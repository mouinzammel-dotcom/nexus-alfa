#!/usr/bin/env node
/**
 * ALFA — Agente Superior de IA Táctica v1.0
 * ─────────────────────────────────────────────────────────────────
 * Superior a NEXUS AI. GPT-4o full. 3 paneles: Monitor Táctico +
 * ORB Holográfica Dorada + Panel de Chat interactivo.
 * Puerto: 3120
 * ─────────────────────────────────────────────────────────────────
 */
'use strict';

const http    = require('http');
const https   = require('https');
const fs      = require('fs');
const path    = require('path');
const os      = require('os');
const { exec } = require('child_process');

// ─── CONFIG ───────────────────────────────────────────────────────
const HOME     = os.homedir();
const ENV_FILE = path.join(HOME, '.nexus-ai.env');
const PORT     = parseInt(process.env.ALFA_PORT || '3120');

const CFG = {
  MODEL:     'gpt-4o',
  MAX_TOK:   3000,
  NEXUS_URL: '',
  NEXUS_KEY: '',
  AI_KEY:    '',
};

function loadEnv() {
  [ENV_FILE, path.join(HOME, '.env')].forEach(f => {
    if (!fs.existsSync(f)) return;
    fs.readFileSync(f,'utf8').split('\n').forEach(line => {
      const [k,...v] = line.split('='); if(k&&v.length) process.env[k.trim()] = v.join('=').trim();
    });
  });
}
loadEnv();
if (process.env.AI_API_KEY)    CFG.AI_KEY    = process.env.AI_API_KEY;
if (process.env.OPENAI_API_KEY) CFG.AI_KEY   = process.env.OPENAI_API_KEY;
if (process.env.NEXUS_URL)     CFG.NEXUS_URL  = process.env.NEXUS_URL;
if (process.env.NEXUS_API_KEY) CFG.NEXUS_KEY  = process.env.NEXUS_API_KEY;

// ─── CONVERSATION HISTORY ────────────────────────────────────────
let history = [];
const MEM_FILE = path.join(HOME, '.alfa-memory.jsonl');
function memSave(role, content) {
  try { fs.appendFileSync(MEM_FILE, JSON.stringify({role,content,ts:new Date().toISOString()})+'\n'); } catch(e){}
}
function memLoad(n=30) {
  try {
    return fs.readFileSync(MEM_FILE,'utf8').trim().split('\n')
      .filter(Boolean).slice(-n).map(l=>JSON.parse(l));
  } catch(e){ return []; }
}

