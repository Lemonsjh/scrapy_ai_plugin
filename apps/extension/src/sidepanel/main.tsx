import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles.css";
import { installPreviewChrome } from "./preview-shim";

if (new URLSearchParams(location.search).has("preview")) installPreviewChrome();

ReactDOM.createRoot(document.getElementById("root")!).render(<React.StrictMode><App /></React.StrictMode>);
