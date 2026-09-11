const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const dir = 'E:/vertex/packages/server/drizzle';
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
const db = new Database('E:/vertex/data/backspace.db');
const recorded = new Set(db.prepare('SELECT hash FROM __drizzle_migrations').all().map((r) => r.hash));
console.log('table_info __drizzle_migrations:', JSON.stringify(db.prepare('PRAGMA table_info(__drizzle_migrations)').all()));
for (const f of files) {
  const content = fs.readFileSync(path.join(dir, f)).toString();
  const h = crypto.createHash('sha256').update(content).digest('hex');
  console.log(`${f} -> ${recorded.has(h) ? 'RECORDED' : '*** MISSING ***'}  ${h.slice(0, 12)}`);
}
console.log('total recorded:', recorded.size);
db.close();