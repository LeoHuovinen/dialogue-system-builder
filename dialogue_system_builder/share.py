"""The dialogue system builder's testing links, ``SaveTestingLink``, ``TestingLinkDesign``, ``TestingLinkRuns`` and
``TestingLinkRunCount``, which give a saved conversation a link others can try it through, at ``/try/<ConversationDesignPublicLinkToken>``, and a
page of their conversations, at ``/results/<ConversationDesignPublicLinkToken>``.

The dialogue system builder is made to run with Illocutionary Lifecycles (IL), which it cannot run without, and in it a person
draws a conversation as steps and lines on a canvas, compiles it to the flow IL runs, and talks to it through IL's
mounts, and this module, in the server folder ``dialogue_system_builder``, keeps the designs behind the links and lists the runs
made through them. There are no accounts. The link code opens the chat page. A saved conversation's API key, kept in the
same file as it is, is what a Save that changes the conversation must present, and Save makes it together with the
file. A run through a link is an ordinary IL session,
reserved by ``dialogue_system_builder.mounts.ReserveDialogueSystemBuilderConversationSession`` with the link's ConversationDesignPublicLinkToken and connected
through IL's text mount like the designer's own Start, on the server's stored copy of the design. This module writes
one JSON file per link under ``<DIALOGUE_SYSTEM_BUILDER_DATA>/shares``, and reads finished sessions back through IL's read-only
storage vendor "local-readonly". A run is read once and kept in memory until its stored events change, so the page's
run counts stay cheap however many runs a link has. The runs of a link are the stored sessions whose id is exactly
"try-", the ConversationDesignPublicLinkToken, "-", then either a hex suffix alone or "text-" or "voice-" and a hex suffix.
``dialogue_system_builder.mounts.DialogueSystemBuilderConversationSessionId`` makes the first of these. The routes that
call this module are in ``dialogue_system_builder.app``.
"""
from __future__ import annotations

import json
import os
import secrets
import string
import time
from typing import Any

from dialogue_system_builder import store
from dialogue_system_builder.compile import compile_design

# Session id -> (the time its events folder last changed, what TestingLinkRuns needs of it, or None when it is no run).
_READ_RUNS: dict[str, tuple[float, dict[str, Any] | None]] = {}

# The names a link's multimodal element may take, stored in the link file under the key "MultimodalElement". Each names
# one of IL's example pages, which the testing link's page shows above the chat. ``dialogue_system_builder.app`` serves
# each from IL's own examples folder, and the testing link's page hands it every call of the chat's conversation, so it
# moves with the conversation the tester is having.
TESTING_LINK_MULTIMODAL_ELEMENTS = ("plasma",)


def _link_path(ConversationDesignPublicLinkToken: str) -> str | None:
    """Return the file of the link ``ConversationDesignPublicLinkToken``, or ``None`` when ``ConversationDesignPublicLinkToken`` holds anything but letters, digits, "-" and
    "_", so a ConversationDesignPublicLinkToken can never name a path outside the folder."""
    if not ConversationDesignPublicLinkToken or not ConversationDesignPublicLinkToken.replace("-", "").replace("_", "").isalnum():
        return None
    folder = os.path.join(store.data_dir(), "shares")
    os.makedirs(folder, exist_ok=True)
    return os.path.join(folder, f"{ConversationDesignPublicLinkToken}.json")


