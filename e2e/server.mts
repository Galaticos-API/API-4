import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { default: app } = require('../backend/src/app.ts');
const port = Number(process.env.PORT ?? 3001);
app.listen(port, '127.0.0.1', () => console.log(`E2E API: http://127.0.0.1:${port}`));
