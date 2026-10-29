import assert from 'node:assert/strict';
import test from 'node:test';
import { fallbackSearchQuery } from './search.service.js';

test('fallback da busca reduz a frase mantendo os termos de conteúdo em português',()=>{
  assert.equal(fallbackSearchQuery('Qual banco de dados estamos usando?'),'banco dados');
  assert.equal(fallbackSearchQuery('Quais decisões já foram tomadas neste projeto?'),'decisões tomadas');
});

test('fallback preserva siglas, códigos, números e consulta curta',()=>{
  assert.equal(fallbackSearchQuery('Quando a API-4 foi criada em 2025?'),'API-4 criada 2025');
  assert.equal(fallbackSearchQuery('PIX'),'PIX');
});
