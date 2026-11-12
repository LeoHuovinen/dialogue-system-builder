"""The dialogue system builder's server, ``build`` and ``serve``, a FastAPI app with IL's text mount on it at "/ws", the
builder's OpenAI-compatible endpoint mount at "/v1" and, with voice on, IL's voice mount on Pipecat's runner app, plus the
builder's own routes for its pages, its checks and its testing links.

The dialogue system builder is made to run with Illocutionary Lifecycles (IL), which it cannot run without, and in it a person
draws a conversation as steps and lines on a canvas, compiles it to the flow IL runs, and talks to it through IL's
mounts, and this module, in the server folder ``dialogue_system_builder``, is the server the builder's pages talk to, the editor
at "/", a testing link's page at "/try/<ConversationDesignPublicLinkToken>" and its results at "/results/<ConversationDesignPublicLinkToken>". Every conversation goes through
IL's topology and nothing else, the page's ``ConnectConversation.js`` from IL speaking the wire of IL's mount, the mount
building the session and its adapter, and the adapter talking to IL's ``SessionProvider``. The page reserves each
session first at ``/api/sessions``, as ``dialogue_system_builder.mounts`` explains. The builder's routes never hold a
conversation, they check, compile, keep testing links and their ConversationDesignAPIKey, and read finished records.

The server keeps nothing about its visitors and runs as one process with its files in one folder, which is all a
person on localhost needs and all someone hosting it has to back up. Every setting is an argument of ``serve`` or a
variable IL reads from the environment, as the README's part on the ``.env`` file lists. ``server.py`` calls ``serve``.
"""
from __future__ import annotations

import datetime
import logging
import os
import sys
import uuid
from typing import Any

# The repository root, which holds the frontend build and the dialogue_system_builder package.
_HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _HERE not in sys.path:
    sys.path.insert(0, _HERE)

from fastapi import APIRouter, Request  # noqa: E402
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse  # noqa: E402

from illocutionary_lifecycles.server.adapters.flow_adapters.SaveLoadFlowAdapter import SaveLoadFlowAdapter  # noqa: E402

from dialogue_system_builder import share, store  # noqa: E402
from dialogue_system_builder.checks import validate_design  # noqa: E402
from dialogue_system_builder.compile import CompileError, compile_design  # noqa: E402
from dialogue_system_builder.mounts import (  # noqa: E402
    DialogueSystemBuilderHTTPEndpointMount,
    DialogueSystemBuilderTextAdapterWebsocketMount,
    ReserveDialogueSystemBuilderConversationSession,
)

logger = logging.getLogger(__name__)
router = APIRouter()
VOICE = True
app = None
VOICE_MOUNT = None
PRESS = False   # True when ``build`` added the hold-to-talk mount, which needs Azure's Speech SDK and the speech key and region

_DIST = os.path.join(_HERE, "frontend", "dist")

# IL's mounts require a flow at construction, and no connection runs this one, since every session is the reserved one.
_NO_FLOW = {"PromptBlocks": {}, "ConversationStates": {}}
# The one model name the endpoint at "/v1" lists and echoes. A request's own "model" field is information only.
ENDPOINT_MODEL_NAME = "dialogue-system-builder"


async def _json_body(request: Request) -> Any:
    """Return the request's JSON body, or ``None`` when it is not JSON."""
    try:
        return await request.json()
    except (ValueError, UnicodeDecodeError):
        return None


def _no_design() -> JSONResponse:
    """Return the 400 answer for a body that holds no design."""
    return JSONResponse({"ok": False, "error": "no design"}, status_code=400)


def _VoiceWayOf(design: dict[str, Any]) -> str:
    """Return the name of the mount a voice conversation of ``design`` runs on. It is "press", the hold-to-talk mount,
    when the design's ``talking`` is "hold". Otherwise it is "voice", the hands-free Pipecat mount."""
    return "press" if (design or {}).get("talking") == "hold" else "voice"


def _VoiceRunsHere(design: dict[str, Any]) -> bool:
    """Return whether this server has the mount ``_VoiceWayOf`` names for ``design``, so that the design can run by
    voice here."""
    return PRESS if _VoiceWayOf(design) == "press" else VOICE


