"""``DialogueSystemBuilderTextAdapterWebsocketMount``, the dialogue system builder's text mount, which is IL's
``illocutionary_lifecycles.server.adapter_mounts.websocket_mounts.TextAdapterWebsocketMount`` with the session of each
connection built from the design the builder reserved for it, ``DialogueSystemBuilderHTTPEndpointMount``, the builder's
OpenAI-compatible endpoint at "/v1", which is IL's
``illocutionary_lifecycles.server.adapter_mounts.http_mounts.HTTPEndpointMount`` with the design chosen by the request's
``ConversationDesignAPIKey``, and the functions that reserve a session.

The dialogue system builder is made to run with Illocutionary Lifecycles (IL), which it cannot run without, and in it a person
draws a conversation as steps and lines on a canvas, compiles it to the flow IL runs, and talks to it through IL's
mounts, and this module, in the builder's server folder ``dialogue_system_builder``, is the point where a design becomes one IL
session. The builder's page never sends a design over the wire a mount owns. The page first posts the design, or the ConversationDesignPublicLinkToken
of a testing link, to the builder's route ``/api/sessions``, which calls ``ReserveDialogueSystemBuilderConversationSession``
and returns a session id. The page then connects to IL's text mount at ``/ws?session_id=...``, or sends that id in the
request data of the WebRTC offer to IL's voice mount, and the mount's ``NewConversationSession`` calls
``DialogueSystemBuilderConversationSession`` with that request data. The voice twin of the mount class is
``dialogue_system_builder.voice_mount.DialogueSystemBuilderPipecatVoiceAdapterWebRtcMount``, chosen when the builder runs with voice,
and both mounts build their session with this module's one function, so a design runs identically as text or as voice. The
endpoint mount has no page and no reservation step. Its ``Authenticate`` finds the stored design whose
``ConversationDesignAPIKey`` is the request's bearer through ``dialogue_system_builder.share.ConversationDesignPublicLinkTokenOfAPIKey``
and refuses with 401 when none has it, and its ``NewConversationSession`` reserves and builds in one go, so a conversation
held over "/v1" is stored like a run through the design's testing link and listed on its results page. IL's mount keeps one
conversation per bearer between requests, so one ``ConversationDesignAPIKey`` is one conversation at a time.

This module compiles with ``dialogue_system_builder.compile.compile_design``, stores every session with IL's "local" storage
vendor under ``dialogue_system_builder.store.sessions_dir``, and
constructs ``illocutionary_lifecycles.core.session_provider.SessionProvider`` only inside the mounts'
``NewConversationSession``. This module holds no socket and sends nothing to the connecting side, which is the mount's. The
reserved designs are kept in ``ReservedDialogueSystemBuilderConversationSessions`` in this process only, so a server restart
between the reservation and the connection loses the reservation and the connection fails with the error below. The
session ids it makes are read by ``dialogue_system_builder.share.TestingLinkRuns``, which lists the runs of a testing link by
the id's prefix "try-<ConversationDesignPublicLinkToken>-", so a change to the id's shape is a change there too.
"""
from __future__ import annotations

import copy
import time
import uuid
from typing import Any

from illocutionary_lifecycles.server.adapter_mounts.http_mounts.HTTPEndpointMount import (
    HTTPEndpointMount,
    HTTPEndpointRefusal,
)
from illocutionary_lifecycles.server.adapter_mounts.websocket_mounts.TextAdapterWebsocketMount import (
    TextAdapterWebsocketMount,
)

# Session id -> {"design", "ConversationDesignPublicLinkToken", "reserved_at"}, one row per Start not yet connected, in this process only.
ReservedDialogueSystemBuilderConversationSessions: dict[str, dict[str, Any]] = {}

# A reservation older than this many seconds is dropped the next time one is made, so an abandoned Start leaves nothing.
RESERVATION_LIFETIME_SECONDS = 600


