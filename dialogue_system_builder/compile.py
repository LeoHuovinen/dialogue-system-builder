"""``compile_design``, which turns the canvas's design into the flow Illocutionary Lifecycles (IL) runs, in the server
folder ``dialogue_system_builder``, called by ``dialogue_system_builder.app``, ``dialogue_system_builder.checks``, ``dialogue_system_builder.mounts`` and ``dialogue_system_builder.share``.

The dialogue system builder is made to run with IL, which it cannot run without, and in it a person draws a conversation as
steps and lines on a canvas, compiles it to the flow IL runs, and talks to it through IL's mounts. The design is the
React Flow document the page holds, nodes and lines, plus a few design-wide fields. Every key of IL's flow is made here,
and the design never carries one, so the flow Download flow writes can be handed to IL's mounts as it is.

The design is a dict written by the page, in ``frontend/src/slices/design.js``, ``frontend/src/Panes.jsx``, the shapes of
``frontend/src/Sidebar.jsx`` and ``frontend/src/templates.json``, and by ``dialogue_system_builder.generate``, so a change to its
shape is a change in all of them and in ``dialogue_system_builder.checks``. Its ``title`` is the conversation's name, ``style`` is
the system prompt, ``memory`` says whether answers are remembered across steps, and ``voice`` is the voice of a voice
Start. Its ``nodes`` each have an ``id``, a ``position`` and a ``type`` of "start", "step" or "end". Only a step holds
anything in ``data``, its prompt ``description`` and its ``questions``, each with ``text``, ``options``, a list of choice
texts that is empty or null for a free answer, and ``anyOther``, which adds the "any other choice" slot. Its ``edges``
are the lines, each with an ``id``, a ``source`` and a ``target``, and ``data`` holding ``when``, a key of ``LINE_KINDS``,
and ``rank``, which orders the lines of one node. A line of the kind "exchanges" also holds ``turns``, one of the kind
"sentence" holds ``sentence``, and one of the kind "choice" holds ``questionIndex`` and ``optionIndex``, or the text of the
choice in ``option``, which is how the templates name a choice.

The keys of the flow are IL's protocol, read by ``illocutionary_lifecycles.core.system_state.system_state.SystemState``,
so a change to them in IL is a change here. ``PromptBlocks`` holds ``ConversationFramePrompt``, the system prompt followed
by "Keep your answer at max 2 sentences.", ``IllocutionaryPrompt``, each state's prompt by index, ``question_prompt``,
which stays empty, and ``memory_callback``, which holds "{pUserMemories}" when ``memory`` is on. ``ConversationStates``
holds, by index, each state's ``name``, its ``questions``, its ``ConversationStateTransitionCriteria`` with ``Analyzer``,
``TargetConversationState`` and ``Prompt``, its ``session_first_reply_flag``, its ``ignore_memories``, and ``global_history_window`` with
``global_history_turns``, which make every state compose over the last 10 turns of the whole conversation.

This module reads no file and writes none. A design it cannot compile raises ``CompileError``, with "The design has no
steps." or "Delete this and connect the nodes again.".
"""
from __future__ import annotations

from typing import Any

# The one table of line kinds, from the canvas's `when` on a line to the registered name of the IL transition criterion
# it compiles to. Registered names are IL's protocol, so IL refuses a name it does not know at session start.
# `dialogue_system_builder.checks` and `dialogue_system_builder.generate` read this table. `WHEN` in `frontend/src/registry.js` lists the
# same kinds with their labels for the page, so a kind added here is added there too.
LINE_KINDS = {
    "answered": "QuestionsAnsweredConversationStateTransitionCriteria",
    "exchanges": "TurnCountConversationStateTransitionCriteria",
    "sentence": "PragmaticConversationStateTransitionCriteria",
    "choice": "CategoricalAnswerConversationStateTransitionCriteria",
}

# The assistant is told nothing the author did not write on the canvas. The wrappers below carry only IL's
# placeholders, no framing text of their own.
_QUESTION_PROMPT = ""
_MEMORY_BASE = "{pUserMemories}"
# The phrase line's condition, read by IL's transition criterion and never by the assistant.
_SAYS_WRAPPER = "The user says this utterance or word, or something that clearly means the same: "


class CompileError(ValueError):
    """A design that cannot be compiled. The message is in plain words."""


def data_of(node: dict[str, Any]) -> dict[str, Any]:
    """Return a copy of the ``data`` dict of ``node``, a node of the design, or an empty dict when it has none."""
    return dict(node.get("data") or {})


def edge_data(edge: dict[str, Any]) -> dict[str, Any]:
    """Return a copy of the ``data`` dict of ``edge``, a line of the design, or an empty dict when it has none."""
    return dict(edge.get("data") or {})


def first_step_id(design: dict[str, Any]) -> Any:
    """Return the target of the line out of the Start node of ``design``, or None when there is no such line."""
    starts = [n.get("id") for n in (design.get("nodes") or []) if n.get("type") == "start"]
    for e in design.get("edges") or []:
        if e.get("source") in starts:
            return e.get("target")
    return None


