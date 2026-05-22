#!/bin/bash
# ═══════════════════════════════════════════════════════════════════
#  ALFA — Instalador v1.0
#  Clona ALFA desde GitHub y configura el alias
# ═══════════════════════════════════════════════════════════════════
set -euo pipefail
CYAN='\033[0;36m'; BOLD='\033[1m'; GREEN='\033[0;32m'
YELLOW='\033[1;33m'; RED='\033[0;31m'; GOLD='\033[0;33m'; NC='\033[0m'

NEXUS_ROOT="$HOME/nexus"
ALFA_REPO="https://github.com/mouinzammel-dotcom/nexus-alfa.git"
ALFA_DIR="$NEXUS_ROOT/nexus-alfa"

echo ""
echo -e "${GOLD}${BOLD}╔══════════════════════════════════════════════╗${NC}"
echo -e "${GOLD}${BOLD}║   A L F A  — Instalador v1.0                ║${NC}"
echo -e "${GOLD}${BOLD}║   Agente Superior de IA Táctica             ║${NC}"
echo -e "${GOLD}${BOLD}╚══════════════════════════════════════════════╝${NC}"
echo ""

command -v node &>/dev/null || { echo -e "${RED}❌ Node.js no encontrado${NC}"; exit 1; }
command -v git  &>/dev/null || { echo -e "${RED}❌ Git no encontrado${NC}"; exit 1; }

mkdir -p "$NEXUS_ROOT"

# Clonar o actualizar
if [ -d "$ALFA_DIR/.git" ]; then
  echo -e "${CYAN}◈ Actualizando ALFA desde GitHub...${NC}"
  cd "$ALFA_DIR" && git pull --ff-only
else
  echo -e "${CYAN}◈ Clonando ALFA desde GitHub...${NC}"
  git clone "$ALFA_REPO" "$ALFA_DIR"
fi
echo -e "${GREEN}✅ ALFA instalado en $ALFA_DIR${NC}"

# Añadir alias alfa al shell
for RC in "$HOME/.zshrc" "$HOME/.bash_profile" "$HOME/.bashrc"; do
  if [ -f "$RC" ]; then
    sed -i '' '/alias alfa=/d;/alias nexus-alfa=/d' "$RC" 2>/dev/null || true
    cat >> "$RC" << ALFAEOF
# ── ALFA aliases ──────────────────────────────────────────
alias alfa='node $ALFA_DIR/alfa.js'
alias nexus-alfa='node $ALFA_DIR/alfa.js'
ALFAEOF
    echo -e "${GREEN}✅ Alias añadidos a $RC${NC}"
    break
  fi
done

# Añadir alfa a start-all.sh si existe
START_ALL="$NEXUS_ROOT/start-all.sh"
if [ -f "$START_ALL" ] && ! grep -q "alfa.js" "$START_ALL" 2>/dev/null; then
  echo -e "${CYAN}◈ Integrando ALFA en nexus-start...${NC}"
  cat >> "$START_ALL" << 'ADDALF'

# ── ALFA (puerto 3120) ─────────────────────────────────────
if [ -f "$HOME/nexus/nexus-alfa/alfa.js" ]; then
  if ! lsof -i :3120 &>/dev/null; then
    ALFA_PORT=3120 nohup node "$HOME/nexus/nexus-alfa/alfa.js" > "$HOME/.nexus-logs/alfa.log" 2>&1 &
    echo $! > "$HOME/.nexus-logs/alfa.pid"
    sleep 2
    lsof -i :3120 &>/dev/null && echo -e "\033[0;32m✅ ALFA listo en :3120\033[0m" || true
  else
    echo -e "\033[0;32m✅ ALFA ya corre en :3120\033[0m"
  fi
fi
ADDALF
  echo -e "${GREEN}✅ ALFA añadido a nexus-start${NC}"
fi

echo ""
echo -e "${GOLD}${BOLD}╔══════════════════════════════════════════════╗${NC}"
echo -e "${GOLD}${BOLD}║  ✅ ALFA INSTALADO                           ║${NC}"
echo -e "${GOLD}${BOLD}╚══════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${YELLOW}Recarga el terminal:${NC}  source ~/.zshrc"
echo ""
echo -e "${GOLD}Comandos:${NC}"
echo -e "  ${BOLD}alfa${NC}          → Arranca ALFA (abre browser en :3120)"
echo -e "  ${BOLD}nexus-start${NC}   → Arranca NEXUS MANUS + ORB + ALFA juntos"
echo ""
echo -e "${CYAN}Panel ALFA:${NC} http://127.0.0.1:3120"
echo ""