def DialogueSystemBuilderConversationSessionId(ConversationDesignPublicLinkToken: str | None) -> str:
    """Return a new session id, "try-", the ConversationDesignPublicLinkToken, "-" and eight hex characters for a run through a testing link, and
    "builder-" and eight hex characters for the designer's own Start. The suffix has a fixed length so that a ConversationDesignPublicLinkToken which
    itself holds "-" still parses. ``dialogue_system_builder.share.TestingLinkRuns`` lists a link's runs by the first form's
    prefix. Called by ``ReserveDialogueSystemBuilderConversationSession`` in this module."""
    suffix = uuid.uuid4().hex[:8]
    return f"try-{ConversationDesignPublicLinkToken}-{suffix}" if ConversationDesignPublicLinkToken else f"builder-{suffix}"


def ReserveDialogueSystemBuilderConversationSession(design: dict[str, Any], ConversationDesignPublicLinkToken: str | None = None) -> str:
    """Keep ``design`` for one coming connection and return the session id the page
    connects with. ``ConversationDesignPublicLinkToken`` is the testing link the run goes through, or ``None`` for the designer's own Start, and
    only names the session. Reservations older than ``RESERVATION_LIFETIME_SECONDS`` are dropped first. Called by the
    route ``/api/sessions`` in ``dialogue_system_builder.app``, which has already checked the design."""
    now = time.time()
    for stale in [sid for sid, row in ReservedDialogueSystemBuilderConversationSessions.items()
                  if now - row["reserved_at"] > RESERVATION_LIFETIME_SECONDS]:
        ReservedDialogueSystemBuilderConversationSessions.pop(stale, None)
    session_id = DialogueSystemBuilderConversationSessionId(ConversationDesignPublicLinkToken)
    ReservedDialogueSystemBuilderConversationSessions[session_id] = {"design": design, "ConversationDesignPublicLinkToken": ConversationDesignPublicLinkToken,
                                                             "reserved_at": now}
    return session_id


def ReservedDialogueSystemBuilderDesign(RequestData: Any) -> dict[str, Any]:
    """Return the reserved row for the ``session_id`` in ``RequestData``, the connection's request data, and raise
    ``ValueError`` "the dialogue system builder has no reserved session '<id>'; press Start again" when there is none, which a
    restart of the server or a page that skipped ``/api/sessions`` causes. Called by
    ``DialogueSystemBuilderConversationSession`` in this module and by the voice mount's ``MountVoiceName``."""
    session_id = str((RequestData or {}).get("session_id") or "")
    row = ReservedDialogueSystemBuilderConversationSessions.get(session_id)
    if row is None:
        raise ValueError(f"the dialogue system builder has no reserved session {session_id!r}; press Start again")
    return {"session_id": session_id, **row}


def DialogueSystemBuilderConversationSession(RequestData: Any) -> Any:
    """Return a new, not yet started ``SessionProvider`` for the session reserved under ``RequestData``'s
    ``session_id``, on the compiled flow of its design, with IL's "local" storage vendor and the question-answer hook
    on, and remove the reservation, so one reservation serves one connection. Raises the
    error of ``ReservedDialogueSystemBuilderDesign`` for an unknown id, and ``dialogue_system_builder.compile.CompileError`` for a design
    that no longer compiles. Called by ``NewConversationSession`` of both dialogue system builder mounts."""
    from illocutionary_lifecycles.core.session_provider import SessionProvider

    from dialogue_system_builder import store
    from dialogue_system_builder.compile import compile_design

    row = ReservedDialogueSystemBuilderDesign(RequestData)
    ReservedDialogueSystemBuilderConversationSessions.pop(row["session_id"], None)
    return SessionProvider(session_id=row["session_id"], memory_vendor="local", vendor_session_address=store.sessions_dir(),
                           ConversationStateInitBundle=copy.deepcopy(compile_design(row["design"])["bundle"]),
                           InitSystemSetterSettings={"QuestionAnswerHook": True})


