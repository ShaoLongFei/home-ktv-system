import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.js";

const root = document.getElementById("root");

if (!root) {
  throw new Error("TV player root element is missing");
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>
);
