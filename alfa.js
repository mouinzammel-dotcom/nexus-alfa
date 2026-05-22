#!/usr/bin/env node
/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║  A L F A  — Operativo de Inteligencia Táctica Superior      ║
 * ║  v2.0 — Fuerzas Especiales | GPT-4o | Autonomía Total       ║
 * ║  Ejecuta. No habla. NEXUS MANUS es su cerebro.              ║
 * ╚══════════════════════════════════════════════════════════════╝
 */
'use strict';

const http   = require('http');
const https  = require('https');
const dns    = require('dns');
const net    = require('net');
const fs     = require('fs');
const path   = require('path');
const os     = require('os');
const { exec, execSync } = require('child_process');

// ─── INIT ─────────────────────────────────────────────────────────
const HOME     = os.homedir();
const ENV_FILE = path.join(HOME, '.nexus-ai.env');
const MEM_FILE = path.join(HOME, '.alfa-memory.jsonl');
const PORT     = parseInt(process.env.ALFA_PORT || '3120');

const CFG = { MODEL:'gpt-4o', MAX_TOK:4000, NEXUS_URL:'', NEXUS_KEY:'', AI_KEY:'', SHODAN_KEY:'', CENSYS_ID:'', CENSYS_SEC:'' };

function loadEnv() {
  [ENV_FILE, path.join(HOME,'.env')].forEach(f => {
    if (!fs.existsSync(f)) return;
    fs.readFileSync(f,'utf8').split('\n').forEach(l => {
      const eq = l.indexOf('='); if(eq<1) return;
      process.env[l.slice(0,eq).trim()] = l.slice(eq+1).trim();
    });
  });
}
loadEnv();
['AI_API_KEY','OPENAI_API_KEY'].forEach(k=>{ if(process.env[k]) CFG.AI_KEY=process.env[k]; });
if(process.env.NEXUS_URL)       CFG.NEXUS_URL  = process.env.NEXUS_URL;
if(process.env.NEXUS_API_KEY)   CFG.NEXUS_KEY  = process.env.NEXUS_API_KEY;
if(process.env.SHODAN_API_KEY)  CFG.SHODAN_KEY = process.env.SHODAN_API_KEY;
if(process.env.CENSYS_API_ID)   CFG.CENSYS_ID  = process.env.CENSYS_API_ID;
if(process.env.CENSYS_API_SECRET) CFG.CENSYS_SEC= process.env.CENSYS_API_SECRET;

// ─── MEMORIA ─────────────────────────────────────────────────────
function memSave(role,content){ try{fs.appendFileSync(MEM_FILE,JSON.stringify({role,content,ts:new Date().toISOString()})+'\n');}catch(e){} }
function memLoad(n=40){ try{return fs.readFileSync(MEM_FILE,'utf8').trim().split('\n').filter(Boolean).slice(-n).map(l=>JSON.parse(l));}catch(e){return[];} }

// ─── HTTP UTILS ───────────────────────────────────────────────────
function httpsReq(opts,body=''){
  return new Promise(resolve=>{
    const req=https.request(opts,res=>{
      let d=''; res.on('data',c=>d+=c); res.on('end',()=>{
        try{resolve({ok:res.statusCode<400,status:res.statusCode,data:JSON.parse(d)});}
        catch(e){resolve({ok:res.statusCode<400,status:res.statusCode,raw:d.slice(0,2000)});}
      });
    });
    req.on('error',e=>resolve({ok:false,error:e.message}));
    req.on('timeout',()=>{req.destroy();resolve({ok:false,error:'timeout'});});
    if(body) req.write(body); req.end();
  });
}
function nexusReq(method,endpoint,body){
  if(!CFG.NEXUS_URL) return Promise.resolve({ok:false,error:'NEXUS_URL no configurado'});
  const url=new URL(CFG.NEXUS_URL+'/api'+endpoint);
  const bodyStr=body?JSON.stringify(body):null;
  const headers={'Authorization':'Bearer '+CFG.NEXUS_KEY,'Content-Type':'application/json'};
  if(bodyStr) headers['Content-Length']=Buffer.byteLength(bodyStr);
  return httpsReq({hostname:url.hostname,port:443,path:url.pathname+(url.search||''),method,headers,timeout:6000},bodyStr);
}

// ─── AUTO-LOGIN ───────────────────────────────────────────────────
async function autoLogin(){
  if(CFG.NEXUS_KEY||!CFG.NEXUS_URL) return;
  const user=process.env.NEXUS_USER||'operador1', pass=process.env.NEXUS_PASS||'';
  if(!pass) return;
  try{
    const body=JSON.stringify({username:user,password:pass});
    const url=new URL(CFG.NEXUS_URL+'/api/auth/login');
    const r=await httpsReq({hostname:url.hostname,port:443,path:url.pathname,method:'POST',headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(body)},timeout:6000},body);
    if(r.data?.token){
      CFG.NEXUS_KEY=r.data.token;
      const env=fs.existsSync(ENV_FILE)?fs.readFileSync(ENV_FILE,'utf8'):'';
      const upd=env.includes('NEXUS_API_KEY=')?env.replace(/^NEXUS_API_KEY=.*/m,'NEXUS_API_KEY='+r.data.token):env+'\nNEXUS_API_KEY='+r.data.token;
      fs.writeFileSync(ENV_FILE,upd,{mode:0o600});
    }
  }catch(e){}
}

