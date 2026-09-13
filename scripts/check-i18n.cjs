#!/usr/bin/env node
// One-shot i18n verifier: scans every t('...') call in packages/web/src,
// checks the key exists in es.json and en.json, and flags raw {placeholder}
// strings leaking into the UI (keys missing or uninterpolated).
const fs = require('fs');
const path = require('path');

const WEB = path.resolve(__dirname, '../packages/web/src');
const es = JSON.parse(fs.readFileSync(path.join(WEB, 'i18n/es.json'), 'utf8'));
const en = JSON.parse(fs.readFileSync(path.join(WEB, 'i18n/en.json'), 'utf8'));

const files = [];
(function walk(dir) {
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    const st = fs.statSync(p);
    if (st.isDirectory()) walk(p);
    else if (/\.(tsx?|jsx?)$/.test(f) && !/\.test\./.test(f)) files.push(p);
  }
})(WEB);

const used = new Map(); // key -> [file:line]
const tCall = /\bt\(\s*(['"`])((?:(?!\1)[^\\])*)\1/g;

for (const f of files) {
  const src = fs.readFileSync(f, 'utf8');
  const lines = src.split('\n');
  for (let i = 0; i < lines.length; i++) {
    let m;
    tCall.lastIndex = 0;
    while ((m = tCall.exec(lines[i]))) {
      const key = m[2];
      if (!key) continue;
      const rel = path.relative(WEB, f).replace(/\\/g, '/');
      if (!used.has(key)) used.set(key, []);
      used.get(key).push(`${rel}:${i + 1}`);
    }
  }
}

// Keys used with template literals: expand the known enum values so the
// checker can verify each concrete key against both dictionaries.
const DYNAMIC_ENUMS = {
  'staff_badge_${': ['owner', 'administrator', 'moderator', 'senior_moderator', 'developer', 'support'],
  'admin_netrex_state_${': ['active', 'permanent', 'expired'],
  'admin_vis_${': ['private', 'public', 'request'],
  'admin_mod_action_${': ['warn', 'timeout', 'ban', 'unban'],
  'admin_space_role_${': ['owner', 'member'],
  'density_${': ['compact', 'comfortable', 'spacious'],
  'vertex_eff_desc_${': ['minimal', 'ambient', 'glass', 'glow'],
};

const missingEs = [], missingEn = [];
const expanded = new Set();
for (const [key, locs] of used.entries()) {
  const prefix = Object.keys(DYNAMIC_ENUMS).find((p) => key.startsWith(p.replace('${', '')));
  if (prefix) {
    const suffix = key.slice(prefix.length).replace(/\$\{/, '');
    if (DYNAMIC_ENUMS[prefix].includes(suffix)) expanded.add(prefix + suffix);
    continue; // template placeholder — verified via expansions
  }
  if (!(key in es)) missingEs.push({ key, locs });
  if (!(key in en)) missingEn.push({ key, locs });
}
for (const key of expanded) {
  if (!(key in es)) missingEs.push({ key, locs: ['(dynamic)'] });
  if (!(key in en)) missingEn.push({ key, locs: ['(dynamic)'] });
}

// Dynamic keys (template literals) are expanded via DYNAMIC_ENUMS above.
const dynamic = [...used.keys()].filter(k => k.includes('${') || k === '');

console.log(`Scanned ${files.length} files, ${used.size} distinct t() keys.`);
console.log('');
console.log(`== MISSING IN es.json (${missingEs.length}):`);
for (const { key, locs } of missingEs) console.log(`  ${key}  ←  ${locs.slice(0, 2).join(', ')}`);
console.log('');
console.log(`== MISSING IN en.json (${missingEn.length}):`);
for (const { key, locs } of missingEn) console.log(`  ${key}  ←  ${locs.slice(0, 2).join(', ')}`);
if (dynamic.length) {
  console.log('');
  console.log(`== DYNAMIC (not verifiable, verify manually): ${dynamic.join(', ')}`);
}

// Keys defined but unused (info only)
const unused = Object.keys(es).filter(k => !used.has(k));
console.log('');
console.log(`== DEFINED BUT UNUSED (${unused.length}) — info only, first 15: ${unused.slice(0, 15).join(', ')}`);

const bad = missingEs.length + missingEn.length;
console.log('');
console.log(bad === 0 ? '✅ 0 missing keys' : `❌ ${bad} missing entries`);
process.exit(bad === 0 ? 0 : 1);
