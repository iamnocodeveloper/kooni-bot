#!/usr/bin/env bash
# =============================================================================
# KOONI — asistente de configuración e instalación
# -----------------------------------------------------------------------------
# Como el `npx kooni-bot init`:
#   1. TE PREGUNTA la configuración (una pregunta a la vez, en español):
#      • slug y nombre del bot   • negocio   • idioma   • tier (free/pro)
#      • proveedor de IA (Claude/GPT/Grok/gateway) + TU API key (oculta)
#      • contraseña del panel    • datos del negocio (horario, servicios…)
#   2. ESCRIBE las variables por ti: .dev.vars (secrets), wrangler.toml
#      ([vars] + nombre del worker) y member/config.local.ts (negocio).
#   3. SIGUE el proceso de integración:
#      local  → corre la prueba automática (scripts/test-local.sh)
#      deploy → Cloudflare: login, recursos (D1/Vectorize/R2), secrets,
#               migraciones, deploy y te entrega la URL del panel.
#
# Uso:
#   bash scripts/kooni-init.sh [config|local|deploy]
#     config → solo configura (no prueba ni despliega)
#     local  → configura + prueba local        (default)
#     deploy → configura + despliega en Cloudflare
#
# Modo silencioso (para automatización/CI): KOONI_SILENT=1 + variables KOONI_*.
# =============================================================================
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

MODE="${1:-local}"
SILENT="${KOONI_SILENT:-0}"

# ── helpers ──────────────────────────────────────────────────────────────────
ask()    { # ask <var> <pregunta> [default]
  local __v="$1" __q="$2" __d="${3:-}"
  if [ "$SILENT" = "1" ]; then eval "$__v=\"\${${__v}:-}\""; return; fi
  local __prompt="  $__q"
  [ -n "$__d" ] && __prompt="$__prompt [$__d]"
  read -r -p "$__prompt: " "$__v" || true
  [ -z "${!__v:-}" ] && eval "$__v='$__d'"
}
ask_secret() { # ask_secret <var> <pregunta>
  local __v="$1" __q="$2"
  if [ "$SILENT" = "1" ]; then eval "$__v=\"\${${__v}:-}\""; return; fi
  read -s -r -p "  $__q: " "$__v"; echo ""
}
confirm() { # confirm <pregunta> → 0 sí / 1 no
  if [ "$SILENT" = "1" ]; then return 0; fi
  local r
  read -r -p "  $1 (s/N): " r || true
  [ "${r,,}" = "s" ] || [ "${r,,}" = "si" ] || [ "${r,,}" = "y" ] || [ "${r,,}" = "yes" ]
}
info() { echo "── $1"; }
ok()   { echo "  ✅ $1"; }
warn() { echo "  ⚠️  $1"; }

echo ""
echo "══════════════════════════════════════════════════════"
echo "  🔨 KOONI · asistente de configuración"
echo "  (te pregunta, tú contestas, él escribe)"
echo "══════════════════════════════════════════════════════"

# ── 1. CONFIGURACIÓN ─────────────────────────────────────────────────────────
info "1. Configuración del bot"

ask KOONI_SLUG "${KOONI_SLUG:-slug del bot (corto, ej. mi-negocio)}" "mi-negocio"
KOONI_SLUG="$(echo "$KOONI_SLUG" | tr '[:upper:]' '[:lower:]' | tr ' ' '-' | tr -cd 'a-z0-9-')"
[ -n "$KOONI_SLUG" ] || KOONI_SLUG="mi-negocio"

ask KOONI_BUSINESS_NAME "${KOONI_BUSINESS_NAME:-nombre del negocio}" ""
ask KOONI_BOT_NAME "${KOONI_BOT_NAME:-cómo se llama tu asistente (ej. Asistente)}" "Asistente"
ask KOONI_LANGUAGE "${KOONI_LANGUAGE:-idioma del bot (es | en | pt-BR)}" "es"
ask KOONI_TIER "${KOONI_TIER:-plan (free | pro)}" "free"

# Proveedor de IA
info "   proveedor de IA (el 'cerebro' del bot):"
info "     1) Anthropic (Claude)  — recomendado"
info "     2) OpenAI (GPT)        — más económico"
info "     3) xAI (Grok)"
info "     4) Gateway OpenAI-compatible (AIsa/OpenRouter — pide base URL)"
if [ "$SILENT" = "1" ]; then KOONI_PROVIDER="${KOONI_PROVIDER:-1}"; else
  read -r -p "  elige 1-4 [1]: " KOONI_PROVIDER; KOONI_PROVIDER="${KOONI_PROVIDER:-1}"; fi
