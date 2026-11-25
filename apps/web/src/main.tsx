import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";
import "./web.css";
import "./redesign.css";

const root = document.getElementById("root");
if (!root) throw new Error("Root element tidak ditemukan");

if ("serviceWorker" in navigator) {
  if (import.meta.env.PROD) {
    window.addEventListener("load", () => {
      void navigator.serviceWorker.register("/sw.js").catch(() => {
        // PWA support is best-effort; the dashboard still works online.
      });
    });
  } else {
    void navigator.serviceWorker.getRegistrations().then((registrations) => {
      for (const registration of registrations) void registration.unregister();
    });
  }
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>
);
