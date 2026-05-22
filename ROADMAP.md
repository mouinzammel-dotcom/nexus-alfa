# ALFA — OVERWATCH COMMAND
## Arquitectura Técnica y Roadmap

**Versión actual:** v3.0  
**Estado:** Operativo — Multi-motor, multi-agente, autonomía total

---

## Arquitectura General

```
┌──────────────────────────────────────────────────────────────────┐
│                    ALFA OVERWATCH COMMAND                        │
│              (Node.js · Puerto 3120 · Multi-motor)               │
├──────────────────┬───────────────────┬───────────────────────────┤
│   AI ENGINES     │   TOOL SYSTEM     │   NEXUS BRAIN             │
│                  │                   │                           │
│  OpenAI GPT-4o   │  NEXUS_READ/WRITE │  SOC + WAR ROOM           │
│  Claude Sonnet   │  SHELL (whitelist)│  INTEL DB + OSINT         │
│  Gemini Pro      │  SHODAN + CENSYS  │  MISSIONS + IR            │
│  Ollama (local)  │  DNS + SSL + WHOIS│  THREAT INTEL             │
│  [GPT-5 futuro]  │  PORT_SCAN        │  ANOMALIES + HUNT         │
│                  │  FILE_READ/LIST   │  OVERWATCH REPORTS        │
│  AUTO-ROUTING:   │  CLIPBOARD        │                           │
│  task → engine   │  NOTIFY (Mac)     │  NEXUS AI MAC             │
│                  │  OPEN_APP         │  ORB + VOZ + TERMINAL     │
│                  │  MEMORY (JSONL)   │                           │
└──────────────────┴───────────────────┴───────────────────────────┘
```

---

## Motores IA — Estado Actual

| Motor | Estado | Config | Mejor para |
|---|---|---|---|
| OpenAI GPT-4o | ✅ Implementado | `AI_API_KEY` | General, seguridad, planning |
| Claude Sonnet | ✅ Implementado | `CLAUDE_API_KEY` | Código, análisis largo |
| Gemini Pro | ✅ Implementado | `GEMINI_API_KEY` | Documentos, contexto largo |
| Ollama (local) | ✅ Implementado | Port 11434 | Offline, privacidad |
| Whisper (voz→texto) | 🔶 Roadmap v4 | — | Comandos de voz |
| Vision/OCR local | 🔶 Roadmap v4 | Tesseract | Imágenes, capturas |
| Embeddings local | 🔶 Roadmap v5 | — | RAG, búsqueda semántica |

---

## Routing Automático por Tarea

```
mensaje → detectTaskType() → selección engine + system prompt específico

code     → Claude (si disponible) → GPT-4o
security → GPT-4o
document → Gemini (si disponible) → GPT-4o  
osint    → GPT-4o
planning → GPT-4o
memory   → cualquier engine disponible
general  → engine primario configurado
```

---

## Tools Implementadas (v3.0)

### NEXUS MANUS (cerebro táctico)
| Tool | Función |
|---|---|
| `NEXUS_READ` | GET cualquier endpoint de NEXUS MANUS |
| `NEXUS_WRITE` | POST/PUT cualquier endpoint |
| `NEXUS_MISSION` | Crear misión táctica |
| `NEXUS_SOC` | Crear evento SOC/SIEM |
| `NEXUS_INTEL` | Actualizar riesgo de persona Intel |
| `NEXUS_HUNT` | Disparar threat hunting |
| `NEXUS_REPORT` | Obtener último informe táctico |

### Sistema y Red
| Tool | Función |
|---|---|
| `SHELL` | Ejecutar comandos (whitelist segura) |
| `SYSTEM_STATUS` | Estado de todos los servicios |
| `PORT_SCAN` | Escanear puertos locales/remotos |
| `SHODAN` | Host lookup + búsqueda (activos propios) |
| `CENSYS` | Búsqueda en Censys |
| `DNS` | Resolución completa (A/AAAA/MX/NS/TXT/CNAME/SOA) |
| `SSL` | Auditoría TLS (proto, cipher, días restantes) |
| `WHOIS` | WHOIS de dominio |

