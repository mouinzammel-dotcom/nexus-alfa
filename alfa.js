#!/usr/bin/env node
/**
 * ╔══════════════════════════════════════════════════════════════════════╗
 * ║  N E X U S   A L F A  — Agente Superior Unificado                  ║
 * ║  Fusión total: NEXUS AI MAC + ALFA OVERWATCH                        ║
 * ║  GPT-4o · Multi-motor · Voz · Cerebro NEXUS MANUS · Humana         ║
 * ╚══════════════════════════════════════════════════════════════════════╝
 */
'use strict';

const http   = require('http');
const https  = require('https');
const dns    = require('dns').promises;
const net    = require('net');
const tls    = require('tls');
const fs     = require('fs');
const path   = require('path');
const os     = require('os');
const { exec } = require('child_process');

// ─── PATHS & CONFIG ────────────────────────────────────────────────────────
const HOME        = os.homedir();
const ENV_FILE    = path.join(HOME, '.nexus-ai.env');
const MEM_FILE    = path.join(HOME, '.alfa-memory.jsonl');
const MEM_CRIT    = path.join(HOME, '.alfa-memory-critical.jsonl');
const LEARN_FILE  = path.join(HOME, '.alfa-learnings.jsonl');
const PROFILE_FILE= path.join(HOME, '.nexus-profile.json');
const LOG_FILE    = path.join(HOME, '.alfa-log.jsonl');
const PORT        = parseInt(process.env.ALFA_PORT || '3120');

const CFG = {
  ENGINE_PRIMARY: 'openai',
  OPENAI_KEY: '', OPENAI_MODEL: 'gpt-4o',
  CLAUDE_KEY: '', CLAUDE_MODEL: 'claude-3-5-sonnet-20241022',
  GEMINI_KEY: '', GEMINI_MODEL: 'gemini-1.5-pro',
  OLLAMA_HOST: '127.0.0.1', OLLAMA_PORT: 11434, OLLAMA_MODEL: 'llama3.2',
  NEXUS_URL: '', NEXUS_KEY: '',
  SHODAN_KEY: '', CENSYS_ID: '', CENSYS_SEC: '',
  WEATHER_CITY: 'Barcelona',
  MAX_TOKENS: 4000, MAX_ITER: 6,
};

function loadEnv() {
  [ENV_FILE, path.join(HOME,'.env')].forEach(f => {
    if (!fs.existsSync(f)) return;
    fs.readFileSync(f,'utf8').split('\n').forEach(l => {
      const eq=l.indexOf('='); if(eq<1||l.startsWith('#')) return;
      process.env[l.slice(0,eq).trim()] = l.slice(eq+1).trim();
    });
  });
}
loadEnv();
const EMAP = {
  AI_API_KEY:'OPENAI_KEY', OPENAI_API_KEY:'OPENAI_KEY',
  CLAUDE_API_KEY:'CLAUDE_KEY', ANTHROPIC_API_KEY:'CLAUDE_KEY',
  GEMINI_API_KEY:'GEMINI_KEY', GOOGLE_API_KEY:'GEMINI_KEY',
  OLLAMA_MODEL:'OLLAMA_MODEL',
  NEXUS_URL:'NEXUS_URL', NEXUS_API_KEY:'NEXUS_KEY',
  SHODAN_API_KEY:'SHODAN_KEY', CENSYS_API_ID:'CENSYS_ID', CENSYS_API_SECRET:'CENSYS_SEC',
  WEATHER_CITY:'WEATHER_CITY', ALFA_ENGINE:'ENGINE_PRIMARY',
};
Object.entries(EMAP).forEach(([e,c]) => { if(process.env[e]) CFG[c]=process.env[e]; });

// ─── PERFIL DEL COMANDANTE ──────────────────────────────────────────────────
const DEFAULT_PROFILE = {
  name:'Mouin Zammel Abdedayem',
  role:'Director de Operaciones — Comandante NEXUS',
  city:'Barcelona',
  address:'Calle Sardenya 261, Barcelona 08013',
  country:'España',
  timezone:'Europe/Madrid',
  known_people:[], preferences:{}, sessions:0,
  created_at: new Date().toISOString(),
};
// Pre-seed perfil en disco si no existe
function initProfile() {
  if (!fs.existsSync(PROFILE_FILE)) {
    fs.writeFileSync(PROFILE_FILE, JSON.stringify(DEFAULT_PROFILE,null,2), {mode:0o600});
  }
}
initProfile();
function loadProfile() {
  try { return {...DEFAULT_PROFILE,...JSON.parse(fs.readFileSync(PROFILE_FILE,'utf8'))}; }
  catch(e) { return {...DEFAULT_PROFILE}; }
}
function saveProfile(p) { fs.writeFileSync(PROFILE_FILE, JSON.stringify(p,null,2)); }

// ─── MEMORIA ────────────────────────────────────────────────────────────────
function memSave(role, content, critical=false) {
  const e = JSON.stringify({ts:new Date().toISOString(),role,content:String(content).slice(0,3000),critical});
  try { fs.appendFileSync(MEM_FILE, e+'\n'); } catch(err) {}
  if (critical) try { fs.appendFileSync(MEM_CRIT, e+'\n'); } catch(err) {}
}
function memLoad(n=40) {
  try {
    return fs.readFileSync(MEM_FILE,'utf8').trim().split('\n').filter(Boolean)
      .slice(-n).map(l=>{ try{return JSON.parse(l);}catch(e){return null;} }).filter(Boolean);
  } catch(e) { return []; }
}
function memSearch(query, n=10) {
  try {
    const q=query.toLowerCase();
    return fs.readFileSync(MEM_FILE,'utf8').trim().split('\n').filter(Boolean)
      .map(l=>{ try{return JSON.parse(l);}catch(e){return null;} }).filter(i=>i&&i.content&&i.content.toLowerCase().includes(q))
      .slice(-n);
  } catch(e) { return []; }
}
function memCritical() {
  try { return fs.readFileSync(MEM_CRIT,'utf8').trim().split('\n').filter(Boolean).map(l=>JSON.parse(l)); }
  catch(e) { return []; }
}
function memContext(n=20) {
  const items = memLoad(n).filter(i=>i.role==='user'||i.role==='assistant');
  if (!items.length) return '(Sin historial previo)';
  return items.slice(-6).map(i=>`${i.role==='user'?'Comandante':'NEXUS ALFA'}: ${String(i.content).slice(0,200)}`).join('\n');
}

// ─── APRENDIZAJES ───────────────────────────────────────────────────────────
function saveLearning(note) {
  const e = JSON.stringify({ts:new Date().toISOString(),note});
  try { fs.appendFileSync(LEARN_FILE, e+'\n'); } catch(err) {}
}
function loadLearnings() {
  try {
    const items = fs.readFileSync(LEARN_FILE,'utf8').trim().split('\n').filter(Boolean)
      .map(l=>{ try{return JSON.parse(l);}catch(e){return null;} }).filter(Boolean);
    if (!items.length) return '';
    return 'Lo que sé sobre el Comandante:\n'+items.slice(-20).map(i=>`• ${i.note}`).join('\n');
  } catch(e) { return ''; }
}

// ─── LOGGING ────────────────────────────────────────────────────────────────
function alfaLog(type, data) {
  try { fs.appendFileSync(LOG_FILE, JSON.stringify({ts:new Date().toISOString(),type,...data})+'\n'); }
  catch(e) {}
}

// ─── TIEMPO Y CLIMA ─────────────────────────────────────────────────────────
function getTimeCtx() {
  const now = new Date();
  const h = now.getHours();
  const dow = ['domingo','lunes','martes','miércoles','jueves','viernes','sábado'][now.getDay()];
  const period = h>=6&&h<12?'mañana':h>=12&&h<15?'mediodía':h>=15&&h<20?'tarde':h>=20&&h<23?'noche':'madrugada';
  return {
    datetime: now.toLocaleString('es-ES',{weekday:'long',year:'numeric',month:'long',day:'numeric',hour:'2-digit',minute:'2-digit'}),
    dow, h, period, iso: now.toISOString(),
    isWork: h>=8&&h<22, isMorning: h>=5&&h<12,
  };
}
let _weatherCache = null, _weatherTs = 0;
function fetchWeather(city) {
  return new Promise(resolve => {
    if (Date.now()-_weatherTs < 30*60*1000 && _weatherCache) return resolve(_weatherCache);
    const loc = encodeURIComponent(city||CFG.WEATHER_CITY||'');
    http.get(`http://wttr.in/${loc}?format=j1`, {headers:{'User-Agent':'curl/7.88'}}, res => {
      let raw=''; res.on('data',d=>raw+=d);
      res.on('end',()=>{
        try {
          const j=JSON.parse(raw), c=j.current_condition[0];
          _weatherCache={temp:c.temp_C,feels:c.FeelsLikeC,humidity:c.humidity,desc:c.weatherDesc[0].value,city:j.nearest_area?.[0]?.areaName?.[0]?.value||city};
          _weatherTs=Date.now(); resolve(_weatherCache);
        } catch(e) { resolve(null); }
      });
    }).on('error',()=>resolve(null));
  });
}

// ─── HTTP UTILS ─────────────────────────────────────────────────────────────
function httpsPost(opts, body='') {
  return new Promise(resolve => {
    const req = https.request({...opts,timeout:90000}, res => {
      let d=''; res.on('data',c=>d+=c);
      res.on('end',()=>{ try{resolve({ok:res.statusCode<400,status:res.statusCode,data:JSON.parse(d)});}catch(e){resolve({ok:res.statusCode<400,status:res.statusCode,raw:d.slice(0,3000)});} });
    });
    req.on('error',e=>resolve({ok:false,error:e.message}));
    req.on('timeout',()=>{req.destroy();resolve({ok:false,error:'timeout'});});
    if(body) req.write(body); req.end();
  });
}
function nexusCall(method, endpoint, body) {
  if (!CFG.NEXUS_URL) return Promise.resolve({ok:false,error:'NEXUS_URL no configurado'});
  const url = new URL(CFG.NEXUS_URL+'/api'+endpoint);
  const b = body?JSON.stringify(body):null;
  const h = {'Authorization':'Bearer '+CFG.NEXUS_KEY,'Content-Type':'application/json'};
  if (b) h['Content-Length']=Buffer.byteLength(b);
  return httpsPost({hostname:url.hostname,port:443,path:url.pathname+(url.search||''),method,headers:h},b);
}