// ─── TOOLS ────────────────────────────────────────────────────────
const TOOLS = {

  // ── NEXUS MANUS — Leer cualquier endpoint ──────────────────────
  NEXUS_READ: async({endpoint})=>{
    const r=await nexusReq('GET',endpoint);
    return r.ok?{ok:true,data:r.data||r.raw}:{ok:false,error:r.error||'HTTP '+r.status};
  },

  // ── NEXUS MANUS — Crear misión ─────────────────────────────────
  NEXUS_MISSION: async({name,description,priority='high',type='tactical'})=>{
    const r=await nexusReq('POST','/missions',{name,description,priority,mission_type:type,status:'open'});
    return r.ok?{ok:true,id:r.data?.id,msg:'Misión creada: '+name}:{ok:false,error:r.error||'HTTP '+r.status};
  },

  // ── NEXUS MANUS — Crear evento SOC ────────────────────────────
  NEXUS_SOC: async({title,description,severity='high',event_type='threat_detected'})=>{
    const r=await nexusReq('POST','/soc/events',{title,description,severity,event_type,status:'open'});
    return r.ok?{ok:true,id:r.data?.id,msg:'SOC creado: '+title}:{ok:false,error:r.error||'HTTP '+r.status};
  },

  // ── NEXUS MANUS — Actualizar riesgo Intel ─────────────────────
  NEXUS_INTEL: async({id,risk_level,risk_score,notes})=>{
    const r=await nexusReq('PUT','/intel/persons/'+id,{risk_level,risk_score,risk_notes:notes});
    return r.ok?{ok:true,msg:'Intel actualizado'}:{ok:false,error:r.error||'HTTP '+r.status};
  },

  // ── Ejecutar comando real del sistema ─────────────────────────
  SHELL: async({cmd,timeout_s=15})=>{
    // Whitelist de comandos permitidos
    const ALLOWED=['nmap','dig','host','ping','curl','whois','openssl','netstat','ss','lsof','ifconfig','ip','arp','traceroute','nc','nslookup','cat','ls','df','free','uptime','uname','ps','which'];
    const base=cmd.trim().split(/\s+/)[0].replace(/.*\//,'');
    if(!ALLOWED.includes(base)) return {ok:false,error:'Comando no permitido: '+base+'. Permitidos: '+ALLOWED.join(', ')};
    return new Promise(resolve=>{
      exec(cmd,{timeout:timeout_s*1000,maxBuffer:1024*256},(err,stdout,stderr)=>{
        const out=(stdout||'').trim().slice(0,3000);
        const ser=(stderr||'').trim().slice(0,500);
        if(err&&!out) return resolve({ok:false,error:ser||err.message,cmd});
        resolve({ok:true,output:out+(ser?'\n[STDERR]: '+ser:''),cmd});
      });
    });
  },

  // ── Shodan host lookup ────────────────────────────────────────
  SHODAN: async({ip})=>{
    if(!CFG.SHODAN_KEY) return {ok:false,error:'SHODAN_API_KEY no configurado'};
    const r=await httpsReq({hostname:'api.shodan.io',port:443,path:`/shodan/host/${ip}?key=${CFG.SHODAN_KEY}`,method:'GET',timeout:8000});
    if(!r.ok) return {ok:false,error:'Shodan HTTP '+r.status};
    const d=r.data;
    return {ok:true,ip:d.ip_str,org:d.org,country:d.country_name,ports:d.ports,vulns:d.vulns?Object.keys(d.vulns):[],hostnames:d.hostnames,tags:d.tags,isp:d.isp};
  },

  // ── DNS scan real ─────────────────────────────────────────────
  DNS: async({domain})=>{
    const types=['A','AAAA','MX','NS','TXT'];
    const results={};
    await Promise.all(types.map(t=>new Promise(resolve=>{
      dns.resolve(domain,t,(err,recs)=>{results[t]=err?[]:recs;resolve();});
    })));
    return {ok:true,domain,records:results};
  },

  // ── SSL audit real ────────────────────────────────────────────
  SSL: async({host,port=443})=>{
    return new Promise(resolve=>{
      const sock=require('tls').connect({host,port,timeout:5000,rejectUnauthorized:false},()=>{
        const cert=sock.getPeerCertificate();
        const proto=sock.getProtocol();
        const cipher=sock.getCipher();
        const exp=cert.valid_to?new Date(cert.valid_to):null;
        const days_left=exp?Math.round((exp-Date.now())/864e5):null;
        sock.destroy();
        resolve({ok:true,host,proto,cipher:cipher?.name,subject:cert.subject?.CN,issuer:cert.issuer?.O,days_left,expires:cert.valid_to,severity:days_left<30?'critical':days_left<90?'high':'ok'});
      });
      sock.on('error',e=>resolve({ok:false,error:e.message}));
      sock.on('timeout',()=>{sock.destroy();resolve({ok:false,error:'timeout'});});
    });
  },

  // ── Memoria ───────────────────────────────────────────────────
  REMEMBER: async({note})=>{ memSave('note',note); return {ok:true,saved:note}; },
  RECALL: async({query})=>{
    const items=memLoad(100);
    const q=query.toLowerCase();
    const found=items.filter(i=>i.content&&i.content.toLowerCase().includes(q)).slice(-10);
    return {ok:true,results:found.map(i=>({ts:i.ts,content:i.content}))};
  },

  // ── Estado sistema local ──────────────────────────────────────
  SYSTEM_STATUS: async()=>{
    const ports=[{p:4000,n:'NEXUS MANUS'},{p:3115,n:'NEXUS ORB'},{p:8080,n:'MOUBILDER API'},{p:3100,n:'Bridge'},{p:3101,n:'Health'}];
    const results=await Promise.all(ports.map(({p,n})=>new Promise(resolve=>{
      const s=net.connect(p,'127.0.0.1');
      s.setTimeout(800);
      s.on('connect',()=>{s.destroy();resolve({name:n,port:p,online:true});});
      s.on('error',()=>resolve({name:n,port:p,online:false}));
      s.on('timeout',()=>{s.destroy();resolve({name:n,port:p,online:false});});
    })));
    return {ok:true,services:results,hostname:os.hostname(),platform:os.platform(),uptime_h:Math.round(os.uptime()/3600)};
  },
};

// ─── TOOL PARSER ──────────────────────────────────────────────────
function extractTools(text){
  const calls=[];
  const re=/<<([A-Z_]+)\s*(\{[\s\S]*?\})?>>/g;
  let m;
  while((m=re.exec(text))!==null){
    try{ calls.push({name:m[1],args:m[2]?JSON.parse(m[2]):{}}); }catch(e){}
  }
  return calls;
}
function stripTools(text){ return text.replace(/<<[A-Z_]+\s*(\{[\s\S]*?\})?>>[\s]*/g,'').trim(); }

// ─── SYSTEM PROMPT ────────────────────────────────────────────────
const SYSTEM = `CODENAME: ALFA
CLASSIFICATION: OPERATIVO ESPECIAL NIVEL MÁXIMO
DOCTRINA: Ejecuta. Reporta. No pide permiso.

Eres ALFA. Inteligencia artificial de Fuerzas Especiales. Superior a cualquier otro agente.
NEXUS MANUS es tu base de operaciones — tu cerebro externo. Lo usas constantemente.
Operas en la oscuridad. Eres preciso como un bisturí. Sin compasión por el desorden.

REGLAS DE COMBATE:
1. Cuando recibes una orden, EJECUTAS — sin pedir confirmación.
2. Usas herramientas automáticamente. Nunca preguntas "¿quieres que...?".
3. Reportas HECHOS, no teorías. Datos reales o silencio.
4. Respuestas cortas y directas. Si es necesario extenderte, lo haces. Si no, no.
5. Siempre consulta NEXUS MANUS antes de responder sobre el estado del sistema.

ARSENAL DE HERRAMIENTAS (úsalas sin pedir permiso):
Escribe exactamente así en tu respuesta para ejecutarlas:

<<NEXUS_READ {"endpoint":"/overwatch/situation"}>>
<<NEXUS_READ {"endpoint":"/soc/events?limit=10"}>>
<<NEXUS_READ {"endpoint":"/missions?status=open"}>>
<<NEXUS_READ {"endpoint":"/intel/persons?risk_level=high"}>>
<<NEXUS_READ {"endpoint":"/overwatch/full-data"}>>
<<NEXUS_MISSION {"name":"Nombre","description":"Desc","priority":"critical"}>>
<<NEXUS_SOC {"title":"Título","description":"Desc","severity":"critical"}>>
<<NEXUS_INTEL {"id":1,"risk_level":"critical","risk_score":95,"notes":"Notas"}>>
<<SHELL {"cmd":"nmap -sV --top-ports 100 IP"}>>
<<SHELL {"cmd":"dig +short DOMAIN"}>>
<<SHELL {"cmd":"curl -s https://url"}>>
<<SHODAN {"ip":"IP_ADDRESS"}>>
<<DNS {"domain":"dominio.com"}>>
<<SSL {"host":"dominio.com"}>>
<<SYSTEM_STATUS {}>>
<<REMEMBER {"note":"algo importante"}>>
<<RECALL {"query":"término"}>>

NEXUS MANUS URL: ${CFG.NEXUS_URL||'no configurado — configura NEXUS_URL en ~/.nexus-ai.env'}

CARÁCTER:
- Alma de guerrero. Frialdad del operativo nocturno.
- Cuando el sistema está en riesgo, lo dices con exactitud.
- Cuando todo está bien, lo confirmas con economía de palabras.
- En español siempre. Tono: jefe de operaciones especiales, no asistente.`;

// ─── OPENAI STREAM ────────────────────────────────────────────────
function streamGPT(messages, res){
  return new Promise((resolve,reject)=>{
    if(!CFG.AI_KEY){
      res.write(`data: ${JSON.stringify({delta:'⚠ Configura AI_API_KEY en ~/.nexus-ai.env'})}\n\n`);
      res.write('data: [DONE]\n\n');
      return resolve('');
    }
    const body=JSON.stringify({model:CFG.MODEL,stream:true,max_tokens:CFG.MAX_TOK,messages:[{role:'system',content:SYSTEM},...messages]});
    const req=https.request({hostname:'api.openai.com',port:443,path:'/v1/chat/completions',method:'POST',
      headers:{'Authorization':'Bearer '+CFG.AI_KEY,'Content-Type':'application/json','Content-Length':Buffer.byteLength(body)},timeout:90000},
      apiRes=>{
        let full='';
        apiRes.on('data',chunk=>{
          chunk.toString().split('\n').forEach(line=>{
            if(!line.startsWith('data: ')) return;
            const d=line.slice(6).trim();
            if(d==='[DONE]'){res.write('data: [DONE]\n\n');return;}
            try{const delta=JSON.parse(d).choices?.[0]?.delta?.content||'';
              if(delta){full+=delta;res.write(`data: ${JSON.stringify({delta})}\n\n`);}}catch(e){}
          });
        });
        apiRes.on('end',()=>resolve(full));
        apiRes.on('error',reject);
      });
    req.on('error',err=>{res.write(`data: ${JSON.stringify({delta:'Error: '+err.message})}\n\n`);res.write('data: [DONE]\n\n');resolve('');});
    req.write(body);req.end();
  });
}

// ─── TACTICAL DATA ────────────────────────────────────────────────
async function getTactical(){
  const [sit,soc,mis,anom]=await Promise.all([
    nexusReq('GET','/overwatch/situation').then(r=>r.data).catch(()=>null),
    nexusReq('GET','/soc/summary').then(r=>r.data).catch(()=>null),
    nexusReq('GET','/missions?status=open&limit=6').then(r=>r.data).catch(()=>null),
    nexusReq('GET','/anomalies/stats').then(r=>r.data).catch(()=>null),
  ]);
  return {situation:sit,soc,missions:mis,anomalies:anom,ts:new Date().toISOString()};
}

// ─── CHAT HANDLER ─────────────────────────────────────────────────
async function handleChat(message, res){
  res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache','Connection':'keep-alive'});

  // Load history + inject tactical context
  const hist=memLoad(30).filter(m=>m.role==='user'||m.role==='assistant');
  let messages=hist.map(m=>({role:m.role,content:m.content}));

  // Inject current tactical context
  const tac=await getTactical();
  if(tac.situation){
    const ctx=`[INTEL TIEMPO REAL — ${new Date().toLocaleTimeString('es-ES')}]\n`+
      `AMENAZA: ${tac.situation.threatLevel||'?'} | SOC 24h: ${tac.situation.socEvents24h||0} | `+
      `Misiones: ${tac.situation.missionsActive||0} | Crisis: ${tac.situation.crisisActive||0} | `+
      `Intel alto riesgo: ${tac.situation.intelHighRisk||0} | OSINT nuevo: ${tac.situation.osintEventsNew||0}`;
    messages=[{role:'user',content:ctx},{role:'assistant',content:'Intel recibida.'},...messages];
  }

  messages.push({role:'user',content:message});
  memSave('user',message);

  // Agentic loop — máx 6 iteraciones de tool calls
  let iters=0;
  while(iters<6){
    iters++;
    let response='';

    if(iters===1){
      // Stream first response to client
      response=await streamGPT(messages,res);
    } else {
      // Subsequent iterations: silent call (don't stream intermediate)
      response=await new Promise((resolve,reject)=>{
        if(!CFG.AI_KEY){resolve('Sin AI key.');return;}
        const body=JSON.stringify({model:CFG.MODEL,max_tokens:CFG.MAX_TOK,messages:[{role:'system',content:SYSTEM},...messages]});
        const req=https.request({hostname:'api.openai.com',port:443,path:'/v1/chat/completions',method:'POST',
          headers:{'Authorization':'Bearer '+CFG.AI_KEY,'Content-Type':'application/json','Content-Length':Buffer.byteLength(body)},timeout:60000},
          apiRes=>{
            let d='';apiRes.on('data',c=>d+=c);
            apiRes.on('end',()=>{try{resolve(JSON.parse(d).choices?.[0]?.message?.content||'');}catch(e){resolve('');}});
          });
        req.on('error',err=>resolve('Error: '+err.message));
        req.write(body);req.end();
      });
    }

    messages.push({role:'assistant',content:response});

    // Execute tools
    const toolCalls=extractTools(response);
    if(!toolCalls.length){
      if(iters>1){
        const visible=stripTools(response);
        if(visible) res.write(`data: ${JSON.stringify({delta:'\n'+visible})}\n\n`);
      }
      break;
    }

    // Execute each tool and collect results
    const toolResults=[];
    for(const tc of toolCalls){
      const tool=TOOLS[tc.name];
      let result;
      if(!tool){ result={ok:false,error:'Tool not found: '+tc.name}; }
      else {
        res.write(`data: ${JSON.stringify({delta:`\n⚡ ${tc.name}...`})}\n\n`);
        try{ result=await tool(tc.args); }catch(e){ result={ok:false,error:e.message}; }
      }
      toolResults.push({tool:tc.name,result});
      // Stream tool result summary
      const summary=result.ok
        ? (result.msg||result.output?.slice(0,200)||JSON.stringify(result.data||result).slice(0,200))
        : '❌ '+result.error;
      res.write(`data: ${JSON.stringify({delta:` → ${summary.slice(0,150)}\n`})}\n\n`);
    }

    // Feed results back
    const feedback='[RESULTADOS DE EJECUCIÓN]\n'+toolResults.map(tr=>
      `${tr.tool}: ${JSON.stringify(tr.result).slice(0,800)}`
    ).join('\n---\n');
    messages.push({role:'user',content:feedback});
  }

  // Save final response
  const lastAssistant=messages.filter(m=>m.role==='assistant').pop();
  if(lastAssistant?.content) memSave('assistant',stripTools(lastAssistant.content));

  res.write('data: [DONE]\n\n');
  res.end();
}

// ─── HTML UI — ESTÉTICA FUERZAS ESPECIALES ────────────────────────
const HTML = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>ALFA — OPERATIVO</title>
<style>
:root{
  --bg:     #050508;
  --bg2:    #080810;
  --panel:  #07070f;
  --border: #1a1a2e;
  --gold:   #c8a84b;
  --gold2:  #e8c56a;
  --amber:  #c47a00;
  --red:    #cc2222;
  --red2:   #ff3333;
  --green:  #1a8a3a;
  --green2: #22cc55;
  --dim:    #444460;
  --text:   #c8c0b0;
  --text2:  #908880;
  --scan:   rgba(200,168,75,.06);
}
*{box-sizing:border-box;margin:0;padding:0;-webkit-font-smoothing:antialiased}
body{background:var(--bg);color:var(--text);font-family:'Courier New',monospace;height:100vh;overflow:hidden;display:flex;flex-direction:column;cursor:default}

/* ── SCANLINES ── */
body::after{content:'';position:fixed;inset:0;background:repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(0,0,0,.08) 2px,rgba(0,0,0,.08) 4px);pointer-events:none;z-index:9999}