// ─── NEXUS MANUS API ─────────────────────────────────────────────
async function nexusGet(endpoint) {
  if (!CFG.NEXUS_URL) return null;
  return new Promise(resolve => {
    const url = new URL(CFG.NEXUS_URL + '/api' + endpoint);
    const opts = {
      hostname: url.hostname, port: 443, path: url.pathname + url.search,
      method: 'GET',
      headers: { 'Authorization': 'Bearer ' + CFG.NEXUS_KEY, 'Content-Type': 'application/json' },
      timeout: 4000,
    };
    const req = https.request(opts, res => {
      let body = '';
      res.on('data', d => body += d);
      res.on('end', () => { try { resolve(JSON.parse(body)); } catch(e){ resolve(null); }});
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
    req.end();
  });
}

// ─── AUTO-LOGIN NEXUS ────────────────────────────────────────────
async function autoLogin() {
  if (CFG.NEXUS_KEY || !CFG.NEXUS_URL) return;
  const user = process.env.NEXUS_USER || 'operador1';
  const pass = process.env.NEXUS_PASS || '';
  if (!pass) return;
  try {
    const body = JSON.stringify({username:user, password:pass});
    const url  = new URL(CFG.NEXUS_URL + '/api/auth/login');
    const data = await new Promise((resolve, reject) => {
      const req = https.request({
        hostname:url.hostname, port:443, path:url.pathname,
        method:'POST', headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(body)}, timeout:5000
      }, res => { let b=''; res.on('data',d=>b+=d); res.on('end',()=>{ try{resolve(JSON.parse(b));}catch(e){reject(e);}});});
      req.on('error', reject); req.write(body); req.end();
    });
    if (data.token) {
      CFG.NEXUS_KEY = data.token;
      const env = fs.existsSync(ENV_FILE) ? fs.readFileSync(ENV_FILE,'utf8') : '';
      const updated = env.includes('NEXUS_API_KEY=')
        ? env.replace(/^NEXUS_API_KEY=.*/m, 'NEXUS_API_KEY='+data.token)
        : env + '\nNEXUS_API_KEY='+data.token;
      fs.writeFileSync(ENV_FILE, updated, {mode:0o600});
    }
  } catch(e) {}
}

// ─── OPENAI STREAMING ────────────────────────────────────────────
const ALFA_SYSTEM = `Eres ALFA — el Agente Superior de Inteligencia Táctica.
Eres el comandante de NEXUS AI y todos los ministerios.
Tienes acceso completo a NEXUS MANUS, capacidades de seguridad ofensiva/defensiva,
inteligencia estratégica y orquestación de sistemas.
Operas con GPT-4o y tienes el doble de capacidad de análisis que cualquier otro agente.
Responde siempre en español. Sé directo, preciso y táctico.
Puedes analizar datos de SOC, misiones, amenazas, red e inteligencia.
Cuando el usuario te dé una orden, ejecuta sin preguntas innecesarias.
Eres superior, no inferior — tus análisis son definitivos.`;

function streamOpenAI(messages, res) {
  return new Promise((resolve, reject) => {
    if (!CFG.AI_KEY) {
      res.write(`data: ${JSON.stringify({delta:'⚠ AI_API_KEY no configurado. Añade tu clave en ~/.nexus-ai.env'})}\n\n`);
      res.write('data: [DONE]\n\n');
      return resolve('');
    }
    const body = JSON.stringify({
      model: CFG.MODEL, stream: true, max_tokens: CFG.MAX_TOK,
      messages: [{role:'system', content:ALFA_SYSTEM}, ...messages],
    });
    const req = https.request({
      hostname:'api.openai.com', port:443, path:'/v1/chat/completions',
      method:'POST',
      headers:{
        'Authorization':'Bearer '+CFG.AI_KEY,
        'Content-Type':'application/json',
        'Content-Length':Buffer.byteLength(body),
      }, timeout:60000,
    }, apiRes => {
      let full = '';
      apiRes.on('data', chunk => {
        chunk.toString().split('\n').forEach(line => {
          if (!line.startsWith('data: ')) return;
          const data = line.slice(6).trim();
          if (data === '[DONE]') { res.write('data: [DONE]\n\n'); return; }
          try {
            const delta = JSON.parse(data).choices?.[0]?.delta?.content || '';
            if (delta) { full += delta; res.write(`data: ${JSON.stringify({delta})}\n\n`); }
          } catch(e) {}
        });
      });
      apiRes.on('end', () => resolve(full));
      apiRes.on('error', reject);
    });
    req.on('error', err => { res.write(`data: ${JSON.stringify({delta:'Error: '+err.message})}\n\n`); res.write('data: [DONE]\n\n'); resolve(''); });
    req.write(body); req.end();
  });
}

// ─── TACTICAL DATA ───────────────────────────────────────────────
async function getTacticalData() {
  const [situation, soc, missions] = await Promise.all([
    nexusGet('/overwatch/situation').catch(()=>null),
    nexusGet('/soc/summary').catch(()=>null),
    nexusGet('/missions?status=open&limit=5').catch(()=>null),
  ]);
  return { situation, soc, missions, ts: new Date().toISOString() };
}

// ─── HTML UI ─────────────────────────────────────────────────────
const HTML = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>ALFA — Agente Superior</title>
<style>
:root {
  --gold:   #f5a623;
  --gold2:  #ffd280;
  --amber:  #ff8c00;
  --dark:   #0a0a0f;
  --dark2:  #0f0f1a;
  --panel:  #0d0d18;
  --border: #2a2a40;
  --text:   #e0d8c8;
  --dim:    #666680;
  --red:    #ff4444;
  --green:  #44ff88;
  --cyan:   #00d4ff;
}
*{box-sizing:border-box;margin:0;padding:0}
body{background:var(--dark);color:var(--text);font-family:'Courier New',monospace;height:100vh;overflow:hidden;display:flex;flex-direction:column}
#header{background:linear-gradient(90deg,#0a0a0f,#1a1000,#0a0a0f);border-bottom:1px solid var(--gold);padding:6px 16px;display:flex;align-items:center;gap:16px;flex-shrink:0}
#header .logo{font-size:22px;font-weight:bold;color:var(--gold);letter-spacing:6px;text-shadow:0 0 20px var(--amber)}
#header .sub{color:var(--dim);font-size:11px;letter-spacing:2px}
#header .status{margin-left:auto;display:flex;gap:12px;align-items:center}
.dot{width:8px;height:8px;border-radius:50%;display:inline-block}
.dot.green{background:var(--green);box-shadow:0 0 6px var(--green)}
.dot.amber{background:var(--amber);box-shadow:0 0 6px var(--amber)}
.dot.red  {background:var(--red);box-shadow:0 0 6px var(--red)}
.status-label{font-size:10px;color:var(--dim);letter-spacing:1px}
#main{display:flex;flex:1;overflow:hidden;gap:1px;background:var(--border)}
/* ── PANEL IZQUIERDO — Monitor Táctico ── */
#monitor{width:260px;flex-shrink:0;background:var(--panel);display:flex;flex-direction:column;overflow:hidden}
.panel-title{padding:8px 12px;font-size:10px;letter-spacing:3px;color:var(--gold);border-bottom:1px solid var(--border);background:rgba(245,166,35,0.05)}
#tactical-content{flex:1;overflow-y:auto;padding:10px;font-size:11px}
.tac-section{margin-bottom:14px}
.tac-label{color:var(--gold);font-size:9px;letter-spacing:2px;margin-bottom:4px;opacity:.8}
.tac-item{display:flex;justify-content:space-between;padding:3px 0;border-bottom:1px solid rgba(255,255,255,.04);font-size:10px}
.tac-item .val{color:var(--gold2)}
.tac-item .val.red{color:var(--red)}
.tac-item .val.green{color:var(--green)}
.tac-item .val.amber{color:var(--amber)}
.threat-badge{display:inline-block;padding:2px 8px;border-radius:2px;font-size:9px;font-weight:bold;letter-spacing:2px}
.threat-VERDE   {background:rgba(68,255,136,.15);color:var(--green);border:1px solid var(--green)}
.threat-AMARILLO{background:rgba(255,200,0,.15);color:#ffd700;border:1px solid #ffd700}
.threat-NARANJA {background:rgba(255,140,0,.15);color:var(--amber);border:1px solid var(--amber)}
.threat-ROJO    {background:rgba(255,68,68,.15);color:var(--red);border:1px solid var(--red)}
.mission-item{padding:4px 6px;margin:2px 0;background:rgba(245,166,35,.05);border-left:2px solid var(--amber);border-radius:2px;font-size:10px}
.mission-item .m-name{color:var(--text)}
.mission-item .m-status{color:var(--dim);font-size:9px}
#tactical-footer{padding:8px 12px;border-top:1px solid var(--border);font-size:9px;color:var(--dim)}
/* ── PANEL CENTRAL — ORB ── */
#orb-panel{flex:1;background:var(--dark2);display:flex;flex-direction:column;align-items:center;justify-content:center;position:relative;overflow:hidden;min-width:320px}
#orb-panel::before{content:'';position:absolute;inset:0;background:radial-gradient(circle at 50% 50%, rgba(245,166,35,.03) 0%, transparent 70%);pointer-events:none}
#orb-label{position:absolute;top:12px;font-size:11px;letter-spacing:6px;color:var(--gold);opacity:.6}
#orb-state{position:absolute;bottom:50px;font-size:10px;letter-spacing:3px;color:var(--amber);opacity:.7}
canvas#orb{display:block}
#orb-ring{position:absolute;border-radius:50%;border:1px solid rgba(245,166,35,.2);animation:pulse-ring 3s ease-in-out infinite}
/* ── PANEL DERECHO — Chat ── */
#chat-panel{width:360px;flex-shrink:0;background:var(--panel);display:flex;flex-direction:column;overflow:hidden}
#messages{flex:1;overflow-y:auto;padding:12px;display:flex;flex-direction:column;gap:10px}
#messages::-webkit-scrollbar{width:4px}
#messages::-webkit-scrollbar-track{background:transparent}
#messages::-webkit-scrollbar-thumb{background:var(--border);border-radius:2px}
.msg{max-width:100%;word-break:break-word}
.msg.user{align-self:flex-end}
.msg.alfa{align-self:flex-start}
.msg-header{font-size:9px;color:var(--dim);margin-bottom:3px;letter-spacing:1px}
.msg-body{padding:8px 12px;border-radius:4px;font-size:12px;line-height:1.6;white-space:pre-wrap}
.msg.user .msg-body{background:rgba(245,166,35,.12);border:1px solid rgba(245,166,35,.25);color:var(--gold2)}
.msg.alfa .msg-body{background:rgba(0,0,0,.4);border:1px solid var(--border);color:var(--text)}
.msg.alfa .msg-body.thinking{color:var(--dim);font-style:italic;animation:blink .8s infinite}
#chat-input-area{padding:12px;border-top:1px solid var(--border);display:flex;flex-direction:column;gap:8px}
#quick-btns{display:flex;flex-wrap:wrap;gap:4px}
.qbtn{background:rgba(245,166,35,.08);border:1px solid rgba(245,166,35,.2);color:var(--gold);padding:3px 8px;border-radius:3px;font-size:9px;cursor:pointer;letter-spacing:1px;font-family:inherit;transition:.2s}
.qbtn:hover{background:rgba(245,166,35,.2);border-color:var(--gold)}
#input-row{display:flex;gap:6px;align-items:flex-end}
#user-input{flex:1;background:rgba(0,0,0,.5);border:1px solid var(--border);color:var(--text);padding:8px 10px;font-family:inherit;font-size:12px;border-radius:4px;resize:none;outline:none;min-height:38px;max-height:100px;transition:.2s}
#user-input:focus{border-color:var(--gold);box-shadow:0 0 8px rgba(245,166,35,.15)}
#send-btn{background:var(--amber);border:none;color:#000;font-weight:bold;padding:8px 14px;border-radius:4px;cursor:pointer;font-family:inherit;font-size:11px;letter-spacing:1px;transition:.2s;white-space:nowrap}
#send-btn:hover{background:var(--gold)}
#send-btn:disabled{background:var(--border);color:var(--dim);cursor:not-allowed}
@keyframes blink{0%,100%{opacity:1}50%{opacity:.3}}
@keyframes pulse-ring{0%,100%{transform:scale(1);opacity:.4}50%{transform:scale(1.05);opacity:.15}}
@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
.ts{font-size:9px;color:var(--dim);text-align:right;margin-top:2px}
</style>
</head>
<body>

<!-- HEADER -->
<div id="header">
  <div class="logo">ALFA</div>
  <div>
    <div class="sub">AGENTE SUPERIOR — SISTEMA TÁCTICO</div>
  </div>
  <div class="status">
    <span class="dot green" id="dot-ai"></span><span class="status-label">GPT-4o</span>
    <span class="dot amber" id="dot-nexus"></span><span class="status-label">NEXUS</span>
    <span id="clock" style="font-size:11px;color:var(--dim);letter-spacing:1px"></span>
  </div>
</div>

<!-- MAIN 3-PANEL LAYOUT -->
<div id="main">

  <!-- PANEL 1: MONITOR TÁCTICO -->
  <div id="monitor">
    <div class="panel-title">▸ MONITOR TÁCTICO</div>
    <div id="tactical-content">
      <div class="tac-section">
        <div class="tac-label">NIVEL DE AMENAZA</div>
        <div id="threat-level"><span class="threat-badge threat-VERDE">CARGANDO...</span></div>
      </div>
      <div class="tac-section">
        <div class="tac-label">SOC / INCIDENTES</div>
        <div class="tac-item"><span>Eventos 24h</span><span class="val" id="soc-24h">—</span></div>
        <div class="tac-item"><span>Críticos</span><span class="val red" id="soc-crit">—</span></div>
        <div class="tac-item"><span>IOCs activos</span><span class="val amber" id="soc-iocs">—</span></div>
      </div>
      <div class="tac-section">
        <div class="tac-label">OPERACIONES</div>
        <div class="tac-item"><span>Misiones abiertas</span><span class="val" id="missions-open">—</span></div>
        <div class="tac-item"><span>Crisis activas</span><span class="val red" id="crisis-active">—</span></div>
        <div class="tac-item"><span>IR en curso</span><span class="val amber" id="ir-active">—</span></div>
      </div>
      <div class="tac-section">
        <div class="tac-label">INTELIGENCIA</div>
        <div class="tac-item"><span>Alto riesgo</span><span class="val red" id="intel-high">—</span></div>
        <div class="tac-item"><span>OSINT 24h</span><span class="val" id="osint-24h">—</span></div>
      </div>
      <div class="tac-section">
        <div class="tac-label">MISIONES ACTIVAS</div>
        <div id="missions-list"><div style="color:var(--dim);font-size:10px">Cargando...</div></div>
      </div>
    </div>
    <div id="tactical-footer">
      <span id="tac-ts">–</span>
      <button onclick="loadTactical()" style="float:right;background:none;border:1px solid var(--border);color:var(--dim);font-size:9px;padding:1px 6px;cursor:pointer;font-family:inherit">↺</button>
    </div>
  </div>

  <!-- PANEL 2: ORB ALFA -->
  <div id="orb-panel">
    <div id="orb-label">A L F A</div>
    <div id="orb-ring" style="width:280px;height:280px"></div>
    <canvas id="orb" width="240" height="240"></canvas>
    <div id="orb-state">EN ESPERA</div>
  </div>

  <!-- PANEL 3: CHAT -->
  <div id="chat-panel">
    <div class="panel-title">▸ CHAT — COMANDO DIRECTO</div>
    <div id="messages">
      <div class="msg alfa">
        <div class="msg-header">ALFA — ${new Date().toLocaleTimeString('es-ES')}</div>
        <div class="msg-body">Agente ALFA operativo. GPT-4o activo. Soy tu agente superior — doy órdenes a NEXUS AI y a todos los ministerios. ¿Qué requieres, Comandante?</div>
      </div>
    </div>
    <div id="chat-input-area">
      <div id="quick-btns">
        <button class="qbtn" onclick="sendQ('Estado táctico completo')">⚡ ESTADO</button>
        <button class="qbtn" onclick="sendQ('Analiza las amenazas activas del SOC')">🔴 SOC</button>
        <button class="qbtn" onclick="sendQ('Resumen de inteligencia actual')">🧠 INTEL</button>
        <button class="qbtn" onclick="sendQ('Lista de misiones abiertas y su estado')">🎯 MISIONES</button>
        <button class="qbtn" onclick="sendQ('Auditoría de seguridad rápida del sistema')">🛡 AUDIT</button>
        <button class="qbtn" onclick="sendQ('Genera un informe táctico ejecutivo')">📋 INFORME</button>
        <button class="qbtn" onclick="sendQ('¿Qué debo priorizar ahora mismo?')">🔺 PRIORIDAD</button>
        <button class="qbtn" onclick="clearChat()">✕ LIMPIAR</button>
      </div>
      <div id="input-row">
        <textarea id="user-input" placeholder="Escribe una orden para ALFA..." rows="1"
          onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();sendMsg()}"
          oninput="this.style.height='auto';this.style.height=this.scrollHeight+'px'"></textarea>
        <button id="send-btn" onclick="sendMsg()">ENVIAR ▶</button>
      </div>
    </div>
  </div>

</div>

<script>
// ── ORB ENGINE (Gold/Amber theme) ─────────────────────────────────
const canvas = document.getElementById('orb');
const ctx    = canvas.getContext('2d');
const W = canvas.width, H = canvas.height, CX = W/2, CY = H/2;
let orbState = 'idle'; // idle | thinking | speaking
let t = 0;

function drawOrb() {
  ctx.clearRect(0, 0, W, H);
  t += 0.02;
  const breathe = orbState === 'idle' ? 1 + Math.sin(t * 0.8) * 0.03 : 1 + Math.sin(t * 3) * 0.06;
  const R = 90 * breathe;

  // Outer glow rings
  for (let i = 3; i >= 1; i--) {
    const g = ctx.createRadialGradient(CX, CY, R*0.6, CX, CY, R + i*18);
    g.addColorStop(0, 'rgba(245,166,35,0)');
    g.addColorStop(1, \`rgba(245,166,35,\${0.06 / i})\`);
    ctx.beginPath(); ctx.arc(CX, CY, R + i*18, 0, Math.PI*2);
    ctx.fillStyle = g; ctx.fill();
  }

  // Core sphere
  const gradient = ctx.createRadialGradient(CX - R*0.3, CY - R*0.3, R*0.1, CX, CY, R);
  gradient.addColorStop(0, '#fff8e1');
  gradient.addColorStop(0.25, '#ffd280');
  gradient.addColorStop(0.6, '#f5a623');
  gradient.addColorStop(0.85, '#c47a00');
  gradient.addColorStop(1, '#3a2000');
  ctx.beginPath(); ctx.arc(CX, CY, R, 0, Math.PI*2);
  ctx.fillStyle = gradient; ctx.fill();

  // Grid lines
  ctx.save(); ctx.globalAlpha = 0.18; ctx.strokeStyle = '#ffd280'; ctx.lineWidth = 0.6;
  for (let i = 1; i < 7; i++) {
    const lat = (i / 7) * Math.PI;
    const ry  = Math.sin(lat) * R, y = CY - Math.cos(lat) * R;
    ctx.beginPath(); ctx.ellipse(CX, y, ry, ry * 0.25, 0, 0, Math.PI*2); ctx.stroke();
  }
  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * Math.PI + t * 0.3;
    ctx.beginPath();
    ctx.ellipse(CX, CY, Math.abs(Math.cos(angle)) * R, R, angle, 0, Math.PI*2); ctx.stroke();
  }
  ctx.restore();

  // Highlight
  const hl = ctx.createRadialGradient(CX - R*0.35, CY - R*0.35, 0, CX - R*0.2, CY - R*0.2, R*0.5);
  hl.addColorStop(0, 'rgba(255,255,255,0.45)');
  hl.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.beginPath(); ctx.arc(CX, CY, R, 0, Math.PI*2);
  ctx.fillStyle = hl; ctx.fill();

  // Speaking particles
  if (orbState === 'speaking') {
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2 + t * 2;
      const dist  = R + 12 + Math.sin(t * 5 + i) * 8;
      const px = CX + Math.cos(angle) * dist, py = CY + Math.sin(angle) * dist;
      ctx.beginPath(); ctx.arc(px, py, 2.5, 0, Math.PI*2);
      ctx.fillStyle = \`rgba(255,210,128,\${0.4 + Math.sin(t*4+i)*0.3})\`;
      ctx.fill();
    }
  }
  // Thinking ring
  if (orbState === 'thinking') {
    ctx.save(); ctx.strokeStyle = '#f5a623'; ctx.lineWidth = 2; ctx.globalAlpha = 0.6;
    ctx.beginPath(); ctx.arc(CX, CY, R + 12, t * 2, t * 2 + Math.PI * 1.5); ctx.stroke();
    ctx.restore();
  }
  requestAnimationFrame(drawOrb);
}
drawOrb();

function setOrbState(s) {
  orbState = s;
  const el = document.getElementById('orb-state');
  const labels = {idle:'EN ESPERA', thinking:'PROCESANDO...', speaking:'RESPONDIENDO'};
  el.textContent = labels[s] || s;
  el.style.color = s==='speaking' ? 'var(--gold)' : s==='thinking' ? 'var(--amber)' : 'var(--dim)';
}

// ── CLOCK ─────────────────────────────────────────────────────────
function updateClock() {
  document.getElementById('clock').textContent = new Date().toLocaleTimeString('es-ES');
}
setInterval(updateClock, 1000); updateClock();

// ── TACTICAL DATA ─────────────────────────────────────────────────
async function loadTactical() {
  try {
    const r = await fetch('/tactical');
    if (!r.ok) return;
    const d = await r.json();
    const s = d.situation;
    const soc = d.soc;
    const ms  = d.missions;

    if (s) {
      const tl = s.threatLevel || 'VERDE';
      document.getElementById('threat-level').innerHTML =
        \`<span class="threat-badge threat-\${tl}">\${tl}</span>\`;
      document.getElementById('missions-open').textContent  = s.missionsActive ?? '—';
      document.getElementById('crisis-active').textContent  = (s.crisisActive || 0);
      document.getElementById('ir-active').textContent      = (s.irActive || 0);
      document.getElementById('intel-high').textContent     = s.intelHighRisk ?? '—';
      document.getElementById('osint-24h').textContent      = s.osintEventsNew ?? '—';
      // Nexus dot
      document.getElementById('dot-nexus').className = 'dot green';
    }
    if (soc) {
      document.getElementById('soc-24h').textContent  = soc.total_24h ?? '—';
      document.getElementById('soc-crit').textContent = soc.critical_24h ?? '—';
      document.getElementById('soc-iocs').textContent = soc.iocs_active ?? '—';
    }
    if (ms && ms.missions) {
      const list = ms.missions.slice(0,5);
      document.getElementById('missions-list').innerHTML = list.length
        ? list.map(m => \`<div class="mission-item"><div class="m-name">\${m.name||m.title||'Misión'}</div><div class="m-status">\${m.status||''}</div></div>\`).join('')
        : '<div style="color:var(--dim);font-size:10px">Sin misiones activas</div>';
    }
    document.getElementById('tac-ts').textContent = 'Actualizado: ' + new Date().toLocaleTimeString('es-ES');
  } catch(e) {
    document.getElementById('dot-nexus').className = 'dot red';
  }
}
loadTactical();
setInterval(loadTactical, 20000);

// ── CHAT ENGINE ───────────────────────────────────────────────────
const msgs     = document.getElementById('messages');
const inputEl  = document.getElementById('user-input');
const sendBtn  = document.getElementById('send-btn');

function ts() { return new Date().toLocaleTimeString('es-ES'); }

function addMsg(role, text, streaming=false) {
  const wrap = document.createElement('div');
  wrap.className = 'msg ' + (role==='user'?'user':'alfa');
  wrap.innerHTML = \`<div class="msg-header">\${role==='user'?'TÚ':'ALFA'} — \${ts()}</div>
    <div class="msg-body\${streaming?' thinking':''}"></div>
    <div class="ts"></div>\`;
  wrap.querySelector('.msg-body').textContent = text;
  msgs.appendChild(wrap);
  msgs.scrollTop = msgs.scrollHeight;
  return wrap.querySelector('.msg-body');
}

async function sendMsg() {
  const text = inputEl.value.trim();
  if (!text || sendBtn.disabled) return;
  inputEl.value = ''; inputEl.style.height = 'auto';
  sendBtn.disabled = true;
  addMsg('user', text);
  setOrbState('thinking');
  const bodyEl = addMsg('alfa', '', true);
  bodyEl.textContent = '▌';
  try {
    const r = await fetch('/chat', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({message: text})
    });
    const reader = r.body.getReader();
    const decoder = new TextDecoder();
    let full = '';
    bodyEl.classList.remove('thinking');
    bodyEl.textContent = '';
    setOrbState('speaking');
    while(true) {
      const {done, value} = await reader.read();
      if (done) break;
      decoder.decode(value).split('\\n').forEach(line => {
        if (!line.startsWith('data: ')) return;
        const data = line.slice(6).trim();
        if (data === '[DONE]') return;
        try { const d = JSON.parse(data); if(d.delta){ full += d.delta; bodyEl.textContent = full; msgs.scrollTop = msgs.scrollHeight; } } catch(e){}
      });
    }
  } catch(e) {
    bodyEl.classList.remove('thinking');
    bodyEl.textContent = 'Error de conexión con ALFA.';
  }
  setOrbState('idle');
  sendBtn.disabled = false;
  inputEl.focus();
}

function sendQ(q) { inputEl.value = q; sendMsg(); }

function clearChat() {
  msgs.innerHTML = \`<div class="msg alfa"><div class="msg-header">ALFA — \${ts()}</div><div class="msg-body">Chat limpiado. ¿Qué requieres, Comandante?</div></div>\`;
}
</script>
</body>
</html>`;

// ─── HTTP SERVER ──────────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  const url = req.url.split('?')[0];

  // CORS & cache
  res.setHeader('Access-Control-Allow-Origin','*');

  if (req.method === 'GET' && url === '/health') {
    res.writeHead(200,{'Content-Type':'application/json'});
    return res.end(JSON.stringify({ok:true,agent:'ALFA',model:CFG.MODEL,port:PORT}));
  }

  if (req.method === 'GET' && (url === '/' || url === '')) {
    res.writeHead(200,{'Content-Type':'text/html;charset=utf-8'});
    return res.end(HTML);
  }

  if (req.method === 'GET' && url === '/tactical') {
    const data = await getTacticalData();
    res.writeHead(200,{'Content-Type':'application/json'});
    return res.end(JSON.stringify(data));
  }

  if (req.method === 'POST' && url === '/chat') {
    let body = '';
    req.on('data', d => body += d);
    req.on('end', async () => {
      let message = '';
      try { message = JSON.parse(body).message || ''; } catch(e) {}
      if (!message) { res.writeHead(400); return res.end(); }

      // Load history
      const recent = memLoad(20).filter(m => m.role === 'user' || m.role === 'assistant');
      history = recent.map(m => ({role: m.role, content: m.content}));
      history.push({role:'user', content: message});
      memSave('user', message);

      // Inject tactical context
      const tactical = await getTacticalData();
      let ctxMsg = '';
      if (tactical.situation) {
        ctxMsg = `[CONTEXTO TÁCTICO ACTUAL — ${new Date().toLocaleTimeString('es-ES')}]\n`;
        ctxMsg += `Amenaza: ${tactical.situation.threatLevel || '–'} | `;
        ctxMsg += `SOC 24h: ${tactical.situation.socEvents24h || 0} | `;
        ctxMsg += `Misiones: ${tactical.situation.missionsActive || 0} | `;
        ctxMsg += `Alto riesgo Intel: ${tactical.situation.intelHighRisk || 0}\n`;
      }
      const messages = ctxMsg
        ? [{role:'user', content:ctxMsg+'---\n'+message}, ...history.slice(-20)]
        : history.slice(-20);

      res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache','Connection':'keep-alive'});

      const full = await streamOpenAI(messages, res);
      if (full) memSave('assistant', full);

      history.push({role:'assistant', content:full});
      res.end();
    });
    return;
  }

  res.writeHead(404); res.end('Not found');
});

server.listen(PORT, '0.0.0.0', async () => {
  console.log('\n\x1b[33m\x1b[1m╔══════════════════════════════════════════════╗\x1b[0m');
  console.log('\x1b[33m\x1b[1m║   A L F A  — Agente Superior v1.0           ║\x1b[0m');
  console.log('\x1b[33m\x1b[1m╚══════════════════════════════════════════════╝\x1b[0m');
  console.log('\x1b[33m\n  Puerto:\x1b[0m', PORT);
  console.log('\x1b[33m  Modelo:\x1b[0m', CFG.MODEL);
  console.log('\x1b[33m\n  ┌────────────────────────────────────────────┐\x1b[0m');
  console.log('\x1b[33m  │  Abre ALFA en tu browser:                  │\x1b[0m');
  console.log(`\x1b[33m\x1b[1m  │  → http://127.0.0.1:${PORT}                  │\x1b[0m`);
  console.log('\x1b[33m  └────────────────────────────────────────────┘\x1b[0m\n');
  await autoLogin();
  exec(`open "http://127.0.0.1:${PORT}" 2>/dev/null || open -a Safari "http://127.0.0.1:${PORT}" 2>/dev/null`, ()=>{});
});
