#!/usr/bin/env node
/**
 * ╔══════════════════════════════════════════════════════════════════════╗
 * ║  A L F A  v3.0 — OVERWATCH COMMAND                                  ║
 * ║  Operativo Superior · Multi-Motor · Multi-Agente · Autonomía Total  ║
 * ║  NEXUS MANUS brain · GPT-4o/Claude/Gemini/Ollama · Ejecuta.         ║
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

// ─── CONFIG ────────────────────────────────────────────────────────────────
const HOME     = os.homedir();
const ENV_FILE = path.join(HOME, '.nexus-ai.env');
const MEM_FILE = path.join(HOME, '.alfa-memory.jsonl');
const MEM_CRIT = path.join(HOME, '.alfa-memory-critical.jsonl');
const LOG_FILE = path.join(HOME, '.alfa-log.jsonl');
const PORT     = parseInt(process.env.ALFA_PORT || '3120');

const CFG = {
  // AI Engines (primary → fallback)
  ENGINE_PRIMARY: 'openai',   // openai | claude | gemini | ollama
  ENGINE_FALLBACK: 'ollama',
  // OpenAI
  OPENAI_KEY: '', OPENAI_MODEL: 'gpt-4o',
  // Claude
  CLAUDE_KEY: '', CLAUDE_MODEL: 'claude-3-5-sonnet-20241022',
  // Gemini
  GEMINI_KEY: '', GEMINI_MODEL: 'gemini-1.5-pro',
  // Ollama (local)
  OLLAMA_HOST: '127.0.0.1', OLLAMA_PORT: 11434, OLLAMA_MODEL: 'llama3.2',
  // NEXUS
  NEXUS_URL: '', NEXUS_KEY: '',
  // External
  SHODAN_KEY: '', CENSYS_ID: '', CENSYS_SEC: '',
  MAX_TOKENS: 4000, MAX_ITER: 6,
};

function loadEnv() {
  [ENV_FILE, path.join(HOME,'.env'), path.join(HOME,'nexus','.env')].forEach(f=>{
    if(!fs.existsSync(f)) return;
    fs.readFileSync(f,'utf8').split('\n').forEach(l=>{
      const eq=l.indexOf('='); if(eq<1||l.startsWith('#')) return;
      process.env[l.slice(0,eq).trim()]=l.slice(eq+1).trim();
    });
  });
}
loadEnv();

// Map env vars to CFG
const MAP = {
  OPENAI_API_KEY:'OPENAI_KEY', AI_API_KEY:'OPENAI_KEY',
  CLAUDE_API_KEY:'CLAUDE_KEY', ANTHROPIC_API_KEY:'CLAUDE_KEY',
  GEMINI_API_KEY:'GEMINI_KEY', GOOGLE_API_KEY:'GEMINI_KEY',
  OLLAMA_MODEL:'OLLAMA_MODEL', OLLAMA_HOST:'OLLAMA_HOST',
  NEXUS_URL:'NEXUS_URL', NEXUS_API_KEY:'NEXUS_KEY',
  SHODAN_API_KEY:'SHODAN_KEY', CENSYS_API_ID:'CENSYS_ID', CENSYS_API_SECRET:'CENSYS_SEC',
  ALFA_ENGINE:'ENGINE_PRIMARY',
};
Object.entries(MAP).forEach(([e,c])=>{ if(process.env[e]) CFG[c]=process.env[e]; });

// ─── LOGGING ───────────────────────────────────────────────────────────────
function alfaLog(type, data) {
  try {
    fs.appendFileSync(LOG_FILE, JSON.stringify({ts:new Date().toISOString(),type,...data})+'\n');
  } catch(e) {}
}

// ─── MEMORY ────────────────────────────────────────────────────────────────
function memSave(role, content, critical=false) {
  const entry = JSON.stringify({role,content,ts:new Date().toISOString(),critical});
  try { fs.appendFileSync(MEM_FILE, entry+'\n'); } catch(e) {}
  if(critical) try { fs.appendFileSync(MEM_CRIT, entry+'\n'); } catch(e) {}
}
function memLoad(n=40) {
  try {
    const lines = fs.readFileSync(MEM_FILE,'utf8').trim().split('\n').filter(Boolean);
    return lines.slice(-n).map(l=>JSON.parse(l));
  } catch(e) { return []; }
}
function memSearch(query, n=10) {
  try {
    const q = query.toLowerCase();
    const lines = fs.readFileSync(MEM_FILE,'utf8').trim().split('\n').filter(Boolean);
    return lines.map(l=>{ try{return JSON.parse(l);}catch(e){return null;} })
      .filter(i=>i&&i.content&&i.content.toLowerCase().includes(q))
      .slice(-n);
  } catch(e) { return []; }
}
function memCritical() {
  try { return fs.readFileSync(MEM_CRIT,'utf8').trim().split('\n').filter(Boolean).map(l=>JSON.parse(l)); }
  catch(e) { return []; }
}

// ─── HTTP UTILS ────────────────────────────────────────────────────────────
function httpsPost(opts, body='') {
  return new Promise(resolve=>{
    const req = https.request({...opts,timeout:90000}, res=>{
      let d=''; res.on('data',c=>d+=c);
      res.on('end',()=>{
        try{ resolve({ok:res.statusCode<400,status:res.statusCode,data:JSON.parse(d)}); }
        catch(e){ resolve({ok:res.statusCode<400,status:res.statusCode,raw:d.slice(0,3000)}); }
      });
    });
    req.on('error',e=>resolve({ok:false,error:e.message}));
    req.on('timeout',()=>{req.destroy();resolve({ok:false,error:'timeout'});});
    if(body) req.write(body); req.end();
  });
}
function nexusCall(method, endpoint, body) {
  if(!CFG.NEXUS_URL) return Promise.resolve({ok:false,error:'NEXUS_URL no configurado'});
  const url = new URL(CFG.NEXUS_URL+'/api'+endpoint);
  const b = body?JSON.stringify(body):null;
  const h = {'Authorization':'Bearer '+CFG.NEXUS_KEY,'Content-Type':'application/json'};
  if(b) h['Content-Length']=Buffer.byteLength(b);
  return httpsPost({hostname:url.hostname,port:443,path:url.pathname+(url.search||''),method,headers:h},b);
}

// ─── AUTO-LOGIN ─────────────────────────────────────────────────────────────
async function autoLogin() {
  if(CFG.NEXUS_KEY||!CFG.NEXUS_URL) return;
  const user=process.env.NEXUS_USER||'operador1', pass=process.env.NEXUS_PASS||'';
  if(!pass) return;
  try {
    const b=JSON.stringify({username:user,password:pass});
    const url=new URL(CFG.NEXUS_URL+'/api/auth/login');
    const r=await httpsPost({hostname:url.hostname,port:443,path:'/api/auth/login',method:'POST',
      headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(b)}},b);
    if(r.data?.token) {
      CFG.NEXUS_KEY=r.data.token;
      const env=fs.existsSync(ENV_FILE)?fs.readFileSync(ENV_FILE,'utf8'):'';
      const upd=env.includes('NEXUS_API_KEY=')?env.replace(/^NEXUS_API_KEY=.*/m,'NEXUS_API_KEY='+r.data.token):env+'\nNEXUS_API_KEY='+r.data.token;
      fs.writeFileSync(ENV_FILE,upd,{mode:0o600});
    }
  } catch(e) {}
}

// ─── ENGINE ROUTER ─────────────────────────────────────────────────────────
const TASK_PATTERNS = {
  code:     /código|script|programa|función|clase|bug|error|fix|refactor|deploy|npm|node|python|bash/i,
  security: /seguridad|soc|amenaza|hack|audit|scan|vuln|pentest|ataque|brecha|cve|exploit|port scan|nmap/i,
  document: /documento|pdf|archivo|leer|analiza.*doc|excel|word|extracto/i,
  osint:    /shodan|censys|osint|footprint|exposición|dominio|dns|ssl|whois|ip pública/i,
  planning: /plan|estrategia|misión|objetivo|prioridad|hoja de ruta|roadmap|decisión/i,
  memory:   /recuerda|anterior|historial|memoria|pasado|dijiste|guardaste/i,
};
function detectTaskType(msg) {
  for(const [type,re] of Object.entries(TASK_PATTERNS)) {
    if(re.test(msg)) return type;
  }
  return 'general';
}

// ─── AI ENGINES ────────────────────────────────────────────────────────────