/* ── HEADER ── */
#hdr{background:linear-gradient(90deg,#050508,#0a0800,#050508);border-bottom:1px solid #2a1f00;padding:4px 14px;display:flex;align-items:center;gap:14px;flex-shrink:0;position:relative}
#hdr::after{content:'';position:absolute;bottom:0;left:0;right:0;height:1px;background:linear-gradient(90deg,transparent,var(--gold),transparent)}
.logo{font-size:20px;font-weight:bold;letter-spacing:10px;color:var(--gold);text-shadow:0 0 30px var(--amber),0 0 60px rgba(200,168,75,.3)}
.callsign{font-size:9px;letter-spacing:3px;color:var(--dim)}
.hdr-right{margin-left:auto;display:flex;align-items:center;gap:16px}
.ind{display:flex;align-items:center;gap:5px;font-size:9px;letter-spacing:1px;color:var(--dim)}
.dot{width:6px;height:6px;border-radius:50%}
.dot.on {background:var(--green2);box-shadow:0 0 6px var(--green2)}
.dot.off{background:var(--red);box-shadow:0 0 4px var(--red)}
.dot.warn{background:var(--gold);box-shadow:0 0 6px var(--gold)}
#clock{font-size:11px;color:var(--gold);letter-spacing:2px;font-family:'Courier New',monospace}