case "$KOONI_PROVIDER" in
  2) LLM_PROVIDER="openai"; PROV_NAME="OpenAI";;
  3) LLM_PROVIDER="xai";   PROV_NAME="xAI (Grok)";;
  4) LLM_PROVIDER="openai"; PROV_NAME="Gateway (AIsa/OpenRouter)"
     ask KOONI_BASE_URL "  URL base del gateway (ej. https://api.aisa.one/v1)" "https://api.aisa.one/v1";;
  *) LLM_PROVIDER="anthropic"; PROV_NAME="Anthropic (Claude)";;
esac
ask_secret KOONI_API_KEY "API key de $PROV_NAME (no se mostrará)"
[ -n "${KOONI_API_KEY:-}" ] || warn "sin API key — la IA no responderá hasta que la pongas"

ask_secret KOONI_DASH_PASS "contraseña del panel /admin (usuario: admin)"
KOONI_DASH_PASS="${KOONI_DASH_PASS:-kooni-local-password}"
KOONI_KB_TOKEN="${KOONI_KB_TOKEN:-$(head -c 24 /dev/urandom 2>/dev/null | od -An -tx1 | tr -d ' \n' | head -c 32)}"
[ -n "$KOONI_KB_TOKEN" ] || KOONI_KB_TOKEN="kooni-reindex-$(date +%s)"

# Datos del negocio (se escriben en member/config.local.ts → businessConfig)
info "   datos del negocio (opcional — también se editan en el panel):"
ask KOONI_OFFERS "${KOONI_OFFERS:-qué ofrece el negocio (ej. cortes de pelo y barba)}" ""
ask KOONI_HOURS "${KOONI_HOURS:-horario (ej. Lun-Sáb 10am-8pm)}" ""
ask KOONI_LOCATION "${KOONI_LOCATION:-ubicación}" ""
ask KOONI_PHONE "${KOONI_PHONE:-teléfono de contacto}" ""
ask KOONI_PAYMENTS "${KOONI_PAYMENTS:-métodos de pago (ej. efectivo, tarjeta)}" ""
ask KOONI_FAQ "${KOONI_FAQ:-preguntas frecuentes, separadas por | (ej. ¿hacen envíos?|¿aceptan tarjeta?)}" ""
ask KOONI_TONE "${KOONI_TONE:-tono del bot (cercano | formal | divertido)}" "cercano"

# ── 2. ESCRIBIR VARIABLES ────────────────────────────────────────────────────
info "2. Escribiendo configuración"

# .dev.vars (secrets locales, gitignored)
cat > .dev.vars <<VARS
# KOONI — secrets locales (generados por scripts/kooni-init.sh · NUNCA commitees)
LLM_PROVIDER=${LLM_PROVIDER}
OPENAI_API_KEY=${KOONI_API_KEY}
ANTHROPIC_API_KEY=${KOONI_API_KEY}
XAI_API_KEY=${KOONI_API_KEY}
${KOONI_BASE_URL:+OPENAI_API_BASE_URL=${KOONI_BASE_URL}}
DASHBOARD_PASSWORD=${KOONI_DASH_PASS}
KB_REINDEX_TOKEN=${KOONI_KB_TOKEN}
VARS
ok ".dev.vars escrito (secrets: IA, panel, reindex)"

# wrangler.toml ([vars] + nombre del worker)
python - "$KOONI_SLUG" "$KOONI_BUSINESS_NAME" "$KOONI_BOT_NAME" "$KOONI_LANGUAGE" "$KOONI_TIER" "$LLM_PROVIDER" <<'PY'
import io, sys, re
p = "wrangler.toml"
s = io.open(p, encoding="utf-8").read()
slug, biz, bot, lang, tier, prov = sys.argv[1:7]
# nombre del worker
s = re.sub(r'name = "kooni-bot-[^"]*"', f'name = "kooni-bot-{slug}"', s)
# vars del bot
s = re.sub(r'BOT_NAME = "[^"]*"', f'BOT_NAME = "{bot}"', s)
s = re.sub(r'BUSINESS_NAME = "[^"]*"', f'BUSINESS_NAME = "{biz}"', s)
s = re.sub(r'BOT_LANGUAGE = "[^"]*"', f'BOT_LANGUAGE = "{lang}"', s)
s = re.sub(r'BOT_TIER = "[^"]*"', f'BOT_TIER = "{tier}"', s)
s = re.sub(r'DASHBOARD_BASE_URL = "[^"]*"', f'DASHBOARD_BASE_URL = "https://kooni-bot-{slug}.workers.dev"', s)
# provider (línea comentada en wrangler.toml)
if prov != "anthropic":
    if 'LLM_PROVIDER' not in s.split("[vars]")[1].split("[[")[0]:
        s = s.replace("[vars]", f'[vars]\nLLM_PROVIDER = "{prov}"', 1)