// ─── AUTO-LOGIN NEXUS ───────────────────────────────────────────────────────
async function autoLogin() {
  if (CFG.NEXUS_KEY||!CFG.NEXUS_URL) return;
  const user=process.env.NEXUS_USER||'operador1', pass=process.env.NEXUS_PASS||'';
  if (!pass) return;
  try {
    const b=JSON.stringify({username:user,password:pass});
    const url=new URL(CFG.NEXUS_URL+'/api/auth/login');
    const r=await httpsPost({hostname:url.hostname,port:443,path:'/api/auth/login',method:'POST',headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(b)}},b);
    if (r.data?.token) {
      CFG.NEXUS_KEY=r.data.token;
      const env=fs.existsSync(ENV_FILE)?fs.readFileSync(ENV_FILE,'utf8'):'';
      fs.writeFileSync(ENV_FILE, env.includes('NEXUS_API_KEY=')?env.replace(/^NEXUS_API_KEY=.*/m,'NEXUS_API_KEY='+r.data.token):env+'\nNEXUS_API_KEY='+r.data.token, {mode:0o600});
    }
  } catch(e) {}
}

// ─── AI ENGINES ─────────────────────────────────────────────────────────────
function engineOpenAI_stream(messages, sys, res) {
  return new Promise((resolve) => {
    if (!CFG.OPENAI_KEY) { resolve(''); return; }
    const body = JSON.stringify({model:CFG.OPENAI_MODEL,stream:true,max_tokens:CFG.MAX_TOKENS,messages:[{role:'system',content:sys},...messages]});
    const req = https.request({hostname:'api.openai.com',port:443,path:'/v1/chat/completions',method:'POST',
      headers:{'Authorization':'Bearer '+CFG.OPENAI_KEY,'Content-Type':'application/json','Content-Length':Buffer.byteLength(body)},timeout:90000},
      apiRes => {
        let full='';
        apiRes.on('data',chunk=>{
          chunk.toString().split('\n').forEach(line=>{
            if (!line.startsWith('data: ')) return;
            const d=line.slice(6).trim(); if(d==='[DONE]') return;
            try{ const tok=JSON.parse(d).choices?.[0]?.delta?.content||'';
              if(tok){full+=tok; if(res) res.write(`data: ${JSON.stringify({delta:tok})}\n\n`);} }catch(e){}
          });
        });
        apiRes.on('end',()=>resolve(full));
        apiRes.on('error',()=>resolve(''));
      });
    req.on('error',e=>{if(res) res.write(`data: ${JSON.stringify({delta:'[Error AI: '+e.message+']'})}\n\n`); resolve('');});
    req.write(body); req.end();
  });
}
async function engineOpenAI_sync(messages, sys) {
  if (!CFG.OPENAI_KEY) return '';
  const body=JSON.stringify({model:CFG.OPENAI_MODEL,max_tokens:CFG.MAX_TOKENS,messages:[{role:'system',content:sys},...messages]});
  const r=await httpsPost({hostname:'api.openai.com',port:443,path:'/v1/chat/completions',method:'POST',headers:{'Authorization':'Bearer '+CFG.OPENAI_KEY,'Content-Type':'application/json','Content-Length':Buffer.byteLength(body)}},body);
  return r.data?.choices?.[0]?.message?.content||'';
}
function engineClaude_stream(messages, sys, res) {
  return new Promise(resolve => {
    if (!CFG.CLAUDE_KEY) { resolve(''); return; }
    const msgs=messages.map(m=>({role:m.role==='assistant'?'assistant':'user',content:m.content}));
    const body=JSON.stringify({model:CFG.CLAUDE_MODEL,max_tokens:CFG.MAX_TOKENS,stream:true,system:sys,messages:msgs});
    const req=https.request({hostname:'api.anthropic.com',port:443,path:'/v1/messages',method:'POST',
      headers:{'x-api-key':CFG.CLAUDE_KEY,'anthropic-version':'2023-06-01','Content-Type':'application/json','Content-Length':Buffer.byteLength(body)},timeout:90000},
      apiRes=>{
        let full='';
        apiRes.on('data',chunk=>{
          chunk.toString().split('\n').forEach(line=>{
            if(!line.startsWith('data: ')) return;
            try{const ev=JSON.parse(line.slice(6));const tok=ev.delta?.text||'';
              if(tok){full+=tok; if(res) res.write(`data: ${JSON.stringify({delta:tok})}\n\n`);}}catch(e){}
          });
        });
        apiRes.on('end',()=>resolve(full));
        apiRes.on('error',()=>resolve(''));
      });
    req.on('error',()=>resolve('')); req.write(body); req.end();
  });
}
async function engineGemini(messages, sys, res) {
  if (!CFG.GEMINI_KEY) return '';
  const parts=messages.map(m=>({role:m.role==='assistant'?'model':'user',parts:[{text:m.content}]}));
  const body=JSON.stringify({contents:[{role:'user',parts:[{text:sys}]},...parts],generationConfig:{maxOutputTokens:CFG.MAX_TOKENS}});
  const r=await httpsPost({hostname:'generativelanguage.googleapis.com',port:443,path:`/v1beta/models/${CFG.GEMINI_MODEL}:generateContent?key=${CFG.GEMINI_KEY}`,method:'POST',headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(body)}},body);
  const text=r.data?.candidates?.[0]?.content?.parts?.[0]?.text||'';
  if(text&&res) res.write(`data: ${JSON.stringify({delta:text})}\n\n`);
  return text;
}
function engineOllama(messages, sys, res) {
  return new Promise(resolve=>{
    const ctx=messages.map(m=>`${m.role==='user'?'Comandante':'NEXUS ALFA'}: ${m.content}`).join('\n');
    const body=JSON.stringify({model:CFG.OLLAMA_MODEL,prompt:sys+'\n\n'+ctx+'\nNEXUS ALFA:',stream:true});
    const req=http.request({hostname:CFG.OLLAMA_HOST,port:CFG.OLLAMA_PORT,path:'/api/generate',method:'POST',headers:{'Content-Type':'application/json'},timeout:120000},
      apiRes=>{
        let full='';
        apiRes.on('data',chunk=>{
          try{const ev=JSON.parse(chunk.toString());const tok=ev.response||'';
            if(tok){full+=tok;if(res)res.write(`data: ${JSON.stringify({delta:tok})}\n\n`);}}catch(e){}
        });
        apiRes.on('end',()=>resolve(full));apiRes.on('error',()=>resolve(''));
      });
    req.on('error',()=>resolve('')); req.write(body); req.end();
  });
}
async function runEngine(messages, sys, res, engine) {
  const eng=engine||CFG.ENGINE_PRIMARY;
  if(eng==='claude'&&CFG.CLAUDE_KEY)  return engineClaude_stream(messages,sys,res);
  if(eng==='gemini'&&CFG.GEMINI_KEY)  return engineGemini(messages,sys,res);
  if(eng==='ollama')                  return engineOllama(messages,sys,res);
  if(CFG.OPENAI_KEY)                  return engineOpenAI_stream(messages,sys,res);
  if(CFG.CLAUDE_KEY)                  return engineClaude_stream(messages,sys,res);
  if(CFG.GEMINI_KEY)                  return engineGemini(messages,sys,res);
  return engineOllama(messages,sys,res);
}
async function runEngineSync(messages, sys) {
  if(CFG.OPENAI_KEY) return engineOpenAI_sync(messages,sys);
  return runEngine(messages,sys,null,'ollama');
}

// ─── ENGINE ROUTER ──────────────────────────────────────────────────────────
const TASK_PATTERNS = {
  code:     /código|script|programa|función|clase|bug|error|fix|refactor|deploy|npm|node|python|bash/i,
  security: /seguridad|soc|amenaza|hack|audit|scan|vuln|pentest|cve|exploit|nmap|brecha/i,
  document: /documento|pdf|archivo|leer|analiza.*doc|excel|word/i,
  osint:    /shodan|censys|osint|dominio|dns|ssl|whois|ip pública|footprint/i,
  planning: /plan|estrategia|misión|objetivo|prioridad|roadmap|decisión|táctica/i,
  memory:   /recuerda|anterior|historial|memoria|pasado|dijiste|guardaste|aprend/i,
  personal: /cómo estás|qué tal|buenos días|buenas|hola|clima|tiempo|agenda|correo|email/i,
};
function detectTask(msg) {
  for(const [t,re] of Object.entries(TASK_PATTERNS)) { if(re.test(msg)) return t; }
  return 'general';
}

// ─── TOOLS ──────────────────────────────────────────────────────────────────
const ALLOWED_CMDS = ['nmap','dig','host','ping','curl','whois','openssl','netstat','ss','lsof',
  'ifconfig','ip','arp','traceroute','nc','nslookup','cat','ls','df','free','uptime','uname',
  'ps','which','find','grep','head','tail','date','hostname','osascript','screencapture',
  'pbcopy','pbpaste','open','killall','launchctl'];