class DialogueSystemBuilderTextAdapterWebsocketMount(TextAdapterWebsocketMount):
    """IL's text mount, whose session per connection is the one the builder reserved, as the module docstring above
    explains. The builder's server builds it once with an empty flow, since IL's mount requires one at
    construction and no connection uses it, and puts it on its app at "/ws" with ``MountOnApp``."""

    def NewConversationSession(self, RequestData: Any = None) -> Any:
        """Return the session ``DialogueSystemBuilderConversationSession`` builds for ``RequestData``, the socket URL's query
        string as a dict, which carries ``session_id``. Called by IL's ``TextAdapterWebsocketMount.Attend`` once per
        connection."""
        return DialogueSystemBuilderConversationSession(RequestData)


class DialogueSystemBuilderHTTPEndpointMount(HTTPEndpointMount):
    """IL's HTTP mount, the OpenAI-compatible endpoint, with the design of each conversation chosen by the request's
    ``ConversationDesignAPIKey``. IL's mount serves one flow given at construction and accepts every bearer, which fits a
    server with one flow. The builder stores many designs, each with its own ``ConversationDesignAPIKey``, so two things must
    happen per request that IL's mount leaves to the server, the two methods it documents for overriding. ``Authenticate``
    refuses a bearer that is no stored design's key, since IL's mount would otherwise open a conversation on the server's
    model for any string. ``NewConversationSession`` builds the session on the design the bearer belongs to, through the
    same reservation and the same ``DialogueSystemBuilderConversationSession`` as the text and voice mounts, so a
    conversation over "/v1" is stored and listed like a run through the design's testing link. Everything else, the routes,
    the request and reply formats, the conversation kept per bearer between requests, the ending at an End step or after
    ``IdleSeconds`` without a turn, and the commands ``HELP``, ``END`` and ``STOP``, is IL's code unchanged. The builder's
    server builds the mount once with an empty flow, since IL's mount requires one at construction and no conversation uses
    it, and puts it on its app at "/v1" with ``MountOnApp``."""

    def Authenticate(self, RequestData: Any = None) -> None:
        """Refuse with 401 when no stored design has the request's bearer as its ``ConversationDesignAPIKey``. Called by IL's
        mount first on every request to "/v1"."""
        from dialogue_system_builder.share import ConversationDesignPublicLinkTokenOfAPIKey

        if ConversationDesignPublicLinkTokenOfAPIKey((RequestData or {}).get("authorization")) is None:
            raise HTTPEndpointRefusal(401, "Incorrect API key provided.", "invalid_request_error", "invalid_api_key")

    def NewConversationSession(self, RequestData: Any = None) -> Any:
        """Return a new, not yet started ``SessionProvider`` on the design whose ``ConversationDesignAPIKey`` is the request's
        bearer. Checks the design as ``/api/sessions`` does and raises ``ValueError`` with the findings when it cannot run as
        text, which IL's mount answers with 400, then reserves it under the design's ``ConversationDesignPublicLinkToken`` and
        builds the session with ``DialogueSystemBuilderConversationSession``, so the session id has the testing link's shape and
        the conversation is listed with the link's runs. Called by IL's mount when a bearer has no conversation yet."""
        from dialogue_system_builder.checks import validate_design
        from dialogue_system_builder.share import ConversationDesignPublicLinkTokenOfAPIKey, TestingLinkDesign

        ConversationDesignPublicLinkToken = ConversationDesignPublicLinkTokenOfAPIKey((RequestData or {}).get("authorization"))
        design = (TestingLinkDesign(ConversationDesignPublicLinkToken) or {}).get("design")
        if not isinstance(design, dict):
            raise ValueError("the dialogue system builder has no stored design for this key")
        checked = validate_design(design, require_voice=False)
        if not checked["ok"]:
            findings = [str(f.get("text") or f) for f in checked.get("findings", []) if isinstance(f, dict)]
            raise ValueError(checked.get("refusal") or " ".join(findings) or "the design cannot run")
        session_id = ReserveDialogueSystemBuilderConversationSession(design, ConversationDesignPublicLinkToken)
        return DialogueSystemBuilderConversationSession({"session_id": session_id})
