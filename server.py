"""Runs the dialogue system builder, a program made to run with Illocutionary Lifecycles (IL), in which a person draws a
conversation on a canvas, talks to it through IL's mounts and saves or exports it.

``python server.py`` runs it on http://127.0.0.1:8200, reading the keys from a ``.env`` file in this folder, as
``.env.example`` lists. Pipecat is optional. Without it the builder runs the same, on text conversations, and the page
greys out Start with voice. ``--host 0.0.0.0`` and ``--port`` serve it to others, and ``--data`` names the folder its
files go in. ``README-HOSTING.md`` says what else that takes. Everything else is in ``dialogue_system_builder.app``.
"""
import argparse
import importlib.util

from dotenv import load_dotenv

load_dotenv()

from dialogue_system_builder.app import serve  # noqa: E402

parser = argparse.ArgumentParser(description="Run the dialogue system builder.")
parser.add_argument("--text-only", action="store_true", help="grey out voice even when Pipecat is installed")
parser.add_argument("--host", default="127.0.0.1")
parser.add_argument("--port", type=int, default=8200)
parser.add_argument("--data", default=None, help="the folder for sessions, flows and testing links (default: ./data)")
parser.add_argument("--stt", default="azure", help="IL's STT vendor for voice: azure, elevenlabs, openai or whisper")
options = parser.parse_args()

voice = not options.text_only and importlib.util.find_spec("pipecat") is not None
serve(voice=voice, host=options.host, port=options.port, data_dir=options.data, stt_vendor=options.stt)