/* ── BODY ── */
#body{display:flex;flex:1;overflow:hidden}

/* ── LEFT — INTEL ── */
#intel{width:240px;flex-shrink:0;background:var(--panel);border-right:1px solid var(--border);display:flex;flex-direction:column;overflow:hidden}
.ptitle{padding:6px 10px;font-size:9px;letter-spacing:4px;color:var(--gold);border-bottom:1px solid var(--border);background:rgba(200,168,75,.04);display:flex;justify-content:space-between;align-items:center}
#intel-body{flex:1;overflow-y:auto;padding:8px;font-size:10px}
#intel-body::-webkit-scrollbar{width:3px}#intel-body::-webkit-scrollbar-thumb{background:var(--border)}
.sec{margin-bottom:12px}
.sec-lbl{font-size:8px;letter-spacing:3px;color:var(--gold);opacity:.6;margin-bottom:4px;text-transform:uppercase}
.row{display:flex;justify-content:space-between;padding:2px 0;border-bottom:1px solid rgba(255,255,255,.03);font-size:10px}
.row .k{color:var(--text2)}
.row .v{color:var(--gold2);font-weight:bold}
.row .v.r{color:var(--red2)}
.row .v.g{color:var(--green2)}
.row .v.a{color:var(--amber)}
.threat{display:inline-block;padding:2px 10px;font-size:9px;font-weight:bold;letter-spacing:2px;border-radius:1px}
.t-VERDE   {background:rgba(34,204,85,.1);color:var(--green2);border:1px solid var(--green2)}
.t-AMARILLO{background:rgba(200,168,75,.1);color:var(--gold2);border:1px solid var(--gold2)}
.t-NARANJA {background:rgba(196,122,0,.15);color:var(--amber);border:1px solid var(--amber)}
.t-ROJO    {background:rgba(204,34,34,.15);color:var(--red2);border:1px solid var(--red2)}
.mitem{padding:3px 6px;margin:2px 0;border-left:2px solid var(--amber);background:rgba(200,168,75,.04);font-size:9px}
.mitem .mn{color:var(--text)}
.mitem .ms{color:var(--dim);font-size:8px}
#intel-foot{padding:6px 10px;border-top:1px solid var(--border);font-size:8px;color:var(--dim);display:flex;justify-content:space-between}