@router.post("/api/sessions")
async def reserve_session(request: Request):
    """Reserve one conversation session and return ``{"ok", "session_id", "endings"}``, the id the page connects to
    IL's mount with and the indexes of the design's End steps. The body is ``{"way", "design"}`` for the designer's own
    Start, where ``way`` is "text", "voice" or "press", or ``{"way", "ConversationDesignPublicLinkToken"}`` for a run through a testing link. A
    testing link runs the server's stored copy of its design, and a text or voice run is allowed only when the link's
    settings allow it. Answers 404 "This link does not exist." for an unknown
    link and 400 with the check's findings for a design that cannot run on that way."""
    body = await _json_body(request)
    if not isinstance(body, dict):
        return _no_design()
    way = body.get("way") if body.get("way") in ("voice", "press") else "text"
    ConversationDesignPublicLinkToken = str(body.get("ConversationDesignPublicLinkToken") or "") or None
    if way == "voice" and not VOICE:
        return JSONResponse({"ok": False, "error": "this server runs on text alone"}, status_code=400)
    if way == "press" and not PRESS:
        return JSONResponse({"ok": False, "error": "this server has no hold-to-talk voice"}, status_code=400)
    if ConversationDesignPublicLinkToken:
        link = share.TestingLinkDesign(ConversationDesignPublicLinkToken)
        if link is None:
            return JSONResponse({"ok": False, "error": "This link does not exist."}, status_code=404)
        if way != "text" and not share.TestingLinkVoice(link):
            return JSONResponse({"ok": False, "error": "this testing link is text only"}, status_code=400)
        if way == "text" and not share.TestingLinkText(link) and _VoiceRunsHere(link["design"]) and share.TestingLinkVoice(link):
            return JSONResponse({"ok": False, "error": "this testing link is voice only"}, status_code=400)
        design = link["design"]
    else:
        design = body.get("design")
        if not isinstance(design, dict):
            return _no_design()
    checked = validate_design(design, require_voice=(way != "text"))
    if not checked["ok"]:
        return JSONResponse(checked, status_code=400)
    session_id = ReserveDialogueSystemBuilderConversationSession(design, ConversationDesignPublicLinkToken)
    return JSONResponse({"ok": True, "session_id": session_id, "endings": compile_design(design)["endings"]})


_VOICES: list[dict] = []


@router.get("/api/voices")
async def voices():
    """Return every English voice the Azure Speech region offers, for the design's voice choice, fetched once and kept
    in memory, or 502 with the error when the list cannot be fetched, as on a server with no speech key."""
    global _VOICES
    if not _VOICES:
        import httpx
        region = os.environ.get("AZURE_SPEECH_REGION", "")
        try:
            async with httpx.AsyncClient(timeout=20) as client:
                r = await client.get(f"https://{region}.tts.speech.microsoft.com/cognitiveservices/voices/list",
                                     headers={"Ocp-Apim-Subscription-Key": os.environ.get("AZURE_SPEECH_KEY", "")})
                r.raise_for_status()
            _VOICES = sorted(({"name": v["ShortName"], "locale": v["Locale"], "localeName": v.get("LocaleName", v["Locale"]),
                               "displayName": v.get("DisplayName", v["ShortName"]), "gender": v.get("Gender", "")}
                              for v in r.json() if str(v.get("Locale", "")).lower().startswith("en-")),
                             key=lambda v: (v["locale"], v["name"]))
        except Exception as exc:  # the list is a convenience, and text conversations need none of it
            logger.warning("voice list unavailable: %s", exc)
            return JSONResponse({"voices": [], "error": str(exc)}, status_code=502)
    return JSONResponse({"voices": _VOICES})


@router.post("/api/generate")
async def generate(request: Request):
    """Return a whole design generated from the body's ``description`` by ``dialogue_system_builder.generate.generate_design``,
    with the findings of the builder's check beside it under their own key."""
    from dialogue_system_builder.generate import GenerateError, generate_design
    body = await _json_body(request)
    try:
        design = await generate_design(str((body or {}).get("description") or ""))
    except (GenerateError, RuntimeError) as exc:   # RuntimeError is IL's own when no model is configured
        return JSONResponse({"ok": False, "error": str(exc)})
    checked = validate_design(design, require_voice=False)
    return JSONResponse({"ok": True, "design": design, "findings": checked["findings"], "refusal": checked["refusal"]})


