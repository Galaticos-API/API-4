import { Pool } from 'pg';
import http from 'http';

async function run() {
  const pool = new Pool({
    host: process.env.POSTGRES_HOST || 'postgres',
    user: process.env.POSTGRES_USER || 'sinapse',
    password: process.env.POSTGRES_PASSWORD || 'sinapse_dev_password',
    database: process.env.POSTGRES_DB || 'sinapse',
    port: 5432
  });

  const { rows } = await pool.query('SELECT id, texto FROM chunk WHERE embedding IS NULL');
  console.log('Found chunks without embedding:', rows.length);

  for (const row of rows) {
    const embedding = await new Promise((resolve, reject) => {
      const req = http.request({
        hostname: 'host.docker.internal',
        port: 8000,
        path: '/embed',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Service-Token': process.env.AI_SERVICE_TOKEN
        }
      }, res => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            resolve(json.embeddings[0]);
          } catch(e) { reject(e); }
        });
      });
      req.on('error', reject);
      req.write(JSON.stringify({ texts: [row.texto] }));
      req.end();
    });

    console.log('Embedded chunk', row.id, 'dim:', embedding.length);
    await pool.query('UPDATE chunk SET embedding = $2::vector WHERE id = $1', [row.id, JSON.stringify(embedding)]);
    console.log('Updated chunk', row.id);
  }

  await pool.end();
}

run().catch(err => {
  console.error('FAILED:', err);
  process.exit(1);
});