def ordered_states(design: dict[str, Any]) -> list[dict[str, Any]]:
    """Return the step and End nodes of ``design`` in the order of IL's state indexes, the first step first and then
    the rest as authored. ``orderedStateIdsOf`` in ``frontend/src/registry.js`` keeps the same order for the page."""
    nodes = [n for n in (design.get("nodes") or []) if n.get("type") in ("step", "end")]
    first = first_step_id(design)
    head = [n for n in nodes if n.get("id") == first]
    tail = [n for n in nodes if n.get("id") != first]
    return head + tail


def compile_design(design: dict[str, Any]) -> dict[str, Any]:
    """Return a dict with ``bundle``, the flow IL runs for ``design``, and ``endings``, the state indexes of its End
    steps and of any step with no line out. The module docstring lists the keys of both the design and the flow.

    ``CompileError`` is raised only for what IL cannot see, "The design has no steps." for an empty design and "Delete
    this and connect the nodes again." for a line of an unknown kind. What IL checks itself, such as a line's target or
    a line from a step to itself, is passed through unchanged, and IL refuses it at session start."""
    nodes = ordered_states(design)
    if not nodes:
        raise CompileError("The design has no steps.")
    index_of = {n.get("id"): str(i) for i, n in enumerate(nodes)}
    edges = list(design.get("edges") or [])
    start_ids = {n.get("id") for n in (design.get("nodes") or []) if n.get("type") == "start"}
    memory_on = bool(design.get("memory", True))

    states: dict[str, Any] = {}
    prompts: dict[str, Any] = {}
    endings: list[str] = []

    for i, node in enumerate(nodes):
        idx = str(i)
        nid = node.get("id")
        d = data_of(node)
        is_ending = node.get("type") == "end"
        questions = _questions_of(d)
        # The order of the rows is the order IL reads them, since IL takes the lowest entry that fires in a refresh.
        # A line from the "any other choice" slot always goes first, because the answer that fills that slot
        # also empties the question list, so an "all answered" line ranked above it would win and
        # the off-list answer would be treated as an order.
        own_edges = [] if is_ending else sorted(
            (e for e in edges if e.get("source") == nid),
            key=lambda e: (0 if is_any_other_edge(d, edge_data(e)) else 1,
                           int(edge_data(e).get("rank") or 0)))

        rows = []
        for e in own_edges:
            ed = edge_data(e)
            when = str(ed.get("when") or "exchanges")
            if when not in LINE_KINDS:
                raise CompileError("Delete this and connect the nodes again.")
            # The target is handed to IL as it is, because refusing an unknown target or a line from a step to
            # itself is IL's own check.
            target = e.get("target")
            row: dict[str, Any] = {"Analyzer": LINE_KINDS[when],
                                   "TargetConversationState": index_of.get(target, str(target))}
            if when == "sentence":
                # IL's criterion reads this text as a free-form condition, so the author's word or phrase is
                # framed as what the user says, since a bare word would be ambiguous.
                row["Prompt"] = _SAYS_WRAPPER + str(ed.get("sentence") or "").strip()
            elif when == "choice":
                row["Prompt"] = choice_text(d, ed)
            elif when == "exchanges":
                # The turn criterion fires when the state's user-turn count, which already includes
                # the current reply, reaches its number, so the line fires after exactly ``turns`` replies.
                try:
                    turns = max(1, int(ed.get("turns") or 1))
                except (TypeError, ValueError):
                    turns = 1
                row["Prompt"] = str(turns)
            rows.append(row)

        tracks_questions = any(edge_data(e).get("when") in ("answered", "choice") for e in own_edges)

        # Nodes have no names, so a step is known by its position only, to IL and to the page.
        entry: dict[str, Any] = {"name": f"Step {i + 1}"}
        if questions and tracks_questions:
            entry["questions"] = questions
        if rows:
            entry["ConversationStateTransitionCriteria"] = rows
        # The first step is entered without an utterance at session start, and the flag is read only after a move, so
        # it gets the flag only when a line loops back into it. Without the flag the re-entry would check the previous
        # node's user turn against the fresh questions.
        if i > 0 or any(e.get("target") == nid and e.get("source") not in start_ids for e in edges):
            entry["session_first_reply_flag"] = "ignore_EntryUtterance"
        if i == 0 and not memory_on:
            entry["ignore_memories"] = True
        # Every state composes over the last 10 turns of the whole conversation, never over the state's own
        # utterances alone, so a new node never starts blank.
        entry["global_history_window"] = True
        entry["global_history_turns"] = 10

        states[idx] = entry
        prompts[idx] = _state_prompt(d, questions, tracks_questions)
        if is_ending or not rows:
            endings.append(idx)

    blocks: dict[str, Any] = {
        # The one hidden line, which follows the author's system prompt.
        "ConversationFramePrompt": (str(design.get("style") or "").strip() + "\nKeep your answer at max 2 sentences.").strip(),
        "IllocutionaryPrompt": prompts,
        "question_prompt": _QUESTION_PROMPT,
        "memory_callback": ({"Base": _MEMORY_BASE} if memory_on else {}),
    }

    return {"bundle": {"PromptBlocks": blocks, "ConversationStates": states},
            "endings": endings}