@router.post("/api/share")
async def share_design(request: Request):
    """Store the body's ``design`` behind a testing link, the existing one named by ``ConversationDesignPublicLinkToken`` or a new one, and return
    ``{"ConversationDesignPublicLinkToken", "link", "url", "ConversationDesignAPIKey", "text", "voice", "micCheck"}``. A ``text``,
    ``voice`` or ``micCheck`` key in the body sets that link setting to true or false. A key left out of the body leaves
    that setting as it was. ``url`` names the host the request
    reached, so the link works for others behind a proxy that passes ``X-Forwarded-Proto`` and ``Host``.
    ``ConversationDesignAPIKey`` is the link's API key, made by this Save when the link had none. A Save that names an
    existing link which already has an API key must carry that key in the header ``X-Conversation-Design-API-Key``, so
    that a person who only holds the public link code cannot overwrite the design. Answers 403 without it and 400 for a
    design that does not compile."""
    body = await _json_body(request)
    if not isinstance(body, dict) or not isinstance(body.get("design"), dict):
        return _no_design()
    try:
        compile_design(body["design"])
    except CompileError as exc:
        return JSONResponse({"ok": False, "error": str(exc)}, status_code=400)
    wanted = str(body.get("ConversationDesignPublicLinkToken") or "") or None
    existing_key = share.ConversationDesignAPIKey(wanted) if wanted else None
    if existing_key and request.headers.get("x-conversation-design-api-key") != existing_key:
        return JSONResponse({"ok": False, "error": "This link was saved from another browser."}, status_code=403)
    def setting(name: str) -> bool | None:
        return bool(body[name]) if name in body else None
    ConversationDesignPublicLinkToken = share.SaveTestingLink(body["design"], str(body.get("label") or ""), wanted,
                                                              setting("voice"), setting("text"), setting("micCheck"))
    link = share.TestingLinkDesign(ConversationDesignPublicLinkToken) or {}
    proto = request.headers.get("x-forwarded-proto") or request.url.scheme
    host = request.headers.get("host") or request.url.netloc
    return JSONResponse({"ConversationDesignPublicLinkToken": ConversationDesignPublicLinkToken, "link": f"/try/{ConversationDesignPublicLinkToken}",
                         "url": f"{proto}://{host}/try/{ConversationDesignPublicLinkToken}",
                         "ConversationDesignAPIKey": share.ConversationDesignAPIKey(ConversationDesignPublicLinkToken),
                         "text": share.TestingLinkText(link), "voice": bool(link.get("voice")), "micCheck": bool(link.get("mic_check"))})


@router.get("/api/share/counts")
async def share_counts(links: str = ""):
    """Return ``{"counts": {link code: runs}}`` for the comma-separated link codes ``links``, the page's "tried ×N"."""
    return JSONResponse({"counts": {t: share.TestingLinkRunCount(t) for t in links.split(",") if t}})


@router.get("/api/share/{ConversationDesignPublicLinkToken}/design")
async def shared_design(ConversationDesignPublicLinkToken: str):
    """Return the design and label behind the testing link ``ConversationDesignPublicLinkToken``, or 404 for an unknown link.
    ``voice`` is true when the link allows voice and this server has the mount the design needs. ``text`` is true when the
    link allows text, and also whenever ``voice`` is false, so testers always have a way to talk. ``micCheck`` says
    whether a voice start opens the microphone check first."""
    link = share.TestingLinkDesign(ConversationDesignPublicLinkToken)
    if link is None:
        return JSONResponse({"error": "unknown link"}, status_code=404)
    voice = _VoiceRunsHere(link["design"]) and share.TestingLinkVoice(link)
    return JSONResponse({"design": link["design"], "label": link.get("label") or "", "voice": voice,
                         "text": share.TestingLinkText(link) or not voice, "micCheck": bool(link.get("mic_check"))})


