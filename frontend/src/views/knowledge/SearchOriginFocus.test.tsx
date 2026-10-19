import { afterEach, expect, it, vi } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
import { SearchOriginFocus } from "./SearchOriginFocus";

afterEach(()=>{cleanup();window.history.replaceState(null,"","/");vi.restoreAllMocks();});
it("encontra a origem após o carregamento assíncrono e remove destaque ao sair",async()=>{
  window.history.replaceState(null,"","/projects/p1#search-origin=Texto%20de%20origem");
  const {container,unmount}=render(<main><SearchOriginFocus pathname="/projects/p1"/><div id="content"/></main>);
  let source!:HTMLParagraphElement;
  await act(async()=>{
    source=document.createElement("p");source.textContent="Texto de origem";
    container.querySelector("#content")!.append(source);
    await Promise.resolve();
  });
  expect(source).toHaveClass("knowledge-source-focus");
  expect(source).toHaveFocus();
  unmount();
  expect(source).not.toHaveClass("knowledge-source-focus");
});
it("posiciona decisão pelo identificador e trata fragmento inválido sem falhar",()=>{
  window.history.replaceState(null,"","/projects/p1#decision-d1");
  const {getByText,rerender}=render(<main><SearchOriginFocus pathname="/projects/p1"/><p id="decision-d1">Decisão salva</p></main>);
  expect(getByText("Decisão salva")).toHaveFocus();
  window.history.replaceState(null,"","/projects/p2#search-origin=%E0%A4%A");
  expect(()=>rerender(<main><SearchOriginFocus pathname="/projects/p2"/></main>)).not.toThrow();
});
