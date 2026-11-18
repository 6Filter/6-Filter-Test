// usage: node layoutshots.mjs <baseUrl> <outDir> <tag> [port]
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import path from "node:path";

const [base, outDir, tag, portArg] = process.argv.slice(2);
const port = Number(portArg || 9344);
mkdirSync(outDir, { recursive: true });
const profile = path.join(process.env.TEMP, "layout-profile-" + port);
rmSync(profile, { recursive: true, force: true });
const edge = spawn("C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", [
  "--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, "--no-first-run", "--disable-gpu", "--hide-scrollbars", "about:blank",
], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let targets;
for (let i = 0; i < 40; i++) {
  try { targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); if (targets.length) break; } catch {}
  await sleep(300);
}
const page = targets.find((t) => t.type === "page");
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0;
const pending = new Map();
ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); } };
const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, (d) => (d.error ? rej(new Error(method + ": " + d.error.message)) : res(d.result))); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expression) => (await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true })).result.value;

const PID = process.env.FORM_ID || "00000000-0000-4000-8000-000000000009";
const SIZES = [[1920, 1080], [1440, 900], [1366, 768], [1024, 768], [390, 844]];
const OPEN = `(()=>{const b=[...document.querySelectorAll('button')].find(b=>/View entered inputs/.test(b.textContent)); if(b) b.click();})()`;
const OPENALL = `(()=>{document.querySelectorAll('.prop-filter.is-collapsed .prop-filter-h.is-toggle').forEach(h=>h.click());})()`;
const METRICS = `(()=>{
  const r=(el)=>{if(!el)return null;const b=el.getBoundingClientRect();return {x:Math.round(b.x),y:Math.round(b.y+scrollY),w:Math.round(b.width),h:Math.round(b.height)}};
  const cards={start:document.querySelector('#the-proposition')};
  for (const k of ['f1','f2','f3','f4','f5','f6']) cards[k]=document.getElementById(k);
  const out={}; for(const k in cards) out[k]=r(cards[k]);
  const f4=[...document.querySelectorAll('.f4-dimension-row')].map(e=>r(e));
  const bar=document.querySelector('.submit-bar'); 
  return JSON.stringify({docH:document.documentElement.scrollHeight, sw:document.documentElement.scrollWidth, iw:innerWidth, cards:out, f4h:f4.map(x=>x&&x.h), f4x:f4.map(x=>x&&x.x), barH: bar?Math.round(bar.getBoundingClientRect().height):0});
})()`;
const report = [];
await send("Page.enable");
await send("Page.navigate", { url: `${base}/propositions/${PID}` });
await sleep(15000);
for (const [w, h] of SIZES) {
  for (const state of ["collapsed", "open"]) {
    await send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 1, mobile: false });
    await send("Page.navigate", { url: `${base}/propositions/${PID}` });
    await sleep(3500);
    await ev(OPEN);
    await sleep(1200);
    if (state === "open") { await ev(OPENALL); await sleep(900); }
    const m = JSON.parse(await ev(METRICS));
    report.push(`${w}x${h} ${state}: ` + JSON.stringify(m));
    if (![1366, 1024].includes(w)) {
      const height = Math.min(9000, m.docH);
      await send("Emulation.setDeviceMetricsOverride", { width: w, height, deviceScaleFactor: 1, mobile: false });
      await sleep(500);
      const shot = await send("Page.captureScreenshot", { format: "png", fromSurface: true });
      writeFileSync(path.join(outDir, `${tag}-${w}-${state}.png`), Buffer.from(shot.data, "base64"));
    }
  }
}
console.log(report.join("\n"));
ws.close();
edge.kill();
process.exit(0);
