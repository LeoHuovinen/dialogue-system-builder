"""``KeepRelayCredentialsFresh``, which keeps ``TURN_URL`` in this process's environment valid for IL's voice mount when
the relay hands out credentials with a short lifetime.

The dialogue system builder is made to run with Illocutionary Lifecycles (IL), which it cannot run without, and IL's voice
mount, ``illocutionary_lifecycles.server.adapter_mounts.webrtc_mounts.PipecatVoiceAdapterWebRtcMount``, reads ``STUN_URL``
and ``TURN_URL`` from the environment on every WebRTC offer, so a browser on a campus or mobile network, which cannot
reach the server's audio ports directly, is relayed. Hosted relays issue credentials that live for a day or less, so a
``TURN_URL`` written once into ``.env`` stops working soon after. When ``.env`` holds ``RELAY_CREDENTIALS_URL`` and
``RELAY_CREDENTIALS_TOKEN`` instead, this module posts to that address with the token as the bearer, expects the reply
``{"iceServers": [{"urls", "username", "credential"}, ...]}``, the shape of a browser's ``RTCIceServer``, which is what
hosted relays answer with, writes the result into ``TURN_URL`` and ``STUN_URL`` of this process, and does so again every
twelve hours, so the values IL reads are always within their lifetime. Nothing is written to ``.env``. Called from
``dialogue_system_builder.app.build`` with voice on.
"""
from __future__ import annotations

import logging
import os
import threading
from urllib.parse import quote

logger = logging.getLogger(__name__)

LIFETIME_SECONDS = 86400          # asked for as "ttl" in the request body, one day, which hosted relays accept
REFRESH_SECONDS = 12 * 3600       # half the lifetime, so a credential is replaced long before it expires


def RelayCredentials() -> tuple[str, str] | None:
    """Return ``(STUN_URL, TURN_URL)`` fetched from ``RELAY_CREDENTIALS_URL`` with ``RELAY_CREDENTIALS_TOKEN`` as the
    bearer, in the two forms IL's voice mount reads, or ``None`` when the variables are missing or the relay refuses.
    The TURN address is the UDP one when the relay offers several, and the username and credential are percent-encoded
    into the URL, as IL's ``WebRtcIceServersFromEnvironment`` expects."""
    url, token = os.environ.get("RELAY_CREDENTIALS_URL", "").strip(), os.environ.get("RELAY_CREDENTIALS_TOKEN", "").strip()
    if not url or not token:
        return None
    import httpx

    try:
        reply = httpx.post(url, json={"ttl": LIFETIME_SECONDS}, timeout=15,
                           headers={"Authorization": f"Bearer {token}", "User-Agent": "dialogue-system-builder"})
        reply.raise_for_status()
        servers = reply.json().get("iceServers", [])
    except Exception as error:  # noqa: BLE001  a relay failure must not stop the server, voice then works only directly
        logger.warning("relay credentials could not be fetched, voice works only where the browser reaches the server directly: %s", error)
        return None
    stun = next((u for s in servers for u in _urls(s) if u.startswith("stun:")), "")
    for s in servers:
        turn = [u for u in _urls(s) if u.startswith("turn:")]
        if turn and s.get("username"):
            address = (next((u for u in turn if "udp" in u), turn[0])).split("?")[0]
            return stun, f"turn://{quote(s['username'], safe='')}:{quote(s['credential'], safe='')}@{address[len('turn:'):]}"
    return None


def _urls(server: dict) -> list[str]:
    """Return the ``urls`` of one ICE server entry as a list, whether the relay sent a string or a list."""
    urls = server.get("urls") or []
    return [str(u) for u in (urls if isinstance(urls, list) else [urls])]


def KeepRelayCredentialsFresh() -> bool:
    """Fetch relay credentials now and every ``REFRESH_SECONDS`` after, writing ``STUN_URL`` and ``TURN_URL`` into this
    process's environment each time, and return whether the first fetch succeeded. Does nothing and returns ``False``
    when the two relay variables are not set, so a deployment with its own ``TURN_URL`` in ``.env`` is left alone. The
    refresh runs in a daemon thread, so it never keeps the process alive. Called by ``dialogue_system_builder.app.build``
    when voice is on."""
    if not (os.environ.get("RELAY_CREDENTIALS_URL") and os.environ.get("RELAY_CREDENTIALS_TOKEN")):
        return False

    def refresh() -> bool:
        pair = RelayCredentials()
        if pair:
            stun, os.environ["TURN_URL"] = pair
            if stun:
                os.environ["STUN_URL"] = stun
            logger.info("relay credentials refreshed, valid for %d hours", LIFETIME_SECONDS // 3600)
        return bool(pair)

    def loop() -> None:
        while True:
            threading.Event().wait(REFRESH_SECONDS)
            refresh()

    first = refresh()
    threading.Thread(target=loop, name="relay-credentials", daemon=True).start()
    return first
