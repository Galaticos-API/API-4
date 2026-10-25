import { useEffect, useState } from "react";
import {
  getPbiQualityConfiguration,
  type PbiQualityConfigurationRecord,
} from "../api/api_backlog";

export type QualityConfigurationResult =
  | { state: "loading" }
  | { state: "error" }
  | { state: "ready"; config: PbiQualityConfigurationRecord };

/** Loads the current organization policy; completed-item callers fail closed. */
export function usePbiQualityConfiguration(enabled = true) {
  const [result, setResult] =
    useState<QualityConfigurationResult>({ state: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const refresh = () => setAttempt(value => value + 1);
    window.addEventListener('organization-quality-updated',refresh);
    window.addEventListener('focus',refresh);
    return () => { window.removeEventListener('organization-quality-updated',refresh); window.removeEventListener('focus',refresh); };
  }, []);

  useEffect(() => {
    if (!enabled) {
      setResult({ state: "loading" });
      return;
    }

    const controller = new AbortController();
    setResult({ state: "loading" });

    getPbiQualityConfiguration(controller.signal)
      .then((config) => {
        if (!controller.signal.aborted) {
          setResult({ state: "ready", config });
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setResult({ state: "error" });
        }
      });

    return () => controller.abort();
  }, [attempt, enabled]);

  return {
    result,
    retry: () => setAttempt((value) => value + 1),
  };
}