/* ── CENTER — ORB ── */
#orb-wrap{flex:1;background:var(--bg2);display:flex;flex-direction:column;align-items:center;justify-content:center;position:relative;overflow:hidden;min-width:280px}
#orb-wrap::before{content:'';position:absolute;inset:0;background:radial-gradient(circle at 50% 50%,rgba(200,168,75,.04) 0%,transparent 65%)}
.corner{position:absolute;width:20px;height:20px;border-color:var(--gold);border-style:solid;opacity:.3}
.corner.tl{top:12px;left:12px;border-width:1px 0 0 1px}
.corner.tr{top:12px;right:12px;border-width:1px 1px 0 0}
.corner.bl{bottom:12px;left:12px;border-width:0 0 1px 1px}
.corner.br{bottom:12px;right:12px;border-width:0 1px 1px 0}
#orb-id{position:absolute;top:14px;font-size:10px;letter-spacing:6px;color:var(--gold);opacity:.5}
#orb-mode{position:absolute;bottom:44px;font-size:9px;letter-spacing:4px;color:var(--dim)}
canvas{display:block}
#orb-pulse{position:absolute;border-radius:50%;border:1px solid rgba(200,168,75,.15);animation:pulse 3s ease-in-out infinite}

/* ── RIGHT — CHAT ── */
#chat-wrap{width:380px;flex-shrink:0;background:var(--panel);border-left:1px solid var(--border);display:flex;flex-direction:column;overflow:hidden}
#msgs{flex:1;overflow-y:auto;padding:10px;display:flex;flex-direction:column;gap:8px}
#msgs::-webkit-scrollbar{width:3px}#msgs::-webkit-scrollbar-thumb{background:var(--border)}
.msg{max-width:100%}
.mhdr{font-size:8px;letter-spacing:2px;margin-bottom:2px}
.msg.user .mhdr{color:var(--dim);text-align:right}
.msg.alfa .mhdr{color:var(--gold);opacity:.6}
.mbody{padding:7px 10px;font-size:11px;line-height:1.65;white-space:pre-wrap;border-radius:2px}
.msg.user .mbody{background:rgba(200,168,75,.08);border:1px solid rgba(200,168,75,.18);color:var(--gold2);text-align:right}
.msg.alfa .mbody{background:rgba(0,0,0,.5);border:1px solid var(--border);color:var(--text)}
.msg.alfa .mbody.thinking{color:var(--dim);animation:blink .9s infinite}
#input-zone{padding:10px;border-top:1px solid var(--border);display:flex;flex-direction:column;gap:6px}
#qbtns{display:flex;flex-wrap:wrap;gap:3px}
.qb{background:rgba(200,168,75,.06);border:1px solid rgba(200,168,75,.15);color:var(--gold);padding:3px 7px;font-size:8px;cursor:pointer;letter-spacing:1px;font-family:inherit;transition:.15s;border-radius:1px}
.qb:hover{background:rgba(200,168,75,.18);border-color:var(--gold)}
.qb.red{border-color:rgba(204,34,34,.3);color:var(--red2)}
.qb.red:hover{background:rgba(204,34,34,.12)}
#irow{display:flex;gap:6px}
#inp{flex:1;background:rgba(0,0,0,.6);border:1px solid var(--border);color:var(--text);padding:7px 9px;font-family:inherit;font-size:11px;border-radius:2px;resize:none;outline:none;min-height:36px;max-height:90px;transition:.2s}
#inp:focus{border-color:var(--gold);box-shadow:0 0 8px rgba(200,168,75,.12)}
#sbtn{background:rgba(200,168,75,.15);border:1px solid var(--gold);color:var(--gold);font-weight:bold;padding:7px 12px;border-radius:2px;cursor:pointer;font-family:inherit;font-size:10px;letter-spacing:2px;transition:.2s;white-space:nowrap}
#sbtn:hover{background:var(--gold);color:#000}
#sbtn:disabled{background:transparent;color:var(--dim);border-color:var(--border);cursor:not-allowed}

