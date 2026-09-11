const crypto = require('crypto');
const fs = require('fs');
const Database = require('better-sqlite3');

const file = 'E:/vertex/packages/server/drizzle/0011_admin_center.sql';
const content = fs.readFileSync(file).toString();
const hash = crypto.createHash('sha256').update(content).digest('hex');
console.log('computed 0011 hash:', hash);

const db = new Database('E:/vertex/data/backspace.db');
const existing = db.prepare('SELECT hash FROM __drizzle_migrations WHERE hash = ?').get(hash);
if (existing) {
  console.log('hash already recorded — nothing to do');
} else {
  db.prepare('INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)').run(hash, Date.now());
  console.log('inserted 0011 hash into __drizzle_migrations');
}
console.log('row count:', db.prepare('SELECT COUNT(*) AS n FROM __drizzle_migrations').get().n);
db.close();