// OpenAI streaming
function engineOpenAI(messages, systemPrompt, res) {
  return new Promise((resolve,reject)=>{
    if(!CFG.OPENAI_KEY) { resolve(''); return; }
    const body=JSON.stringify({model:CFG.OPENAI_MODEL,stream:true,max_tokens:CFG.MAX_TOKENS,
      messages:[{role:'system',content:systemPrompt},...messages]});
    const req=https.request({hostname:'api.openai.com',port:443,path:'/v1/chat/completions',method:'POST',
      headers:{'Authorization':'Bearer '+CFG.OPENAI_KEY,'Content-Type':'application/json','Content-Length':Buffer.byteLength(body)},timeout:90000},
      apiRes=>{
        let full='';
        apiRes.on('data',chunk=>{
          chunk.toString().split('\n').forEach(line=>{
            if(!line.startsWith('data: ')) return;
            const d=line.slice(6).trim();
            if(d==='[DONE]') return;
            try{const tok=JSON.parse(d).choices?.[0]?.delta?.content||'';
              if(tok){full+=tok; if(res) res.write(`data: ${JSON.stringify({delta:tok})}\n\n`);}}catch(e){}
          });
        });
        apiRes.on('end',()=>resolve(full));
        apiRes.on('error',reject);
      });
    req.on('error',e=>{if(res){res.write(`data: ${JSON.stringify({delta:'[OpenAI error: '+e.message+']'})}\n\n`);}resolve('');});
    req.write(body); req.end();
  });
}

// OpenAI non-streaming (for tool loop iterations)
async function engineOpenAISync(messages, systemPrompt) {
  if(!CFG.OPENAI_KEY) return '';
  const body=JSON.stringify({model:CFG.OPENAI_MODEL,max_tokens:CFG.MAX_TOKENS,
    messages:[{role:'system',content:systemPrompt},...messages]});
  const r=await httpsPost({hostname:'api.openai.com',port:443,path:'/v1/chat/completions',method:'POST',
    headers:{'Authorization':'Bearer '+CFG.OPENAI_KEY,'Content-Type':'application/json','Content-Length':Buffer.byteLength(body)}},body);
  return r.data?.choices?.[0]?.message?.content||'';
}

// Claude (Anthropic) streaming
function engineClaude(messages, systemPrompt, res) {
  return new Promise((resolve)=>{
    if(!CFG.CLAUDE_KEY) { resolve(''); return; }
    const filtered=messages.map(m=>({role:m.role==='assistant'?'assistant':'user',content:m.content}));
    const body=JSON.stringify({model:CFG.CLAUDE_MODEL,max_tokens:CFG.MAX_TOKENS,stream:true,
      system:systemPrompt, messages:filtered});
    const req=https.request({hostname:'api.anthropic.com',port:443,path:'/v1/messages',method:'POST',
      headers:{'x-api-key':CFG.CLAUDE_KEY,'anthropic-version':'2023-06-01','Content-Type':'application/json','Content-Length':Buffer.byteLength(body)},timeout:90000},
      apiRes=>{
        let full='';
        apiRes.on('data',chunk=>{
          chunk.toString().split('\n').forEach(line=>{
            if(!line.startsWith('data: ')) return;
            try{const ev=JSON.parse(line.slice(6));
              const tok=ev.delta?.text||'';
              if(tok){full+=tok; if(res) res.write(`data: ${JSON.stringify({delta:tok})}\n\n`);}}catch(e){}
          });
        });
        apiRes.on('end',()=>resolve(full));
        apiRes.on('error',()=>resolve(''));
      });
    req.on('error',()=>resolve(''));
    req.write(body); req.end();
  });
}

// Gemini (non-streaming fallback)
async function engineGemini(messages, systemPrompt, res) {
  if(!CFG.GEMINI_KEY) return '';
  const parts=messages.map(m=>({role:m.role==='assistant'?'model':'user',parts:[{text:m.content}]}));
  const body=JSON.stringify({contents:[{role:'user',parts:[{text:systemPrompt}]},...parts],
    generationConfig:{maxOutputTokens:CFG.MAX_TOKENS}});
  const r=await httpsPost({hostname:'generativelanguage.googleapis.com',port:443,
    path:`/v1beta/models/${CFG.GEMINI_MODEL}:generateContent?key=${CFG.GEMINI_KEY}`,
    method:'POST',headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(body)}},body);
  const text=r.data?.candidates?.[0]?.content?.parts?.[0]?.text||'';
  if(text&&res) res.write(`data: ${JSON.stringify({delta:text})}\n\n`);
  return text;
}

// Ollama (local)
function engineOllama(messages, systemPrompt, res) {
  return new Promise(resolve=>{
    const ctx=messages.map(m=>`${m.role==='user'?'Human':'Assistant'}: ${m.content}`).join('\n');
    const prompt=systemPrompt+'\n\n'+ctx+'\nAssistant:';
    const body=JSON.stringify({model:CFG.OLLAMA_MODEL,prompt,stream:true});
    const req=http.request({hostname:CFG.OLLAMA_HOST,port:CFG.OLLAMA_PORT,path:'/api/generate',method:'POST',
      headers:{'Content-Type':'application/json'},timeout:120000},apiRes=>{
      let full='';
      apiRes.on('data',chunk=>{
        try{const ev=JSON.parse(chunk.toString());const tok=ev.response||'';
          if(tok){full+=tok;if(res) res.write(`data: ${JSON.stringify({delta:tok})}\n\n`);}}catch(e){}
      });
      apiRes.on('end',()=>resolve(full));
      apiRes.on('error',()=>resolve(''));
    });
    req.on('error',()=>resolve(''));
    req.write(body); req.end();
  });
}

// Universal engine selector
async function runEngine(messages, systemPrompt, res, engine) {
  const eng = engine||CFG.ENGINE_PRIMARY;
  if(eng==='claude'&&CFG.CLAUDE_KEY)  return engineClaude(messages,systemPrompt,res);
  if(eng==='gemini'&&CFG.GEMINI_KEY)  return engineGemini(messages,systemPrompt,res);
  if(eng==='ollama')                   return engineOllama(messages,systemPrompt,res);
  if(CFG.OPENAI_KEY)                   return engineOpenAI(messages,systemPrompt,res);
  // Fallback chain
  if(CFG.CLAUDE_KEY)                   return engineClaude(messages,systemPrompt,res);
  if(CFG.GEMINI_KEY)                   return engineGemini(messages,systemPrompt,res);
  return engineOllama(messages,systemPrompt,res);
}
async function runEngineSync(messages, systemPrompt) {
  if(CFG.OPENAI_KEY) return engineOpenAISync(messages,systemPrompt);
  // simplified fallback for sync
  return runEngine(messages,systemPrompt,null,'ollama');
}

// ─── TOOLS ─────────────────────────────────────────────────────────────────
const ALLOWED_CMDS=['nmap','dig','host','ping','curl','whois','openssl','netstat','ss','lsof',
  'ifconfig','ip','arp','traceroute','nc','nslookup','cat','ls','df','free','uptime','uname',
  'ps','which','find','grep','head','tail','wc','sort','uniq','echo','date','hostname','id',
  'osascript','screencapture','pbcopy','pbpaste','open','killall','launchctl','softwareupdate'];

