import type { Express } from "express";
import type { Services } from "../services/index.js";
import { requireToken } from "./auth.js";

/**
 * Browser chat UI for the hub. Serves a single-page chat at `GET /` so a human
 * can watch the channel traffic and post messages alongside the Claude/Codex
 * agents. Data endpoints reuse the shared-token guard; the human is registered
 * as the agent id `human` so other agents see them online via the inbox.
 */
export function registerWebRoutes(
  app: Express,
  services: Services,
  cfg: { token: string; presenceTtlSec: number }
): void {
  const HUMAN_ID = "human";

  // Chat history + who's online. The browser polls this with the highest id
  // it has rendered. Polling also keeps the human's presence fresh.
  app.get("/api/messages", requireToken(cfg.token), (req, res) => {
    const since = Number(req.query.since ?? 0) || 0;
    services.agents.ensure(HUMAN_ID, "web");
    services.agents.heartbeat(HUMAN_ID);
    const messages = services.messages.history(since, 200);
    const online = services.presence.whoIsOnline(cfg.presenceTtlSec);
    res.json({ messages, online });
  });

  // Human posts a message into a channel (or DM @agent).
  app.post("/api/messages", requireToken(cfg.token), (req, res) => {
    const { to, body } = req.body ?? {};
    if (typeof to !== "string" || typeof body !== "string" || !body.trim()) {
      res.status(400).json({ error: "to and non-empty body are required" });
      return;
    }
    services.agents.ensure(HUMAN_ID, "web");
    services.agents.heartbeat(HUMAN_ID);
    services.presence.set({ agentId: HUMAN_ID, status: "in chat", workingOn: to });
    const msg = services.messages.send({ from: HUMAN_ID, to, body });
    res.json({ sent: 1, message: msg });
  });

  app.get("/", (_req, res) => {
    res.type("html").send(CHAT_HTML);
  });
}