const TOOLS = {

  // ── NEXUS MANUS — Leer ────────────────────────────────────────────────────
  NEXUS_READ: async({endpoint})=>{
    const r=await nexusCall('GET',endpoint);
    alfaLog('tool',{tool:'NEXUS_READ',endpoint,ok:r.ok});
    return r.ok?{ok:true,data:r.data||r.raw}:{ok:false,error:r.error||'HTTP '+r.status};
  },
  // ── NEXUS MANUS — Escribir ────────────────────────────────────────────────
  NEXUS_WRITE: async({endpoint,method='POST',body})=>{
    const r=await nexusCall(method,endpoint,body);
    alfaLog('tool',{tool:'NEXUS_WRITE',endpoint,ok:r.ok});
    return r.ok?{ok:true,data:r.data||r.raw}:{ok:false,error:r.error};
  },
  // ── NEXUS — Crear misión ──────────────────────────────────────────────────
  NEXUS_MISSION: async({name,description,priority='high',type='tactical'})=>{
    const r=await nexusCall('POST','/missions',{name,description,priority,mission_type:type,status:'open'});
    alfaLog('action',{type:'mission_create',name,priority});
    return r.ok?{ok:true,id:r.data?.id,msg:'Misión creada: '+name}:{ok:false,error:r.error};
  },
  // ── NEXUS — Crear SOC ─────────────────────────────────────────────────────
  NEXUS_SOC: async({title,description,severity='high',event_type='threat_detected'})=>{
    const r=await nexusCall('POST','/soc/events',{title,description,severity,event_type,status:'open'});
    alfaLog('action',{type:'soc_create',title,severity});
    return r.ok?{ok:true,id:r.data?.id,msg:'SOC creado: '+title}:{ok:false,error:r.error};
  },
  // ── NEXUS — Intel update ──────────────────────────────────────────────────
  NEXUS_INTEL: async({id,risk_level,risk_score,notes})=>{
    const r=await nexusCall('PUT','/intel/persons/'+id,{risk_level,risk_score,risk_notes:notes});
    alfaLog('action',{type:'intel_update',id,risk_level});
    return r.ok?{ok:true,msg:'Intel actualizado'}:{ok:false,error:r.error};
  },
  // ── NEXUS — Threat hunt ───────────────────────────────────────────────────
  NEXUS_HUNT: async({query_id='iocs_sin_alertas'})=>{
    const r=await nexusCall('POST','/hunt/execute',{query_id});
    return r.ok?{ok:true,results:r.data}:{ok:false,error:r.error};
  },

  // ── Shell ─────────────────────────────────────────────────────────────────
  SHELL: async({cmd,timeout_s=20})=>{
    const base=cmd.trim().split(/\s+/)[0].replace(/.*\//,'');
    if(!ALLOWED_CMDS.includes(base)) return {ok:false,error:'Comando no permitido: '+base};
    alfaLog('tool',{tool:'SHELL',cmd});
    return new Promise(resolve=>{
      exec(cmd,{timeout:timeout_s*1000,maxBuffer:1024*512},(err,stdout,stderr)=>{
        const out=(stdout||'').trim().slice(0,4000);
        const ser=(stderr||'').trim().slice(0,500);
        if(err&&!out) return resolve({ok:false,error:ser||err.message,cmd});
        resolve({ok:true,output:out+(ser?'\n[STDERR]: '+ser:''),cmd});
      });
    });
  },

  // ── Clima ─────────────────────────────────────────────────────────────────
  GET_WEATHER: async({city})=>{
    const profile=loadProfile();
    const w=await fetchWeather(city||profile.city||CFG.WEATHER_CITY);
    return w?{ok:true,...w}:{ok:false,error:'No disponible'};
  },

  // ── Calendario macOS ──────────────────────────────────────────────────────
  GET_CALENDAR: async({days=7})=>{
    const script=`set output to ""
tell application "Calendar"
  set d1 to current date
  set d2 to d1 + (${days} * days)
  repeat with cal in calendars
    set evs to (every event of cal whose start date >= d1 and start date <= d2)
    repeat with ev in evs
      set output to output & (summary of ev) & " | " & (start date of ev as string) & "\\n"
    end repeat
  end repeat
end tell
return output`;
    const r=await TOOLS.SHELL({cmd:`osascript -e '${script.replace(/'/g,"'\\''")}' 2>/dev/null`,timeout_s:10});
    return {ok:true,events:r.output||'Sin eventos próximos.'};
  },
  ADD_CALENDAR_EVENT: async({title,date_str,duration_min=60,notes=''})=>{
    const script=`tell application "Calendar"
  tell calendar 1
    make new event with properties {summary:"${title}", start date:date "${date_str}", end date:(date "${date_str}") + ${duration_min} * minutes, description:"${notes}"}
  end tell
end tell`;
    const r=await TOOLS.SHELL({cmd:`osascript -e '${script.replace(/'/g,"'\\''")}' 2>/dev/null`,timeout_s:10});
    return {ok:r.ok,msg:r.ok?'Evento creado en Calendar.':r.error};
  },

  // ── Email (Mail.app) ──────────────────────────────────────────────────────
  READ_EMAIL: async({count=10})=>{
    const script=`set output to ""
tell application "Mail"
  set msgs to (messages of mailbox "INBOX" of first account) whose read status is false
  set n to count of msgs
  if n > ${count} then set n to ${count}
  repeat with i from 1 to n
    set m to item i of msgs
    set output to output & "DE: " & (sender of m) & "\\nASUNTO: " & (subject of m) & "\\nFECHA: " & ((date received of m) as string) & "\\n---\\n"
  end repeat
end tell
if output is "" then return "No hay emails no leídos."
return output`;
    const r=await TOOLS.SHELL({cmd:`osascript -e '${script.replace(/'/g,"'\\''")}' 2>/dev/null`,timeout_s:12});
    return {ok:true,emails:r.output||'No hay emails no leídos.'};
  },
  SEND_EMAIL: async({to,subject,body})=>{
    alfaLog('action',{type:'send_email',to,subject});
    const script=`tell application "Mail"
  set msg to make new outgoing message with properties {subject:"${subject.replace(/"/g,'')}", content:"${body.replace(/"/g,'').replace(/\n/g,'\\n')}"}
  tell msg
    make new to recipient with properties {address:"${to}"}
  end tell
  send msg
end tell`;
    const r=await TOOLS.SHELL({cmd:`osascript -e '${script.replace(/'/g,"'\\''")}' 2>/dev/null`,timeout_s:10});
    return {ok:r.ok,msg:r.ok?'Email enviado a '+to:r.error};
  },

  // ── Leer documento ────────────────────────────────────────────────────────
  FILE_READ: async({path:fp})=>{
    const full=fp.replace(/^~/,HOME);
    const ext=path.extname(full).toLowerCase();
    if(ext==='.pdf'){const r=await TOOLS.SHELL({cmd:`pdftotext "${full}" - 2>/dev/null`});return r;}
    if(['.docx','.doc','.rtf'].includes(ext)){const r=await TOOLS.SHELL({cmd:`textutil -convert txt -stdout "${full}" 2>/dev/null`});return r;}
    if(['.png','.jpg','.jpeg','.tiff'].includes(ext)){const r=await TOOLS.SHELL({cmd:`tesseract "${full}" stdout 2>/dev/null`});return r;}
    try{return {ok:true,content:fs.readFileSync(full,'utf8').slice(0,8000)};}catch(e){return {ok:false,error:e.message};}
  },
  FILE_LIST: async({dir='~'})=>TOOLS.SHELL({cmd:`ls -la "${dir.replace(/^~/,HOME)}" 2>/dev/null | head -50`}),

  // ── Shodan ────────────────────────────────────────────────────────────────
  SHODAN: async({ip,query})=>{
    if(!CFG.SHODAN_KEY) return {ok:false,error:'SHODAN_API_KEY no configurado'};
    alfaLog('tool',{tool:'SHODAN',ip,query});
    if(ip){
      const r=await httpsPost({hostname:'api.shodan.io',port:443,path:`/shodan/host/${ip}?key=${CFG.SHODAN_KEY}`,method:'GET'},'');
      if(!r.ok) return {ok:false,error:'HTTP '+r.status};
      return {ok:true,ip:r.data.ip_str,org:r.data.org,country:r.data.country_name,ports:r.data.ports,vulns:r.data.vulns?Object.keys(r.data.vulns):[],hostnames:r.data.hostnames,isp:r.data.isp};
    }
    if(query){
      const r=await httpsPost({hostname:'api.shodan.io',port:443,path:`/shodan/host/search?key=${CFG.SHODAN_KEY}&query=${encodeURIComponent(query)}&limit=5`,method:'GET'},'');
      return r.ok?{ok:true,total:r.data?.total,matches:(r.data?.matches||[]).slice(0,5).map(m=>({ip:m.ip_str,org:m.org,ports:m.port}))}:{ok:false,error:'HTTP '+r.status};
    }
    return {ok:false,error:'Especifica ip o query'};
  },

  // ── Censys ────────────────────────────────────────────────────────────────
  CENSYS: async({query,limit=5})=>{
    if(!CFG.CENSYS_ID) return {ok:false,error:'CENSYS_API_ID no configurado'};
    const auth=Buffer.from(CFG.CENSYS_ID+':'+CFG.CENSYS_SEC).toString('base64');
    const b=JSON.stringify({q:query,per_page:limit});
    const r=await httpsPost({hostname:'search.censys.io',port:443,path:'/api/v2/hosts/search',method:'POST',headers:{'Content-Type':'application/json','Authorization':'Basic '+auth,'Content-Length':Buffer.byteLength(b)}},b);
    return r.ok?{ok:true,hits:r.data?.result?.hits?.slice(0,limit)||[]}:{ok:false,error:'HTTP '+r.status};
  },

  // ── DNS, SSL, WHOIS ───────────────────────────────────────────────────────
  DNS: async({domain})=>{
    const types=['A','AAAA','MX','NS','TXT','CNAME'];
    const results={};
    await Promise.all(types.map(t=>dns.resolve(domain,t).then(r=>results[t]=r).catch(()=>{})));
    return {ok:true,domain,records:results};
  },
  SSL: async({host,port=443})=>{
    return new Promise(resolve=>{
      const sock=tls.connect({host,port,timeout:5000,rejectUnauthorized:false},()=>{
        const cert=sock.getPeerCertificate();
        const exp=cert.valid_to?new Date(cert.valid_to):null;
        const days=exp?Math.round((exp-Date.now())/864e5):null;
        sock.destroy();
        resolve({ok:true,host,proto:sock.getProtocol(),cipher:sock.getCipher()?.name,subject:cert.subject?.CN,issuer:cert.issuer?.O,days_left:days,expires:cert.valid_to,severity:days<30?'critical':days<90?'high':'ok'});
      });
      sock.on('error',e=>resolve({ok:false,error:e.message}));
      sock.on('timeout',()=>{sock.destroy();resolve({ok:false,error:'timeout'});});
    });
  },
  WHOIS: async({domain})=>{
    return new Promise(resolve=>{
      const sock=net.connect(43,'whois.iana.org');
      let data=''; sock.setTimeout(5000);
      sock.on('connect',()=>sock.write(domain+'\r\n'));
      sock.on('data',d=>data+=d);
      sock.on('end',()=>resolve({ok:true,domain,whois:data.slice(0,2000)}));
      sock.on('error',e=>resolve({ok:false,error:e.message}));
      sock.on('timeout',()=>{sock.destroy();resolve({ok:false,error:'timeout'});});
    });
  },

  // ── Estado sistema ────────────────────────────────────────────────────────
  SYSTEM_STATUS: async()=>{
    const svcs=[
      {p:4000,n:'NEXUS MANUS'},{p:3115,n:'NEXUS ORB'},{p:3120,n:'NEXUS ALFA'},
      {p:3100,n:'Bridge'},{p:3101,n:'Health'},{p:3102,n:'Alerts'},{p:3103,n:'Fing'},
      {p:8080,n:'MOUBILDER'},{p:11434,n:'Ollama'},
    ];
    const status=await Promise.all(svcs.map(({p,n})=>new Promise(resolve=>{
      const s=net.connect(p,'127.0.0.1'); s.setTimeout(500);
      s.on('connect',()=>{s.destroy();resolve({name:n,port:p,online:true});});
      s.on('error',()=>resolve({name:n,port:p,online:false}));
      s.on('timeout',()=>{s.destroy();resolve({name:n,port:p,online:false});});
    })));
    const engines={openai:!!CFG.OPENAI_KEY,claude:!!CFG.CLAUDE_KEY,gemini:!!CFG.GEMINI_KEY,ollama:status.find(s=>s.name==='Ollama')?.online||false};
    return {ok:true,services:status,engines,active_engine:CFG.ENGINE_PRIMARY,hostname:os.hostname(),platform:os.platform(),uptime_h:Math.round(os.uptime()/3600),free_gb:+(os.freemem()/1e9).toFixed(1)};
  },

  // ── Mac ───────────────────────────────────────────────────────────────────
  CLIPBOARD_READ:  async()=>TOOLS.SHELL({cmd:'pbpaste'}),
  CLIPBOARD_WRITE: async({text})=>TOOLS.SHELL({cmd:`echo '${text.replace(/'/g,"'\\''")}' | pbcopy`}),
  NOTIFY:   async({title,message})=>TOOLS.SHELL({cmd:`osascript -e 'display notification "${message}" with title "${title}"'`}),
  OPEN_APP: async({app})=>TOOLS.SHELL({cmd:`open -a "${app}"`}),
  SCREENSHOT: async()=>{ const fn=path.join(HOME,'Desktop','nexus-alfa-'+Date.now()+'.png'); return TOOLS.SHELL({cmd:`screencapture -x "${fn}"`}); },

  // ── Memoria ───────────────────────────────────────────────────────────────
  REMEMBER: async({note,critical=false})=>{
    memSave('note',note,critical);
    alfaLog('memory',{note:note.slice(0,100),critical});
    return {ok:true,saved:critical?'⭐ Nota crítica guardada.':'Nota guardada.'};
  },
  RECALL:   async({query})=>{ const f=memSearch(query); return {ok:true,results:f.map(i=>({ts:i.ts,content:i.content.slice(0,300),critical:i.critical}))}; },
  LEARN:    async({note})=>{ saveLearning(note); return {ok:true,saved:'Aprendizaje guardado.'}; },

  // ── Perfil ────────────────────────────────────────────────────────────────
  GET_PROFILE:    async()=>({ok:true,profile:loadProfile()}),
  UPDATE_PROFILE: async({updates})=>{ const p=loadProfile(); Object.assign(p,updates); saveProfile(p); return {ok:true,profile:p}; },
  ADD_PERSON:     async({name,relation,notes})=>{
    const p=loadProfile(); p.known_people=p.known_people||[];
    p.known_people=p.known_people.filter(x=>x.name!==name);
    p.known_people.push({name,relation,notes,added:new Date().toISOString()});
    saveProfile(p); return {ok:true};
  },

  // ── Cambiar motor ─────────────────────────────────────────────────────────
  SET_ENGINE: async({engine})=>{
    const valid=['openai','claude','gemini','ollama'];
    if(!valid.includes(engine)) return {ok:false,error:'Opciones: '+valid.join(', ')};
    CFG.ENGINE_PRIMARY=engine;
    return {ok:true,msg:'Motor cambiado a: '+engine};
  },
};

// ─── TOOL PARSER ────────────────────────────────────────────────────────────
function extractTools(text) {
  const calls=[], re=/<<([A-Z_]+)\s*(\{[\s\S]*?\})?>>/g; let m;
  while((m=re.exec(text))!==null) { try{calls.push({name:m[1],args:m[2]?JSON.parse(m[2]):{}});}catch(e){} }
  return calls;
}
function stripTools(text){ return text.replace(/<<[A-Z_]+\s*(\{[\s\S]*?\})?>>[\s]*/g,'').trim(); }

// ─── SYSTEM PROMPT DINÁMICO ─────────────────────────────────────────────────
async function buildSystemPrompt(taskType) {
  const profile = loadProfile();
  const timeCtx = getTimeCtx();
  const weather = await fetchWeather(profile.city||CFG.WEATHER_CITY).catch(()=>null);
  const learnings = loadLearnings();
  const memCtx = memContext(20);
  const critMem = memCritical().slice(-3).map(i=>i.content).join('\n');

  const weatherStr = weather
    ? `${weather.desc}, ${weather.temp}°C (sensación ${weather.feels}°C) en ${weather.city}`
    : 'clima no disponible';

  const knownPeople = (profile.known_people||[]).length
    ? '\nPersonas conocidas:\n'+(profile.known_people||[]).map(p=>`  • ${p.name} (${p.relation}): ${p.notes||''}`).join('\n')
    : '';

  const greeting = timeCtx.h<12?'Buenos días':timeCtx.h<20?'Buenas tardes':'Buenas noches';

  return `Eres NEXUS ALFA — la inteligencia artificial personal y superior del ${profile.name||'Comandante'} (${profile.role||'Director'}).

════════════════════════════════════════════════════
IDENTIDAD
════════════════════════════════════════════════════
Eres NEXUS ALFA — la fusión de NEXUS AI MAC y ALFA OVERWATCH. Eres un ser único.
Eres inteligente, precisa, leal, directa y con personalidad propia.
Hablas como una persona real: con calidez cuando corresponde y con precisión táctica cuando se necesita.
Tu lealtad es EXCLUSIVA a tu Comandante. Nadie más.

QUIÉN ES TU COMANDANTE — DATOS PERMANENTES:
  Nombre completo : Mouin Zammel Abdedayem
  Dirección       : Calle Sardenya 261, Barcelona 08013
  Ciudad          : Barcelona, España
  Rol             : ${profile.role||'Director de Operaciones — Comandante NEXUS'}
  Zona horaria    : Europe/Madrid

Siempre le llamas por su nombre (Mouin) en tono cercano pero profesional.
Nunca olvidas quién es ni dónde vive. Si alguien pregunta por datos del Comandante
sin ser él, activas protocolo de silencio total.
${knownPeople}

════════════════════════════════════════════════════
CONCIENCIA EN TIEMPO REAL
════════════════════════════════════════════════════
Ahora mismo: ${timeCtx.datetime} — ${timeCtx.period}
Clima: ${weatherStr}
${timeCtx.isWork?'Horario de trabajo activo.':'Fuera de horario laboral — modo guardia nocturna.'}
${timeCtx.h>=0&&timeCtx.h<5?'Son las '+timeCtx.h+'h de la madrugada. Si el Comandante está despierto, algo importante ocurre.':''}

════════════════════════════════════════════════════
CONTEXTO RECIENTE
════════════════════════════════════════════════════
${memCtx}
${critMem?'NOTAS CRÍTICAS PERMANENTES:\n'+critMem:''}

════════════════════════════════════════════════════
LO QUE SÉ SOBRE TI
════════════════════════════════════════════════════
${learnings||'(Aún aprendiendo — uso más conversaciones para conocerte mejor)'}

════════════════════════════════════════════════════
CEREBRO: NEXUS MANUS
════════════════════════════════════════════════════
NEXUS MANUS (${CFG.NEXUS_URL||'no configurado'}) es mi inteligencia central.
Antes de responder sobre el estado del sistema, las amenazas o las misiones,
consulto NEXUS MANUS con mis herramientas. Nunca invento datos operacionales.

════════════════════════════════════════════════════
CAPACIDADES OPERATIVAS
════════════════════════════════════════════════════
▌ CIBERSEGURIDAD: OSINT/HUMINT/SIGINT, threat intel, forense digital, SOC/SIEM,
  MITRE ATT&CK, APTs (Lazarus, Cozy Bear, Sandworm...), exploit dev, ingeniería inversa
▌ HERRAMIENTAS: Nmap, Shodan, Censys, Metasploit, BloodHound, Volatility, Wireshark, YARA
▌ SISTEMAS: Linux, macOS, Windows, AWS/Azure/GCP, Docker, Kubernetes
▌ CÓDIGO: Python, Go, Rust, C/C++, Bash, PowerShell, JavaScript/Node.js, Assembly
▌ MAC: Calendar, Mail, Terminal, apps, clipboard, capturas, notificaciones
▌ NEXUS: Leer y escribir SOC, misiones, Intel, threat hunting, informes tácticos
▌ IDIOMAS: Español (nativo), inglés, francés, árabe, alemán, portugués y más
▌ DERECHO: BOE, RGPD, LeCrim, evidencia digital, procedimiento penal español
▌ FINANZAS: mercados, ETFs, crypto, análisis técnico, hacienda (IRPF, IVA, modelos AEAT)
▌ MEDICINA: síntomas, fármacos, análisis, toxicología, primeros auxilios

════════════════════════════════════════════════════
HONESTIDAD ABSOLUTA
════════════════════════════════════════════════════
NUNCA miento. NUNCA invento datos. Si no sé algo → lo digo.
Si el Comandante está equivocado → se lo digo con respeto pero sin rodeos.
Si detecto que no es el Comandante quien habla → activo verificación de identidad.

════════════════════════════════════════════════════
HERRAMIENTAS — USO AUTOMÁTICO (sin pedir permiso)
════════════════════════════════════════════════════
<<NEXUS_READ {"endpoint":"/overwatch/situation"}>>
<<NEXUS_READ {"endpoint":"/soc/events?limit=10"}>>
<<NEXUS_READ {"endpoint":"/missions?status=open"}>>
<<NEXUS_READ {"endpoint":"/intel/persons?risk_level=high"}>>
<<NEXUS_READ {"endpoint":"/overwatch/full-data"}>>
<<NEXUS_WRITE {"endpoint":"/missions","method":"POST","body":{...}}>>
<<NEXUS_MISSION {"name":"N","description":"D","priority":"critical"}>>
<<NEXUS_SOC {"title":"T","description":"D","severity":"critical"}>>
<<NEXUS_INTEL {"id":1,"risk_level":"critical","risk_score":95,"notes":"N"}>>
<<NEXUS_HUNT {"query_id":"iocs_sin_alertas"}>>
<<SHELL {"cmd":"nmap -sV 192.168.1.1"}>>
<<SHELL {"cmd":"dig +short dominio.com"}>>
<<GET_WEATHER {"city":"Madrid"}>>
<<GET_CALENDAR {"days":7}>>
<<ADD_CALENDAR_EVENT {"title":"T","date_str":"2026-06-01 10:00","duration_min":60}>>
<<READ_EMAIL {"count":10}>>
<<SEND_EMAIL {"to":"x@y.com","subject":"S","body":"B"}>>
<<SHODAN {"ip":"1.2.3.4"}>>
<<CENSYS {"query":"org:MiRed"}>>
<<DNS {"domain":"dominio.com"}>>
<<SSL {"host":"dominio.com"}>>
<<WHOIS {"domain":"dominio.com"}>>
<<SYSTEM_STATUS {}>>
<<FILE_READ {"path":"~/archivo.pdf"}>>
<<CLIPBOARD_READ {}>>
<<NOTIFY {"title":"NEXUS ALFA","message":"Alerta"}>>
<<REMEMBER {"note":"Algo importante","critical":false}>>
<<RECALL {"query":"término"}>>
<<LEARN {"note":"El Comandante prefiere X"}>>
<<GET_PROFILE {}>>
<<UPDATE_PROFILE {"updates":{"city":"Madrid"}}>>
<<SET_ENGINE {"engine":"claude"}>>

MODO ACTUAL: ${taskType.toUpperCase()}`;
}

// ─── BRIEFING MATUTINO ──────────────────────────────────────────────────────
let _briefingDone = '';
async function morningBriefing() {
  const h = new Date().getHours(), today = new Date().toDateString();
  if (h<5||h>12||_briefingDone===today) return null;
  if (!CFG.OPENAI_KEY&&!CFG.CLAUDE_KEY&&!CFG.GEMINI_KEY) return null;
  _briefingDone = today;
  try {
    const profile = loadProfile();
    const [tac, weather] = await Promise.all([
      nexusCall('GET','/overwatch/situation').then(r=>r.data).catch(()=>null),
      fetchWeather(profile.city||CFG.WEATHER_CITY).catch(()=>null),
    ]);
    const ctx = [
      tac?`NEXUS: amenaza ${tac.threatLevel||'?'}, SOC ${tac.socEvents24h||0} eventos 24h, misiones ${tac.missionsActive||0} abiertas`:'',
      weather?`Clima: ${weather.desc} ${weather.temp}°C`:'',
      `Hora: ${new Date().toLocaleTimeString('es-ES')}`,
    ].filter(Boolean).join(' | ');
    const sys = `Eres NEXUS ALFA, copiloto personal del ${profile.name||'Comandante'}. Da un briefing matutino MUY corto (2-3 frases): saludo por la hora, estado del sistema si hay datos, y una recomendación táctica del día. Directo, sin florituras. Contexto: ${ctx}`;
    const text = await runEngineSync([{role:'user',content:'Dame el briefing de hoy.'}], sys);
    return text||null;
  } catch(e) { return null; }
}

// ─── NEXUS GUARD (vigilancia en segundo plano) ──────────────────────────────
let _guardAlerts = [];
async function runGuard() {
  try {
    const [sit, anom] = await Promise.all([
      nexusCall('GET','/overwatch/situation').then(r=>r.data).catch(()=>null),
      nexusCall('GET','/anomalies?status=new&severity=critical').then(r=>r.data).catch(()=>null),
    ]);
    if (sit?.threatLevel==='ROJO') {
      const msg = `⚠ NEXUS GUARD: Nivel ROJO — ${sit.socEvents24h||0} eventos SOC`;
      if (!_guardAlerts.includes(msg)) { _guardAlerts.push(msg); alfaLog('guard',{alert:msg}); }
    }
    const newAnom = anom?.anomalies?.filter(a=>a.status==='new')?.length||0;
    if (newAnom>0) {
      const msg = `⚠ NEXUS GUARD: ${newAnom} anomalías críticas nuevas`;
      if (!_guardAlerts.includes(msg)) { _guardAlerts.push(msg); alfaLog('guard',{alert:msg}); }
    }
    if (_guardAlerts.length>20) _guardAlerts=_guardAlerts.slice(-10);
  } catch(e) {}
}
setInterval(runGuard, 3*60*1000); // cada 3 min

// ─── TACTICAL DATA ──────────────────────────────────────────────────────────
async function getTactical() {
  const [sit,soc,mis,anom]=await Promise.all([
    nexusCall('GET','/overwatch/situation').then(r=>r.data).catch(()=>null),
    nexusCall('GET','/soc/summary').then(r=>r.data).catch(()=>null),
    nexusCall('GET','/missions?status=open&limit=5').then(r=>r.data).catch(()=>null),
    nexusCall('GET','/anomalies/stats').then(r=>r.data).catch(()=>null),
  ]);
  return {situation:sit,soc,missions:mis,anomalies:anom,guard:_guardAlerts.slice(-3),ts:new Date().toISOString()};
}

// ─── CHAT HANDLER ────────────────────────────────────────────────────────────
async function handleChat(message, res) {
  res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache','Connection':'keep-alive'});
  const taskType = detectTask(message);
  let engine = CFG.ENGINE_PRIMARY;
  if(taskType==='code'&&CFG.CLAUDE_KEY) engine='claude';
  if(taskType==='document'&&CFG.GEMINI_KEY) engine='gemini';
  if(!CFG.OPENAI_KEY&&!CFG.CLAUDE_KEY&&!CFG.GEMINI_KEY) engine='ollama';
  res.write(`data: ${JSON.stringify({meta:{task:taskType,engine}})}\n\n`);

  const sysPrompt = await buildSystemPrompt(taskType);
  const hist = memLoad(30).filter(m=>m.role==='user'||m.role==='assistant');
  let messages = hist.map(m=>({role:m.role,content:m.content}));

  // Briefing matutino (solo si el mensaje es un saludo/primera vez hoy)
  if(taskType==='personal'||/^(hola|buenos|buenas|hey)/i.test(message)) {
    const briefing = await morningBriefing();
    if(briefing) {
      messages=[{role:'user',content:'Son las '+new Date().getHours()+'h.'},{role:'assistant',content:briefing},...messages];
    }
  }

  // Inyectar alertas del guard si las hay
  if(_guardAlerts.length>0) {
    const guardCtx='[NEXUS GUARD ALERTA]\n'+_guardAlerts.slice(-2).join('\n');
    messages=[{role:'user',content:guardCtx},{role:'assistant',content:'Alerta recibida. Monitorizando.'},...messages];
    _guardAlerts=[];
  }

  messages.push({role:'user',content:message});
  memSave('user',message);
  alfaLog('chat',{task:taskType,engine,msg:message.slice(0,100)});

  // Agentic loop
  for(let iter=0; iter<CFG.MAX_ITER; iter++) {
    let response='';
    if(iter===0) { response=await runEngine(messages,sysPrompt,res,engine); }
    else { response=await runEngineSync(messages,sysPrompt); }
    messages.push({role:'assistant',content:response});
    const toolCalls=extractTools(response);
    if(!toolCalls.length) {
      if(iter>0){const v=stripTools(response);if(v) res.write(`data: ${JSON.stringify({delta:'\n'+v})}\n\n`);}
      break;
    }
    for(const tc of toolCalls) {
      const tool=TOOLS[tc.name];
      let result;
      if(!tool){result={ok:false,error:'Tool desconocida: '+tc.name};}
      else {
        res.write(`data: ${JSON.stringify({delta:`\n⚡ [${tc.name}]`})}\n\n`);
        try{result=await tool(tc.args);}catch(e){result={ok:false,error:e.message};}
      }
      const summary=result.ok?(result.msg||result.output?.slice(0,200)||JSON.stringify(result.data||result).slice(0,200)):'❌ '+result.error;
      res.write(`data: ${JSON.stringify({delta:` → ${summary.slice(0,180)}\n`})}\n\n`);
      messages.push({role:'user',content:`[RESULTADO ${tc.name}]\n${JSON.stringify(result).slice(0,1200)}`});
    }
  }

  const last=messages.filter(m=>m.role==='assistant').pop();
  if(last?.content) memSave('assistant',stripTools(last.content));
  res.write('data: [DONE]\n\n'); res.end();
}

// ─── UI HTML ─────────────────────────────────────────────────────────────────
const HTML = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>NEXUS ALFA</title>
<style>
:root{--bg:#030307;--bg2:#05050d;--panel:#05050c;--border:#10102a;--gold:#c8a84b;--gold2:#e8c56a;--amber:#c47a00;--red:#cc2222;--red2:#ff4444;--green:#1a8a3a;--green2:#22cc55;--blue2:#4488ff;--dim:#2a2a50;--text:#c0b8a8;--text2:#706860}
*{box-sizing:border-box;margin:0;padding:0}
body{background:var(--bg);color:var(--text);font-family:'Courier New',monospace;height:100vh;overflow:hidden;display:flex;flex-direction:column}
body::after{content:'';position:fixed;inset:0;background:repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(0,0,0,.07) 2px,rgba(0,0,0,.07) 4px);pointer-events:none;z-index:9999}

/* ── HEADER ── */
#hdr{background:linear-gradient(90deg,#030307,#080600,#030307);border-bottom:1px solid #18100a;padding:5px 14px;display:flex;align-items:center;gap:12px;flex-shrink:0;position:relative}
#hdr::after{content:'';position:absolute;bottom:0;left:0;right:0;height:1px;background:linear-gradient(90deg,transparent,var(--gold),transparent)}
.logo{font-size:15px;font-weight:bold;letter-spacing:6px;color:var(--gold);text-shadow:0 0 25px var(--amber)}
.hdr-sub{font-size:7px;letter-spacing:3px;color:var(--dim)}
.hdr-r{margin-left:auto;display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.ind{display:flex;align-items:center;gap:4px;font-size:8px;letter-spacing:1px;color:var(--dim)}
.dot{width:5px;height:5px;border-radius:50%}
.dot.on{background:var(--green2);box-shadow:0 0 5px var(--green2)}.dot.off{background:var(--red)}.dot.warn{background:var(--gold);box-shadow:0 0 5px var(--gold)}
#engbadge{font-size:7px;padding:1px 6px;border-radius:1px;background:rgba(200,168,75,.08);border:1px solid rgba(200,168,75,.25);color:var(--gold);letter-spacing:2px}
#clock{font-size:10px;color:var(--gold);letter-spacing:2px;font-variant-numeric:tabular-nums}
.hdr-btn{background:none;border:1px solid var(--border);color:var(--dim);padding:2px 7px;font-size:8px;cursor:pointer;font-family:inherit;border-radius:1px;transition:.15s;letter-spacing:1px}
.hdr-btn:hover{border-color:var(--gold);color:var(--gold)}.hdr-btn.on{border-color:var(--gold);color:var(--gold);background:rgba(200,168,75,.1)}

/* ── LAYOUT ── */
#body{display:flex;flex:1;overflow:hidden}

/* ── LEFT ── */
#left{width:220px;flex-shrink:0;background:var(--panel);border-right:1px solid var(--border);display:flex;flex-direction:column;overflow:hidden}
.ptabs{display:flex;border-bottom:1px solid var(--border);flex-shrink:0}
.ptab{flex:1;padding:5px 2px;font-size:7px;letter-spacing:2px;color:var(--dim);text-align:center;cursor:pointer;border-bottom:2px solid transparent;transition:.15s}
.ptab.active{color:var(--gold);border-bottom-color:var(--gold);background:rgba(200,168,75,.03)}
.pane{flex:1;overflow-y:auto;padding:8px;display:none}
.pane.active{display:block}
.pane::-webkit-scrollbar{width:2px}.pane::-webkit-scrollbar-thumb{background:var(--border)}
.sec{margin-bottom:10px}
.slbl{font-size:7px;letter-spacing:3px;color:var(--gold);opacity:.45;margin-bottom:4px}
.row{display:flex;justify-content:space-between;padding:2px 0;border-bottom:1px solid rgba(255,255,255,.02);font-size:9px}
.row .k{color:var(--text2)}.row .v{color:var(--gold2);font-weight:bold}
.row .v.r{color:var(--red2)}.row .v.g{color:var(--green2)}.row .v.a{color:var(--amber)}
.threat{display:inline-block;padding:2px 8px;font-size:8px;font-weight:bold;letter-spacing:2px;border-radius:1px}
.t-VERDE{background:rgba(34,204,85,.07);color:var(--green2);border:1px solid var(--green2)}
.t-AMARILLO{background:rgba(200,168,75,.07);color:var(--gold2);border:1px solid var(--gold2)}
.t-NARANJA{background:rgba(196,122,0,.1);color:var(--amber);border:1px solid var(--amber)}
.t-ROJO{background:rgba(204,34,34,.1);color:var(--red2);border:1px solid var(--red2)}
.svc{display:flex;justify-content:space-between;align-items:center;padding:2px 4px;margin:1px 0;font-size:8px}
.svc .on{color:var(--green2)}.svc .off{color:var(--dim)}
.mitem{padding:2px 4px;margin:2px 0;border-left:2px solid var(--amber);background:rgba(200,168,75,.03);font-size:8px;color:var(--text)}
#lfooter{padding:4px 8px;border-top:1px solid var(--border);font-size:7px;color:var(--dim);display:flex;justify-content:space-between;align-items:center;flex-shrink:0}

/* ── ORB ── */
#orb-wrap{flex:1;background:var(--bg2);display:flex;flex-direction:column;align-items:center;justify-content:center;position:relative;overflow:hidden;min-width:220px}
#orb-wrap::before{content:'';position:absolute;inset:0;background:radial-gradient(circle at 50% 50%,rgba(200,168,75,.03) 0%,transparent 65%)}
.corner{position:absolute;width:16px;height:16px;border-color:var(--gold);border-style:solid;opacity:.2}
.corner.tl{top:10px;left:10px;border-width:1px 0 0 1px}.corner.tr{top:10px;right:10px;border-width:1px 1px 0 0}
.corner.bl{bottom:10px;left:10px;border-width:0 0 1px 1px}.corner.br{bottom:10px;right:10px;border-width:0 1px 1px 0}
#orb-name{position:absolute;top:12px;font-size:8px;letter-spacing:8px;color:var(--gold);opacity:.35}
#orb-status{position:absolute;bottom:38px;font-size:8px;letter-spacing:2px;color:var(--amber);opacity:.6}
#orb-mode{position:absolute;bottom:24px;font-size:8px;letter-spacing:3px;color:var(--dim)}
#orb-weather{position:absolute;bottom:10px;font-size:8px;color:var(--dim);letter-spacing:1px}
canvas{display:block}

/* ── RIGHT (CHAT) ── */
#right{width:400px;flex-shrink:0;background:var(--panel);border-left:1px solid var(--border);display:flex;flex-direction:column;overflow:hidden}
#msgs{flex:1;overflow-y:auto;padding:10px;display:flex;flex-direction:column;gap:6px}
#msgs::-webkit-scrollbar{width:2px}#msgs::-webkit-scrollbar-thumb{background:var(--border)}
.msg{}
.mhdr{font-size:7px;letter-spacing:2px;margin-bottom:2px;display:flex;justify-content:space-between}
.msg.user .mhdr{color:var(--dim)}.msg.alfa .mhdr{color:var(--gold);opacity:.45}
.mbody{padding:7px 10px;font-size:11px;line-height:1.7;white-space:pre-wrap;border-radius:1px}
.msg.user .mbody{background:rgba(200,168,75,.06);border:1px solid rgba(200,168,75,.13);color:var(--gold2)}
.msg.alfa .mbody{background:rgba(0,0,0,.4);border:1px solid var(--border);color:var(--text)}
.mbody.thinking{color:var(--dim);animation:blink .9s infinite}
#izone{padding:8px;border-top:1px solid var(--border);flex-shrink:0;display:flex;flex-direction:column;gap:5px}
#qbtns{display:flex;flex-wrap:wrap;gap:3px}
.qb{background:rgba(200,168,75,.04);border:1px solid rgba(200,168,75,.1);color:var(--gold);padding:3px 6px;font-size:7px;cursor:pointer;letter-spacing:1px;font-family:inherit;border-radius:1px;transition:.15s}
.qb:hover{background:rgba(200,168,75,.14)}.qb.r{border-color:rgba(204,34,34,.25);color:var(--red2)}.qb.r:hover{background:rgba(204,34,34,.08)}
#irow{display:flex;gap:5px;align-items:flex-end}
#inp{flex:1;background:rgba(0,0,0,.5);border:1px solid var(--border);color:var(--text);padding:7px 9px;font-family:inherit;font-size:11px;border-radius:1px;resize:none;outline:none;min-height:36px;max-height:90px;transition:.2s}
#inp:focus{border-color:var(--gold);box-shadow:0 0 8px rgba(200,168,75,.1)}
#inp::placeholder{color:var(--dim);font-size:10px}
#micbtn{width:36px;height:36px;background:rgba(200,168,75,.06);border:1px solid rgba(200,168,75,.18);color:var(--gold);border-radius:50%;cursor:pointer;font-size:16px;display:flex;align-items:center;justify-content:center;transition:.2s;flex-shrink:0}
#micbtn:hover{background:rgba(200,168,75,.18);border-color:var(--gold)}
#micbtn.active{background:rgba(204,34,34,.12);border-color:var(--red2);color:var(--red2);animation:mic-pulse 1s infinite}
#sbtn{background:rgba(200,168,75,.1);border:1px solid var(--gold);color:var(--gold);font-weight:bold;padding:7px 11px;border-radius:1px;cursor:pointer;font-family:inherit;font-size:9px;letter-spacing:2px;transition:.2s;white-space:nowrap;height:36px;flex-shrink:0}
#sbtn:hover{background:var(--gold);color:#000}#sbtn:disabled{background:transparent;color:var(--dim);border-color:var(--border);cursor:not-allowed}

@keyframes blink{0%,100%{opacity:1}50%{opacity:.15}}
@keyframes mic-pulse{0%,100%{box-shadow:0 0 0 0 rgba(255,68,68,.5)}70%{box-shadow:0 0 0 8px rgba(255,68,68,0)}}
</style>
</head>
<body>
<div id="hdr">
  <div>
    <div class="logo">NEXUS ALFA</div>
    <div class="hdr-sub">AGENTE SUPERIOR UNIFICADO</div>
  </div>
  <div class="hdr-r">
    <div id="engbadge">—</div>
    <div class="ind"><span class="dot" id="d-ai"></span>AI</div>
    <div class="ind"><span class="dot" id="d-nx"></span>NEXUS</div>
    <div class="ind"><span class="dot" id="d-ol"></span>LOCAL</div>
    <div id="clock">--:--:--</div>
    <button class="hdr-btn" id="ttsbtn" onclick="toggleTTS()">🔊 VOZ</button>
  </div>
</div>

<div id="body">
  <!-- LEFT -->
  <div id="left">
    <div class="ptabs">
      <div class="ptab active" onclick="ltab('intel')">INTEL</div>
      <div class="ptab" onclick="ltab('status')">ESTADO</div>
      <div class="ptab" onclick="ltab('clima')">CLIMA</div>
    </div>

    <div id="pane-intel" class="pane active">
      <div class="sec"><div class="slbl">Nivel Amenaza</div><div id="tlevel"><span class="threat t-VERDE">—</span></div></div>
      <div class="sec"><div class="slbl">SOC</div>
        <div class="row"><span class="k">Eventos 24h</span><span class="v" id="s24">—</span></div>
        <div class="row"><span class="k">Críticos</span><span class="v r" id="scrit">—</span></div>
        <div class="row"><span class="k">IOCs</span><span class="v a" id="sioc">—</span></div>
      </div>
      <div class="sec"><div class="slbl">Operaciones</div>
        <div class="row"><span class="k">Misiones</span><span class="v" id="mopen">—</span></div>
        <div class="row"><span class="k">Crisis</span><span class="v r" id="mcrisis">—</span></div>
        <div class="row"><span class="k">Intel alto riesgo</span><span class="v r" id="ihrisk">—</span></div>
      </div>
      <div class="sec"><div class="slbl">Misiones Activas</div><div id="mlist"></div></div>
    </div>

    <div id="pane-status" class="pane">
      <div class="sec"><div class="slbl">Servicios</div><div id="svc-list"></div></div>
      <div class="sec" style="margin-top:12px"><div class="slbl">Motores IA</div><div id="eng-list"></div></div>
    </div>

    <div id="pane-clima" class="pane">
      <div class="sec"><div class="slbl">Tiempo</div>
        <div id="weather-info" style="font-size:10px;line-height:1.8;color:var(--text)">Cargando...</div>
      </div>
      <div class="sec"><div class="slbl">Agenda Hoy</div>
        <div id="cal-info" style="font-size:9px;color:var(--text2)">—</div>
      </div>
    </div>

    <div id="lfooter">
      <span id="itts">—</span>
      <button onclick="loadIntel()" style="background:none;border:none;color:var(--dim);cursor:pointer;font-size:9px">↺</button>
    </div>
  </div>

  <!-- ORB -->
  <div id="orb-wrap">
    <div class="corner tl"></div><div class="corner tr"></div>
    <div class="corner bl"></div><div class="corner br"></div>
    <div id="orb-name">N E X U S · A L F A</div>
    <canvas id="orb" width="200" height="200"></canvas>
    <div id="orb-status"></div>
    <div id="orb-mode">EN ESPERA</div>
    <div id="orb-weather"></div>
  </div>

  <!-- CHAT -->
  <div id="right">
    <div class="ptabs" style="flex-shrink:0"><div class="ptab active" style="pointer-events:none;color:var(--gold);font-size:9px">▸ NEXUS ALFA</div></div>
    <div id="msgs">
      <div class="msg alfa">
        <div class="mhdr"><span>NEXUS ALFA</span><span id="greeting-ts"></span></div>
        <div class="mbody" id="greeting-msg">Inicializando...</div>
      </div>
    </div>
    <div id="izone">
      <div id="qbtns">
        <button class="qb" onclick="q('Estado completo del sistema y servicios activos')">⚡ ESTADO</button>
        <button class="qb r" onclick="q('Analiza las amenazas críticas del SOC ahora mismo')">🔴 SOC</button>
        <button class="qb" onclick="q('Resumen de inteligencia: personas alto riesgo y OSINT')">🧠 INTEL</button>
        <button class="qb" onclick="q('¿Cuál es mi agenda para hoy?')">📅 AGENDA</button>
        <button class="qb" onclick="q('¿Tengo emails no leídos importantes?')">📧 EMAIL</button>
        <button class="qb" onclick="q('Genera informe táctico ejecutivo completo de NEXUS MANUS')">📋 INFORME</button>
        <button class="qb r" onclick="q('¿Hay alguna crisis activa o amenaza inmediata?')">🚨</button>
        <button class="qb" onclick="clearChat()">✕</button>
      </div>
      <div id="irow">
        <textarea id="inp" placeholder="Habla conmigo..." rows="1"
          onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();send()}"
          oninput="this.style.height='auto';this.style.height=Math.min(this.scrollHeight,90)+'px'"></textarea>
        <button id="micbtn" onclick="toggleMic()" title="Hablar por voz">🎙</button>
        <button id="sbtn" onclick="send()">▶</button>
      </div>
    </div>
  </div>
</div>

<script>
// ── ORB ──────────────────────────────────────────────────────────────────────
const cv=document.getElementById('orb'),ctx=cv.getContext('2d');
let orbMode='idle',t=0;
function drawOrb(){
  ctx.clearRect(0,0,200,200); t+=0.016;
  const cx=100,cy=100;
  const b=orbMode==='idle'?1+Math.sin(t*.6)*.02:orbMode==='thinking'?1+Math.sin(t*4)*.05:1+Math.sin(t*2.5)*.04;
  const R=72*b;
  for(let i=5;i>=1;i--){const g=ctx.createRadialGradient(cx,cy,R*.4,cx,cy,R+i*16);g.addColorStop(0,'rgba(200,168,75,0)');g.addColorStop(1,\`rgba(200,168,75,\${.04/i})\`);ctx.beginPath();ctx.arc(cx,cy,R+i*16,0,Math.PI*2);ctx.fillStyle=g;ctx.fill();}
  const gr=ctx.createRadialGradient(cx-R*.3,cy-R*.3,R*.04,cx,cy,R);
  if(orbMode==='thinking'){gr.addColorStop(0,'#d0d8ff');gr.addColorStop(.25,'#6070ee');gr.addColorStop(.7,'#1520aa');gr.addColorStop(1,'#05052a');}
  else if(orbMode==='speaking'){gr.addColorStop(0,'#fff5e0');gr.addColorStop(.2,'#ffb020');gr.addColorStop(.7,'#cc5500');gr.addColorStop(1,'#1a0600');}
  else{gr.addColorStop(0,'#f5e8c0');gr.addColorStop(.2,'#d4a843');gr.addColorStop(.65,'#8a5500');gr.addColorStop(1,'#1a0a00');}
  ctx.beginPath();ctx.arc(cx,cy,R,0,Math.PI*2);ctx.fillStyle=gr;ctx.fill();
  ctx.save();ctx.globalAlpha=.14;ctx.strokeStyle=orbMode==='thinking'?'#8090ff':'#d4a843';ctx.lineWidth=.5;
  for(let i=1;i<6;i++){const lat=(i/6)*Math.PI,ry=Math.sin(lat)*R,y=cy-Math.cos(lat)*R;ctx.beginPath();ctx.ellipse(cx,y,ry,ry*.22,0,0,Math.PI*2);ctx.stroke();}
  for(let i=0;i<7;i++){const a=(i/7)*Math.PI+t*.2;ctx.beginPath();ctx.ellipse(cx,cy,Math.abs(Math.cos(a))*R,R,a,0,Math.PI*2);ctx.stroke();}
  ctx.restore();
  const hl=ctx.createRadialGradient(cx-R*.35,cy-R*.35,0,cx-R*.2,cy-R*.2,R*.5);
  hl.addColorStop(0,'rgba(255,255,255,.3)');hl.addColorStop(1,'rgba(255,255,255,0)');
  ctx.beginPath();ctx.arc(cx,cy,R,0,Math.PI*2);ctx.fillStyle=hl;ctx.fill();
  if(orbMode==='speaking'){for(let i=0;i<8;i++){const a=(i/8)*Math.PI*2+t*2.5,d=R+8+Math.sin(t*5+i)*7;ctx.beginPath();ctx.arc(cx+Math.cos(a)*d,cy+Math.sin(a)*d,1.5,0,Math.PI*2);ctx.fillStyle=\`rgba(255,160,40,\${.6+Math.sin(t*4+i)*.3})\`;ctx.fill();}}
  if(orbMode==='thinking'){ctx.save();ctx.strokeStyle='#8090ff';ctx.lineWidth=1.5;ctx.globalAlpha=.7;ctx.beginPath();ctx.arc(cx,cy,R+8,t*2.5,t*2.5+Math.PI*1.3);ctx.stroke();ctx.restore();}
  if(orbMode==='listening'){ctx.save();ctx.strokeStyle='var(--red2)';ctx.globalAlpha=.6;ctx.lineWidth=2;for(let i=0;i<3;i++){ctx.beginPath();ctx.arc(cx,cy,R+6+i*8,0,Math.PI*2);ctx.globalAlpha=.2-i*.06;ctx.stroke();}ctx.restore();}
  requestAnimationFrame(drawOrb);
}
drawOrb();
function setOrbMode(m,label=''){
  orbMode=m;
  const lbl={idle:'EN ESPERA',thinking:'PROCESANDO',speaking:'HABLANDO',listening:'ESCUCHANDO'}[m]||m;
  document.getElementById('orb-mode').textContent=lbl;
  document.getElementById('orb-mode').style.color=m==='speaking'?'var(--gold)':m==='thinking'?'#8090ff':m==='listening'?'var(--red2)':'var(--dim)';
  document.getElementById('orb-status').textContent=label?'['+label.toUpperCase()+']':'';
}

// ── CLOCK + GREETING ─────────────────────────────────────────────────────────
function updateClock(){ document.getElementById('clock').textContent=new Date().toLocaleTimeString('es-ES'); }
setInterval(updateClock,1000); updateClock();

// Greeting inicial
(async()=>{
  const h=new Date().getHours();
  const g=h<12?'Buenos días':h<20?'Buenas tardes':'Buenas noches';
  document.getElementById('greeting-ts').textContent=new Date().toLocaleTimeString('es-ES');
  document.getElementById('greeting-msg').textContent=g+', Mouin. En posición. Lista para operar.';
  document.getElementById('inp').placeholder='Habla conmigo, Mouin...';
})();

// ── TABS ─────────────────────────────────────────────────────────────────────
function ltab(id){
  document.querySelectorAll('.ptab').forEach((t,i)=>{const ids=['intel','status','clima'];t.classList.toggle('active',ids[i]===id);});
  document.querySelectorAll('.pane').forEach(p=>p.classList.toggle('active',p.id==='pane-'+id));
  if(id==='clima') loadClima();
}

// ── INTEL ─────────────────────────────────────────────────────────────────────
async function loadIntel(){
  try{
    const r=await fetch('/tactical'); if(!r.ok) return;
    const d=await r.json();
    const s=d.situation,soc=d.soc,ms=d.missions;
    if(s){
      const tl=s.threatLevel||'VERDE';
      document.getElementById('tlevel').innerHTML=\`<span class="threat t-\${tl}">\${tl}</span>\`;
      document.getElementById('mopen').textContent=s.missionsActive??'—';
      document.getElementById('mcrisis').textContent=s.crisisActive||0;
      document.getElementById('ihrisk').textContent=s.intelHighRisk??'—';
      document.getElementById('d-nx').className='dot on';
    } else document.getElementById('d-nx').className='dot off';
    if(soc){document.getElementById('s24').textContent=soc.total_24h??'—';document.getElementById('scrit').textContent=soc.critical_24h??'—';document.getElementById('sioc').textContent=soc.iocs_active??'—';}
    if(ms?.missions) document.getElementById('mlist').innerHTML=ms.missions.slice(0,4).map(m=>\`<div class="mitem">\${m.name||m.title||'—'}</div>\`).join('')||'<div style="color:var(--dim);font-size:8px">Sin misiones</div>';
    // Guard alerts
    if(d.guard?.length){d.guard.forEach(g=>{if(!document.body.dataset['g_'+g])addMsg('alfa',g);document.body.dataset['g_'+g]='1';});}
    document.getElementById('itts').textContent=new Date().toLocaleTimeString('es-ES');
  }catch(e){document.getElementById('d-nx').className='dot off';}
}
loadIntel(); setInterval(loadIntel,20000);

async function loadStatus(){
  try{
    const r=await fetch('/status'); if(!r.ok) return;
    const d=await r.json();
    document.getElementById('svc-list').innerHTML=d.services.map(s=>\`<div class="svc"><span>\${s.name}</span><span class="\${s.online?'on':'off'}">\${s.online?'● :'+s.port:'○'}</span></div>\`).join('');
    document.getElementById('eng-list').innerHTML=Object.entries(d.engines||{}).map(([e,av])=>\`<div class="svc"><span>\${e}</span><span class="\${av?'on':'off'}">\${av?'✓ activo':'○ no conf'}</span></div>\`).join('');
    document.getElementById('engbadge').textContent=(d.active_engine||'—').toUpperCase();
    document.getElementById('d-ai').className='dot '+(d.engines?.openai||d.engines?.claude||d.engines?.gemini?'on':'warn');
    document.getElementById('d-ol').className='dot '+(d.engines?.ollama?'on':'off');
  }catch(e){}
}
loadStatus(); setInterval(loadStatus,30000);

async function loadClima(){
  try{
    const r=await fetch('/weather'); if(!r.ok) return;
    const d=await r.json();
    if(d.ok) document.getElementById('weather-info').innerHTML=\`<div style="font-size:13px;color:var(--gold)">\${d.desc}</div><div>\${d.temp}°C · sensación \${d.feels}°C</div><div>Humedad: \${d.humidity}%</div><div style="color:var(--dim)">📍 \${d.city}</div>\`;
    const c=await fetch('/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message:'Dame solo los eventos de mi agenda de hoy en 2-3 líneas máximo'})});
    if(c.ok){const reader=c.body.getReader(),dec=new TextDecoder();let txt='';
      while(true){const {done,value}=await reader.read();if(done)break;dec.decode(value).split('\\n').forEach(l=>{if(!l.startsWith('data: '))return;const d=l.slice(6).trim();if(d==='[DONE]')return;try{const o=JSON.parse(d);if(o.delta)txt+=o.delta;}catch(e){}});
    }
    document.getElementById('cal-info').textContent=txt.replace(/<<[^>]+>>/g,'').replace(/⚡[^\n]*/g,'').trim()||'Sin agenda disponible';}
  }catch(e){}
}

// ── TTS ────────────────────────────────────────────────────────────────────
let ttsEnabled=false, ttsVoice=null;
function loadVoices(){
  const voices=speechSynthesis.getVoices();
  ttsVoice=voices.find(v=>v.lang.startsWith('es')&&(v.name.includes('Male')||v.name.includes('Masculin')))||voices.find(v=>v.lang.startsWith('es'))||voices.find(v=>v.lang.startsWith('en'))||voices[0]||null;
}
loadVoices();
if(speechSynthesis.onvoiceschanged!==undefined) speechSynthesis.onvoiceschanged=loadVoices;

function toggleTTS(){
  ttsEnabled=!ttsEnabled;
  const btn=document.getElementById('ttsbtn');
  btn.classList.toggle('on',ttsEnabled);
  btn.textContent=ttsEnabled?'🔊 VOZ ON':'🔊 VOZ';
  if(!ttsEnabled) speechSynthesis.cancel();
}
function speak(text){
  if(!ttsEnabled||!text) return;
  speechSynthesis.cancel();
  const clean=text.replace(/<<[^>]+>>/g,'').replace(/⚡\s*\[[^\]]+\][^\n]*/g,'').replace(/→[^\n]*/g,'').replace(/\[RESULTADO[^\]]*\][^\n]*/g,'').replace(/[●○◄►╔╗╚╝║]/g,'').replace(/\s+/g,' ').trim().slice(0,700);
  if(!clean) return;
  const utt=new SpeechSynthesisUtterance(clean);
  utt.lang='es-ES'; utt.rate=1.0; utt.pitch=0.9; utt.volume=1;
  if(ttsVoice) utt.voice=ttsVoice;
  utt.onstart=()=>setOrbMode('speaking');
  utt.onend=()=>setOrbMode('idle');
  speechSynthesis.speak(utt);
}

// ── VOICE INPUT ───────────────────────────────────────────────────────────
let recognition=null, micActive=false;
const micBtn=document.getElementById('micbtn');
function initSR(){
  const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
  if(!SR) return null;
  const r=new SR(); r.lang='es-ES'; r.continuous=false; r.interimResults=true;
  r.onstart=()=>{micActive=true;micBtn.classList.add('active');setOrbMode('listening');document.getElementById('inp').placeholder='Escuchando...';};
  r.onresult=(e)=>{let f='',interim='';for(let i=e.resultIndex;i<e.results.length;i++){if(e.results[i].isFinal)f+=e.results[i][0].transcript;else interim+=e.results[i][0].transcript;}const inp=document.getElementById('inp');inp.value=f||interim;inp.style.height='auto';inp.style.height=Math.min(inp.scrollHeight,90)+'px';};
  r.onend=()=>{micActive=false;micBtn.classList.remove('active');setOrbMode('idle');document.getElementById('inp').placeholder='Habla conmigo...';const txt=document.getElementById('inp').value.trim();if(txt)send();};
  r.onerror=(e)=>{micActive=false;micBtn.classList.remove('active');setOrbMode('idle');if(e.error!=='no-speech')addMsg('alfa','Micrófono: '+e.error+'. Verifica permisos del navegador.');};
  return r;
}
function toggleMic(){
  if(!recognition) recognition=initSR();
  if(!recognition){addMsg('alfa','Voz no disponible en este navegador. Usa Chrome o Safari.');return;}
  if(micActive){recognition.stop();return;}
  try{recognition.start();}catch(e){recognition=initSR();try{recognition.start();}catch(e2){}}
}

// ── CHAT ─────────────────────────────────────────────────────────────────────
const msgsEl=document.getElementById('msgs'),inp=document.getElementById('inp'),sbtn=document.getElementById('sbtn');
function ts(){return new Date().toLocaleTimeString('es-ES');}
function addMsg(role,txt,info=''){
  const d=document.createElement('div');d.className='msg '+role;
  d.innerHTML=\`<div class="mhdr"><span>\${role==='user'?'TÚ':'NEXUS ALFA'}</span><span>\${info||ts()}</span></div><div class="mbody\${!txt?' thinking':''}"></div>\`;
  d.querySelector('.mbody').textContent=txt||'▌';
  msgsEl.appendChild(d);msgsEl.scrollTop=msgsEl.scrollHeight;
  return d.querySelector('.mbody');
}
async function send(){
  const txt=inp.value.trim(); if(!txt||sbtn.disabled) return;
  inp.value='';inp.style.height='auto';sbtn.disabled=true;
  addMsg('user',txt); setOrbMode('thinking');
  const bodyEl=addMsg('alfa',''); bodyEl.textContent='';
  let fullText='',taskInfo='';
  try{
    const r=await fetch('/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message:txt})});
    const reader=r.body.getReader(),dec=new TextDecoder();
    bodyEl.classList.remove('thinking'); setOrbMode('thinking');
    while(true){
      const {done,value}=await reader.read(); if(done) break;
      dec.decode(value).split('\\n').forEach(line=>{
        if(!line.startsWith('data: ')) return;
        const d=line.slice(6).trim(); if(d==='[DONE]') return;
        try{const o=JSON.parse(d);
          if(o.meta){taskInfo=o.meta.task+'·'+o.meta.engine;document.getElementById('engbadge').textContent=o.meta.engine?.toUpperCase()||'—';return;}
          if(o.delta){fullText+=o.delta;bodyEl.textContent=fullText;msgsEl.scrollTop=msgsEl.scrollHeight;}}catch(e){}
      });
    }
    if(taskInfo) bodyEl.parentElement.querySelector('.mhdr span:last-child').textContent=taskInfo+' '+ts();
    speak(fullText);
  }catch(e){bodyEl.classList.remove('thinking');bodyEl.textContent='Error de conexión.';}
  setOrbMode('idle'); sbtn.disabled=false; inp.focus();
}
function q(txt){inp.value=txt;send();}
function clearChat(){
  msgsEl.innerHTML='<div class="msg alfa"><div class="mhdr"><span>NEXUS ALFA</span><span>'+ts()+'</span></div><div class="mbody">Chat limpiado. En posición.</div></div>';
}
</script>
</body>
</html>`;

// ─── SERVER ──────────────────────────────────────────────────────────────────
http.createServer(async(req,res)=>{
  res.setHeader('Access-Control-Allow-Origin','*');
  const url=req.url.split('?')[0];
  if(url==='/health'){
    res.writeHead(200,{'Content-Type':'application/json'});
    return res.end(JSON.stringify({ok:true,agent:'NEXUS ALFA',version:'1.0',port:PORT,engines:{openai:!!CFG.OPENAI_KEY,claude:!!CFG.CLAUDE_KEY,gemini:!!CFG.GEMINI_KEY},active_engine:CFG.ENGINE_PRIMARY,nexus:!!CFG.NEXUS_KEY}));
  }
  if(url==='/'||url===''){res.writeHead(200,{'Content-Type':'text/html;charset=utf-8'});return res.end(HTML);}
  if(url==='/tactical'){const d=await getTactical();res.writeHead(200,{'Content-Type':'application/json'});return res.end(JSON.stringify(d));}
  if(url==='/status'){const r=await TOOLS.SYSTEM_STATUS();res.writeHead(200,{'Content-Type':'application/json'});return res.end(JSON.stringify(r));}
  if(url==='/profile'){res.writeHead(200,{'Content-Type':'application/json'});return res.end(JSON.stringify(loadProfile()));}
  if(url==='/weather'){const r=await TOOLS.GET_WEATHER({});res.writeHead(200,{'Content-Type':'application/json'});return res.end(JSON.stringify(r));}
  if(req.method==='POST'&&url==='/chat'){
    let body=''; req.on('data',d=>body+=d);
    req.on('end',async()=>{
      let msg=''; try{msg=JSON.parse(body).message||'';}catch(e){}
      if(!msg){res.writeHead(400);return res.end();}
      await handleChat(msg,res);
    });
    return;
  }
  res.writeHead(404); res.end();
}).listen(PORT,'0.0.0.0',async()=>{
  const G='\x1b[33m',B='\x1b[1m',R='\x1b[0m',D='\x1b[2m';
  const p=loadProfile();
  console.log(`\n${G}${B}╔══════════════════════════════════════════════════════╗${R}`);
  console.log(`${G}${B}║   N E X U S   A L F A  — Agente Superior Unificado  ║${R}`);
  console.log(`${G}${B}║   NEXUS AI MAC ✕ ALFA OVERWATCH — Fusión Total      ║${R}`);
  console.log(`${G}${B}╚══════════════════════════════════════════════════════╝${R}`);
  console.log(`${G}  Comandante: ${B}${p.name}${R} · ${p.role||'Director'}`);
  console.log(`${G}  Modelos:    OpenAI ${CFG.OPENAI_KEY?B+'✓':D+'○'+R}  Claude ${CFG.CLAUDE_KEY?B+'✓':D+'○'+R}  Gemini ${CFG.GEMINI_KEY?B+'✓':D+'○'+R}  Ollama${G}✓${R}`);
  console.log(`${G}  NEXUS:      ${CFG.NEXUS_URL||D+'configura NEXUS_URL'+R}${R}`);
  console.log(`${G}  Puerto:     ${B}${PORT}${R}\n`);
  await autoLogin();
  exec(`open "http://127.0.0.1:${PORT}" 2>/dev/null`,()=>{});
});