# The "any other choice" slot compiles to one more option on the question, and the slot's line carries the same text
# as its prompt, which is what IL's choice criterion compares against. IL's question checker caps the tokens of its
# answer, so an option is a few words and never a framing sentence. `dialogue_system_builder.checks` reads this too.
ANY_OTHER_OPTION = "other"
# The long prompt for the slot goes in the question's text, which IL's question checker reads and which has no cap.
# The prompt is appended to the author's question only when the slot is on, the way the phrase line's condition is framed.
_ANY_OTHER_QUESTION_WRAPPER = (
    " (The choice 'other' is the error case, not a normal choice. First map the answer onto one of "
    "the real choices as usual: a paraphrase, a synonym, a partial name, a pointing phrase such as "
    "'the first one' or 'the special', or a clear preference for one of them is that choice. Pick "
    "'other' only when the user clearly asks for, names, or insists on something that no real choice "
    "can mean, such as an item the list does not offer. A stall, a question back, or silence is not "
    "an answer and never 'other'. When the choice is 'other', the answer sentence must name what the "
    "user actually asked for.)")


def has_any_other(q: Any) -> bool:
    """Return whether ``q``, a question of a step, offers the "any other choice" slot, which it does only with
    ``anyOther`` set and at least one written choice."""
    return (isinstance(q, dict) and bool(q.get("anyOther"))
            and any(str(o).strip() for o in (q.get("options") or [])))


def is_any_other_edge(d: dict[str, Any], ed: dict[str, Any]) -> bool:
    """Return whether ``ed``, the data of a line out of the step whose data is ``d``, is a choice line pointing at a
    question's "any other choice" slot, which it does with ``optionIndex`` -1."""
    if str(ed.get("when") or "") != "choice" or ed.get("optionIndex") is None:
        return False
    try:
        if int(ed["optionIndex"]) != -1:
            return False
        return has_any_other((d.get("questions") or [])[int(ed.get("questionIndex") or 0)])
    except (IndexError, TypeError, ValueError):
        return False


def choice_text(d: dict[str, Any], ed: dict[str, Any]) -> str:
    """Return the choice text the line data ``ed`` points at, read from the step data ``d`` by ``questionIndex`` and
    ``optionIndex``, or an empty string when there is none at that position. ``optionIndex`` -1 is the "any other
    choice" slot and returns ``ANY_OTHER_OPTION``. A line with no ``optionIndex``, as in the templates, returns its
    ``option`` text. ``choiceOf`` in ``frontend/src/registry.js`` reads a line the same way for the page."""
    if ed.get("optionIndex") is not None:
        if is_any_other_edge(d, ed):
            return ANY_OTHER_OPTION
        try:
            q = (d.get("questions") or [])[int(ed.get("questionIndex") or 0)]
            options = (q or {}).get("options") if isinstance(q, dict) else None
            return str((options or [])[int(ed["optionIndex"])]).strip()
        except (IndexError, TypeError, ValueError):
            return ""
    return str(ed.get("option") or "").strip()


def _questions_of(d: dict[str, Any]) -> list[Any]:
    """Return the questions of the step data ``d`` in the form IL's flow takes, a plain string for a free answer and a
    dict with ``question`` and ``options`` for fixed choices, leaving out a question with no text."""
    out: list[Any] = []
    for q in d.get("questions") or []:
        text = str((q or {}).get("text") or "")
        options = [str(o) for o in ((q or {}).get("options") or []) if str(o).strip()]
        if not text.strip():
            continue
        if not options:
            out.append(text)
            continue
        if has_any_other(q):
            # The slot is the last option, one word, after the author's written choices, which stay exactly as
            # written, and its long prompt goes in the question's text.
            options = options + [ANY_OTHER_OPTION]
            text = text.rstrip() + _ANY_OTHER_QUESTION_WRAPPER
        out.append({"question": text, "options": options})
    return out


def _state_prompt(d: dict[str, Any], questions: list[Any], tracks_questions: bool) -> str:
    """Return the state's prompt from the step data ``d``, only the author's own words, the description and then the
    ``questions``. With ``tracks_questions`` true a line depends on the answers, so IL's placeholder
    "{pConversationStateRemainingQuestions}" stands for the questions, and otherwise they are listed as plain text."""
    text = str(d.get("description") or "").strip()
    if questions and not tracks_questions:
        # Asked but not tracked, since no line depends on them, so they go in the prompt as plain text.
        listed = "\n".join(q["question"] if isinstance(q, dict) else q for q in questions)
        text += ("\n" if text else "") + listed
    if questions and tracks_questions:
        text += "\n{pConversationStateRemainingQuestions}"
    return text
