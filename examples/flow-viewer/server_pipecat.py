"""The dialogue system builder's flow viewer and chat on a page of your own over IL's Pipecat voice mount, where the microphone
stays open and a pause ends the turn.

The dialogue system builder is made to run with Illocutionary Lifecycles (IL), and this server runs on IL alone, with no builder
server. This file reads ``flow.json`` from the folder it is started in, serves ``page/``, and takes ``STT_VENDOR`` and
``TTS_VOICE`` from the environment. Run it from this folder and open http://127.0.0.1:7879/page/pipecat.html.
``server_text.py`` and ``server_press_to_speak.py`` serve the same page over IL's other two mounts.
"""
import json
import os

from fastapi.staticfiles import StaticFiles
from pipecat.runner.run import app

from illocutionary_lifecycles.server.adapter_mounts.webrtc_mounts.PipecatVoiceAdapterWebRtcMount import PipecatVoiceAdapterWebRtcMount

conversation = json.load(open("flow.json"))      # exported from the builder, used as it is


mount = PipecatVoiceAdapterWebRtcMount(conversation, STTVendor=os.environ["STT_VENDOR"], TTSVoice=os.environ["TTS_VOICE"])
mount.MountOnApp(app)
app.mount("/page", StaticFiles(directory="page", html=True))      # your page, served at /page/; Pipecat's own page at /client/
mount.StartWebRtcServerProcess(mount.Attend, host="127.0.0.1", port=7879)