def TestingLinkDesign(ConversationDesignPublicLinkToken: str) -> dict[str, Any] | None:
    """Return the stored link ``ConversationDesignPublicLinkToken`` as a dict with ``design``, ``label``, ``shared_at`` and
    ``ConversationDesignAPIKey``, or ``None`` for an unknown or malformed link code. A link file without a
    ``ConversationDesignAPIKey`` gets one at its next Save."""
    path = _link_path(ConversationDesignPublicLinkToken)
    if not path or not os.path.isfile(path):
        return None
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def SaveTestingLink(design: dict[str, Any], label: str, ConversationDesignPublicLinkToken: str | None = None,
                    voice: bool | None = None, text: bool | None = None, mic_check: bool | None = None,
                    MultimodalElement: str | None = None) -> str:
    """Store ``design`` and ``label`` behind the link ``ConversationDesignPublicLinkToken`` when that link exists, so a
    later Save of the same conversation updates the design behind its link and keeps its runs and its
    ``ConversationDesignAPIKey``, or behind a new random link code otherwise. When the link file has no
    ``ConversationDesignAPIKey``, this function makes one, "sk-" and 48 random letters and digits, OpenAI's key
    format so that a tool written for OpenAI's API accepts it in its key setting, and the ``/api/share`` route
    returns it to the browser that saved. ``text`` and ``voice`` say which start buttons the link's testers see, and
    ``mic_check`` says whether starting with voice opens the microphone check first. ``MultimodalElement`` names the
    multimodal element shown above the chat, one of ``TESTING_LINK_MULTIMODAL_ELEMENTS``, and an empty string or an
    unknown name shows none. A setting given as ``None`` stays as the link had it, and a new link starts with text
    on, voice off, the microphone check off and no multimodal element. If a save would turn off both text and voice,
    text is turned back on, so testers always have a way to talk. The route, not this function, decides whether a
    Save may change an existing link. Returns the link code."""
    link = TestingLinkDesign(ConversationDesignPublicLinkToken) if ConversationDesignPublicLinkToken else None
    if link is None:
        ConversationDesignPublicLinkToken, link = secrets.token_urlsafe(9), {}
    link.update({"design": design, "label": str(label or "")[:200], "shared_at": time.time()})
    for name, value in (("voice", voice), ("text", text), ("mic_check", mic_check)):
        if value is not None:
            link[name] = bool(value)
    if MultimodalElement is not None:
        link["MultimodalElement"] = MultimodalElement if MultimodalElement in TESTING_LINK_MULTIMODAL_ELEMENTS else ""
    if not TestingLinkText(link) and not link.get("voice"):
        link["text"] = True
    if not link.get("ConversationDesignAPIKey"):
        alphabet = string.ascii_letters + string.digits
        link["ConversationDesignAPIKey"] = "sk-" + "".join(secrets.choice(alphabet) for _ in range(48))
    with open(_link_path(ConversationDesignPublicLinkToken), "w", encoding="utf-8") as f:
        json.dump(link, f)
    return ConversationDesignPublicLinkToken


def TestingLinkText(link: dict[str, Any]) -> bool:
    """Return whether testers of the stored ``link`` may start it with text. The link's text setting is on unless the
    person who shared it turned it off."""
    return link.get("text") is not False


def TestingLinkVoice(link: dict[str, Any]) -> bool:
    """Return whether testers of the stored ``link`` may start it with voice. That needs two things, the link's voice
    setting turned on by the person who shared it, and a TTS voice chosen in the link's design."""
    return bool(link.get("voice")) and bool(str((link.get("design") or {}).get("voice") or ""))


def TestingLinkMultimodalElement(link: dict[str, Any]) -> str:
    """Return the name of the multimodal element the stored ``link`` shows above the chat, one of
    ``TESTING_LINK_MULTIMODAL_ELEMENTS``, or an empty string when it shows none. A link saved before multimodal
    elements existed shows none."""
    MultimodalElement = str(link.get("MultimodalElement") or "")
    return MultimodalElement if MultimodalElement in TESTING_LINK_MULTIMODAL_ELEMENTS else ""


def ConversationDesignAPIKey(ConversationDesignPublicLinkToken: str) -> str | None:
    """Return the ``ConversationDesignAPIKey`` of the link ``ConversationDesignPublicLinkToken``, or ``None`` when the link is
    unknown or its file has no key. The ``/api/share`` route compares the header of a re-save against it."""
    return (TestingLinkDesign(ConversationDesignPublicLinkToken) or {}).get("ConversationDesignAPIKey") or None


def ConversationDesignPublicLinkTokenOfAPIKey(key: str | None) -> str | None:
    """Return the ``ConversationDesignPublicLinkToken`` whose stored design carries ``key`` as its ``ConversationDesignAPIKey``,
    or ``None`` when no stored design does. Reads every link file under ``shares``, which is one small JSON file per
    stored design. Called by ``dialogue_system_builder.mounts.DialogueSystemBuilderHTTPEndpointMount.Authenticate`` on
    every request to "/v1", where the bearer is the key and nothing else names the design."""
    if not key or not key.startswith("sk-"):
        return None
    folder = os.path.join(store.data_dir(), "shares")
    if not os.path.isdir(folder):
        return None
    for name in os.listdir(folder):
        if name.endswith(".json") and (TestingLinkDesign(name[:-5]) or {}).get("ConversationDesignAPIKey") == key:
            return name[:-5]
    return None


