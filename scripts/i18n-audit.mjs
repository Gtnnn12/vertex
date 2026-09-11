// i18n audit: find translation keys used in web source but missing from dictionaries.
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve('packages/web/src');
const exts = new Set(['.tsx', '.ts']);
const files = [];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (exts.has(path.extname(e.name))) files.push(p);
  }
})(ROOT);

const keyRe = /\b(?:t|translateStatic)\(\s*['"`]([A-Za-z0-9_]+)['"`]/g;
const used = new Set();
for (const f of files) {
  const src = fs.readFileSync(f, 'utf8');
  let m;
  while ((m = keyRe.exec(src))) used.add(m[1]);
}

const es = JSON.parse(fs.readFileSync('packages/web/src/i18n/es.json', 'utf8'));
const en = JSON.parse(fs.readFileSync('packages/web/src/i18n/en.json', 'utf8'));

const missingEs = [...used].filter((k) => !(k in es)).sort();
const missingEn = [...used].filter((k) => !(k in en)).sort();
const unusedEs = Object.keys(es).filter((k) => !used.has(k)).sort();

console.log(`files scanned: ${files.length}`);
console.log(`used keys: ${used.size}`);
console.log(`es.json keys: ${Object.keys(es).length}, en.json keys: ${Object.keys(en).length}`);
console.log(`\n=== MISSING IN es.json (${missingEs.length}) ===`);
console.log(missingEs.join('\n'));
console.log(`\n=== MISSING IN en.json (${missingEn.length}) ===`);
console.log(missingEn.join('\n'));
console.log(`\n=== DEFINED BUT UNUSED (${unusedEs.length}) ===`);
console.log(unusedEs.join('\n'));
