import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./app.css";
import { Playground } from "./playground/Playground";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Playground />
  </StrictMode>,
);