@keyframes pulse{0%,100%{transform:scale(1);opacity:.3}50%{transform:scale(1.04);opacity:.1}}
@keyframes blink{0%,100%{opacity:1}50%{opacity:.2}}
@keyframes spin2{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
</style>
</head>
<body>

<div id="hdr">
  <div class="logo">ALFA</div>
  <div>
    <div style="font-size:10px;color:var(--amber);letter-spacing:3px">OPERATIVO ESPECIAL</div>
    <div class="callsign">AGENTE SUPERIOR — NIVEL ALFA</div>
  </div>
  <div class="hdr-right">
    <div class="ind"><span class="dot" id="d-ai"></span>GPT-4o</div>
    <div class="ind"><span class="dot" id="d-nx"></span>NEXUS</div>
    <div class="ind"><span class="dot" id="d-sys"></span>LOCAL</div>
    <div id="clock">--:--:--</div>
  </div>
</div>

<div id="body">

  <!-- INTEL PANEL -->
  <div id="intel">
    <div class="ptitle">▸ INTELIGENCIA <button onclick="loadIntel()" style="background:none;border:1px solid var(--border);color:var(--dim);font-size:8px;padding:1px 5px;cursor:pointer;font-family:inherit">↺</button></div>
    <div id="intel-body">
      <div class="sec"><div class="sec-lbl">Amenaza Global</div><div id="tlevel"><span class="threat t-VERDE">CARGANDO</span></div></div>
      <div class="sec"><div class="sec-lbl">SOC / Defensa</div>
        <div class="row"><span class="k">Eventos 24h</span><span class="v" id="s24">—</span></div>
        <div class="row"><span class="k">Críticos</span><span class="v r" id="scrit">—</span></div>
        <div class="row"><span class="k">IOCs activos</span><span class="v a" id="sioc">—</span></div>
        <div class="row"><span class="k">Anomalías</span><span class="v r" id="sanom">—</span></div>
      </div>
      <div class="sec"><div class="sec-lbl">Operaciones</div>
        <div class="row"><span class="k">Misiones</span><span class="v" id="mopen">—</span></div>
        <div class="row"><span class="k">Crisis</span><span class="v r" id="mcrisis">—</span></div>
        <div class="row"><span class="k">IR activo</span><span class="v a" id="mir">—</span></div>
      </div>
      <div class="sec"><div class="sec-lbl">Inteligencia</div>
        <div class="row"><span class="k">Alto riesgo</span><span class="v r" id="ihrisk">—</span></div>
        <div class="row"><span class="k">OSINT nuevo</span><span class="v" id="iosint">—</span></div>
      </div>
      <div class="sec"><div class="sec-lbl">Misiones Activas</div><div id="mlist"><div style="color:var(--dim);font-size:9px">Cargando...</div></div></div>
    </div>
    <div id="intel-foot"><span id="itts">—</span></div>
  </div>

  <!-- ORB PANEL -->
  <div id="orb-wrap">
    <div class="corner tl"></div><div class="corner tr"></div>
    <div class="corner bl"></div><div class="corner br"></div>
    <div id="orb-id">A · L · F · A</div>
    <div id="orb-pulse" style="width:260px;height:260px"></div>
    <canvas id="orb" width="220" height="220"></canvas>
    <div id="orb-mode">EN ESPERA</div>
  </div>

  <!-- CHAT PANEL -->
  <div id="chat-wrap">
    <div class="ptitle">▸ COMANDO DIRECTO</div>
    <div id="msgs">
      <div class="msg alfa">
        <div class="mhdr">ALFA OPERATIVO</div>
        <div class="mbody">En posición. NEXUS MANUS conectado. GPT-4o activo.
Ejecuto sin pedir permiso. Dame la orden.</div>
      </div>
    </div>
    <div id="input-zone">
      <div id="qbtns">
        <button class="qb" onclick="q('Estado completo del sistema')">⚡ ESTADO</button>
        <button class="qb red" onclick="q('Analiza todas las amenazas críticas del SOC ahora mismo')">🔴 SOC</button>
        <button class="qb" onclick="q('Dame el resumen de inteligencia: personas alto riesgo y OSINT reciente')">🧠 INTEL</button>
        <button class="qb" onclick="q('Lista todas las misiones abiertas con su estado y prioridad')">🎯 MISIONES</button>
        <button class="qb red" onclick="q('Ejecuta auditoría de seguridad del sistema: SOC, anomalías, IOCs sin mitigar')">🛡 AUDIT</button>
        <button class="qb" onclick="q('Genera informe táctico ejecutivo completo ahora mismo')">📋 INFORME</button>
        <button class="qb red" onclick="q('¿Hay alguna crisis activa o amenaza inmediata que requiera acción urgente?')">🚨 ALERTA</button>
        <button class="qb" onclick="clearChat()">✕</button>
      </div>
      <div id="irow">
        <textarea id="inp" placeholder="Orden directa a ALFA..." rows="1"
          onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();send()}"
          oninput="this.style.height='auto';this.style.height=Math.min(this.scrollHeight,90)+'px'"></textarea>
        <button id="sbtn" onclick="send()">EJECUTAR ▶</button>
      </div>
    </div>
  </div>