### Mac (automatización local)
| Tool | Función |
|---|---|
| `CLIPBOARD_READ` | Leer portapapeles |
| `CLIPBOARD_WRITE` | Escribir portapapeles |
| `NOTIFY` | Notificación macOS |
| `OPEN_APP` | Abrir aplicación |
| `FILE_READ` | Leer archivo (PDF/Word/imagen OCR/texto) |
| `FILE_LIST` | Listar directorio |

### Memoria
| Tool | Función |
|---|---|
| `REMEMBER` | Guardar nota (normal o crítica ⭐) |
| `RECALL` | Buscar en historial por texto |
| `MEMORY_CRITICAL` | Ver notas críticas permanentes |
| `SET_ENGINE` | Cambiar motor IA en tiempo real |

---

## Archivos en Disco (Mac)

```
~/.nexus-ai.env           # Config: API keys, NEXUS_URL, motores
~/.alfa-memory.jsonl      # Historial completo de conversación
~/.alfa-memory-critical.jsonl  # Notas críticas permanentes (nunca borrar)
~/.alfa-log.jsonl         # Log de todas las acciones y tools ejecutadas
~/nexus/nexus-alfa/       # Código fuente (actualizable con git pull)
```

---

## Variables de Configuración (~/.nexus-ai.env)

```bash
# Motor principal
ALFA_ENGINE=openai        # openai | claude | gemini | ollama

# OpenAI
AI_API_KEY=sk-...

# Claude (Anthropic)
CLAUDE_API_KEY=sk-ant-...

# Gemini (Google)
GEMINI_API_KEY=AI...

# Ollama local
OLLAMA_MODEL=llama3.2     # o: mistral, deepseek-r1, codellama

# NEXUS MANUS
NEXUS_URL=https://...replit.dev
NEXUS_API_KEY=...         # se rellena automático con auto-login
NEXUS_USER=operador1
NEXUS_PASS=...

# OSINT (activos propios)
SHODAN_API_KEY=...
CENSYS_API_ID=...
CENSYS_API_SECRET=...

# Puerto ALFA
ALFA_PORT=3120
```

---

## ROADMAP — Fases

### ✅ FASE 1 — Base Operativa (COMPLETO — v1/v2)
- [x] Servidor Node.js puerto 3120
- [x] GPT-4o con streaming SSE
- [x] Orb dorada 3 paneles
- [x] Conexión NEXUS MANUS
- [x] Tools básicas: NEXUS, SHELL, SHODAN, DNS, SSL
- [x] Memoria JSONL persistente
- [x] Auto-login NEXUS MANUS

### ✅ FASE 2 — Multi-Motor + Ampliación (COMPLETO — v3)
- [x] Multi-engine: OpenAI + Claude + Gemini + Ollama
- [x] Auto-routing por tipo de tarea
- [x] System prompts especializados por modo
- [x] 28 tools implementadas
- [x] Logging completo de acciones (`~/.alfa-log.jsonl`)
- [x] Panel de motores en UI (cambio en tiempo real)
- [x] Memoria crítica permanente
- [x] Integración completa NEXUS MANUS (7 tools)
- [x] Mac automation (clipboard, notify, open app, filesystem)

### 🔶 FASE 3 — Agentes Especializados (Próxima)
**Objetivo: Agentes con personalidad y función específica**

- [ ] `SOC_AGENT` — Monitorización continua SOC, alertas automáticas cada N min
- [ ] `OSINT_AGENT` — Escaneo periódico de footprint propio
- [ ] `CODE_AGENT` — Revisión de código, detección de bugs, sugerencias
- [ ] `NETWORK_AGENT` — Monitor de red local, detección de dispositivos nuevos
- [ ] `CAMERA_AGENT` — Monitorización cámaras NEXUS MANUS
- [ ] `IR_AGENT` — Respuesta a incidentes, playbooks automáticos

**Stack necesario:**
```
- Worker system: setInterval + job queue (node-cron o similar)
- Event bus: EventEmitter para comunicación inter-agente
- Agent registry: Map con agentes activos y su estado
- WebSocket: reemplazar SSE para bidireccional real-time
```

