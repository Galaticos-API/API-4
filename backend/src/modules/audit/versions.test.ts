import test from 'node:test';
import assert from 'node:assert/strict';
import { compareSnapshots } from './versions.service.js';

test('comparação ignora ordem das propriedades JSON e mantém a ordem dos critérios',()=>{
  assert.deepEqual(compareSnapshots({origem:{a:1,b:2}},{origem:{b:2,a:1}}),[]);
  assert.deepEqual(compareSnapshots({criterios:['primeiro','segundo']},{criterios:['segundo','primeiro']})
    .map(change=>change.campo),['criterios']);
});
test('comparação preserva booleanos, nulos e texto multilinha sem truncar valores',()=>{
  const text='Descrição\n'.repeat(1000);
  const result=compareSnapshots({titulo:'Original',requer_interface:false,descricao:null},
    {titulo:'Atualizado',requer_interface:true,descricao:text});
  assert.equal(result.length,3);
  assert.equal(result.find(change=>change.campo==='descricao')!.novo,text);
  assert.equal(result.find(change=>change.campo==='requer_interface')!.anterior,false);
});
