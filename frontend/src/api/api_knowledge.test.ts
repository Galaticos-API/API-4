import { afterEach, expect, it, vi } from "vitest";
import { readDocumentText, searchKnowledge, type KnowledgeHit } from "./api_knowledge";

const hit: KnowledgeHit = {id:"c1",entity_id:"d1",entity_type:"documento",project_id:"p1",project_name:"Alfa",title:"Escopo",text:"Texto",metadata:{},source_url:null,relevance_score:1};
const page = {document:{id:"d1",name:"Escopo",project_id:"p1"},items:[{id:"c1",text:"Conteúdo",index:0}],offset:0,total:1,next_offset:null};
afterEach(()=>vi.unstubAllGlobals());
it('aceita relatorio do Analyzer na busca e preserva sua execucao', async () => {
  const report = { ...hit, entity_type: 'analise_repositorio', metadata: { run_id: 'run-42' }, source_url: '/projects/p1#repo-analyzer=d1' };
  vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response(JSON.stringify({ items: [report] })))));
  const results = await searchKnowledge({ query: 'arquitetura', project: 'p1', technology: '', level: '' }, new AbortController().signal);
  expect(results[0].metadata.run_id).toBe('run-42');
});
it.each([
  {...page,document:{...page.document,project_id:"p2"}},
  {...page,document:{...page.document,id:"d2"}},
  {...page,items:[null]},
  {...page,items:[]},
  {...page,items:[{...page.items[0],index:-1}]},
  {...page,items:[{...page.items[0],index:1}]},
  {...page,total:0},
  {...page,next_offset:1},
  {...page,total:2},
])("recusa texto com identidade ou paginação inconsistente %#",async response=>{
  vi.stubGlobal("fetch",vi.fn(()=>Promise.resolve(new Response(JSON.stringify(response)))));
  await expect(readDocumentText(hit,undefined,new AbortController().signal)).rejects.toThrow("Texto do documento inválido");
});
it("mantém conteúdo como texto e aceita a última página",async()=>{
  vi.stubGlobal("fetch",vi.fn(()=>Promise.resolve(new Response(JSON.stringify({...page,items:[{...page.items[0],text:'<img src=x onerror=alert(1)>'}]})))));
  const result=await readDocumentText(hit,undefined,new AbortController().signal);
  expect(result.items[0].text).toBe('<img src=x onerror=alert(1)>');
});