@router.get("/api/share/{ConversationDesignPublicLinkToken}/runs")
async def shared_runs(ConversationDesignPublicLinkToken: str):
    """Return ``{"ConversationDesignPublicLinkToken", "runs"}``, every run through the testing link ``ConversationDesignPublicLinkToken``, or 404 for an unknown link."""
    if share.TestingLinkDesign(ConversationDesignPublicLinkToken) is None:
        return JSONResponse({"error": "unknown link"}, status_code=404)
    return JSONResponse({"ConversationDesignPublicLinkToken": ConversationDesignPublicLinkToken, "runs": share.TestingLinkRuns(ConversationDesignPublicLinkToken)})


@router.get("/health")
async def health():
    """Return ``{"ok": true}`` while the server answers."""
    return JSONResponse({"ok": True})


@router.get("/api/capabilities")
async def capabilities():
    """Return ``{"voice", "press", "text"}``, each true when this server can start that kind of conversation. ``voice``
    is hands-free voice on Pipecat, ``press`` is hold-to-talk voice, and ``text`` is typing. The page greys out every Start
    button the server cannot serve."""
    return JSONResponse({"voice": VOICE, "press": PRESS, "text": True})


@router.post("/api/flow")
async def flow(request: Request):
    """Return the design in the body compiled to IL's flow, saved through IL's ``SaveLoadFlowAdapter`` under
    ``<DIALOGUE_SYSTEM_BUILDER_DATA>/flows`` and sent as a file named after the design's title, the file a server hands to IL's mounts
    as it is. Answers 400 with the check's findings for a design that cannot run."""
    design = await _json_body(request)
    if not isinstance(design, dict):
        return _no_design()
    checked = validate_design(design, require_voice=False)
    if not checked["ok"]:
        return JSONResponse(checked, status_code=400)
    stamp = datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    path = os.path.join(store.data_dir(), "flows", f"{stamp}-{uuid.uuid4().hex[:8]}.json")
    SaveLoadFlowAdapter().save_flow(compile_design(design)["bundle"], path)
    name = "".join(c if c.isalnum() or c in "-_ " else "" for c in str(design.get("title") or "")).strip() or "flow"
    return FileResponse(path, media_type="application/json", filename=f"{name}.json")


@router.post("/api/validate")
async def validate(request: Request):
    """Return the builder's check of the design in the body, ``{"ok", "findings", "refusal"}``, with ``?mode=text`` for
    a Start with text only, which needs no voice, and ``?quick=1`` to leave out IL's session start, for the page's
    colouring of the Start buttons on every edit."""
    design = await _json_body(request)
    if not isinstance(design, dict):
        return _no_design()
    return JSONResponse(validate_design(design, require_voice=(request.query_params.get("mode") != "text"),
                                        quick=request.query_params.get("quick") == "1"))


def _page(name: str):
    """Return the built page ``name`` from ``frontend/dist``, or a note that the page is not built yet."""
    path = os.path.join(_DIST, name)
    if os.path.isfile(path):
        return FileResponse(path, media_type="text/html")
    return JSONResponse({"ok": True, "frontend": "not built yet"})


@router.get("/")
async def index():
    """The editor page."""
    return _page("index.html")


@router.get("/viewer.html")
async def viewer():
    """The flow viewer alone, the builder's canvas in conversation mode, driven by the page that embeds it."""
    return _page("viewer.html")


@router.get("/flow-viewer.js")
async def flow_viewer_js():
    """The script whose ``mountFlowViewer`` embeds the viewer in any page as one view of IL's ``ConnectConversation``."""
    return FileResponse(os.path.join(_DIST, "flow-viewer.js"), media_type="text/javascript")


@router.get("/try/{ConversationDesignPublicLinkToken}")
async def try_page(ConversationDesignPublicLinkToken: str):
    """The tester's page of the testing link ``ConversationDesignPublicLinkToken``, or a 404 page for an unknown link."""
    if share.TestingLinkDesign(ConversationDesignPublicLinkToken) is None:
        return HTMLResponse("<p>This link does not exist.</p>", status_code=404)
    return _page("try.html")


@router.get("/results/{ConversationDesignPublicLinkToken}")
async def results_page(ConversationDesignPublicLinkToken: str):
    """The page of the testers' conversations through the link ``ConversationDesignPublicLinkToken``, or a 404 page for an unknown link."""
    if share.TestingLinkDesign(ConversationDesignPublicLinkToken) is None:
        return HTMLResponse("<p>This link does not exist.</p>", status_code=404)
    return _page("results.html")


