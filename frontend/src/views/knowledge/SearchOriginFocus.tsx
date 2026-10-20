import { useEffect } from "react";

export function SearchOriginFocus({ pathname }: { pathname: string }) {
  useEffect(() => {
    const hash = window.location.hash;
    if (!hash.startsWith("#search-origin=") && !hash.startsWith("#decision-")) return;
    let excerpt = "";
    try { excerpt = hash.startsWith("#search-origin=") ? decodeURIComponent(hash.slice(15)).toLocaleLowerCase("pt-BR").trim() : ""; } catch { return; }
    const root = document.querySelector("main");
    if (!root) return;
    let focused: HTMLElement | null = null;
    const locate = () => {
      if (focused) return;
      const element = hash.startsWith("#decision-") ? document.getElementById(hash.slice(1))
        : [...root.querySelectorAll<HTMLElement>("textarea,input[type=text],p,dd,h1,h2,h3")].find(candidate => {
          const text = candidate instanceof HTMLTextAreaElement || candidate instanceof HTMLInputElement ? candidate.value : candidate.textContent ?? "";
          return excerpt.length > 0 && text.toLocaleLowerCase("pt-BR").includes(excerpt);
        });
      if (!element) return;
      focused = element;
      element.classList.add("knowledge-source-focus");
      if (!element.matches("input,textarea,select,button,a[href]")) element.setAttribute("tabindex", "-1");
      element.scrollIntoView?.({ block: "center" });
      element.focus({ preventScroll: true });
      observer.disconnect();
    };
    const observer = new MutationObserver(locate);
    observer.observe(root, { childList: true, subtree: true });
    locate();
    const timer = window.setTimeout(() => observer.disconnect(), 20000);
    return () => { observer.disconnect(); window.clearTimeout(timer); focused?.classList.remove("knowledge-source-focus"); };
  }, [pathname]);
  return null;
}
