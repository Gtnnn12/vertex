const path = require('path');
const Database = require(path.join('E:/vertex/packages/server/node_modules/better-sqlite3'));
process.chdir('E:/vertex/packages/server');
const db = new Database('E:/vertex/data/backspace.db', { readonly: true });
const t = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all();
console.log('TABLES:', t.map((x) => x.name).join(', '));
try { console.log('invite_links count:', db.prepare('SELECT COUNT(*) c FROM invite_links').get().c); } catch (e) { console.log('invite_links ERROR:', e.message); }
try { console.log('spaces:', JSON.stringify(db.prepare('SELECT id,name,invite_code FROM spaces').all())); } catch (e) { console.log('spaces ERROR:', e.message); }
try { console.log('users:', JSON.stringify(db.prepare('SELECT id,username,is_admin FROM users LIMIT 10').all())); } catch (e) { console.log('users ERROR:', e.message); }
