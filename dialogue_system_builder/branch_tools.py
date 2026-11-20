"""Helpers around a ``dialogue_system_builder.branch.Branch``, in the server folder ``dialogue_system_builder``.

They are plain functions and one small key counter, and none of them touches a session. ``place`` gives a branch
real numeric keys and points its ``RETURN`` exits at an existing state. The ``add_`` functions add transitions to
chosen states of a placed branch, such as moving on after two turns or going back when the user asks to.
``plan_swap`` builds the three arguments of IL's ``ReplaceBranch`` for taking one branch out and putting another in
behind a phatic doorway state, and ``check_flow`` finds exits to missing states and states with no way back to a chosen
state. ``merge`` writes a placed branch into a flow that has not started yet.

A placed branch is a dict from key to a pair of entry and prompt, the form ``ReplaceBranch`` takes.
"""
from __future__ import annotations

import copy
from typing import Any, Callable, Iterable

from dialogue_system_builder.branch import RETURN, Branch
from dialogue_system_builder.compile import LINE_KINDS, _SAYS_WRAPPER

Placed = dict[str, tuple[dict[str, Any], str]]


class KeyCounter:
    """Hands out numeric state keys that only grow, so a key never means two different states in one session."""

    def __init__(self, start: int = 1000):
        self.next = start

    def take(self, n: int) -> list[str]:
        keys = [str(self.next + i) for i in range(n)]
        self.next += n
        return keys


def place(branch: Branch, counter: KeyCounter, back_to: str) -> tuple[Placed, str]:
    """Return ``branch`` under fresh keys from ``counter``, with every ``RETURN`` exit leading to ``back_to``, and
    the key of its entry state."""
    local = list(branch.states)
    keys = dict(zip(local, counter.take(len(local)), strict=True))
    keys[RETURN] = str(back_to)
    out: Placed = {}
    for k in local:
        entry = copy.deepcopy(branch.states[k])
        for row in entry.get("ConversationStateTransitionCriteria") or []:
            row["TargetConversationState"] = keys[str(row["TargetConversationState"])]
        out[keys[k]] = (entry, branch.prompts[k])
    return out, keys[branch.entry]


def _rows(entry: dict[str, Any]) -> list[dict[str, Any]]:
    return entry.setdefault("ConversationStateTransitionCriteria", [])


def add_transition(placed: Placed, row_for: Callable[[str, dict[str, Any], Placed], dict[str, Any] | None],
                   keys: Iterable[str] | None = None, first: bool = False) -> Placed:
    """Add the row ``row_for(key, entry, placed)`` returns to every chosen state, all states when ``keys`` is None, and
    return ``placed``. A state for which it returns None is left alone. A row is added last unless ``first`` is
    true, and IL moves through the lowest row that is done, so a row added last only wins when nothing else is done.
    A row that would lead a state to itself is never added."""
    for k in (placed if keys is None else list(keys)):
        entry, _ = placed[k]
        row = row_for(k, entry, placed)
        if row is None or str(row["TargetConversationState"]) == k:
            continue
        rows = _rows(entry)
        if first:
            rows.insert(0, row)
        else:
            rows.append(row)
    return placed


def after_turns(n: int, target: str | None = None) -> Callable[[str, dict[str, Any], Placed], dict[str, Any] | None]:
    """A row that moves on after ``n`` user turns, so a state that waits for an answer or a phrase never waits
    forever. It goes to ``target``, or when ``target`` is None to where the state goes on by itself. For a fork that
    is the state its arms all lead to, so a user who never chooses is not sent down the first arm. A state that
    already moves on after ``n`` turns or fewer gets nothing."""
    def row(_key: str, entry: dict[str, Any], placed: Placed) -> dict[str, Any] | None:
        existing = _rows(entry)
        if any(r["Analyzer"] == LINE_KINDS["exchanges"] and str(r["Prompt"]).isdigit() and int(r["Prompt"]) <= n
               for r in existing):
            return None
        to = target
        if to is None and existing:
            to = existing[0]["TargetConversationState"]
            if existing[0]["Analyzer"] == LINE_KINDS["choice"] and to in placed:
                arm_rows = _rows(placed[to][0])
                to = arm_rows[0]["TargetConversationState"] if arm_rows else to
        if to is None:
            return None
        return {"Analyzer": LINE_KINDS["exchanges"], "TargetConversationState": str(to), "Prompt": str(n)}
    return row