io.open(p, "w", encoding="utf-8").write(s)
print("wrangler.toml actualizado:", slug, biz, bot, lang, tier, prov)
PY
ok "wrangler.toml escrito (slug=$KOONI_SLUG · tier=$KOONI_TIER)"

# member/config.local.ts (negocio → businessConfig)
python - "$KOONI_BUSINESS_NAME" "$KOONI_OFFERS" "$KOONI_HOURS" "$KOONI_LOCATION" "$KOONI_PHONE" "$KOONI_PAYMENTS" "$KOONI_FAQ" "$KOONI_TONE" <<'PY'
import io, sys, json
p = "member/config.local.ts"
biz, offers, hours, loc, phone, pays, faq, tone = (x or "" for x in sys.argv[1:9])
faq_list = [f.strip() for f in faq.split("|") if f.strip()]
services = [{"name": offers, "price": 0}] if offers else []
payments = [x.strip() for x in pays.split(",") if x.strip()]
# customFields SIEMPRE con valores string (Record<string, string>) — es el
# contrato que espera el prompt y evita romper el tipo BusinessConfig.
custom = {}
if offers or faq_list:
    custom = {
        "ofrecemos": offers,
        "preguntasFrecuentes": " | ".join(faq_list),
        "tono": tone,
    }
out = f'''// member/config.local.ts — config del negocio (generado por scripts/kooni-init.sh)
// NUNCA se sobrescribe en updates. Edita aquí o desde el panel → Configuración.

export const memberConfig = {{
  businessName: {json.dumps(biz, ensure_ascii=False)},
  botName: "Asistente",
  language: "es" as "es" | "en",
  tier: "free" as "free" | "pro",
  timezone: "America/Mexico_City",
  contactEmail: "",
}};

export type MemberConfig = typeof memberConfig;

export const businessConfig = {{
  hours: {json.dumps(hours, ensure_ascii=False)},
  services: {json.dumps(services, ensure_ascii=False)},
  location: {json.dumps(loc, ensure_ascii=False)},
  paymentMethods: {json.dumps(payments, ensure_ascii=False)},
  contactPhone: {json.dumps(phone, ensure_ascii=False)},
  customFields: {json.dumps(custom, ensure_ascii=False)} as Record<string, string>,
}};

export const catalog: {{ name: string; price: number; description?: string; sku?: string }}[] = [];
'''
io.open(p, "w", encoding="utf-8").write(out)
print("member/config.local.ts escrito")
PY
ok "member/config.local.ts escrito (negocio + FAQ)"

echo ""
echo "══════════════════════════════════════════════════════"
echo "  RESUMEN DE CONFIGURACIÓN"
echo "  Bot:    kooni-bot-$KOONI_SLUG ($KOONI_TIER)"
echo "  Negocio: $KOONI_BUSINESS_NAME  ·  Idioma: $KOONI_LANGUAGE"
echo "  Cerebro: $PROV_NAME"
echo "══════════════════════════════════════════════════════"

# ── 3. SIGUIENTE PASO ────────────────────────────────────────────────────────
case "$MODE" in
  config)
    info "Configuración lista. Siguiente: bash scripts/test-local.sh (probar local) o bash scripts/kooni-init.sh deploy";;
  deploy)
    info "3. Despliegue en Cloudflare"
    confirm "¿Desplegar en TU cuenta de Cloudflare ahora?" || { warn "puedes hacerlo luego con: bash scripts/kooni-init.sh deploy"; exit 0; }

    echo "  → Abre el navegador para autorizar Cloudflare (wrangler login)..."
    npx wrangler login || { warn "no se pudo autenticar (wrangler login)"; exit 1; }
    ok "Cloudflare autenticado"

    # Recursos (ignora si ya existen)
    D1_ID="$(npx wrangler d1 create kooni_db 2>&1 | python -c "