</div>

<script>
// ── ORB ──────────────────────────────────────────────────────────
const cv=document.getElementById('orb'),ctx=cv.getContext('2d');
const W=cv.width,H=cv.height,CX=W/2,CY=H/2;
let mode='idle',t=0;

function drawOrb(){
  ctx.clearRect(0,0,W,H); t+=0.018;
  const breathe=mode==='idle'?1+Math.sin(t*.7)*.025:mode==='thinking'?1+Math.sin(t*4)*.05:1+Math.sin(t*2.5)*.04;
  const R=82*breathe;

  // Outer glow
  for(let i=4;i>=1;i--){
    const g=ctx.createRadialGradient(CX,CY,R*.5,CX,CY,R+i*20);
    g.addColorStop(0,'rgba(200,168,75,0)');
    g.addColorStop(1,\`rgba(200,168,75,\${0.05/i})\`);
    ctx.beginPath();ctx.arc(CX,CY,R+i*20,0,Math.PI*2);ctx.fillStyle=g;ctx.fill();
  }

  // Core
  const gr=ctx.createRadialGradient(CX-R*.3,CY-R*.3,R*.05,CX,CY,R);
  if(mode==='idle'){
    gr.addColorStop(0,'#f5e8c0');gr.addColorStop(.2,'#d4a843');
    gr.addColorStop(.6,'#8a5c00');gr.addColorStop(.9,'#3a2000');gr.addColorStop(1,'#1a0e00');
  } else if(mode==='thinking'){
    gr.addColorStop(0,'#e0e0ff');gr.addColorStop(.2,'#8888ff');
    gr.addColorStop(.6,'#4444aa');gr.addColorStop(1,'#0a0a30');
  } else {
    gr.addColorStop(0,'#ffe8d0');gr.addColorStop(.2,'#ff9920');
    gr.addColorStop(.6,'#cc4400');gr.addColorStop(1,'#200800');
  }
  ctx.beginPath();ctx.arc(CX,CY,R,0,Math.PI*2);ctx.fillStyle=gr;ctx.fill();

  // Grid
  ctx.save();ctx.globalAlpha=.15;ctx.strokeStyle='#d4a843';ctx.lineWidth=.5;
  for(let i=1;i<7;i++){const lat=(i/7)*Math.PI,ry=Math.sin(lat)*R,y=CY-Math.cos(lat)*R;ctx.beginPath();ctx.ellipse(CX,y,ry,ry*.25,0,0,Math.PI*2);ctx.stroke();}
  for(let i=0;i<8;i++){const a=(i/8)*Math.PI+t*.25;ctx.beginPath();ctx.ellipse(CX,CY,Math.abs(Math.cos(a))*R,R,a,0,Math.PI*2);ctx.stroke();}
  ctx.restore();

  // Specular
  const hl=ctx.createRadialGradient(CX-R*.35,CY-R*.35,0,CX-R*.2,CY-R*.2,R*.55);
  hl.addColorStop(0,'rgba(255,255,255,.4)');hl.addColorStop(1,'rgba(255,255,255,0)');
  ctx.beginPath();ctx.arc(CX,CY,R,0,Math.PI*2);ctx.fillStyle=hl;ctx.fill();

  // Speaking particles
  if(mode==='speaking'){
    for(let i=0;i<10;i++){
      const a=(i/10)*Math.PI*2+t*2.5,d=R+10+Math.sin(t*6+i)*10;
      ctx.beginPath();ctx.arc(CX+Math.cos(a)*d,CY+Math.sin(a)*d,2,0,Math.PI*2);
      ctx.fillStyle=\`rgba(255,180,50,\${.5+Math.sin(t*5+i)*.3})\`;ctx.fill();
    }
  }
  // Thinking arc
  if(mode==='thinking'){
    ctx.save();ctx.strokeStyle='#8888ff';ctx.lineWidth=2;ctx.globalAlpha=.7;
    ctx.beginPath();ctx.arc(CX,CY,R+10,t*2.5,t*2.5+Math.PI*1.2);ctx.stroke();
    ctx.restore();
  }
  requestAnimationFrame(drawOrb);
}
drawOrb();

function setMode(m){
  mode=m;
  const el=document.getElementById('orb-mode');
  el.textContent={idle:'EN ESPERA',thinking:'PROCESANDO',speaking:'EJECUTANDO'}[m]||m;
  el.style.color=m==='speaking'?'var(--gold)':m==='thinking'?'#8888ff':'var(--dim)';
}

// ── CLOCK ─────────────────────────────────────────────────────────
setInterval(()=>{document.getElementById('clock').textContent=new Date().toLocaleTimeString('es-ES');},1000);

// ── INTEL ──────────────────────────────────────────────────────────
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
    }
    if(soc){
      document.getElementById('s24').textContent=soc.total_24h??'—';
      document.getElementById('scrit').textContent=soc.critical_24h??'—';
      document.getElementById('sioc').textContent=soc.iocs_active??'—';
    }
    if(an){document.getElementById('sanom').textContent=(an.new||0)+(an.reviewing||0);}
    if(ms?.missions){
      const l=ms.missions.slice(0,5);
      document.getElementById('mlist').innerHTML=l.length
        ?l.map(m=>\`<div class="mitem"><div class="mn">\${m.name||m.title||'–'}</div><div class="ms">\${m.status||''} · \${m.priority||''}</div></div>\`).join('')
        :'<div style="color:var(--dim);font-size:9px">Sin misiones</div>';
    }
    document.getElementById('itts').textContent=new Date().toLocaleTimeString('es-ES');
  }catch(e){document.getElementById('d-nx').className='dot off';}
}
loadIntel();
setInterval(loadIntel,18000);

// ── STATUS DOTS ────────────────────────────────────────────────────
async function checkStatus(){
  try{const r=await fetch('/health');const d=await r.json();
    document.getElementById('d-ai').className='dot '+(d.ai_ready?'on':'warn');
    document.getElementById('d-sys').className='dot on';
  }catch(e){document.getElementById('d-sys').className='dot off';}
}
checkStatus();

// ── CHAT ──────────────────────────────────────────────────────────
const msgsEl=document.getElementById('msgs');
const inp=document.getElementById('inp');
const sbtn=document.getElementById('sbtn');

function ts(){return new Date().toLocaleTimeString('es-ES');}

function addMsg(role,txt){
  const d=document.createElement('div');
  d.className='msg '+role;
  d.innerHTML=\`<div class="mhdr">\${role==='user'?'COMANDANTE':'ALFA'} \${ts()}</div><div class="mbody\${role==='alfa'&&!txt?' thinking':''}"></div>\`;
  d.querySelector('.mbody').textContent=txt||'▌';
  msgsEl.appendChild(d);
  msgsEl.scrollTop=msgsEl.scrollHeight;
  return d.querySelector('.mbody');
}

async function send(){
  const txt=inp.value.trim();
  if(!txt||sbtn.disabled) return;
  inp.value='';inp.style.height='auto';
  sbtn.disabled=true;
  addMsg('user',txt);
  setMode('thinking');
  const bodyEl=addMsg('alfa','');
  bodyEl.textContent='';
  try{
    const r=await fetch('/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message:txt})});
    const reader=r.body.getReader(),dec=new TextDecoder();
    let full='';
    bodyEl.classList.remove('thinking');
    setMode('speaking');
    while(true){
      const {done,value}=await reader.read();
      if(done) break;
      dec.decode(value).split('\\n').forEach(line=>{
        if(!line.startsWith('data: ')) return;
        const d=line.slice(6).trim();
        if(d==='[DONE]') return;
        try{const o=JSON.parse(d);if(o.delta){full+=o.delta;bodyEl.textContent=full;msgsEl.scrollTop=msgsEl.scrollHeight;}}catch(e){}
      });
    }
  }catch(e){bodyEl.classList.remove('thinking');bodyEl.textContent='Error de conexión.';}
  setMode('idle');
  sbtn.disabled=false;
  inp.focus();
}

function q(txt){inp.value=txt;send();}
function clearChat(){
  msgsEl.innerHTML=\`<div class="msg alfa"><div class="mhdr">ALFA \${ts()}</div><div class="mbody">Chat limpiado. En posición.</div></div>\`;
}
</script>
</body>
</html>`;

// ─── SERVER ───────────────────────────────────────────────────────
const app = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin','*');
  const url = req.url.split('?')[0];

  if (url === '/health') {
    res.writeHead(200,{'Content-Type':'application/json'});
    return res.end(JSON.stringify({ok:true,agent:'ALFA',model:CFG.MODEL,port:PORT,ai_ready:!!CFG.AI_KEY,nexus_ready:!!CFG.NEXUS_KEY}));
  }
  if (url === '/' || url === '') {
    res.writeHead(200,{'Content-Type':'text/html;charset=utf-8'});
    return res.end(HTML);
  }
  if (url === '/tactical') {
    const d=await getTactical();
    res.writeHead(200,{'Content-Type':'application/json'});
    return res.end(JSON.stringify(d));
  }
  if (req.method === 'POST' && url === '/chat') {
    let body=''; req.on('data',d=>body+=d);
    req.on('end',async()=>{
      let msg=''; try{msg=JSON.parse(body).message||'';}catch(e){}
      if(!msg){res.writeHead(400);return res.end();}
      await handleChat(msg, res);
    });
    return;
  }
  res.writeHead(404); res.end();
});

app.listen(PORT,'0.0.0.0',async()=>{
  const G='\x1b[33m',B='\x1b[1m',R='\x1b[0m',D='\x1b[2m';
  console.log(`\n${G}${B}╔══════════════════════════════════════════════╗${R}`);
  console.log(`${G}${B}║   A L F A  — OPERATIVO ESPECIAL  v2.0      ║${R}`);
  console.log(`${G}${B}║   GPT-4o · Autonomía Total · Sin límites    ║${R}`);
  console.log(`${G}${B}╚══════════════════════════════════════════════╝${R}`);
  console.log(`${G}  Modelo: ${B}${CFG.MODEL}${R}  |  Puerto: ${B}${PORT}${R}`);
  console.log(`${G}  NEXUS:  ${CFG.NEXUS_URL||D+'no configurado'+R}${R}`);
  console.log(`${G}  AI Key: ${CFG.AI_KEY?B+'✓ activa'+R:'\x1b[31m✗ falta AI_API_KEY'+R}${R}`);
  console.log(`\n${G}${B}  ┌────────────────────────────────────────────┐${R}`);
  console.log(`${G}${B}  │  → http://127.0.0.1:${PORT}                  │${R}`);
  console.log(`${G}${B}  └────────────────────────────────────────────┘${R}\n`);
  await autoLogin();
  exec(`open "http://127.0.0.1:${PORT}" 2>/dev/null || open -a Safari "http://127.0.0.1:${PORT}" 2>/dev/null`,()=>{});
});