def build(voice: bool = True, stt_vendor: str = "azure") -> Any:
    """Return the app with IL's mounts and every builder route on it. With ``voice`` on the app is Pipecat's runner app
    with IL's voice mount, using ``stt_vendor`` for STT, and the relay credentials of ``dialogue_system_builder.relay`` kept
    fresh when ``.env`` names a relay that issues credentials, and without it the app is a bare FastAPI and Pipecat is never imported. In both cases IL's text mount is at "/ws", the builder's OpenAI-compatible endpoint mount is at "/v1", and the
    built pages' ``assets`` and ``il`` folders are served, the second holding IL's page scripts. IL's press-to-speak
    mount for hold-to-talk is added at "/press" when Azure's Speech SDK is installed and the speech key and region are set.
    Called by ``serve``."""
    global VOICE, PRESS, app, VOICE_MOUNT
    VOICE = bool(voice)
    if VOICE:
        from pipecat.runner.run import app as runner_app

        from dialogue_system_builder.relay import KeepRelayCredentialsFresh
        from dialogue_system_builder.voice_mount import (
            DialogueSystemBuilderPipecatVoiceAdapterWebRtcMount,
        )
        app = runner_app
        KeepRelayCredentialsFresh()   # TURN_URL fetched from the relay named in .env and kept within its lifetime
        VOICE_MOUNT = DialogueSystemBuilderPipecatVoiceAdapterWebRtcMount(_NO_FLOW, STTVendor=stt_vendor)
        VOICE_MOUNT.MountOnApp(app)
    else:
        from fastapi import FastAPI
        app = FastAPI()
        VOICE_MOUNT = None
    DialogueSystemBuilderTextAdapterWebsocketMount(_NO_FLOW).MountOnApp(app, "/ws")
    try:   # hold-to-talk needs Azure's Speech SDK and AZURE_SPEECH_KEY and AZURE_SPEECH_REGION, and is left off without them
        import importlib.util
        # IL imports the SDK only when someone first presses the button, so a missing SDK would otherwise surface then.
        if importlib.util.find_spec("azure.cognitiveservices.speech") is None:
            raise ImportError("Azure's Speech SDK azure-cognitiveservices-speech is not installed")
        from dialogue_system_builder.press_mount import (
            DialogueSystemBuilderPressToSpeakAdapterWebsocketMount,
        )
        DialogueSystemBuilderPressToSpeakAdapterWebsocketMount(_NO_FLOW).MountOnApp(app, "/press")
        PRESS = True
    except (ImportError, RuntimeError, ValueError) as exc:
        PRESS = False
        logger.info("hold-to-talk voice is off: %s", exc)
    DialogueSystemBuilderHTTPEndpointMount(_NO_FLOW, IdleSeconds=180, ModelName=ENDPOINT_MODEL_NAME).MountOnApp(app, "/v1")
    app.include_router(router)
    from fastapi.staticfiles import StaticFiles
    for folder in ("assets", "il"):
        if os.path.isdir(os.path.join(_DIST, folder)):
            app.mount(f"/{folder}", StaticFiles(directory=os.path.join(_DIST, folder)), name=folder)
    return app


def serve(voice: bool = True, host: str = "127.0.0.1", port: int = 8200, data_dir: str | None = None,
          stt_vendor: str = "azure") -> None:
    """Run the dialogue system builder on ``host`` and ``port`` until it is stopped. With ``voice`` on, IL's voice mount runs
    Pipecat's runner, which replaces ``sys.argv`` with its own arguments. With ``voice`` off, uvicorn runs the app on
    text alone. ``data_dir`` sets ``DIALOGUE_SYSTEM_BUILDER_DATA``, where sessions, flows and testing links are kept."""
    if data_dir:
        os.environ["DIALOGUE_SYSTEM_BUILDER_DATA"] = data_dir
    build(voice, stt_vendor)
    if VOICE:
        VOICE_MOUNT.StartWebRtcServerProcess(VOICE_MOUNT.Attend, host=host, port=port)
    else:
        import uvicorn
        uvicorn.run(app, host=host, port=port, log_level="warning")
