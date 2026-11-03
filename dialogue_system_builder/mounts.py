"""``DialogueSystemBuilderTextAdapterWebsocketMount``, the dialogue system builder's text way, which is IL's
``illocutionary_lifecycles.server.adapter_mounts.websocket_mounts.TextAdapterWebsocketMount`` with the session of each
connection built from the design the builder reserved for it, and the functions that reserve that session.

The dialogue system builder is made to run with Illocutionary Lifecycles (IL), which it cannot run without, and in it a person
draws a conversation as steps and lines on a canvas, compiles it to the flow IL runs, and talks to it through IL's
mounts, and this module, in the builder's server folder ``dialogue_system_builder``, is the point where a design becomes one IL
session. The builder's page never sends a design over the wire a mount owns. The page first posts the design, or the token
of a testing link, to the builder's route ``/api/sessions``, which calls ``ReserveDialogueSystemBuilderConversationSession``
and returns a session id. The page then connects to IL's text mount at ``/ws?session_id=...``, or sends that id in the
request data of the WebRTC offer to IL's voice mount, and the mount's ``NewConversationSession`` calls
``DialogueSystemBuilderConversationSession`` with that request data. The voice twin of the mount class is
``dialogue_system_builder.voice_mount.DialogueSystemBuilderPipecatVoiceAdapterWebRtcMount``, chosen when the builder runs with voice,
and both mounts build their session with this module's one function, so a design runs identically on either way.

This module compiles with ``dialogue_system_builder.compile.compile_design``, stores every session with IL's "local" storage
vendor under ``dialogue_system_builder.store.sessions_dir``, and
constructs ``illocutionary_lifecycles.core.session_provider.SessionProvider`` only inside the mounts'
``NewConversationSession``. This module holds no socket and sends nothing to the connecting side, which is the mount's. The
reserved designs are kept in ``ReservedDialogueSystemBuilderConversationSessions`` in this process only, so a server restart
between the reservation and the connection loses the reservation and the connection fails with the error below. The
session ids it makes are read by ``dialogue_system_builder.share.TestingLinkRuns``, which lists the runs of a testing link by
the id's prefix "try-<token>-", so a change to the id's shape is a change there too.
"""
from __future__ import annotations

import copy
import time
import uuid
from typing import Any

from illocutionary_lifecycles.server.adapter_mounts.websocket_mounts.TextAdapterWebsocketMount import (
    TextAdapterWebsocketMount,
)

# Session id -> {"design", "way", "token", "reserved_at"}, one row per Start not yet connected, in this process only.
ReservedDialogueSystemBuilderConversationSessions: dict[str, dict[str, Any]] = {}

# A reservation older than this many seconds is dropped the next time one is made, so an abandoned Start leaves nothing.
RESERVATION_LIFETIME_SECONDS = 600


def DialogueSystemBuilderConversationSessionId(way: str, token: str | None) -> str:
    """Return a new session id, "try-<token>-<way>-<hex>" for a run through a testing link and "builder-<way>-<hex>"
    for the designer's own Start. ``dialogue_system_builder.share.TestingLinkRuns`` lists a link's runs by the first form's
    prefix. Called by ``ReserveDialogueSystemBuilderConversationSession`` in this module."""
    suffix = uuid.uuid4().hex[:8]
    return f"try-{token}-{way}-{suffix}" if token else f"builder-{way}-{suffix}"


def ReserveDialogueSystemBuilderConversationSession(design: dict[str, Any], way: str, token: str | None = None) -> str:
    """Keep ``design`` for one coming connection on ``way``, "text" or "voice", and return the session id the page
    connects with. ``token`` is the testing link the run goes through, or ``None`` for the designer's own Start, and
    only names the session. Reservations older than ``RESERVATION_LIFETIME_SECONDS`` are dropped first. Called by the
    route ``/api/sessions`` in ``dialogue_system_builder.app``, which has already checked the design."""
    now = time.time()
    for stale in [sid for sid, row in ReservedDialogueSystemBuilderConversationSessions.items()
                  if now - row["reserved_at"] > RESERVATION_LIFETIME_SECONDS]:
        ReservedDialogueSystemBuilderConversationSessions.pop(stale, None)
    session_id = DialogueSystemBuilderConversationSessionId(way, token)
    ReservedDialogueSystemBuilderConversationSessions[session_id] = {"design": design, "way": way, "token": token,
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
