#!/bin/bash
# ═══════════════════════════════════════════════════════════════════
#  ALFA — Instalador v2.0
#  Instala ALFA, dependencias, crea ejecutable real en ~/bin
# ═══════════════════════════════════════════════════════════════════
GOLD='\033[0;33m'; BOLD='\033[1m'; GREEN='\033[0;32m'
CYAN='\033[0;36m'; RED='\033[0;31m'; YELLOW='\033[1;33m'; NC='\033[0m'

NEXUS_ROOT="$HOME/nexus"
ALFA_REPO="https://github.com/mouinzammel-dotcom/nexus-alfa.git"
ALFA_DIR="$NEXUS_ROOT/nexus-alfa"
BIN_DIR="$HOME/bin"

echo ""
echo -e "${GOLD}${BOLD}╔══════════════════════════════════════════════╗${NC}"
echo -e "${GOLD}${BOLD}║   A L F A  — Instalador v2.0                ║${NC}"
echo -e "${GOLD}${BOLD}║   Agente Superior de IA Táctica             ║${NC}"
echo -e "${GOLD}${BOLD}╚══════════════════════════════════════════════╝${NC}"
echo ""

# ── Comprobaciones ──────────────────────────────────────────────
command -v node &>/dev/null || { echo -e "${RED}❌ Node.js no encontrado. Instala con: brew install node${NC}"; exit 1; }
command -v git  &>/dev/null || { echo -e "${RED}❌ Git no encontrado${NC}"; exit 1; }
echo -e "${GREEN}✅ Node.js $(node -v) | Git $(git --version | cut -d' ' -f3)${NC}"

# ── Clonar o actualizar ──────────────────────────────────────────
mkdir -p "$NEXUS_ROOT"
if [ -d "$ALFA_DIR/.git" ]; then
  echo -e "${CYAN}◈ Actualizando ALFA desde GitHub...${NC}"
  git -C "$ALFA_DIR" pull --ff-only 2>&1 || git -C "$ALFA_DIR" pull
else
  echo -e "${CYAN}◈ Clonando ALFA desde GitHub...${NC}"
  git clone "$ALFA_REPO" "$ALFA_DIR"
fi
echo -e "${GREEN}✅ ALFA en $ALFA_DIR${NC}"

# ── npm install ──────────────────────────────────────────────────
echo -e "${CYAN}◈ Instalando dependencias npm...${NC}"
cd "$ALFA_DIR"
npm install --silent 2>/dev/null || npm install
echo -e "${GREEN}✅ Dependencias instaladas${NC}"

# ── Crear ejecutable real en ~/bin/alfa ──────────────────────────
mkdir -p "$BIN_DIR"
cat > "$BIN_DIR/alfa" << SCRIPT
#!/bin/bash
ALFA_PORT=\${ALFA_PORT:-3120}
cd "$ALFA_DIR"
node alfa.js &
ALFA_PID=\$!
sleep 1
if kill -0 \$ALFA_PID 2>/dev/null; then
  echo -e "\033[0;33m✅ ALFA corriendo en http://127.0.0.1:\${ALFA_PORT}\033[0m"
  open "http://127.0.0.1:\${ALFA_PORT}" 2>/dev/null || true
  wait \$ALFA_PID
fi
SCRIPT
chmod +x "$BIN_DIR/alfa"
echo -e "${GREEN}✅ Ejecutable creado: $BIN_DIR/alfa${NC}"

# ── Asegurar ~/bin en PATH + alias en shell ──────────────────────
for RC in "$HOME/.zshrc" "$HOME/.bash_profile" "$HOME/.bashrc"; do
  [ -f "$RC" ] || continue

  # Limpiar entradas viejas
  grep -v 'alias alfa=' "$RC" | grep -v 'alias nexus-alfa=' | grep -v '# ── ALFA' > /tmp/_rc_tmp 2>/dev/null && mv /tmp/_rc_tmp "$RC" || true

  # Añadir ~/bin al PATH si no está
  if ! grep -q 'export PATH.*HOME/bin' "$RC" 2>/dev/null; then
    echo '' >> "$RC"
    echo '# ── ~/bin en PATH (ALFA y otros ejecutables locales)' >> "$RC"
    echo 'export PATH="$HOME/bin:$PATH"' >> "$RC"
  fi

  # Añadir alias explícitos con ruta absoluta (sin variables, sin comillas simples problemáticas)
  echo '' >> "$RC"
  echo '# ── ALFA aliases ──────────────────────────────────────────' >> "$RC"
  echo "alias alfa='$BIN_DIR/alfa'" >> "$RC"
  echo "alias nexus-alfa='$BIN_DIR/alfa'" >> "$RC"
  echo -e "${GREEN}✅ Aliases en $RC${NC}"
  break
done

# Añadir $HOME/bin a PATH en esta sesión también
export PATH="$BIN_DIR:$PATH"

# ── Integrar en nexus-start si existe ───────────────────────────
START_ALL="$NEXUS_ROOT/nexus-ai-mac/start-all.sh"
[ -f "$NEXUS_ROOT/start-all.sh" ] && START_ALL="$NEXUS_ROOT/start-all.sh"
if [ -f "$START_ALL" ] && ! grep -q "nexus-alfa/alfa.js" "$START_ALL" 2>/dev/null; then
  echo -e "${CYAN}◈ Integrando ALFA en nexus-start...${NC}"
  cat >> "$START_ALL" << ADDALF

# ── ALFA (puerto 3120) ─────────────────────────────────────────
if [ -f "$ALFA_DIR/alfa.js" ]; then
  if ! lsof -i :3120 &>/dev/null; then
    mkdir -p "\$HOME/.nexus-logs"
    ALFA_PORT=3120 nohup node "$ALFA_DIR/alfa.js" > "\$HOME/.nexus-logs/alfa.log" 2>&1 &
    echo \$! > "\$HOME/.nexus-logs/alfa.pid"
    sleep 2 && lsof -i :3120 &>/dev/null && echo -e "\033[0;33m✅ ALFA listo en :3120\033[0m" || true
  else
    echo -e "\033[0;33m✅ ALFA ya corre en :3120\033[0m"
  fi
fi
ADDALF
  echo -e "${GREEN}✅ ALFA añadido a nexus-start${NC}"
fi

# ── Resumen final ────────────────────────────────────────────────
echo ""
echo -e "${GOLD}${BOLD}╔══════════════════════════════════════════════╗${NC}"
echo -e "${GOLD}${BOLD}║  ✅ ALFA INSTALADO Y LISTO                  ║${NC}"
echo -e "${GOLD}${BOLD}╚══════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${YELLOW}Para usar AHORA mismo (sin recargar):${NC}"
echo ""
echo -e "  ${BOLD}$BIN_DIR/alfa${NC}    → arrancar ALFA ahora mismo"
echo ""
echo -e "${YELLOW}Después de recargar terminal (${NC}source ~/.zshrc${YELLOW}):${NC}"
echo -e "  ${BOLD}alfa${NC}             → arrancar ALFA"
echo -e "  ${BOLD}nexus-start${NC}      → arrancar NEXUS + ORB + ALFA"
echo ""
echo -e "${CYAN}Panel ALFA:${NC} http://127.0.0.1:3120"
echo ""
echo -e "${GOLD}── Para arrancar ahora mismo: ──────────────────────${NC}"
echo -e "  ${BOLD}$BIN_DIR/alfa${NC}"
echo ""
