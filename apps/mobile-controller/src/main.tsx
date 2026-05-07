import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.js";
import "./App.css";

const root = document.getElementById("root");

if (!root) {
  throw new Error("Mobile controller root element not found");
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>
);