def when_says(phrase: str, target: str) -> Callable[[str, dict[str, Any], Placed], dict[str, Any]]:
    """A row that moves to ``target`` when the user says ``phrase`` or something that clearly means the same."""
    def row(_key: str, _entry: dict[str, Any], _placed: Placed) -> dict[str, Any]:
        return {"Analyzer": LINE_KINDS["sentence"], "TargetConversationState": str(target),
                "Prompt": _SAYS_WRAPPER + phrase}
    return row


def add_after_turns(placed: Placed, n: int, target: str | None = None, keys: Iterable[str] | None = None) -> Placed:
    """Add a move after ``n`` user turns to the chosen states, as ``after_turns`` describes."""
    return add_transition(placed, after_turns(n, target), keys)


def add_way_back(placed: Placed, target: str, phrase: str = "let's talk about something else, stop, go back",
                 keys: Iterable[str] | None = None) -> Placed:
    """Add a way back to ``target`` when the user asks to leave, to the chosen states."""
    return add_transition(placed, when_says(phrase, target), keys)


def phatic_doorway(entry_key: str, idea: str, back_to: str, name: str = "phatic doorway") -> tuple[dict[str, Any], str]:
    """A phatic doorway state that tells the user what comes next and leads into ``entry_key`` after one turn, or back to
    ``back_to`` when the user does not want it."""
    entry = {"name": name, "session_first_reply_flag": "ignore_EntryUtterance",
             "global_history_window": True, "global_history_turns": 10,
             "ConversationStateTransitionCriteria": [
                 {"Analyzer": LINE_KINDS["sentence"], "TargetConversationState": str(back_to),
                  "Prompt": _SAYS_WRAPPER + "no, not that, something else"},
                 {"Analyzer": LINE_KINDS["exchanges"], "TargetConversationState": str(entry_key), "Prompt": "1"}]}
    return entry, f"Say that next we can talk about this, and ask if that sounds good. {idea}"


def plan_swap(old_keys: Iterable[str], placed: Placed, phatic_doorway_key: str,
              phatic_doorway_state: tuple[dict[str, Any], str]) -> tuple[list[str], Placed, Placed]:
    """Return ``old_keys``, ``placed`` and the rewritten phatic doorway, the three arguments of ``ReplaceBranch``."""
    return list(old_keys), placed, {str(phatic_doorway_key): phatic_doorway_state}


def check_flow(states: dict[str, dict[str, Any]], home: str) -> list[str]:
    """Return the problems of a whole flow given as key to entry, exits to missing states and states with no path
    to ``home``, or an empty list."""
    problems = []
    targets = {k: [str(r["TargetConversationState"]) for r in (e.get("ConversationStateTransitionCriteria") or [])]
               for k, e in states.items()}
    for k, ts in targets.items():
        problems += [f"{k} leads to missing {t}" for t in ts if t not in states]
    reaches = {home}
    grew = True
    while grew:
        grew = False
        for k, ts in targets.items():
            if k not in reaches and any(t in reaches for t in ts):
                reaches.add(k)
                grew = True
    problems += [f"{k} has no way back to {home}" for k in states if k not in reaches]
    return problems


def after_swap(flow_states: dict[str, dict[str, Any]], old: list[str], new: Placed, rewritten: Placed) -> dict[str, Any]:
    """Return the flow's states as they would be after the swap, key to entry, for ``check_flow``."""
    out = {k: e for k, e in flow_states.items() if k not in old}
    out.update({k: e for k, (e, _) in new.items()})
    out.update({k: e for k, (e, _) in rewritten.items()})
    return out


def merge(bundle: dict[str, Any], placed: Placed) -> dict[str, Any]:
    """Write a placed branch into ``bundle``, a flow that has not started, and return it."""
    for k, (entry, prompt) in placed.items():
        bundle.setdefault("ConversationStates", {})[k] = copy.deepcopy(entry)
        bundle.setdefault("PromptBlocks", {}).setdefault("IllocutionaryPrompt", {})[k] = prompt
    return bundle
