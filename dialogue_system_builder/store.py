"""``data_dir`` and the folders under it, where the dialogue system builder keeps what it writes on disk, in the server folder
``dialogue_system_builder``.

The dialogue system builder is made to run with Illocutionary Lifecycles (IL), which it cannot run without, and in it a person
draws a conversation as steps and lines on a canvas, compiles it to the flow IL runs, and talks to it through IL's
mounts. The data folder holds ``sessions/``, one folder per conversation as IL's local storage vendor writes it,
``flows/``, every file Download flow made, and ``shares/``, one file per testing link. The data folder is ``DIALOGUE_SYSTEM_BUILDER_DATA`` from the
environment, set by ``--data`` on ``server.py``, or ``data`` in the builder's folder. Saved conversations live in the
browser, not here. Read by ``dialogue_system_builder.app``, ``dialogue_system_builder.mounts`` and ``dialogue_system_builder.share``.
"""
from __future__ import annotations

import os

_HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def data_dir() -> str:
    """Return the folder the builder keeps its files in."""
    return os.environ.get("DIALOGUE_SYSTEM_BUILDER_DATA") or os.path.join(_HERE, "data")


def sessions_dir() -> str:
    """Return the folder of IL's stored sessions."""
    return os.path.join(data_dir(), "sessions")
