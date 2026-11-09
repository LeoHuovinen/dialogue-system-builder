"""The server folder of the dialogue system builder, and the place a reader of the repository starts.

The dialogue system builder is made to run with Illocutionary Lifecycles (IL), which it cannot run without, and in it a person
draws a conversation as steps and lines on a canvas, compiles it to the flow IL runs, and talks to it through IL's
mounts. IL is installed from its own repository beside this one, as ``README.md`` says, and this package imports it as
``illocutionary_lifecycles``.

The repository has six parts, each with one task. The server, this folder, checks, compiles and stores designs, keeps
testing links, reads finished records and puts IL's two mounts on its app, and knows nothing of the canvas. The editor,
the top level of ``frontend/src`` with the entry ``frontend/index.html``, is the canvas, the sidebar, the panes, Start,
Save and the saved conversations. The shared canvas parts, ``frontend/src/store.js`` with ``slices``, ``nodes``,
``edges``, ``flow``, ``registry.js``, ``layout.js`` and ``styles.css``, hold the design as data and the live view of a
conversation on it. The separable views, ``frontend/src/viewer`` with ``frontend/public-flow-viewer.js`` and
``frontend/src/chat`` with ``frontend/public-flow-chat.js``, are the canvas alone and the chat alone, each a view of
IL's ``ConnectConversation`` in a frame of its own, and ``examples/flow-viewer`` runs them with no builder server. The
testing link's pages are ``frontend/src/try.jsx`` and ``frontend/src/results.jsx``. IL's page scripts, the browser half
of its mounts, are copies in ``frontend/public/il`` and ``examples/flow-viewer/page`` and are changed only by copying
them from IL again.

Every conversation follows one chain. A page of the builder speaks the wire of an IL mount through IL's
``ConnectConversation.js``, the mount builds the session and its adapter, and the adapter talks to
``illocutionary_lifecycles.core.session_provider.SessionProvider``, and nothing of the builder reaches further in. The
builder adds one thing to that chain, the session of each connection is the one the builder reserved at
``/api/sessions``, as ``dialogue_system_builder.mounts`` explains.

The server has eight modules. ``dialogue_system_builder.app`` is the FastAPI app with its routes and IL's mounts on it, and
``server.py`` beside this folder starts it. ``dialogue_system_builder.mounts`` holds the reservation and the text mount, and
``dialogue_system_builder.voice_mount`` the voice mount, which stands in for the text mount by way and is imported only when
Pipecat is installed. ``dialogue_system_builder.compile`` turns a design into IL's flow, and ``dialogue_system_builder.generate`` goes the
opposite way, turning a description into a design with the model. ``dialogue_system_builder.checks`` finds what is wrong with a
design before it may run, ``dialogue_system_builder.share`` keeps the testing links and lists their runs, and
``dialogue_system_builder.store`` names the folders all of them write in.

Eight words are the builder's own. A design is the canvas's document, nodes and lines with a few design-wide fields,
which Export design writes and Import design loads back, and it differs from a flow, which Download flow writes for IL
to run and which cannot be loaded back. A step is a node with a prompt, which the compiler makes one of IL's conversation
states. A line is an edge between nodes, which becomes one entry of ``ConversationStateTransitionCriteria``. End is a
node IL does not know, which the builder marks by the state indexes ``dialogue_system_builder.compile.compile_design`` returns as
``endings``. A reservation is a design kept for one coming connection. A testing link is "/try/" followed by the
``ConversationDesignPublicLinkToken``, made by Save and passed on to everyone who is to try the design, so the link is public
and opens the chat page and nothing else. A saved design also has a ``ConversationDesignAPIKey``, "sk-" and 48 random letters
and digits in OpenAI's key format, made at Save and returned only to the browser that saved. A later Save of that design must
present the key, so holding the link alone does not allow overwriting the design. The key is written as it is into the
design's JSON file, so whoever runs the server can read it there when helping the person who saved. The same key is the
bearer of a request to "/v1", the builder's OpenAI-compatible endpoint, which runs one turn of that design per request and
keeps the conversation between requests, so a tool written for OpenAI's API talks to the design once given the key. A run
is one finished or unfinished conversation a person had with the design through its link or through "/v1".

A ``data-testid`` in the page files is a stable name for that element, for programs that drive the pages.
"""
