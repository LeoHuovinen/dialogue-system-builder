"""The dialogue system builder's flow viewer and chat on a page of your own over IL's text mount, with typed turns and no speech keys.

The dialogue system builder is made to run with Illocutionary Lifecycles (IL), and this server runs on IL alone, with no builder
server. This file reads ``flow.json`` from the folder it is started in and serves ``page/``. Run it from this folder and open
http://127.0.0.1:7875/page/text.html. ``server_press_to_speak.py`` and ``server_pipecat.py`` serve the same page over
IL's other two mounts.
"""
import json

import uvicorn
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from illocutionary_lifecycles.server.adapter_mounts.websocket_mounts.TextAdapterWebsocketMount import TextAdapterWebsocketMount

conversation = json.load(open("flow.json"))      # exported from the builder, used as it is


app = FastAPI()
TextAdapterWebsocketMount(conversation).MountOnApp(app, "/ws")
app.mount("/page", StaticFiles(directory="page", html=True))      # your page, served at /page/
uvicorn.run(app, host="127.0.0.1", port=7875, log_level="warning")
