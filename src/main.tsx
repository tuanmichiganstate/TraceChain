import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/app";
import { LocaleProvider } from "./app/providers/locale-provider";
import { SimulationProvider } from "./app/providers/simulation-provider";
import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/app.css";

const container = document.getElementById("root");
if (container === null) {
  throw new Error("Root element #root is missing from index.html");
}

createRoot(container).render(
  <StrictMode>
    <LocaleProvider>
      <SimulationProvider>
        <App />
      </SimulationProvider>
    </LocaleProvider>
  </StrictMode>,
);
