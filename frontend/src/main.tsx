import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App.js";
import "./index.css";
import { AuthGate, AuthProvider } from "./auth/Auth";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AuthProvider><AuthGate><App /></AuthGate></AuthProvider>
  </React.StrictMode>
);
