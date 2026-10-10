import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App.js";
import "./index.css";
import { AuthGate } from "./views/auth/AuthView";
import { AuthProvider } from "./viewmodels/useAuthViewModel";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AuthProvider><AuthGate><App /></AuthGate></AuthProvider>
  </React.StrictMode>
);
