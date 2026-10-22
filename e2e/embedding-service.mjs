import { createServer } from 'node:http';

// Embeddings determinísticos para exercitar SQL/HTTP reais; os demais modos de IA ficam indisponíveis.
export async function startEmbeddingService() {
  const server = createServer(async (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    if (req.method !== 'POST' || req.url !== '/embeddings') {
      res.writeHead(503); res.end('{"error":"IA indisponível no teste"}'); return;
    }
    let bytes = 0;
    for await (const part of req) {
      bytes += part.length;
      if (bytes > 64 * 1024) { res.writeHead(413); res.end('{}'); return; }
    }
    res.end(JSON.stringify({ embedding: Array(1024).fill(0.1) }));
  });
  server.requestTimeout = 5000;
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return { server, url: 'http://127.0.0.1:' + server.address().port };
}