import sys, re, json
raw = sys.stdin.read()
m = re.search(r'database_id.{0,60}?\"([0-9a-f-]{36})\"', raw) or re.search(r'\"database_id\"\s*:\s*\"([0-9a-f-]{36})\"', raw)
print(m.group(1) if m else '')")"
    if [ -z "$D1_ID" ]; then
      D1_ID="$(npx wrangler d1 list 2>/dev/null | grep kooni_db | grep -oE '[0-9a-f-]{36}' | head -1)"
    fi
    if [ -n "$D1_ID" ]; then
      python - "$D1_ID" <<'PY'
import io, sys, re
p = "wrangler.toml"
s = io.open(p, encoding="utf-8").read()
s = re.sub(r'database_id = "[^"]*"', f'database_id = "{sys.argv[1]}"', s)
io.open(p, "w", encoding="utf-8").write(s)
print("database_id actualizado")
PY
      ok "D1 kooni_db listo (id $D1_ID)"
    else
      warn "no se detectó el id de D1 — pégalo a mano en wrangler.toml"
    fi
    npx wrangler vectorize create kooni_kb --dimensions=1024 --metric=cosine >/dev/null 2>&1 && ok "Vectorize kooni_kb listo" || ok "Vectorize kooni_kb ya existía"
    npx wrangler r2 bucket create kooni-bot-catalog >/dev/null 2>&1 && ok "R2 kooni-bot-catalog listo" || ok "R2 kooni-bot-catalog ya existía"

    # Secrets (desde .dev.vars, vía stdin — nunca en el chat)
    put_secret() { # put_secret <key> [valor de .dev.vars]
      local k="$1" v="${2:-}"
      [ -n "$v" ] || return 0
      echo "$v" | npx wrangler secret put "$k" >/dev/null 2>&1 && ok "secret $k guardado"
    }
    put_secret ANTHROPIC_API_KEY "$(grep '^ANTHROPIC_API_KEY=' .dev.vars | cut -d= -f2-)"
    put_secret OPENAI_API_KEY "$(grep '^OPENAI_API_KEY=' .dev.vars | cut -d= -f2-)"
    put_secret XAI_API_KEY "$(grep '^XAI_API_KEY=' .dev.vars | cut -d= -f2-)"
    put_secret DASHBOARD_PASSWORD "$(grep '^DASHBOARD_PASSWORD=' .dev.vars | cut -d= -f2-)"
    put_secret KB_REINDEX_TOKEN "$(grep '^KB_REINDEX_TOKEN=' .dev.vars | cut -d= -f2-)"

    info "   migraciones + deploy..."
    pnpm install >/dev/null 2>&1 || true
    pnpm db:apply:remote >/dev/null 2>&1 && ok "migraciones D1 aplicadas" || warn "db:apply:remote falló (¿D1 listo?)"
    pnpm run deploy 2>&1 | tee /tmp/kooni-deploy.log | grep -E "Uploaded|Deployed|workers.dev" | head -3
    WORKER_URL="$(grep -oE 'https://[a-z0-9-]+\.workers\.dev' /tmp/kooni-deploy.log | head -1)"
    if [ -n "$WORKER_URL" ]; then
      python - "$WORKER_URL" <<'PY'
import io, sys, re
p = "wrangler.toml"
s = io.open(p, encoding="utf-8").read()
s = re.sub(r'DASHBOARD_BASE_URL = "[^"]*"', f'DASHBOARD_BASE_URL = "{sys.argv[1]}"', s)
io.open(p, "w", encoding="utf-8").write(s)
PY
      info "   redeploy con la URL real del panel..."
      pnpm run deploy >/dev/null 2>&1
      echo ""
      echo "  🎉 BOT EN LÍNEA:  $WORKER_URL"
      echo "     Panel admin:   $WORKER_URL/admin   (usuario: admin)"
      echo "     Siguiente:     docs/DESPLIEGUE.md §8 para conectar canales (Telegram, WhatsApp…)"
    else
      warn "no se detectó la URL del worker — revisa /tmp/kooni-deploy.log"
    fi;;
  local)
    info "3. Prueba local automática"
    bash scripts/test-local.sh || warn "la prueba local reportó fallos"
    echo "  → Panel local: http://localhost:8787/admin  (usuario: admin)"
    echo "  → Cuando quieras producción: bash scripts/kooni-init.sh deploy";;
esac

echo ""
echo "  Documentación: docs/PRUEBA-LOCAL.md · docs/DESPLIEGUE.md · docs/PLANES.md"
echo ""
