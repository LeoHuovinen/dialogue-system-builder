"""``DialogueSystemBuilderPressToSpeakAdapterWebsocketMount`` runs a builder design for a person who holds a button while
talking. It is IL's ``illocutionary_lifecycles.server.adapter_mounts.websocket_mounts.PressToSpeakAdapterWebsocketMount``
with two changes. Each connection gets the session the builder reserved for it, and the replies are spoken in the voice
that session's design names.

The dialogue system builder runs every conversation on Illocutionary Lifecycles (IL). A person draws a conversation as
steps and lines on a canvas, the builder compiles it to the flow IL runs, and the person talks to it through one of IL's
mounts. This module is the counterpart of ``dialogue_system_builder.voice_mount.DialogueSystemBuilderPipecatVoiceAdapterWebRtcMount``
for a design whose ``talking`` is "hold". The speech travels over a plain WebSocket with no WebRTC and no Pipecat, and the
assistant hears nothing while the button is up.

Before a page connects, it asks the builder's ``/api/sessions`` route to reserve a session for its design, and it
connects with the session id it gets back. ``dialogue_system_builder.mounts`` describes that reservation, and both voice
mounts build their session through ``dialogue_system_builder.mounts.DialogueSystemBuilderConversationSession``.

IL's mount checks ``AZURE_SPEECH_KEY`` and ``AZURE_SPEECH_REGION`` when ``dialogue_system_builder.app.build`` adds it to
the app at server start, and ``build`` skips this mount when the two settings or Azure's Speech SDK are missing. The
speech recognition language is the one given at construction, ``en-US`` by default, because the builder's voice list
offers English voices only.
"""
from __future__ import annotations

from typing import Any

from illocutionary_lifecycles.server.adapter_mounts.websocket_mounts.PressToSpeakAdapterWebsocketMount import (
    PressToSpeakAdapterWebsocketMount,
)

from dialogue_system_builder.mounts import (
    DialogueSystemBuilderConversationSession,
    ReservedDialogueSystemBuilderDesign,
)


class DialogueSystemBuilderPressToSpeakAdapterWebsocketMount(PressToSpeakAdapterWebsocketMount):
    """IL's press-to-speak mount, with the reserved session and the design's voice for each connection, as the module
    docstring above explains."""

    def __init__(self, ConversationStateInitBundle: dict, language: str = "en-US", **Keywords: Any) -> None:
        """Keep the flow, the speech recognition language and the hooks as IL's mount does. IL refuses an empty
        ``TTSVoice``, so this passes a placeholder that is never spoken, because every connection takes its voice from its
        own design through ``MountVoiceName``. ``Keywords`` go to IL's constructor unchanged."""
        super().__init__(ConversationStateInitBundle, TTSVoice="placeholder, never spoken", language=language, **Keywords)

    def MountVoiceName(self, RequestData: Any = None) -> str:
        """Return the voice the replies of this connection are spoken in. ``NewConversationSession`` runs first, reads the
        voice from the reserved design and copies it into ``RequestData`` as ``DialogueSystemBuilderTTSVoice``, because it
        also deletes the reservation and the design cannot be read again afterwards. Raises ``ValueError`` beginning "the
        reserved design names no voice" when that value is missing."""
        voice = str((RequestData or {}).get("DialogueSystemBuilderTTSVoice") or "")
        if not voice:
            raise ValueError("the reserved design names no voice; the builder's checks require one before Start with voice")
        return voice

    def NewConversationSession(self, RequestData: Any = None) -> Any:
        """Return the session for this connection, built but not started, since IL's ``Attend`` starts it. ``RequestData``
        is the socket URL's query string as a dict and names the reserved session in ``session_id``. Before building, this
        copies the design's voice into ``RequestData`` as ``DialogueSystemBuilderTTSVoice`` for ``MountVoiceName``. Raises
        ``ValueError`` beginning "the reserved design names no voice" when the design has none. IL's
        ``PressToSpeakAdapterWebsocketMount.Attend`` calls this once per connection."""
        row = ReservedDialogueSystemBuilderDesign(RequestData)
        voice = str(row["design"].get("voice") or "")
        if not voice:
            raise ValueError("the reserved design names no voice; the builder's checks require one before Start with voice")
        if isinstance(RequestData, dict):
            RequestData["DialogueSystemBuilderTTSVoice"] = voice
        return DialogueSystemBuilderConversationSession(RequestData)