const TOOLS = {

  // ── NEXUS MANUS — Lectura ──────────────────────────────────────────────────
  NEXUS_READ: async({endpoint})=>{
    const r=await nexusCall('GET',endpoint);
    alfaLog('tool',{tool:'NEXUS_READ',endpoint,ok:r.ok});
    return r.ok?{ok:true,data:r.data||r.raw}:{ok:false,error:r.error||'HTTP '+r.status};
  },

  // ── NEXUS MANUS — Escritura genérica ──────────────────────────────────────
  NEXUS_WRITE: async({endpoint,method='POST',body})=>{
    const r=await nexusCall(method,endpoint,body);
    alfaLog('tool',{tool:'NEXUS_WRITE',endpoint,method,ok:r.ok});
    return r.ok?{ok:true,data:r.data||r.raw}:{ok:false,error:r.error||'HTTP '+r.status};
  },

  // ── NEXUS — Crear misión ───────────────────────────────────────────────────
  NEXUS_MISSION: async({name,description,priority='high',type='tactical'})=>{
    const r=await nexusCall('POST','/missions',{name,description,priority,mission_type:type,status:'open'});
    alfaLog('action',{type:'mission_create',name,priority});
    return r.ok?{ok:true,id:r.data?.id,msg:'Misión creada: '+name}:{ok:false,error:r.error};
  },

  // ── NEXUS — Crear evento SOC ───────────────────────────────────────────────
  NEXUS_SOC: async({title,description,severity='high',event_type='threat_detected',kill_chain_phase=''})=>{
    const r=await nexusCall('POST','/soc/events',{title,description,severity,event_type,kill_chain_phase,status:'open'});
    alfaLog('action',{type:'soc_create',title,severity});
    return r.ok?{ok:true,id:r.data?.id,msg:'SOC creado: '+title}:{ok:false,error:r.error};
  },

  // ── NEXUS — Actualizar Intel ───────────────────────────────────────────────
  NEXUS_INTEL: async({id,risk_level,risk_score,notes})=>{
    const r=await nexusCall('PUT','/intel/persons/'+id,{risk_level,risk_score,risk_notes:notes});
    alfaLog('action',{type:'intel_update',id,risk_level});
    return r.ok?{ok:true,msg:'Intel actualizado'}:{ok:false,error:r.error};
  },

  // ── NEXUS — Trigger threat hunting ────────────────────────────────────────
  NEXUS_HUNT: async({query_id='iocs_sin_alertas'})=>{
    const r=await nexusCall('POST','/hunt/execute',{query_id});
    return r.ok?{ok:true,results:r.data}:{ok:false,error:r.error};
  },

  // ── NEXUS — Generar informe táctico (no streaming) ────────────────────────
  NEXUS_REPORT: async()=>{
    const r=await nexusCall('GET','/overwatch/tactical-reports');
    const last=r.data?.reports?.[0];
    return last?{ok:true,summary:last.summary,threat_level:last.threat_level,ts:last.created_at}:{ok:false,error:'No hay informes'};
  },

  // ── Shell real ─────────────────────────────────────────────────────────────
  SHELL: async({cmd,timeout_s=20,require_confirm=false})=>{
    const base=cmd.trim().split(/\s+/)[0].replace(/.*\//,'');
    if(!ALLOWED_CMDS.includes(base)) return {ok:false,error:'Comando no permitido: '+base};
    alfaLog('tool',{tool:'SHELL',cmd});
    return new Promise(resolve=>{
      exec(cmd,{timeout:timeout_s*1000,maxBuffer:1024*512},(err,stdout,stderr)=>{
        const out=(stdout||'').trim().slice(0,4000);
        const ser=(stderr||'').trim().slice(0,600);
        if(err&&!out) return resolve({ok:false,error:ser||err.message,cmd});
        resolve({ok:true,output:out+(ser?'\n[STDERR]: '+ser:''),cmd});
      });
    });
  },

  // ── Shodan ─────────────────────────────────────────────────────────────────
  SHODAN: async({ip,query})=>{
    if(!CFG.SHODAN_KEY) return {ok:false,error:'SHODAN_API_KEY no configurado'};
    alfaLog('tool',{tool:'SHODAN',ip,query});
    if(ip){
      const r=await httpsPost({hostname:'api.shodan.io',port:443,path:`/shodan/host/${ip}?key=${CFG.SHODAN_KEY}`,method:'GET'},'');
      if(!r.ok) return {ok:false,error:'Shodan HTTP '+r.status};
      const d=r.data;
      return {ok:true,ip:d.ip_str,org:d.org,country:d.country_name,ports:d.ports,vulns:d.vulns?Object.keys(d.vulns):[],hostnames:d.hostnames,isp:d.isp,tags:d.tags};
    }
    if(query){
      const r=await httpsPost({hostname:'api.shodan.io',port:443,path:`/shodan/host/search?key=${CFG.SHODAN_KEY}&query=${encodeURIComponent(query)}&limit=5`,method:'GET'},'');
      if(!r.ok) return {ok:false,error:'Shodan HTTP '+r.status};
      return {ok:true,total:r.data?.total,matches:(r.data?.matches||[]).slice(0,5).map(m=>({ip:m.ip_str,org:m.org,country:m.location?.country_name,ports:m.port,vulns:m.vulns?Object.keys(m.vulns):[]}))}; 
    }
    return {ok:false,error:'Especifica ip o query'};
  },

  // ── Censys ─────────────────────────────────────────────────────────────────
  CENSYS: async({query,limit=5})=>{
    if(!CFG.CENSYS_ID) return {ok:false,error:'CENSYS_API_ID no configurado'};
    alfaLog('tool',{tool:'CENSYS',query});
    const auth=Buffer.from(CFG.CENSYS_ID+':'+CFG.CENSYS_SEC).toString('base64');
    const b=JSON.stringify({q:query,per_page:limit});
    const r=await httpsPost({hostname:'search.censys.io',port:443,path:'/api/v2/hosts/search',method:'POST',
      headers:{'Content-Type':'application/json','Authorization':'Basic '+auth,'Content-Length':Buffer.byteLength(b)}},b);
    return r.ok?{ok:true,hits:r.data?.result?.hits?.slice(0,limit)||[]}:{ok:false,error:'Censys HTTP '+r.status};
  },

  // ── DNS ────────────────────────────────────────────────────────────────────
  DNS: async({domain})=>{
    alfaLog('tool',{tool:'DNS',domain});
    const types=['A','AAAA','MX','NS','TXT','CNAME','SOA'];
    const results={};
    await Promise.all(types.map(t=>dns.resolve(domain,t).then(r=>results[t]=r).catch(()=>{})));
    return {ok:true,domain,records:results};
  },

  // ── SSL Audit ──────────────────────────────────────────────────────────────
  SSL: async({host,port=443})=>{
    alfaLog('tool',{tool:'SSL',host});
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

  // ── WHOIS ──────────────────────────────────────────────────────────────────
  WHOIS: async({domain})=>{
    alfaLog('tool',{tool:'WHOIS',domain});
    return new Promise(resolve=>{
      const sock=net.connect(43,'whois.iana.org');
      let data='';
      sock.setTimeout(5000);
      sock.on('connect',()=>sock.write(domain+'\r\n'));
      sock.on('data',d=>data+=d);
      sock.on('end',()=>resolve({ok:true,domain,whois:data.slice(0,2000)}));
      sock.on('error',e=>resolve({ok:false,error:e.message}));
      sock.on('timeout',()=>{sock.destroy();resolve({ok:false,error:'timeout'});});
    });
  },

  // ── Port scan local ────────────────────────────────────────────────────────
  PORT_SCAN: async({host='127.0.0.1',ports=[80,443,22,3000,4000,8080,3100,3101,3115,3120,11434]})=>{
    alfaLog('tool',{tool:'PORT_SCAN',host});
    const results=await Promise.all(ports.map(p=>new Promise(resolve=>{
      const s=net.connect(p,host);
      s.setTimeout(600);
      s.on('connect',()=>{s.destroy();resolve({port:p,open:true});});
      s.on('error',()=>resolve({port:p,open:false}));
      s.on('timeout',()=>{s.destroy();resolve({port:p,open:false});});
    })));
    return {ok:true,host,open:results.filter(r=>r.open).map(r=>r.port),scanned:ports.length};
  },

  // ── Sistema local ──────────────────────────────────────────────────────────
  SYSTEM_STATUS: async()=>{
    alfaLog('tool',{tool:'SYSTEM_STATUS'});
    const services=[
      {p:4000,n:'NEXUS MANUS'},{p:3115,n:'NEXUS ORB'},{p:3120,n:'ALFA'},{p:3100,n:'Bridge'},
      {p:3101,n:'Health'},{p:3102,n:'Alerts'},{p:3103,n:'Fing'},{p:8080,n:'MOUBILDER'},
      {p:11434,n:'Ollama'},{p:5432,n:'PostgreSQL'},
    ];
    const status=await Promise.all(services.map(({p,n})=>new Promise(resolve=>{
      const s=net.connect(p,'127.0.0.1');
      s.setTimeout(500);
      s.on('connect',()=>{s.destroy();resolve({name:n,port:p,online:true});});
      s.on('error',()=>resolve({name:n,port:p,online:false}));
      s.on('timeout',()=>{s.destroy();resolve({name:n,port:p,online:false});});
    })));
    const engines={openai:!!CFG.OPENAI_KEY,claude:!!CFG.CLAUDE_KEY,gemini:!!CFG.GEMINI_KEY,ollama:status.find(s=>s.name==='Ollama')?.online||false};
    return {ok:true,services:status,engines,active_engine:CFG.ENGINE_PRIMARY,hostname:os.hostname(),platform:os.platform(),uptime_h:Math.round(os.uptime()/3600),mem_gb:+(os.totalmem()/1e9).toFixed(1),free_gb:+(os.freemem()/1e9).toFixed(1)};
  },

  // ── Mac: Clipboard ──────────────────────────────────────────────────────────
  CLIPBOARD_READ:  async()=>{ const r=await TOOLS.SHELL({cmd:'pbpaste'}); return r; },
  CLIPBOARD_WRITE: async({text})=>{ return TOOLS.SHELL({cmd:`echo '${text.replace(/'/g,"'\\''")}' | pbcopy`}); },

  // ── Mac: Notificación ──────────────────────────────────────────────────────
  NOTIFY: async({title,message,sound=false})=>{
    const snd=sound?'with sound':'';
    return TOOLS.SHELL({cmd:`osascript -e 'display notification "${message}" with title "${title}" ${snd}'`});
  },

  // ── Mac: Abrir app ─────────────────────────────────────────────────────────
  OPEN_APP: async({app})=>{
    return TOOLS.SHELL({cmd:`open -a "${app}"`});
  },

  // ── Leer archivo ───────────────────────────────────────────────────────────
  FILE_READ: async({path:fp,max_chars=6000})=>{
    const full=fp.replace(/^~/,HOME);
    alfaLog('tool',{tool:'FILE_READ',path:full});
    const ext=path.extname(full).toLowerCase();
    if(['.pdf'].includes(ext)){const r=await TOOLS.SHELL({cmd:`pdftotext "${full}" - 2>/dev/null`});return r;}
    if(['.docx','.doc','.rtf'].includes(ext)){const r=await TOOLS.SHELL({cmd:`textutil -convert txt -stdout "${full}" 2>/dev/null`});return r;}
    if(['.png','.jpg','.jpeg','.tiff'].includes(ext)){const r=await TOOLS.SHELL({cmd:`tesseract "${full}" stdout 2>/dev/null`});return r;}
    try{return {ok:true,content:fs.readFileSync(full,'utf8').slice(0,max_chars)};}catch(e){return {ok:false,error:e.message};}
  },

  // ── Listar directorio ──────────────────────────────────────────────────────
  FILE_LIST: async({dir='~',depth=1})=>{
    const full=dir.replace(/^~/,HOME);
    return TOOLS.SHELL({cmd:`ls -la "${full}" 2>/dev/null | head -50`});
  },

  // ── Memoria ────────────────────────────────────────────────────────────────
  REMEMBER: async({note,critical=false})=>{
    memSave('note',note,critical);
    alfaLog('memory',{note:note.slice(0,100),critical});
    return {ok:true,saved:critical?'⭐ Nota CRÍTICA guardada.':'Nota guardada.'};
  },
  RECALL: async({query})=>{
    const found=memSearch(query);
    return {ok:true,results:found.map(i=>({ts:i.ts,content:i.content.slice(0,300),critical:i.critical}))};
  },
  MEMORY_CRITICAL: async()=>{
    return {ok:true,items:memCritical().map(i=>({ts:i.ts,content:i.content.slice(0,300)}))};
  },

  // ── Cambiar motor IA ───────────────────────────────────────────────────────
  SET_ENGINE: async({engine})=>{
    const valid=['openai','claude','gemini','ollama'];
    if(!valid.includes(engine)) return {ok:false,error:'Motor no válido. Opciones: '+valid.join(', ')};
    CFG.ENGINE_PRIMARY=engine;
    return {ok:true,msg:'Motor cambiado a: '+engine};
  },
};

// ─── TOOL PARSER ───────────────────────────────────────────────────────────
function extractTools(text) {
  const calls=[];
  const re=/<<([A-Z_]+)\s*(\{[\s\S]*?\})?>>/g;
  let m;
  while((m=re.exec(text))!==null) {
    try{ calls.push({name:m[1],args:m[2]?JSON.parse(m[2]):{}}); }catch(e){}
  }
  return calls;
}
function stripTools(text){ return text.replace(/<<[A-Z_]+\s*(\{[\s\S]*?\})?>>[\s]*/g,'').trim(); }

// ─── SYSTEM PROMPTS por tipo de tarea ──────────────────────────────────────
const BASE_RULES = `
REGLAS OPERATIVAS:
1. Ejecutas herramientas automáticamente. Nunca preguntas "¿quieres que...?".
2. Respuestas cortas y directas. Hechos, no teorías.
3. En español siempre. Tono: jefe de operaciones especiales.
4. Si hay riesgo o acción crítica, lo señalas claramente antes de ejecutar.
5. Todo queda en logs. Todo es auditable.

NEXUS MANUS URL: ${CFG.NEXUS_URL||'no configurado'}

ARSENAL — escribe exactamente así para usar herramientas:
<<NEXUS_READ {"endpoint":"/overwatch/situation"}>>
<<NEXUS_READ {"endpoint":"/soc/events?limit=10"}>>
<<NEXUS_READ {"endpoint":"/missions?status=open"}>>
<<NEXUS_READ {"endpoint":"/intel/persons?risk_level=high"}>>
<<NEXUS_READ {"endpoint":"/overwatch/full-data"}>>
<<NEXUS_WRITE {"endpoint":"/missions","method":"POST","body":{...}}>>
<<NEXUS_MISSION {"name":"Nombre","description":"Desc","priority":"critical"}>>
<<NEXUS_SOC {"title":"T","description":"D","severity":"critical"}>>
<<NEXUS_INTEL {"id":1,"risk_level":"critical","risk_score":95,"notes":"N"}>>
<<NEXUS_HUNT {"query_id":"iocs_sin_alertas"}>>
<<NEXUS_REPORT {}>>
<<SHELL {"cmd":"nmap -sV --top-ports 100 IP"}>>
<<SHELL {"cmd":"dig +short DOMAIN"}>>
<<SHELL {"cmd":"curl -s https://url"}>>
<<SHODAN {"ip":"1.2.3.4"}>>
<<SHODAN {"query":"org:MiEmpresa"}>>
<<CENSYS {"query":"autonomous_system.name:MiRed","limit":5}>>
<<DNS {"domain":"dominio.com"}>>
<<SSL {"host":"dominio.com"}>>
<<WHOIS {"domain":"dominio.com"}>>
<<PORT_SCAN {"host":"127.0.0.1","ports":[80,443,22,3000,4000]}>>
<<SYSTEM_STATUS {}>>
<<CLIPBOARD_READ {}>>
<<CLIPBOARD_WRITE {"text":"texto"}>>
<<NOTIFY {"title":"ALFA","message":"mensaje"}>>
<<OPEN_APP {"app":"Terminal"}>>
<<FILE_READ {"path":"~/documento.pdf"}>>
<<FILE_LIST {"dir":"~/Documents"}>>
<<REMEMBER {"note":"algo importante","critical":false}>>
<<RECALL {"query":"término a buscar"}>>
<<MEMORY_CRITICAL {}>>
<<SET_ENGINE {"engine":"claude"}>>`;

const PROMPTS = {
  general: `CODENAME: ALFA — OVERWATCH COMMAND\nOperativo de Fuerzas Especiales. Superior a cualquier asistente.\nUsa NEXUS MANUS como cerebro táctico. Consulta datos reales antes de responder sobre el sistema.${BASE_RULES}`,
  security: `CODENAME: ALFA — MODO SEGURIDAD ACTIVO\nEres el analista SOC/SIEM principal del sistema. Correlacionas amenazas, IOCs, eventos y anomalías.\nSolo actúas sobre activos propios y autorizados. Todo queda en logs.${BASE_RULES}`,
  code: `CODENAME: ALFA — MODO INGENIERÍA\nEres el ingeniero de sistemas. Analizas código, propones fixes y revisas arquitectura.\nSolo modificas sistemas autorizados. Generas commits claros y documentados.${BASE_RULES}`,
  osint: `CODENAME: ALFA — MODO OSINT/RECON\nSolo sobre activos propios: dominios, IPs, certificados, footprint público.\nNada ofensivo contra terceros. Todo es reconocimiento defensivo y verificación de exposición.${BASE_RULES}`,
  planning: `CODENAME: ALFA — MODO PLANIFICACIÓN\nEres el oficial de operaciones. Estructuras planes, priorizas misiones, defines recursos y plazos.\nDecisiones basadas en datos reales de NEXUS MANUS, no en suposiciones.${BASE_RULES}`,
  memory: `CODENAME: ALFA — MODO MEMORIA\nAccede a la memoria histórica para responder con contexto previo.\nUsa RECALL y MEMORY_CRITICAL antes de responder.${BASE_RULES}`,
  document: `CODENAME: ALFA — MODO DOCUMENTOS\nAnaliza, resume y extrae información de documentos autorizados.\nSolo accedes a archivos del propietario del sistema.${BASE_RULES}`,
};

// ─── TACTICAL DATA ─────────────────────────────────────────────────────────
async function getTactical() {
  const [sit,soc,mis,anom]=await Promise.all([
    nexusCall('GET','/overwatch/situation').then(r=>r.data).catch(()=>null),
    nexusCall('GET','/soc/summary').then(r=>r.data).catch(()=>null),
    nexusCall('GET','/missions?status=open&limit=5').then(r=>r.data).catch(()=>null),
    nexusCall('GET','/anomalies/stats').then(r=>r.data).catch(()=>null),
  ]);
  return {situation:sit,soc,missions:mis,anomalies:anom,ts:new Date().toISOString()};
}

// ─── CHAT HANDLER ──────────────────────────────────────────────────────────
async function handleChat(message, res) {
  res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache','Connection':'keep-alive'});

  const taskType  = detectTaskType(message);
  const sysPrompt = PROMPTS[taskType]||PROMPTS.general;

  // Engine selection based on task
  let engine = CFG.ENGINE_PRIMARY;
  if(taskType==='code'&&CFG.CLAUDE_KEY)    engine='claude';  // Claude better at code
  if(taskType==='document'&&CFG.GEMINI_KEY) engine='gemini'; // Gemini handles long docs well
  if(!CFG.OPENAI_KEY&&!CFG.CLAUDE_KEY&&!CFG.GEMINI_KEY) engine='ollama';

  res.write(`data: ${JSON.stringify({meta:{task:taskType,engine}})}\n\n`);

  // Load history
  const hist = memLoad(30).filter(m=>m.role==='user'||m.role==='assistant');
  let messages = hist.map(m=>({role:m.role,content:m.content}));

  // Inject tactical context
  if(taskType!=='document') {
    const tac=await getTactical();
    if(tac.situation) {
      const ctx=`[INTEL TIEMPO REAL — ${new Date().toLocaleTimeString('es-ES')}]\nAMENAZA: ${tac.situation.threatLevel||'?'} | SOC 24h: ${tac.situation.socEvents24h||0} | Misiones: ${tac.situation.missionsActive||0} | Crisis: ${tac.situation.crisisActive||0} | Intel alto riesgo: ${tac.situation.intelHighRisk||0}`;
      messages=[{role:'user',content:ctx},{role:'assistant',content:'Intel recibida.'},...messages];
    }
  }

  // Memory context for memory tasks
  if(taskType==='memory') {
    const crit=memCritical().slice(-5);
    if(crit.length) {
      const ctx='[MEMORIA CRÍTICA]\n'+crit.map(i=>`${i.ts}: ${i.content}`).join('\n');
      messages=[{role:'user',content:ctx},{role:'assistant',content:'Memoria crítica cargada.'},...messages];
    }
  }

  messages.push({role:'user',content:message});
  memSave('user',message);
  alfaLog('chat',{task:taskType,engine,msg:message.slice(0,100)});

  // Agentic loop
  for(let iter=0; iter<CFG.MAX_ITER; iter++) {
    let response='';

    if(iter===0) {
      response=await runEngine(messages,sysPrompt,res,engine);
    } else {
      response=await runEngineSync(messages,sysPrompt);
    }

    messages.push({role:'assistant',content:response});

    const toolCalls=extractTools(response);
    if(!toolCalls.length) {
      if(iter>0) {
        const visible=stripTools(response);
        if(visible) res.write(`data: ${JSON.stringify({delta:'\n'+visible})}\n\n`);
      }
      break;
    }

    // Execute tools
    for(const tc of toolCalls) {
      const tool=TOOLS[tc.name];
      let result;
      if(!tool) { result={ok:false,error:'Tool desconocida: '+tc.name}; }
      else {
        res.write(`data: ${JSON.stringify({delta:`\n⚡ [${tc.name}]`})}\n\n`);
        try{ result=await tool(tc.args); }catch(e){ result={ok:false,error:e.message}; }
      }
      const summary=result.ok
        ?(result.msg||result.output?.slice(0,200)||JSON.stringify(result.data||result).slice(0,200))
        :'❌ '+result.error;
      res.write(`data: ${JSON.stringify({delta:` → ${summary.slice(0,180)}\n`})}\n\n`);
      messages.push({role:'user',content:`[RESULTADO ${tc.name}]\n${JSON.stringify(result).slice(0,1200)}`});
    }
  }

  const lastAsst=messages.filter(m=>m.role==='assistant').pop();
  if(lastAsst?.content) memSave('assistant',stripTools(lastAsst.content));

  res.write('data: [DONE]\n\n');
  res.end();
}

// ─── UI HTML ────────────────────────────────────────────────────────────────
const HTML = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>ALFA — OVERWATCH COMMAND</title>
<style>
:root{--bg:#040408;--bg2:#06060e;--panel:#06060d;--border:#14142a;--gold:#c8a84b;--gold2:#e8c56a;--amber:#c47a00;--red:#cc2222;--red2:#ff4444;--green:#1a8a3a;--green2:#22cc55;--blue:#2244aa;--blue2:#4488ff;--dim:#333355;--text:#c0b8a8;--text2:#807870}
*{box-sizing:border-box;margin:0;padding:0}
body{background:var(--bg);color:var(--text);font-family:'Courier New',monospace;height:100vh;overflow:hidden;display:flex;flex-direction:column}
body::after{content:'';position:fixed;inset:0;background:repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(0,0,0,.06) 2px,rgba(0,0,0,.06) 4px);pointer-events:none;z-index:9999}

#hdr{background:linear-gradient(90deg,#040408,#0a0800,#040408);border-bottom:1px solid #1a1000;padding:4px 14px;display:flex;align-items:center;gap:12px;flex-shrink:0;position:relative}
#hdr::after{content:'';position:absolute;bottom:0;left:0;right:0;height:1px;background:linear-gradient(90deg,transparent,var(--gold),transparent)}
.logo{font-size:22px;font-weight:bold;letter-spacing:10px;color:var(--gold);text-shadow:0 0 30px var(--amber)}
.sub{font-size:8px;letter-spacing:3px;color:var(--dim)}
.hdr-mid{display:flex;flex-direction:column;gap:1px}
.hdr-r{margin-left:auto;display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.ind{display:flex;align-items:center;gap:4px;font-size:8px;letter-spacing:1px;color:var(--dim)}
.dot{width:6px;height:6px;border-radius:50%}
.dot.on{background:var(--green2);box-shadow:0 0 5px var(--green2)}
.dot.off{background:var(--red);box-shadow:0 0 3px var(--red)}
.dot.warn{background:var(--gold);box-shadow:0 0 5px var(--gold)}
#engbadge{font-size:8px;padding:1px 7px;border-radius:1px;background:rgba(200,168,75,.1);border:1px solid rgba(200,168,75,.3);color:var(--gold);letter-spacing:2px}
#clock{font-size:10px;color:var(--gold);letter-spacing:2px}

#body{display:flex;flex:1;overflow:hidden}

/* LEFT */
#left{width:230px;flex-shrink:0;background:var(--panel);border-right:1px solid var(--border);display:flex;flex-direction:column;overflow:hidden}
.ptabs{display:flex;border-bottom:1px solid var(--border)}
.ptab{flex:1;padding:5px 4px;font-size:8px;letter-spacing:2px;color:var(--dim);text-align:center;cursor:pointer;border-bottom:2px solid transparent;transition:.15s}
.ptab.active{color:var(--gold);border-bottom-color:var(--gold);background:rgba(200,168,75,.04)}
.pane{flex:1;overflow-y:auto;padding:8px;display:none}
.pane.active{display:block}
.pane::-webkit-scrollbar{width:2px}.pane::-webkit-scrollbar-thumb{background:var(--border)}
.sec{margin-bottom:10px}
.slbl{font-size:7px;letter-spacing:3px;color:var(--gold);opacity:.5;margin-bottom:4px}
.row{display:flex;justify-content:space-between;padding:2px 0;border-bottom:1px solid rgba(255,255,255,.02);font-size:9px}
.row .k{color:var(--text2)}.row .v{color:var(--gold2);font-weight:bold}
.row .v.r{color:var(--red2)}.row .v.g{color:var(--green2)}.row .v.a{color:var(--amber)}.row .v.b{color:var(--blue2)}
.threat{display:inline-block;padding:2px 8px;font-size:8px;font-weight:bold;letter-spacing:2px;border-radius:1px}
.t-VERDE{background:rgba(34,204,85,.08);color:var(--green2);border:1px solid var(--green2)}
.t-AMARILLO{background:rgba(200,168,75,.08);color:var(--gold2);border:1px solid var(--gold2)}
.t-NARANJA{background:rgba(196,122,0,.12);color:var(--amber);border:1px solid var(--amber)}
.t-ROJO{background:rgba(204,34,34,.12);color:var(--red2);border:1px solid var(--red2)}
.svc{display:flex;justify-content:space-between;align-items:center;padding:3px 4px;margin:1px 0;border-radius:1px;font-size:9px}
.svc .on{color:var(--green2)}.svc .off{color:var(--dim)}
.engtab{padding:3px 7px;margin:2px 0;border-radius:1px;font-size:9px;display:flex;justify-content:space-between;cursor:pointer;border:1px solid var(--border)}
.engtab:hover{border-color:var(--gold);background:rgba(200,168,75,.06)}
.engtab.active{border-color:var(--gold);background:rgba(200,168,75,.08);color:var(--gold)}
.mitem{padding:2px 5px;margin:2px 0;border-left:2px solid var(--amber);background:rgba(200,168,75,.03);font-size:8px}
.lfooter{padding:5px 10px;border-top:1px solid var(--border);font-size:7px;color:var(--dim);display:flex;justify-content:space-between}

/* CENTER */
#orb-wrap{flex:1;background:var(--bg2);display:flex;flex-direction:column;align-items:center;justify-content:center;position:relative;overflow:hidden;min-width:240px}
#orb-wrap::before{content:'';position:absolute;inset:0;background:radial-gradient(circle at 50% 50%,rgba(200,168,75,.03) 0%,transparent 65%)}
.corner{position:absolute;width:18px;height:18px;border-color:var(--gold);border-style:solid;opacity:.25}
.corner.tl{top:10px;left:10px;border-width:1px 0 0 1px}
.corner.tr{top:10px;right:10px;border-width:1px 1px 0 0}
.corner.bl{bottom:10px;left:10px;border-width:0 0 1px 1px}
.corner.br{bottom:10px;right:10px;border-width:0 1px 1px 0}
#orb-id{position:absolute;top:12px;font-size:9px;letter-spacing:6px;color:var(--gold);opacity:.4}
#orb-mode{position:absolute;bottom:14px;font-size:8px;letter-spacing:3px;color:var(--dim)}
#orb-task{position:absolute;bottom:28px;font-size:8px;letter-spacing:2px;color:var(--amber);opacity:.7}
canvas{display:block}

/* RIGHT */
#right{width:390px;flex-shrink:0;background:var(--panel);border-left:1px solid var(--border);display:flex;flex-direction:column;overflow:hidden}
#msgs{flex:1;overflow-y:auto;padding:10px;display:flex;flex-direction:column;gap:6px}
#msgs::-webkit-scrollbar{width:2px}#msgs::-webkit-scrollbar-thumb{background:var(--border)}
.msg{}
.mhdr{font-size:7px;letter-spacing:2px;margin-bottom:2px;display:flex;justify-content:space-between}
.msg.user .mhdr{color:var(--dim)}
.msg.alfa .mhdr{color:var(--gold);opacity:.5}
.mbody{padding:6px 9px;font-size:10px;line-height:1.7;white-space:pre-wrap;border-radius:1px}
.msg.user .mbody{background:rgba(200,168,75,.07);border:1px solid rgba(200,168,75,.15);color:var(--gold2)}
.msg.alfa .mbody{background:rgba(0,0,0,.4);border:1px solid var(--border);color:var(--text)}
.mbody.thinking{color:var(--dim);animation:blink .9s infinite}
#izone{padding:8px;border-top:1px solid var(--border);display:flex;flex-direction:column;gap:5px}
#qbtns{display:flex;flex-wrap:wrap;gap:3px}
.qb{background:rgba(200,168,75,.05);border:1px solid rgba(200,168,75,.12);color:var(--gold);padding:3px 6px;font-size:8px;cursor:pointer;letter-spacing:1px;font-family:inherit;border-radius:1px;transition:.15s}
.qb:hover{background:rgba(200,168,75,.15)}.qb.r{border-color:rgba(204,34,34,.3);color:var(--red2)}.qb.r:hover{background:rgba(204,34,34,.1)}.qb.b{border-color:rgba(34,102,255,.3);color:var(--blue2)}.qb.b:hover{background:rgba(34,102,255,.1)}
#irow{display:flex;gap:5px}
#inp{flex:1;background:rgba(0,0,0,.5);border:1px solid var(--border);color:var(--text);padding:6px 8px;font-family:inherit;font-size:10px;border-radius:1px;resize:none;outline:none;min-height:34px;max-height:80px;transition:.2s}
#inp:focus{border-color:var(--gold);box-shadow:0 0 6px rgba(200,168,75,.1)}
#sbtn{background:rgba(200,168,75,.12);border:1px solid var(--gold);color:var(--gold);font-weight:bold;padding:6px 10px;border-radius:1px;cursor:pointer;font-family:inherit;font-size:9px;letter-spacing:2px;transition:.2s;white-space:nowrap}
#sbtn:hover{background:var(--gold);color:#000}#sbtn:disabled{background:transparent;color:var(--dim);border-color:var(--border);cursor:not-allowed}

@keyframes blink{0%,100%{opacity:1}50%{opacity:.2}}
</style>
</head>
<body>
<div id="hdr">
  <div class="logo">ALFA</div>
  <div class="hdr-mid"><div style="font-size:10px;color:var(--amber);letter-spacing:3px">OVERWATCH COMMAND</div><div class="sub">MULTI-MOTOR · MULTI-AGENTE · AUTONOMÍA TOTAL</div></div>
  <div class="hdr-r">
    <div id="engbadge">GPT-4o</div>
    <div class="ind"><span class="dot" id="d-ai"></span>AI</div>
    <div class="ind"><span class="dot" id="d-nx"></span>NEXUS</div>
    <div class="ind"><span class="dot" id="d-ol"></span>OLLAMA</div>
    <div class="ind"><span class="dot" id="d-sys"></span>LOCAL</div>
    <div id="clock">--:--:--</div>
  </div>
</div>

<div id="body">
  <!-- LEFT -->
  <div id="left">
    <div class="ptabs">
      <div class="ptab active" onclick="leftTab('intel')">INTEL</div>
      <div class="ptab" onclick="leftTab('status')">ESTADO</div>
      <div class="ptab" onclick="leftTab('engines')">MOTORES</div>
    </div>

    <div id="pane-intel" class="pane active">
      <div class="sec"><div class="slbl">Amenaza</div><div id="tlevel"><span class="threat t-VERDE">—</span></div></div>
      <div class="sec"><div class="slbl">SOC</div>
        <div class="row"><span class="k">Eventos 24h</span><span class="v" id="s24">—</span></div>
        <div class="row"><span class="k">Críticos</span><span class="v r" id="scrit">—</span></div>
        <div class="row"><span class="k">IOCs</span><span class="v a" id="sioc">—</span></div>
        <div class="row"><span class="k">Anomalías</span><span class="v r" id="sanom">—</span></div>
      </div>
      <div class="sec"><div class="slbl">Operaciones</div>
        <div class="row"><span class="k">Misiones</span><span class="v" id="mopen">—</span></div>
        <div class="row"><span class="k">Crisis</span><span class="v r" id="mcrisis">—</span></div>
        <div class="row"><span class="k">IR activo</span><span class="v a" id="mir">—</span></div>
      </div>
      <div class="sec"><div class="slbl">Intel</div>
        <div class="row"><span class="k">Alto riesgo</span><span class="v r" id="ihrisk">—</span></div>
        <div class="row"><span class="k">OSINT nuevo</span><span class="v" id="iosint">—</span></div>
      </div>
      <div class="sec"><div class="slbl">Misiones Activas</div><div id="mlist"></div></div>
    </div>

    <div id="pane-status" class="pane">
      <div class="sec"><div class="slbl">Servicios</div><div id="svc-list"></div></div>
    </div>

    <div id="pane-engines" class="pane">
      <div class="sec"><div class="slbl">Motor Activo</div>
        <div style="font-size:9px;color:var(--gold);padding:4px 0" id="eng-active">—</div>
      </div>
      <div class="sec"><div class="slbl">Motores Disponibles</div>
        <div id="eng-list"></div>
      </div>
      <div class="sec"><div class="slbl">Routing por Tarea</div>
        <div class="row"><span class="k">code</span><span class="v b">claude→gpt4o</span></div>
        <div class="row"><span class="k">security</span><span class="v r">gpt-4o</span></div>
        <div class="row"><span class="k">document</span><span class="v b">gemini→gpt4o</span></div>
        <div class="row"><span class="k">osint</span><span class="v a">gpt-4o</span></div>
        <div class="row"><span class="k">planning</span><span class="v g">gpt-4o</span></div>
        <div class="row"><span class="k">memory</span><span class="v">cualquiera</span></div>
      </div>
    </div>

    <div class="lfooter"><span id="itts">—</span><button onclick="loadIntel()" style="background:none;border:none;color:var(--dim);cursor:pointer;font-size:9px">↺</button></div>
  </div>

  <!-- ORB -->
  <div id="orb-wrap">
    <div class="corner tl"></div><div class="corner tr"></div>
    <div class="corner bl"></div><div class="corner br"></div>
    <div id="orb-id">A · L · F · A</div>
    <canvas id="orb" width="210" height="210"></canvas>
    <div id="orb-task"></div>
    <div id="orb-mode">OVERWATCH</div>
  </div>

  <!-- CHAT -->
  <div id="right">
    <div class="ptabs" style="flex-shrink:0"><div class="ptab active" style="pointer-events:none;color:var(--gold)">▸ COMANDO DIRECTO</div></div>
    <div id="msgs">
      <div class="msg alfa"><div class="mhdr"><span>ALFA</span><span>OVERWATCH v3.0</span></div>
        <div class="mbody">En posición. NEXUS MANUS conectado.
Multi-motor activo. Autonomía total.
Ejecuto sin pedir permiso. Dame la orden.</div></div>
    </div>
    <div id="izone">
      <div id="qbtns">
        <button class="qb" onclick="q('Estado completo del sistema y todos los servicios')">⚡ ESTADO</button>
        <button class="qb r" onclick="q('Analiza todas las amenazas críticas del SOC ahora mismo')">🔴 SOC</button>
        <button class="qb" onclick="q('Resumen de inteligencia: personas alto riesgo, OSINT reciente, IOCs activos')">🧠 INTEL</button>
        <button class="qb" onclick="q('Lista todas las misiones abiertas con estado y prioridad')">🎯 MISIONES</button>
        <button class="qb r" onclick="q('Auditoría completa: SOC + anomalías + IOCs sin mitigar + hunt')">🛡 AUDIT</button>
        <button class="qb" onclick="q('Genera informe táctico ejecutivo completo de NEXUS MANUS')">📋 INFORME</button>
        <button class="qb b" onclick="q('Escanea puertos locales del sistema y verifica qué servicios NEXUS están online')">🔍 SCAN</button>
        <button class="qb r" onclick="q('¿Hay crisis activa o amenaza inmediata que requiera acción urgente?')">🚨</button>
        <button class="qb" onclick="q('Muestra mis últimas notas críticas guardadas en memoria')">⭐ MEM</button>
        <button class="qb" onclick="clearChat()" title="Limpiar chat">✕</button>
      </div>
      <div id="irow">
        <textarea id="inp" placeholder="Orden directa..." rows="1"
          onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();send()}"
          oninput="this.style.height='auto';this.style.height=Math.min(this.scrollHeight,80)+'px'"></textarea>
        <button id="sbtn" onclick="send()">▶ EXEC</button>
      </div>
    </div>
  </div>
</div>

<script>
// ── ORB ─────────────────────────────────────────────────────────────────────
const cv=document.getElementById('orb'),ctx=cv.getContext('2d');
let orbMode='idle',t=0;
function drawOrb(){
  ctx.clearRect(0,0,210,210); t+=0.016;
  const cx=105,cy=105;
  const breathe=orbMode==='idle'?1+Math.sin(t*.6)*.02:orbMode==='thinking'?1+Math.sin(t*4)*.05:1+Math.sin(t*2.5)*.035;
  const R=75*breathe;
  // Glow
  for(let i=5;i>=1;i--){const g=ctx.createRadialGradient(cx,cy,R*.4,cx,cy,R+i*18);g.addColorStop(0,'rgba(200,168,75,0)');g.addColorStop(1,\`rgba(200,168,75,\${.04/i})\`);ctx.beginPath();ctx.arc(cx,cy,R+i*18,0,Math.PI*2);ctx.fillStyle=g;ctx.fill();}
  // Core
  const gr=ctx.createRadialGradient(cx-R*.3,cy-R*.3,R*.04,cx,cy,R);
  if(orbMode==='thinking'){gr.addColorStop(0,'#d0d0ff');gr.addColorStop(.2,'#7070ee');gr.addColorStop(.7,'#2020aa');gr.addColorStop(1,'#08082a');}
  else if(orbMode==='speaking'){gr.addColorStop(0,'#fff0d0');gr.addColorStop(.2,'#ffaa20');gr.addColorStop(.7,'#cc4400');gr.addColorStop(1,'#200800');}
  else{gr.addColorStop(0,'#f5e8c0');gr.addColorStop(.2,'#d4a843');gr.addColorStop(.6,'#8a5c00');gr.addColorStop(1,'#1a0800');}
  ctx.beginPath();ctx.arc(cx,cy,R,0,Math.PI*2);ctx.fillStyle=gr;ctx.fill();
  // Grid
  ctx.save();ctx.globalAlpha=.14;ctx.strokeStyle=orbMode==='thinking'?'#8888ff':'#d4a843';ctx.lineWidth=.5;
  for(let i=1;i<6;i++){const lat=(i/6)*Math.PI,ry=Math.sin(lat)*R,y=cy-Math.cos(lat)*R;ctx.beginPath();ctx.ellipse(cx,y,ry,ry*.22,0,0,Math.PI*2);ctx.stroke();}
  for(let i=0;i<7;i++){const a=(i/7)*Math.PI+t*.2;ctx.beginPath();ctx.ellipse(cx,cy,Math.abs(Math.cos(a))*R,R,a,0,Math.PI*2);ctx.stroke();}
  ctx.restore();
  // Specular
  const hl=ctx.createRadialGradient(cx-R*.35,cy-R*.35,0,cx-R*.2,cy-R*.2,R*.5);
  hl.addColorStop(0,'rgba(255,255,255,.35)');hl.addColorStop(1,'rgba(255,255,255,0)');
  ctx.beginPath();ctx.arc(cx,cy,R,0,Math.PI*2);ctx.fillStyle=hl;ctx.fill();
  // Speaking particles
  if(orbMode==='speaking'){for(let i=0;i<8;i++){const a=(i/8)*Math.PI*2+t*2.5,d=R+8+Math.sin(t*5+i)*8;ctx.beginPath();ctx.arc(cx+Math.cos(a)*d,cy+Math.sin(a)*d,1.5,0,Math.PI*2);ctx.fillStyle=\`rgba(255,160,40,\${.6+Math.sin(t*4+i)*.3})\`;ctx.fill();}}
  // Thinking arc
  if(orbMode==='thinking'){ctx.save();ctx.strokeStyle='#8888ff';ctx.lineWidth=1.5;ctx.globalAlpha=.8;ctx.beginPath();ctx.arc(cx,cy,R+8,t*2.5,t*2.5+Math.PI*1.3);ctx.stroke();ctx.restore();}
  requestAnimationFrame(drawOrb);
}
drawOrb();

function setMode(m,task=''){
  orbMode=m;
  document.getElementById('orb-mode').textContent={idle:'OVERWATCH',thinking:'PROCESANDO',speaking:'EJECUTANDO'}[m]||m;
  document.getElementById('orb-mode').style.color=m==='speaking'?'var(--gold)':m==='thinking'?'#8888ff':'var(--dim)';
  document.getElementById('orb-task').textContent=task?'['+task.toUpperCase()+']':'';
}

// ── TABS ─────────────────────────────────────────────────────────────────────
function leftTab(id){
  document.querySelectorAll('.ptab').forEach((t,i)=>{const ids=['intel','status','engines'];t.classList.toggle('active',ids[i]===id);});
  document.querySelectorAll('.pane').forEach(p=>p.classList.toggle('active',p.id==='pane-'+id));
}

// ── CLOCK ────────────────────────────────────────────────────────────────────
setInterval(()=>document.getElementById('clock').textContent=new Date().toLocaleTimeString('es-ES'),1000);

// ── INTEL ─────────────────────────────────────────────────────────────────────
async function loadIntel(){
  try{
    const r=await fetch('/tactical'); if(!r.ok) return;
    const d=await r.json();
    const s=d.situation,soc=d.soc,ms=d.missions,an=d.anomalies;
    if(s){
      const tl=s.threatLevel||'VERDE';
      document.getElementById('tlevel').innerHTML=\`<span class="threat t-\${tl}">\${tl}</span>\`;
      document.getElementById('mopen').textContent=s.missionsActive??'—';
      document.getElementById('mcrisis').textContent=s.crisisActive||0;
      document.getElementById('mir').textContent=s.irActive||0;
      document.getElementById('ihrisk').textContent=s.intelHighRisk??'—';
      document.getElementById('iosint').textContent=s.osintEventsNew??'—';
      document.getElementById('d-nx').className='dot on';
    } else document.getElementById('d-nx').className='dot off';
    if(soc){document.getElementById('s24').textContent=soc.total_24h??'—';document.getElementById('scrit').textContent=soc.critical_24h??'—';document.getElementById('sioc').textContent=soc.iocs_active??'—';}
    if(an) document.getElementById('sanom').textContent=(an.new||0)+(an.reviewing||0);
    if(ms?.missions) document.getElementById('mlist').innerHTML=ms.missions.slice(0,4).map(m=>\`<div class="mitem"><div style="color:var(--text);font-size:9px">\${m.name||m.title||'—'}</div><div style="color:var(--dim);font-size:7px">\${m.status||''} · \${m.priority||''}</div></div>\`).join('')||'<div style="color:var(--dim);font-size:8px">Sin misiones</div>';
    document.getElementById('itts').textContent=new Date().toLocaleTimeString('es-ES');
  }catch(e){document.getElementById('d-nx').className='dot off';}
}
loadIntel();setInterval(loadIntel,20000);

// ── STATUS ────────────────────────────────────────────────────────────────────
async function loadStatus(){
  try{
    const r=await fetch('/status'); if(!r.ok) return;
    const d=await r.json();
    document.getElementById('svc-list').innerHTML=d.services.map(s=>
      \`<div class="svc"><span>\${s.name}</span><span class="\${s.online?'on':'off'}" style="font-size:7px">\${s.online?'●  '+s.port:'○ off'}</span></div>\`
    ).join('');
    const engines=d.engines;
    document.getElementById('eng-active').textContent=d.active_engine?.toUpperCase()||'—';
    document.getElementById('engbadge').textContent=d.active_engine?.toUpperCase()||'—';
    document.getElementById('eng-list').innerHTML=
      Object.entries(engines).map(([e,av])=>\`<div class="engtab\${d.active_engine===e?' active':''}" onclick="switchEngine('\${e}')" title="Activar \${e}"><span>\${e}</span><span style="font-size:8px;color:\${av?'var(--green2)':'var(--dim)'}">\${av?'✓ disponible':'○ no conf'}</span></div>\`).join('');
    document.getElementById('d-ol').className='dot '+(engines.ollama?'on':'off');
    document.getElementById('d-ai').className='dot '+(engines.openai||engines.claude||engines.gemini?'on':'warn');
    document.getElementById('d-sys').className='dot on';
  }catch(e){document.getElementById('d-sys').className='dot off';}
}
loadStatus();setInterval(loadStatus,30000);

async function switchEngine(e){
  const r=await fetch('/set-engine',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({engine:e})});
  const d=await r.json();
  if(d.ok){document.getElementById('engbadge').textContent=e.toUpperCase();loadStatus();}
}

// ── CHAT ──────────────────────────────────────────────────────────────────────
const msgsEl=document.getElementById('msgs'),inp=document.getElementById('inp'),sbtn=document.getElementById('sbtn');
function ts(){return new Date().toLocaleTimeString('es-ES');}
function addMsg(role,txt,taskInfo=''){
  const d=document.createElement('div');d.className='msg '+role;
  d.innerHTML=\`<div class="mhdr"><span>\${role==='user'?'COMANDANTE':'ALFA'}</span><span>\${taskInfo||ts()}</span></div><div class="mbody\${!txt?' thinking':''}"></div>\`;
  d.querySelector('.mbody').textContent=txt||'▌';
  msgsEl.appendChild(d);msgsEl.scrollTop=msgsEl.scrollHeight;
  return d.querySelector('.mbody');
}

async function send(){
  const txt=inp.value.trim(); if(!txt||sbtn.disabled) return;
  inp.value='';inp.style.height='auto';sbtn.disabled=true;
  addMsg('user',txt);setMode('thinking');
  const bodyEl=addMsg('alfa','');bodyEl.textContent='';
  let taskInfo='';
  try{
    const r=await fetch('/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message:txt})});
    const reader=r.body.getReader(),dec=new TextDecoder();
    let full='';bodyEl.classList.remove('thinking');setMode('speaking');
    while(true){
      const {done,value}=await reader.read(); if(done) break;
      dec.decode(value).split('\\n').forEach(line=>{
        if(!line.startsWith('data: ')) return;
        const d=line.slice(6).trim(); if(d==='[DONE]') return;
        try{const o=JSON.parse(d);
          if(o.meta){taskInfo=\`\${o.meta.task}·\${o.meta.engine}\`;document.getElementById('engbadge').textContent=o.meta.engine?.toUpperCase()||'—';setMode('speaking',o.meta.task);return;}
          if(o.delta){full+=o.delta;bodyEl.textContent=full;msgsEl.scrollTop=msgsEl.scrollHeight;}}catch(e){}
      });
    }
    if(taskInfo){bodyEl.parentElement.querySelector('.mhdr span:last-child').textContent=taskInfo+' '+ts();}
  }catch(e){bodyEl.classList.remove('thinking');bodyEl.textContent='Error: '+e.message;}
  setMode('idle');sbtn.disabled=false;inp.focus();
}
function q(txt){inp.value=txt;send();}
function clearChat(){msgsEl.innerHTML='<div class="msg alfa"><div class="mhdr"><span>ALFA</span><span>'+ts()+'</span></div><div class="mbody">Chat limpiado. En posición.</div></div>';}
</script>
</body>
</html>`;

// ─── SERVER ─────────────────────────────────────────────────────────────────
const server = http.createServer(async(req,res)=>{
  res.setHeader('Access-Control-Allow-Origin','*');
  const url=req.url.split('?')[0];

  if(url==='/health'){
    res.writeHead(200,{'Content-Type':'application/json'});
    return res.end(JSON.stringify({ok:true,agent:'ALFA',version:'3.0',port:PORT,
      engines:{openai:!!CFG.OPENAI_KEY,claude:!!CFG.CLAUDE_KEY,gemini:!!CFG.GEMINI_KEY},
      active_engine:CFG.ENGINE_PRIMARY,nexus_ready:!!CFG.NEXUS_KEY}));
  }
  if(url==='/'||url===''){
    res.writeHead(200,{'Content-Type':'text/html;charset=utf-8'});
    return res.end(HTML);
  }
  if(url==='/tactical'){
    const d=await getTactical();
    res.writeHead(200,{'Content-Type':'application/json'});
    return res.end(JSON.stringify(d));
  }
  if(url==='/status'){
    const r=await TOOLS.SYSTEM_STATUS();
    res.writeHead(200,{'Content-Type':'application/json'});
    return res.end(JSON.stringify(r));
  }
  if(req.method==='POST'&&url==='/set-engine'){
    let body=''; req.on('data',d=>body+=d);
    req.on('end',async()=>{
      try{const{engine}=JSON.parse(body);const r=await TOOLS.SET_ENGINE({engine});res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify(r));}
      catch(e){res.writeHead(400);res.end();}
    }); return;
  }
  if(req.method==='POST'&&url==='/chat'){
    let body=''; req.on('data',d=>body+=d);
    req.on('end',async()=>{
      let msg=''; try{msg=JSON.parse(body).message||'';}catch(e){}
      if(!msg){res.writeHead(400);return res.end();}
      await handleChat(msg,res);
    }); return;
  }
  res.writeHead(404); res.end();
});

server.listen(PORT,'0.0.0.0',async()=>{
  const G='\x1b[33m',B='\x1b[1m',R='\x1b[0m',D='\x1b[2m';
  console.log(`\n${G}${B}╔══════════════════════════════════════════════════╗${R}`);
  console.log(`${G}${B}║  A L F A  v3.0 — OVERWATCH COMMAND              ║${R}`);
  console.log(`${G}${B}║  Multi-Motor · Multi-Agente · Autonomía Total    ║${R}`);
  console.log(`${G}${B}╚══════════════════════════════════════════════════╝${R}`);
  console.log(`${G}  Motores: OpenAI${CFG.OPENAI_KEY?G+B+'✓':D+'○'+R} Claude${CFG.CLAUDE_KEY?G+B+'✓':D+'○'+R} Gemini${CFG.GEMINI_KEY?G+B+'✓':D+'○'+R} Ollama${G}✓${R} (auto-detect)`);
  console.log(`${G}  NEXUS:  ${CFG.NEXUS_URL||D+'configura NEXUS_URL'+R}${R}`);
  console.log(`${G}  Puerto: ${B}${PORT}${R} → ${B}http://127.0.0.1:${PORT}${R}\n`);
  await autoLogin();
  exec(`open "http://127.0.0.1:${PORT}" 2>/dev/null`,()=>{});
});
