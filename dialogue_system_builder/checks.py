"""``validate_design`` and ``check_design``, the dialogue system builder's check of a design before it may run, in the server
folder ``dialogue_system_builder``.

The dialogue system builder is made to run with Illocutionary Lifecycles (IL), which it cannot run without, and in it a person
draws a conversation as steps and lines on a canvas, compiles it to the flow IL runs, and talks to it through IL's
mounts. This module checks twice, in order. ``check_design`` finds, in plain words, what IL never checks, such
as a missing End or a step with no line out. ``session_start_refusal`` then builds a session on the compiled flow
through IL's own text mount and starts it, so the builder refuses exactly what IL refuses, in IL's words. A finding is
a dict with ``level``, "error" or "warning", ``code``, ``text``, ``node`` and ``edge``. The page matches a finding by
its ``code`` and shows its ``text``, so a message can be reworded without touching the page. Called by the routes in
``dialogue_system_builder.app``. This module reads nothing from disk and writes nothing.
"""
from __future__ import annotations

import copy
from typing import Any

from dialogue_system_builder.compile import ANY_OTHER_OPTION, CompileError, LINE_KINDS, choice_text, compile_design, has_any_other


def _data(x: dict[str, Any]) -> dict[str, Any]:
    """Return the ``data`` dict of a node or line, empty when it has none."""
    return dict(x.get("data") or {})


def _asks(questions: list[Any]) -> bool:
    """Return whether any of ``questions`` has written text."""
    return any(str((q or {}).get("text") or "").strip() for q in questions)


def _finding(level: str, code: str, text: str, node: Any = None, edge: Any = None) -> dict[str, Any]:
    """Return one finding, about ``node`` or ``edge`` when given, which then turns red on the canvas."""
    return {"level": level, "code": code, "text": text, "node": node, "edge": edge}


def _check_start(starts: list[dict], edges: list[dict], by_id: dict) -> list[dict[str, Any]]:
    """Return the findings on Start, that there is one and that it leads to one step."""
    out = [] if len(starts) == 1 else [_finding("error", "one-start", "There must be exactly one Start.")]
    start_edges = [e for e in edges if e.get("source") in {s.get("id") for s in starts}]
    if starts and len(start_edges) != 1:
        out.append(_finding("error", "connect-start", "Connect Start to one node.", node=starts[0].get("id")))
    elif start_edges and by_id.get(start_edges[0].get("target"), {}).get("type") != "step":
        out.append(_finding("error", "connect-start-to-node", "Connect Start to a step.", edge=start_edges[0].get("id")))
    return out


def _check_step_texts(steps: list[dict]) -> list[dict[str, Any]]:
    """Return the findings on what each step must have written, its prompt and the question of any fixed choices."""
    out = []
    for n in steps:
        d = _data(n)
        if not str(d.get("description") or "").strip():
            out.append(_finding("error", "add-prompt", "Add a prompt to the node.", node=n.get("id")))
        for q in d.get("questions") or []:
            has_options = any(str(o).strip() for o in ((q or {}).get("options") or []))
            if has_options and not str((q or {}).get("text") or "").strip():
                out.append(_finding("error", "write-question", "Write the question.", node=n.get("id")))
    return out


def _check_choice_line(source_data: dict[str, Any], line_data: dict[str, Any], src: Any, eid: Any) -> list[dict[str, Any]]:
    """Return the findings on one choice line, that its step offers choices, that it names one of them, and that
    the question it belongs to is written."""
    questions = source_data.get("questions") or []
    options = {str(o) for q in questions for o in ((q or {}).get("options") or []) if str(o).strip()}
    if any(has_any_other(q) for q in questions):
        options.add(ANY_OTHER_OPTION)
    if not options:
        return [_finding("error", "add-question-with-choices", "Add a question with choices to the node.", node=src, edge=eid)]
    if choice_text(source_data, line_data) not in options:
        return [_finding("error", "pick-choice", "Pick one of the node's choices.", edge=eid)]
    try:
        q = questions[int(line_data.get("questionIndex") or 0)]
    except (IndexError, TypeError, ValueError):
        return []
    if isinstance(q, dict) and not str(q.get("text") or "").strip():
        return [_finding("error", "write-question", "Write the question.", node=src, edge=eid)]
    return []


def _check_line(e: dict[str, Any], by_id: dict) -> list[dict[str, Any]]:
    """Return the findings on one line out of a step or an End. A line with an unknown target is left to IL, which
    refuses it at session start in its own words."""
    eid, src, dst = e.get("id"), e.get("source"), e.get("target")
    if src == dst:
        return [_finding("error", "self-line", "A node cannot connect to itself.", node=src, edge=eid)]
    if by_id[src].get("type") == "end":
        return [_finding("error", "end-onward", "End cannot connect onward.", node=src, edge=eid)]
    line_data = _data(e)
    when = str(line_data.get("when") or "exchanges")
    if when not in LINE_KINDS:
        return [_finding("error", "unknown-line", "Delete this and connect the nodes again.", edge=eid)]
    source_data = _data(by_id[src])
    if when == "answered" and not _asks(source_data.get("questions") or []):
        return [_finding("error", "add-questions", "Add questions to the node.", node=src, edge=eid)]
    if when == "sentence" and not str(line_data.get("sentence") or "").strip():
        return [_finding("error", "write-sentence", "Write the sentence.", edge=eid)]
    if when == "choice":
        return _check_choice_line(source_data, line_data, src, eid)
    return []