def _is_run_suffix(rest: str) -> bool:
    """Return whether ``rest``, what follows "try-", the ConversationDesignPublicLinkToken and "-" in a session id, is hex alone or "text-" or
    "voice-" and hex."""
    parts = rest.split("-")
    hex_digits = "0123456789abcdef"
    tail = parts[-1]
    well_formed = bool(tail) and all(c in hex_digits for c in tail)
    return well_formed and (len(parts) == 1 or (len(parts) == 2 and parts[0] in ("text", "voice")))


def _session_ids_of(ConversationDesignPublicLinkToken: str) -> list[str]:
    """Return the stored sessions of the link ``ConversationDesignPublicLinkToken``, oldest first. A ConversationDesignPublicLinkToken may itself hold "-", so a session
    belongs to the link only when what follows the prefix is hex alone, or "text-" or "voice-" and hex."""
    sessions = store.sessions_dir()
    if not os.path.isdir(sessions):
        return []
    prefix = f"try-{ConversationDesignPublicLinkToken}-"
    mine = [s for s in os.listdir(sessions) if s.startswith(prefix) and _is_run_suffix(s[len(prefix):])]
    return sorted(mine, key=lambda s: os.path.getmtime(os.path.join(sessions, s)))


def _read_run(session_id: str) -> dict[str, Any] | None:
    """Return one stored session as a dict with ``session``, ``last_state``, ``started`` and ``turns``, or
    ``None`` when the tester said nothing or IL refuses to reopen it, reading it again only when its events changed."""
    from illocutionary_lifecycles.core.session_provider import SessionProvider
    from illocutionary_lifecycles.server.adapter_callback_handlers.AdapterCallbackHandlerHelpers import turns
    from illocutionary_lifecycles.server.adapter_callback_handlers.EventStreamReader import event_streams

    events = os.path.join(store.sessions_dir(), session_id, "events")
    changed = os.path.getmtime(events) if os.path.isdir(events) else 0.0
    kept = _READ_RUNS.get(session_id)
    if kept and kept[0] == changed:
        return kept[1]
    try:
        provider = SessionProvider(session_id=session_id, memory_vendor="local-readonly",
                                   vendor_session_address=store.sessions_dir())
        provider.start()
    except Exception:  # a folder IL cannot reopen, such as one left by a connection that never started
        _READ_RUNS[session_id] = (changed, None)
        return None
    said = [{"role": t["role"], "text": t["text"]} for t in turns(provider) if str(t.get("text") or "").strip()]
    run = None
    if any(t["role"] == "user" for t in said):
        changes = event_streams(provider).get("ConversationStateEvent") or []
        stamps = [e.stat().st_mtime for e in os.scandir(events)] if changed else []
        run = {"session": session_id,
               "last_state": str(changes[-1].get("conversation_state", 0)) if changes else "0",
               "started": min(stamps) if stamps else changed, "turns": said}
    _READ_RUNS[session_id] = (changed, run)
    return run


def TestingLinkRuns(ConversationDesignPublicLinkToken: str) -> list[dict[str, Any]]:
    """Return every run through the link ``ConversationDesignPublicLinkToken`` in which the tester said something, oldest first, each a dict with
    ``session``, ``ended``, whether it reached an End step of the link's design, ``started`` and ``turns``."""
    link = TestingLinkDesign(ConversationDesignPublicLinkToken)
    if link is None:
        return []
    endings = compile_design(link["design"])["endings"]
    runs = [r for r in (_read_run(s) for s in _session_ids_of(ConversationDesignPublicLinkToken)) if r]
    return [{**{k: v for k, v in r.items() if k != "last_state"}, "ended": r["last_state"] in endings} for r in runs]


def TestingLinkRunCount(ConversationDesignPublicLinkToken: str) -> int:
    """Return how many runs the link ``ConversationDesignPublicLinkToken`` has, for the page's "tried ×N", without compiling its design."""
    return sum(1 for s in _session_ids_of(ConversationDesignPublicLinkToken) if _read_run(s))
