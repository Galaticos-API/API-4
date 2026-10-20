import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { DocumentTextDialog } from "./DocumentTextDialog";
import type { KnowledgeHit } from "../../api/api_knowledge";

const hit: KnowledgeHit = { id:"c21", entity_id:"d1", entity_type:"documento", project_id:"p1", project_name:"Alfa", title:"Escopo.pdf", text:"Consulta", metadata:{}, source_url:"/projects/p1/documents", relevance_score:1 };
beforeEach(() => {
  Object.defineProperty(HTMLDialogElement.prototype,"showModal",{configurable:true,value:function(this:HTMLDialogElement){this.setAttribute("open","");}});
  Object.defineProperty(HTMLDialogElement.prototype,"close",{configurable:true,value:function(this:HTMLDialogElement){this.removeAttribute("open");}});
});
afterEach(() => {cleanup();vi.unstubAllGlobals();});
it("abre a página do resultado, destaca o trecho e permite ler o restante", async () => {
  const request=vi.fn((input:RequestInfo|URL) => {
    const previous=String(input).includes("offset=0");
    return Promise.resolve(new Response(JSON.stringify({document:{id:"d1",name:"Escopo.pdf",project_id:"p1"},items:previous?Array.from({length:20},(_,index)=>({id:"c"+(index+1),text:index===0?"Início do documento":"Texto "+index,index})):[{id:"c21",text:"Trecho selecionado",index:20}],offset:previous?0:20,total:21,next_offset:previous?20:null})));
  });
  vi.stubGlobal("fetch",request);
  const close=vi.fn();
  render(<DocumentTextDialog hit={hit} onClose={close}/>);
  expect(await screen.findByText("Trecho selecionado")).toBeInTheDocument();
  expect(screen.getByText("Trecho selecionado").closest("section")).toHaveClass("knowledge-matched-excerpt");
  expect(screen.getByRole("button",{name:"Próximos trechos"})).toBeDisabled();
  fireEvent.click(screen.getByRole("button",{name:"Trechos anteriores"}));
  expect(await screen.findByText("Início do documento")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button",{name:"Fechar documento"}));
  expect(close).toHaveBeenCalledOnce();
});
it("mostra fonte indisponível e oferece nova tentativa",async()=>{
  vi.stubGlobal("fetch",vi.fn(()=>Promise.resolve(new Response(JSON.stringify({error:"Não encontrado"}),{status:404}))));
  render(<DocumentTextDialog hit={hit} onClose={()=>{}}/>);
  expect(await screen.findByRole("alert")).toHaveTextContent("documento não está disponível");
  expect(screen.getByRole("button",{name:"Tentar novamente"})).toBeEnabled();
});