def _check_paths(starts: list[dict], steps: list[dict], ends: list[dict], outgoing: dict) -> list[dict[str, Any]]:
    """Return the findings on the graph, a step with no way on, a node Start cannot reach, a step that cannot reach End."""
    out = [_finding("error", "connect-onward", "Connect the node onward.", node=n.get("id"))
           for n in steps if not outgoing.get(n.get("id"))]
    reach: set = set()
    stack = [s.get("id") for s in starts]
    while stack:
        cur = stack.pop()
        if cur not in reach:
            reach.add(cur)
            stack.extend(outgoing.get(cur, []))
    out += [_finding("warning", "unreachable", "Not reachable from Start.", node=n.get("id"))
            for n in steps + ends if n.get("id") not in reach]
    reaches_end = {n.get("id") for n in ends}
    changed = True
    while changed:
        changed = False
        for n in steps:
            if n.get("id") not in reaches_end and any(t in reaches_end for t in outgoing.get(n.get("id"), [])):
                reaches_end.add(n.get("id"))
                changed = True
    if ends:
        out += [_finding("error", "connect-to-end", "Connect it to End.", node=n.get("id"))
                for n in steps if n.get("id") in reach and n.get("id") not in reaches_end]
    return out


def check_design(design: dict[str, Any], require_voice: bool = True) -> list[dict[str, Any]]:
    """Return the findings on ``design``, the canvas as the page sends it. ``require_voice`` is true for Start with
    voice, which needs a voice chosen, and false for Start with text only."""
    nodes = list(design.get("nodes") or [])
    edges = list(design.get("edges") or [])
    by_id = {n.get("id"): n for n in nodes}
    starts = [n for n in nodes if n.get("type") == "start"]
    steps = [n for n in nodes if n.get("type") == "step"]
    ends = [n for n in nodes if n.get("type") == "end"]
    out = []
    if require_voice and not str(design.get("voice") or "").strip():
        out.append(_finding("error", "choose-voice", "Choose a voice."))
    if not steps:
        return out + [_finding("error", "add-node", "Add a node.")]
    out += _check_start(starts, edges, by_id)
    if not ends:
        out.append(_finding("error", "add-end", "Add an End."))
    out += _check_step_texts(steps)
    outgoing: dict[Any, list[Any]] = {n.get("id"): [] for n in nodes}
    for e in edges:
        src, dst = e.get("source"), e.get("target")
        if src not in by_id or dst not in by_id:
            continue   # a line from nowhere is dropped by the compiler, and IL refuses an unknown target
        if by_id[src].get("type") == "start":
            outgoing[src].append(dst)
            continue
        found = _check_line(e, by_id)
        out += found
        if not (src == dst or by_id[src].get("type") == "end" or any(f["code"] == "unknown-line" for f in found)):
            outgoing[src].append(dst)
    for n in steps:
        tracked = any(e.get("source") == n.get("id") and _data(e).get("when") in ("answered", "choice") for e in edges)
        if _asks(_data(n).get("questions") or []) and not tracked:
            out.append(_finding("warning", "nothing-waits", "Nothing waits for the node's answers.", node=n.get("id")))
    return out + _check_paths(starts, steps, ends, outgoing)


def session_start_refusal(flow: dict[str, Any]) -> str | None:
    """Return IL's own error text, with the error's class name, when IL refuses to start a session on ``flow``, or
    ``None`` when it starts. IL's text mount builds the session with no storage vendor, so nothing is written, and no
    reply is composed, so no model is called."""
    from illocutionary_lifecycles.server.adapter_mounts.websocket_mounts.TextAdapterWebsocketMount import (
        TextAdapterWebsocketMount,
    )
    try:
        TextAdapterWebsocketMount(copy.deepcopy(flow)).NewConversationSession(None).start()
    except Exception as exc:  # IL's session start raises ValueError, KeyError or RuntimeError with its own words
        return f"{type(exc).__name__}: {exc}"
    return None


def validate_design(design: dict[str, Any], require_voice: bool = True, quick: bool = False) -> dict[str, Any]:
    """Return ``{"ok", "findings", "refusal"}`` for ``design``, ``refusal`` being IL's words or ``None``. ``quick``
    leaves out IL's session start, for the page's check on every edit, which only colours the Start buttons."""
    findings = check_design(design, require_voice=require_voice)
    if any(f["level"] == "error" for f in findings):
        return {"ok": False, "findings": findings, "refusal": None}
    try:
        compiled = compile_design(design)
    except CompileError as exc:
        return {"ok": False, "findings": findings + [_finding("error", "cannot-compile", str(exc))], "refusal": None}
    refusal = None if quick else session_start_refusal(compiled["bundle"])
    return {"ok": refusal is None, "findings": findings, "refusal": refusal}
