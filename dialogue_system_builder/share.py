"""The dialogue system builder's testing links, ``SaveTestingLink``, ``TestingLinkDesign``, ``TestingLinkRuns`` and
``TestingLinkRunCount``, which give a saved conversation a link others can try it through, at ``/try/<token>``, and a
page of their conversations, at ``/results/<token>``.

The dialogue system builder is made to run with Illocutionary Lifecycles (IL), which it cannot run without, and in it a person
draws a conversation as steps and lines on a canvas, compiles it to the flow IL runs, and talks to it through IL's
mounts, and this module, in the server folder ``dialogue_system_builder``, keeps the designs behind the links and lists the runs
made through them. There are no accounts, so the link is the access. A run through a link is an ordinary IL session,
reserved by ``dialogue_system_builder.mounts.ReserveDialogueSystemBuilderConversationSession`` with the link's token and connected
through IL's text mount like the designer's own Start, on the server's stored copy of the design. This module writes
one JSON file per link under ``<DIALOGUE_SYSTEM_BUILDER_DATA>/shares``, and reads finished sessions back through IL's read-only
storage vendor "local-readonly". A run is read once and kept in memory until its stored events change, so the page's
run counts stay cheap however many runs a link has. The runs of a link are the stored sessions whose id is exactly
"try-<token>-<way>-<hex>", the shape ``dialogue_system_builder.mounts.DialogueSystemBuilderConversationSessionId`` gives. The routes that
call this module are in ``dialogue_system_builder.app``.
"""
from __future__ import annotations

import json
import os
import secrets
import time
from typing import Any

from dialogue_system_builder import store
from dialogue_system_builder.compile import compile_design

# Session id -> (the time its events folder last changed, what TestingLinkRuns needs of it, or None when it is no run).
_READ_RUNS: dict[str, tuple[float, dict[str, Any] | None]] = {}


def _link_path(token: str) -> str | None:
    """Return the file of the link ``token``, or ``None`` when ``token`` holds anything but letters, digits, "-" and
    "_", so a token can never name a path outside the folder."""
    if not token or not token.replace("-", "").replace("_", "").isalnum():
        return None
    folder = os.path.join(store.data_dir(), "shares")
    os.makedirs(folder, exist_ok=True)
    return os.path.join(folder, f"{token}.json")


def TestingLinkDesign(token: str) -> dict[str, Any] | None:
    """Return the stored link ``token`` as a dict with ``design``, ``label`` and ``shared_at``, or ``None`` for an
    unknown or malformed token."""
    path = _link_path(token)
    if not path or not os.path.isfile(path):
        return None
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def SaveTestingLink(design: dict[str, Any], label: str, token: str | None = None) -> str:
    """Store ``design`` and ``label`` behind the link ``token`` when that link exists, so a later Save of the same
    conversation updates the design behind its link and keeps its runs, or behind a new random token otherwise, and
    return the token."""
    if not (token and TestingLinkDesign(token) is not None):
        token = secrets.token_urlsafe(9)
    with open(_link_path(token), "w", encoding="utf-8") as f:
        json.dump({"design": design, "label": str(label or "")[:200], "shared_at": time.time()}, f)
    return token


def _session_ids_of(token: str) -> list[str]:
    """Return the stored sessions of the link ``token``, oldest first. A token may itself hold "-", so a session
    belongs to the link only when what follows the prefix is exactly "<way>-<hex>"."""
    sessions = store.sessions_dir()
    if not os.path.isdir(sessions):
        return []
    prefix = f"try-{token}-"
    mine = [s for s in os.listdir(sessions) if s.startswith(prefix)
            and len(s[len(prefix):].split("-")) == 2 and s[len(prefix):].split("-")[0] in ("text", "voice")]
    return sorted(mine, key=lambda s: os.path.getmtime(os.path.join(sessions, s)))


def _read_run(session_id: str) -> dict[str, Any] | None:
    """Return one stored session as a dict with ``session``, ``way``, ``last_state``, ``started`` and ``turns``, or
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
        run = {"session": session_id, "way": session_id.rsplit("-", 2)[-2],
               "last_state": str(changes[-1].get("conversation_state", 0)) if changes else "0",
               "started": min(stamps) if stamps else changed, "turns": said}
    _READ_RUNS[session_id] = (changed, run)
    return run


def TestingLinkRuns(token: str) -> list[dict[str, Any]]:
    """Return every run through the link ``token`` in which the tester said something, oldest first, each a dict with
    ``session``, ``way``, ``ended``, whether it reached an End step of the link's design, ``started`` and ``turns``."""
    link = TestingLinkDesign(token)
    if link is None:
        return []
    endings = compile_design(link["design"])["endings"]
    runs = [r for r in (_read_run(s) for s in _session_ids_of(token)) if r]
    return [{**{k: v for k, v in r.items() if k != "last_state"}, "ended": r["last_state"] in endings} for r in runs]


def TestingLinkRunCount(token: str) -> int:
    """Return how many runs the link ``token`` has, for the page's "tried ×N", without compiling its design."""
    return sum(1 for s in _session_ids_of(token) if _read_run(s))