### 🔶 FASE 4 — Voz + Visión (Siguiente)
**Objetivo: Entrada/salida multimodal**

- [ ] Whisper API (OpenAI) — voz→texto desde browser
- [ ] TTS — texto→voz respuesta (OpenAI TTS o Coqui local)
- [ ] Vision — análisis de imágenes/capturas (GPT-4o Vision)
- [ ] OCR mejorado — tesseract local + Vision API
- [ ] Comandos de voz con detección de keyword ("Alfa...")

**Stack necesario:**
```
- MediaRecorder API (browser) → WebM → Whisper
- Web Audio API para TTS reproducción
- Canvas/ImageData para captures
```

### 🔷 FASE 5 — RAG + Vector DB (Futuro)
**Objetivo: Memoria semántica avanzada**

- [ ] ChromaDB local (Docker) para embeddings
- [ ] Indexación automática de conversaciones y documentos
- [ ] Búsqueda semántica (no solo keyword)
- [ ] Ingesta de PDFs, correos, notas en vector store
- [ ] Contexto de larga duración (>100k tokens efectivos)

**Stack necesario:**
```
- ChromaDB o LanceDB (local, sin servidor)
- text-embedding-3-small (OpenAI) o nomic-embed-text (Ollama)
- chunking: 512 tokens, overlap 50
```

### 🔷 FASE 6 — React + Vite Frontend (Futuro)
**Objetivo: UI profesional como aplicación web completa**

- [ ] Migrar HTML embebido a React + Vite
- [ ] Componentes modulares por panel
- [ ] Estado global (Zustand o Jotai)
- [ ] WebSocket para actualizaciones en tiempo real
- [ ] Dashboard táctico responsive (mobile ready)
- [ ] Dark theme militar con Tailwind CSS
- [ ] Mapas interactivos (Leaflet) para GEOINT

### 🔷 FASE 7 — LangGraph Multi-Agente (Futuro avanzado)
**Objetivo: Orquestación profesional de agentes**

- [ ] Grafos de agentes con LangGraph.js (o Python)
- [ ] Agentes con estado persistente
- [ ] Supervisión: Commander agent coordina subagentes
- [ ] Planner: descompone misiones en subtareas
- [ ] Retry automático con fallback
- [ ] MCP (Model Context Protocol) compatible

---

## Seguridad y Auditoría

Principios:
1. **Solo activos propios** — SHODAN/CENSYS/NMAP solo sobre IPs/dominios autorizados
2. **Whitelist de comandos** — SHELL solo ejecuta binarios de lista aprobada
3. **Log completo** — toda acción queda en `~/.alfa-log.jsonl`
4. **Confirmación en crítico** — acciones destructivas requieren confirmación explícita
5. **Sin auto-modificación** — ALFA no modifica su propio código
6. **Sin ofensivo** — cero ataques contra terceros, nunca

---

## Deployment y Actualización

```bash
# Instalar
curl -fsSL https://raw.githubusercontent.com/mouinzammel-dotcom/nexus-alfa/main/install-alfa.sh | bash

# Actualizar (git pull)
cd ~/nexus/nexus-alfa && git pull && killall -9 node && alfa

# Iniciar
alfa                    # abre http://127.0.0.1:3120
nexus-start             # inicia NEXUS MANUS + ORB + ALFA

# Ver logs
tail -f ~/.alfa-log.jsonl | jq .
```

---

## Integración con Ecosistema NEXUS

```
MOUBILDER (Mac local)
    ↓ Bridge Agent (3100)
NEXUS AI MAC (3115 orb, 3116 voz)
    ↓ comparte ~/.nexus-ai.env
ALFA (3120) ←→ NEXUS MANUS CLOUD (4000/Replit)
    ↓ logs en ~/.alfa-log.jsonl
NEXUS GUARD (LaunchAgent) — vigilancia 24/7
```

Todos comparten:
- `~/.nexus-ai.env` — configuración unificada
- `NEXUS_URL` + `NEXUS_API_KEY` — acceso al cerebro táctico
- GitHub — actualización centralizada

---

*Última actualización: 2026-05-22 | ALFA v3.0 | OVERWATCH COMMAND*
