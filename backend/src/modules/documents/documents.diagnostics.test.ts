import test from "node:test";
import assert from "node:assert/strict";
import { classifyIngestionFailure } from "./documents.ingestion.js";
test("diagnósticos não vazam corpo, token ou mensagem da exceção",()=>{
  for(const [status,retry] of [[422,false],[401,false],[429,true],[503,true]] as const) {
    const result=classifyIngestionFailure({isAxiosError:true,message:"segredo",response:{status,data:"conteúdo privado"}});
    assert.equal(result.retryable,retry);assert.equal(result.httpStatus,status);
    assert.doesNotMatch(JSON.stringify(result),/segredo|privado/);
  }
  assert.equal(classifyIngestionFailure({isAxiosError:true,code:"ECONNABORTED"}).code,"TIMEOUT");
  assert.equal(classifyIngestionFailure({code:"ENOENT"}).retryable,false);
});
