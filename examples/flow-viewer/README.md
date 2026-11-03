# Embedding the flow viewer and chat

The canvas and the chat from the dialogue system builder, with no editor and no builder server, on your own page, using IL's mounts. Each is a view of IL's `ConnectConversation`, so a page can use either or both, over text or voice.

Run these from this folder, in the environment where IL is installed. These servers don't read `.env`, so export your model key and any other key below in the shell. Each server reads `flow.json` from the folder it is started in.

| Mode | Run | Open | Also needs |
|---|---|---|---|
| Typing | `python server_text.py` | http://127.0.0.1:7875/page/text.html | IL's `text` extra |
| Press to speak | `python server_press_to_speak.py` | http://127.0.0.1:7878/page/press-to-speak.html | IL's `press` extra, with `AZURE_SPEECH_KEY`, `AZURE_SPEECH_REGION`, `SPEECH_LANGUAGE` and `TTS_VOICE` in the environment |
| Open microphone | `python server_pipecat.py` | http://127.0.0.1:7879/page/pipecat.html | IL's `pipecat` extra, `STT_VENDOR` and `TTS_VOICE` in the environment, and that vendor's key |

`README-TEXT.md`, `README-PRESS.md` and `README-VOICE.md` in IL's `examples/` folder explain the mounts themselves.

The page shows the conversation flow as it appears in the builder, one node per conversation state, with the current node highlighted as the conversation moves, and the chat beside it.

## The files

- `flow.json` is the conversation, as the builder's Download flow writes it. IL runs it directly.
- `page/design.json` is the design of the same conversation, as the builder's Export design writes it. Only the viewer needs it, to draw the canvas.
- `page/flow/` and `page/chat/` are the builder's `npm run build:viewer` and `npm run build:chat`, unmodified.
- `page/ConnectConversation.js`, the three mount scripts, `log.js`, `pipecat-client.js` and `karaoke.js` are IL's page scripts, copied from IL.
- `page/text.html`, `page/press-to-speak.html` and `page/pipecat.html` are the three pages, which you can copy and change.

To run your own conversation, replace `flow.json` and `page/design.json` with the two files exported from the builder.

## The viewer

The viewer runs in a frame of its own, so its styles never touch your page. Its full API is:

```js
import { mountFlowViewer } from "./flow/flow-viewer.js";
const design = await (await fetch("design.json")).json();          // the loaded object, not the file name
const nodes = mountFlowViewer(element, { src: "flow/viewer.html", design });
nodes.start();              // the conversation has started on its first node
nodes.adapterCallback(e);   // every adapter callback of the session, where state changes move the lit node
nodes.botMessage();         // a reply has arrived, which lights the node on the text mount
nodes.phase(p);             // on the two speech mounts, "listening", "thinking" or "speaking"
nodes.design(d);            // redraw with another design
```

The viewer's page can also be opened directly. `flow/viewer.html?design=URL` shows a design file Export design wrote, `?template=KEY` one of the builder's own templates, and `&demo=1` added to either replays a sample run, every state change and phase as a conversation would send them.

## The chat

The chat also runs in a frame of its own. With `typing: true` it shows an input, and `onSend` receives each typed line.

```js
import { mountFlowChat } from "./chat/flow-chat.js";
const chat = mountFlowChat(element, { src: "chat/chat.html", typing: true, onSend: (text) => conversation.sendText(text) });
chat.start();                   // the conversation has started
chat.userMessage(text, final);  // the person's line, with final false while they are still speaking
chat.botMessage(text);          // the assistant's reply, or a piece of it
```

## The page

You do not call those methods yourself. `ConnectConversation` calls them on every view you hand it. The relevant part of `page/text.html` is:

```js
import { ConnectConversation } from "./ConnectConversation.js";
import { mountFlowViewer } from "./flow/flow-viewer.js";
import { mountFlowChat } from "./chat/flow-chat.js";

const design = await (await fetch("design.json")).json();
const nodes = mountFlowViewer(document.getElementById("nodes"), { src: "flow/viewer.html", design });
let conversation;
const chat = mountFlowChat(document.getElementById("chat"), { src: "chat/chat.html", typing: true, onSend: (text) => conversation.sendText(text) });
conversation = await ConnectConversation({ way: "text", views: [nodes, chat] });
```

To use only one of them, leave the other out of `views`. The other two pages add their speech controls and use `way` for their mount, and nothing in the viewer or the chat changes.

## The server

`server_text.py` is a complete server. It adds IL's mount to a FastAPI app and serves your page.

```python
conversation = json.load(open("flow.json"))

app = FastAPI()
TextAdapterWebsocketMount(conversation).MountOnApp(app, "/ws")
app.mount("/page", StaticFiles(directory="page", html=True))
uvicorn.run(app, host="127.0.0.1", port=7875, log_level="warning")
```
