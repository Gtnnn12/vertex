/* One-off CDP screenshot helper (not part of the app).
 * Usage: node scripts/shot.cjs <output.png> [settings|sidebar]
 * Env: CDP_TOKEN (auth token), SHOT_URL (page url) */
const { spawn } = require('child_process');
const fs = require('fs');
const http = require('http');
const WebSocket = require('../packages/server/node_modules/ws');

const OUT = process.argv[2] || 'shot.png';
const MODE = process.argv[3] || 'space';
const URL_SHOT = process.env.SHOT_URL || 'http://localhost:5173/channels/357640776927133696';
const TOKEN = process.env.CDP_TOKEN;
if (!TOKEN) { console.error('CDP_TOKEN required'); process.exit(1); }

const PORT = 9333;
const edge = spawn('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', [
  '--headless=new', `--remote-debugging-port=${PORT}`,
  '--window-size=1400,900', '--no-first-run', '--no-default-browser-check',
  '--user-data-dir=' + process.env.TEMP + '/vertex-shot-profile-' + Date.now(),
  'about:blank',
], { stdio: 'ignore' });

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function getJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch (e) { reject(e); } });
    }).on('error', reject);
  });
}

async function main() {
  let targets;
  for (let i = 0; i < 30; i++) {
    try { targets = await getJson(`http://127.0.0.1:${PORT}/json`); break; }
    catch { await sleep(500); }
  }
  if (!targets) { console.error('no CDP'); edge.kill(); process.exit(1); }
  const page = targets.find(t => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl, { maxPayload: 256 * 1024 * 1024 });
  let id = 0;
  const pending = new Map();
  ws.on('message', (raw) => {
    const msg = JSON.parse(raw);
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
  });
  const send = (method, params = {}) => new Promise((resolve) => {
    const mid = ++id;
    pending.set(mid, resolve);
    ws.send(JSON.stringify({ id: mid, method, params }));
  });

  await new Promise(r => ws.on('open', r));
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1400, height: 900, deviceScaleFactor: 1, mobile: false });

  // Seed the auth token before app JS runs
  await send('Page.addScriptToEvaluateOnNewDocument', {
    source: `localStorage.setItem('backspace_token', ${JSON.stringify(TOKEN)});`,
  });

  await send('Page.navigate', { url: URL_SHOT });
  await sleep(9000);

  if (MODE === 'settings') {
    await send('Runtime.evaluate', { expression: `
      (function(){
        const btns = Array.from(document.querySelectorAll('button'));
        const idBtn = btns.find(b => b.textContent.trim() === 'Banner Test HQ');
        if (idBtn) { idBtn.click(); return 'clicked identity'; }
        return 'identity not found';
      })()
    `});
    await sleep(2500);
  }

  if (MODE === 'popout') {
    // Open the profile popout: click the avatar inside the bottom-left user area.
    await send('Runtime.evaluate', { expression: `
      (function(){
        const areas = document.querySelectorAll('[data-avatar]');
        const last = areas[areas.length - 1];
        if (!last) return 'no avatar';
        const r = last.getBoundingClientRect();
        const ev = new MouseEvent('click', { bubbles: true, clientX: r.x + r.width/2, clientY: r.y + r.height/2 });
        last.dispatchEvent(ev);
        return 'clicked avatar at ' + Math.round(r.x) + ',' + Math.round(r.y);
      })()
    `});
    await sleep(2200);
  }

  if (MODE === 'presence') {
    // Open the user panel: click the bottom-left user-area trigger button.
    const res = await send('Runtime.evaluate', { expression: `
      (function(){
        const row = document.querySelector('[data-user-area-trigger]');
        if (!row) return 'no trigger';
        const r = row.getBoundingClientRect();
        row.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: r.x + r.width/2, clientY: r.y + r.height/2 }));
        return 'clicked row';
      })()
    `});
    console.log('trigger:', res.result?.result?.value);
    await sleep(1500);
    const check = await send('Runtime.evaluate', { expression: `!!document.querySelector('[data-user-panel]')` });
    console.log('panel in DOM:', check.result?.result?.value);
  }

  const shot = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(OUT, Buffer.from(shot.result.data, 'base64'));
  console.log('saved', OUT);
  ws.close();
  edge.kill();
  process.exit(0);
}

main().catch(e => { console.error(e); edge.kill(); process.exit(1); });
