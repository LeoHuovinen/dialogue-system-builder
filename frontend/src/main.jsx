// Renders the editor, App.jsx, into index.html. App.jsx lists the editor's parts.
import React from "react";
import ReactDOM from "react-dom/client";
import "./styles.css";
import App from "./App";


ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
