const Database = require('better-sqlite3');
const db = new Database('E:/vertex/data/backspace.db');
console.log('=== drizzle_migrations ===');
console.log(db.prepare('SELECT * FROM __drizzle_migrations').all());
console.log('=== users cols ===');
console.log(db.prepare('PRAGMA table_info(users)').all().map((c) => c.name).join(', '));
console.log('=== admin tables ===');
console.log(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'admin%'").all().map((r) => r.name).join(', '));
db.close();