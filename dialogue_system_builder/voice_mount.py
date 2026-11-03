"""``DialogueSystemBuilderPipecatVoiceAdapterWebRtcMount``, the dialogue system builder's voice way, which is IL's
``illocutionary_lifecycles.server.adapter_mounts.webrtc_mounts.PipecatVoiceAdapterWebRtcMount`` with the session of each
offer built from the design the builder reserved for it, and spoken in the voice that design names.

The dialogue system builder is made to run with Illocutionary Lifecycles (IL), which it cannot run without, and in it a person
draws a conversation as steps and lines on a canvas, compiles it to the flow IL runs, and talks to it through IL's
mounts, and this module, in the builder's server folder ``dialogue_system_builder``, is the voice twin of
``dialogue_system_builder.mounts.DialogueSystemBuilderTextAdapterWebsocketMount``, chosen when the builder's ``serve`` is called with
voice on. Both build their session with ``dialogue_system_builder.mounts.DialogueSystemBuilderConversationSession``, so the module
docstring of ``dialogue_system_builder.mounts`` explains the reservation. This module imports Pipecat through IL's voice mount,
so it is imported only with voice on. The STT is the vendor ``serve`` is given, and a reply is spoken in the design's own voice, the canvas field ``voice``,
which the builder's check requires before a voice Start.
"""
from __future__ import annotations

from typing import Any

from illocutionary_lifecycles.server.adapter_mounts.webrtc_mounts.PipecatVoiceAdapterWebRtcMount import (
    PipecatVoiceAdapterWebRtcMount,
)

from dialogue_system_builder.mounts import DialogueSystemBuilderConversationSession, ReservedDialogueSystemBuilderDesign


class DialogueSystemBuilderPipecatVoiceAdapterWebRtcMount(PipecatVoiceAdapterWebRtcMount):
    """IL's voice mount, whose session per offer is the one the builder reserved and whose voice is that design's, as
    the module docstring above explains."""

    def __init__(self, ConversationStateInitBundle: dict, STTVendor: str, **Keywords: Any) -> None:
        """Keep the flow, the STT and the hooks as IL's voice mount does, with no voice of the mount's own. Every voice
        comes from the design reserved for the connection, and ``NewConversationSession`` raises when a design names
        none, so the value handed to IL's ``TTSVoice``, which IL refuses to leave empty, is never spoken. ``STTVendor``
        and ``Keywords`` are passed to IL's constructor as they are."""
        super().__init__(ConversationStateInitBundle, TTSVoice="the reserved design's voice", STTVendor=STTVendor, **Keywords)

    def MountVoiceName(self, RequestData: Any = None) -> str:
        """Return the TTS voice name of the design reserved under ``RequestData``'s ``session_id``, which
        ``NewConversationSession`` copied into ``RequestData`` as ``DialogueSystemBuilderTTSVoice``, and raise ``ValueError``
        beginning "the reserved design names no voice" when it is missing. IL's ``PipecatVoiceAdapterWebRtcMount.Attend``
        calls it after ``NewConversationSession``, which has removed the reservation, so the voice is copied into the
        request data there first."""
        voice = str((RequestData or {}).get("DialogueSystemBuilderTTSVoice") or "")
        if not voice:
            raise ValueError("the reserved design names no voice; the builder's checks require one before Start with voice")
        return voice

    def NewConversationSession(self, RequestData: Any = None) -> Any:
        """Return the started session ``dialogue_system_builder.mounts.DialogueSystemBuilderConversationSession`` builds for
        ``RequestData``, the offer's request data, which carries ``session_id``, after copying the reserved design's
        voice into ``RequestData`` as ``DialogueSystemBuilderTTSVoice`` for ``MountVoiceName``. Raises ``ValueError`` beginning
        "the reserved design names no voice" when the design has no ``voice``, before any session starts. IL's voice
        mount starts its session here, so this does too, and the start raises what IL's session start raises for a
        wrong flow. Called by IL's ``PipecatVoiceAdapterWebRtcMount.Attend`` once per offer."""
        row = ReservedDialogueSystemBuilderDesign(RequestData)
        voice = str(row["design"].get("voice") or "")
        if not voice:
            raise ValueError("the reserved design names no voice; the builder's checks require one before Start with voice")
        if isinstance(RequestData, dict):
            RequestData["DialogueSystemBuilderTTSVoice"] = voice
        provider = DialogueSystemBuilderConversationSession(RequestData)
        provider.start()
        return provider