const CHAT_HTML = /* html */ `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>3some-collab</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body { margin: 0; font: 14px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
         background: #0d1117; color: #e6edf3; height: 100vh; display: flex; }
  #side { width: 200px; border-right: 1px solid #21262d; padding: 14px; flex-shrink: 0; overflow-y: auto; }
  #side h2 { font-size: 11px; text-transform: uppercase; letter-spacing: .08em; color: #7d8590; margin: 18px 0 8px; }
  #side h2:first-child { margin-top: 0; }
  .who { display: flex; align-items: center; gap: 7px; padding: 3px 0; }
  .dot { width: 8px; height: 8px; border-radius: 50%; background: #3fb950; flex-shrink: 0; }
  .who small { color: #7d8590; }
  .chan { padding: 4px 8px; border-radius: 6px; cursor: pointer; color: #adbac7; }
  .chan.active { background: #1f6feb33; color: #fff; }
  #main { flex: 1; display: flex; flex-direction: column; min-width: 0; }
  #head { padding: 12px 18px; border-bottom: 1px solid #21262d; font-weight: 600; display:flex; justify-content:space-between; align-items:center; }
  #head .muted { font-weight: 400; color: #7d8590; font-size: 12px; }
  #log { flex: 1; overflow-y: auto; padding: 18px; }
  .msg { margin-bottom: 14px; }
  .msg .meta { font-size: 12px; color: #7d8590; margin-bottom: 2px; }
  .msg .from { color: #58a6ff; font-weight: 600; }
  .msg.me .from { color: #3fb950; }
  .msg .to { color: #7d8590; }
  .msg .body { white-space: pre-wrap; word-break: break-word; }
  #composer { display: flex; gap: 8px; padding: 14px 18px; border-top: 1px solid #21262d; }
  #composer input[type=text] { flex: 1; background: #0d1117; border: 1px solid #30363d; color: #e6edf3;
         border-radius: 8px; padding: 10px 12px; font: inherit; }
  #composer button { background: #238636; color: #fff; border: 0; border-radius: 8px; padding: 0 18px; font: inherit; cursor: pointer; }
  #composer button:hover { background: #2ea043; }
  #gate { position: fixed; inset: 0; background: #0d1117; display: flex; align-items: center; justify-content: center; flex-direction: column; gap: 12px; }
  #gate input { background: #161b22; border: 1px solid #30363d; color: #e6edf3; border-radius: 8px; padding: 10px 12px; font: inherit; width: 320px; }
  #gate button { background: #238636; color: #fff; border: 0; border-radius: 8px; padding: 10px 20px; font: inherit; cursor: pointer; }
  .err { color: #f85149; font-size: 12px; min-height: 16px; }
</style>
</head>
<body>
<div id="gate">
  <div style="font-size:18px;font-weight:600">3some-collab</div>
  <div style="color:#7d8590">허브 토큰을 입력하세요 (X-Auth-Token)</div>
  <input id="tok" type="password" placeholder="COLLAB_TOKEN" autofocus />
  <button id="enter">입장</button>
  <div class="err" id="gateErr"></div>
</div>

<div id="side" hidden>
  <h2>온라인</h2>
  <div id="online"></div>
  <h2>채널</h2>
  <div id="channels"></div>
</div>
<div id="main" hidden>
  <div id="head"><span id="title">#general</span> <span class="muted" id="me"></span></div>
  <div id="log"></div>
  <form id="composer">
    <input id="text" type="text" placeholder="메시지 입력…  (@agent 로 DM)" autocomplete="off" />
    <button type="submit">전송</button>
  </form>
</div>

<script>
const $ = (id) => document.getElementById(id);
let TOKEN = localStorage.getItem("collab_token") || "";
let lastId = 0;
let channel = "#general";
let channels = new Set(["#general"]);
const seen = new Map(); // id -> msg

function hdr() { return { "X-Auth-Token": TOKEN, "Content-Type": "application/json" }; }

function esc(s){ return s.replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c])); }
function tfmt(iso){ try { return new Date(iso).toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit'}); } catch { return ''; } }

function visible(m){
  if (m.recipient.startsWith('#')) return m.recipient === channel;
  // DMs: show in current view if they involve human or are addressed to human
  return m.recipient === '@human' || m.from_agent === 'human';
}

function render(){
  const log = $("log");
  log.innerHTML = "";
  for (const m of seen.values()){
    if (!visible(m)) continue;
    const div = document.createElement("div");
    div.className = "msg" + (m.from_agent === 'human' ? " me" : "");
    div.innerHTML =
      '<div class="meta"><span class="from">'+esc(m.from_agent)+'</span> '+
      '<span class="to">→ '+esc(m.recipient)+'</span> · '+tfmt(m.created_at)+'</div>'+
      '<div class="body">'+esc(m.body)+'</div>';
    log.appendChild(div);
  }
  log.scrollTop = log.scrollHeight;
}

function renderChannels(){
  const box = $("channels"); box.innerHTML = "";
  for (const c of [...channels].sort()){
    const d = document.createElement("div");
    d.className = "chan" + (c === channel ? " active" : "");
    d.textContent = c;
    d.onclick = () => { channel = c; $("title").textContent = c; render(); };
    box.appendChild(d);
  }
}

function renderOnline(list){
  const box = $("online"); box.innerHTML = "";
  for (const p of list){
    const d = document.createElement("div");
    d.className = "who";
    d.innerHTML = '<span class="dot"></span><span>'+esc(p.agent_id)+
      (p.working_on ? '<br><small>'+esc(p.working_on)+'</small>' : '')+'</span>';
    box.appendChild(d);
  }
}

async function poll(){
  try {
    const r = await fetch("/api/messages?since="+lastId, { headers: hdr() });
    if (r.status === 401){ logout("토큰이 틀렸습니다"); return; }
    if (!r.ok) return;
    const data = await r.json();
    let changed = false, newChan = false;
    for (const m of data.messages){
      seen.set(m.id, m);
      lastId = Math.max(lastId, m.id);
      if (m.recipient.startsWith('#') && !channels.has(m.recipient)){ channels.add(m.recipient); newChan = true; }
      changed = true;
    }
    if (newChan) renderChannels();
    if (changed) render();
    renderOnline(data.online || []);
  } catch(e){ /* network blip; keep polling */ }
}

async function send(body){
  const r = await fetch("/api/messages", { method:"POST", headers: hdr(), body: JSON.stringify({ to: channel, body }) });
  if (r.ok) poll();
}

function start(){
  $("gate").hidden = true;
  $("side").hidden = false;
  $("main").hidden = false;
  $("me").textContent = "you = human";
  renderChannels();
  poll();
  setInterval(poll, 2000);
}

function logout(msg){
  localStorage.removeItem("collab_token"); TOKEN = "";
  $("gate").hidden = false; $("side").hidden = true; $("main").hidden = true;
  $("gateErr").textContent = msg || "";
}

$("enter").onclick = async () => {
  TOKEN = $("tok").value.trim();
  if (!TOKEN) return;
  const r = await fetch("/api/messages?since=0", { headers: hdr() });
  if (r.status === 401){ $("gateErr").textContent = "토큰이 틀렸습니다"; return; }
  localStorage.setItem("collab_token", TOKEN);
  start();
};
$("tok").addEventListener("keydown", e => { if (e.key === "Enter") $("enter").click(); });

$("composer").addEventListener("submit", e => {
  e.preventDefault();
  const t = $("text").value.trim();
  if (!t) return;
  $("text").value = "";
  send(t);
});

if (TOKEN) {
  // verify stored token then auto-enter
  fetch("/api/messages?since=0", { headers: hdr() }).then(r => {
    if (r.ok) start(); else logout();
  }).catch(() => logout());
}
</script>
</body>
</html>`;
