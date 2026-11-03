"""The dialogue system builder's flow viewer and chat on a page of your own over IL's press-to-speak mount, where a person holds a
button to speak, with no Pipecat.

The dialogue system builder is made to run with Illocutionary Lifecycles (IL), and this server runs on IL alone, with no builder
server. This file reads ``flow.json`` from the folder it is started in, serves ``page/``, and takes ``SPEECH_LANGUAGE`` and
``TTS_VOICE`` from the environment. Run it from this folder and open http://127.0.0.1:7878/page/press-to-speak.html.
``server_text.py`` and ``server_pipecat.py`` serve the same page over IL's other two mounts.
"""
import json
import os

import uvicorn
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from illocutionary_lifecycles.server.adapter_mounts.websocket_mounts.PressToSpeakAdapterWebsocketMount import PressToSpeakAdapterWebsocketMount

conversation = json.load(open("flow.json"))      # exported from the builder, used as it is


app = FastAPI()
PressToSpeakAdapterWebsocketMount(conversation, language=os.environ["SPEECH_LANGUAGE"], TTSVoice=os.environ["TTS_VOICE"]).MountOnApp(app, "/ws")
app.mount("/page", StaticFiles(directory="page", html=True))      # your page, served at /page/
uvicorn.run(app, host="127.0.0.1", port=7878, log_level="warning")
