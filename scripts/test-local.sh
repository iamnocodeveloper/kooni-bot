#!/usr/bin/env bash
# =============================================================================
# KOONI — prueba local automatizada
# -----------------------------------------------------------------------------
# Corre todo el checklist de "docs/PRUEBA-LOCAL.md" de un jalón:
#   1. Preflight (node, pnpm, .dev.vars con llave de IA)
#   2. Esquema D1 local (idempotente)
#   3. Arranca `wrangler dev` si no está corriendo
#   4. Prueba infra: /health, /admin (401 sin auth, dashboard con auth)
#   5. Flujo de IA real por Telegram (simulado): pregunta → lead en D1
#   6. Zernio: webhook DM + comentario (auto-DM intent)
#   7. typecheck + tests unitarios (resumen)
#   8. Reporte final
#
# Uso:   bash scripts/test-local.sh          (requiere git-bash / Linux/macOS)
# Salida: PASS/FAIL por cada prueba; al final el reporte.
# =============================================================================
set -uo pipefail
PORT="${PORT:-8787}"
BASE="http://localhost:$PORT"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

PASS=0; FAIL=0
ok()   { echo "  ✅ $1"; PASS=$((PASS+1)); }
bad()  { echo "  ❌ $1"; FAIL=$((FAIL+1)); }
info() { echo "── $1"; }
jsonq() { python -c "
import json, sys, io
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
raw = io.open(sys.argv[1], encoding='utf-8').read()
data = json.loads(raw[raw.find('['):])
for r in data[0]['results']:
    print(r)
" "$1"; }

echo ""
echo "══════════════════════════════════════════════════════"
echo "  KOONI · PRUEBA LOCAL · $(date '+%Y-%m-%d %H:%M')"
echo "══════════════════════════════════════════════════════"

# ── 1. Preflight ─────────────────────────────────────────────────────────────
info "1. Preflight"
command -v node >/dev/null || { echo "Falta node"; exit 1; }
command -v pnpm >/dev/null || { echo "Falta pnpm (corepack enable pnpm)"; exit 1; }
[ -f .dev.vars ] || { echo "Falta .dev.vars (cp .dev.vars.example .dev.vars)"; exit 1; }
LLM_CFG="$(grep -cE '^(ANTHROPIC_API_KEY|OPENAI_API_KEY)=.{8,}' .dev.vars 2>/dev/null)"
if [ "$LLM_CFG" -ge 1 ]; then ok "llave de IA presente en .dev.vars"; else bad "sin llave de IA real en .dev.vars (la IA no responderá)"; fi
DP="$(grep -cE '^DASHBOARD_PASSWORD=.{4,}' .dev.vars 2>/dev/null)"
[ "$DP" -ge 1 ] && ok "DASHBOARD_PASSWORD presente" || bad "falta DASHBOARD_PASSWORD"

# ── 2. Esquema D1 ────────────────────────────────────────────────────────────
info "2. Esquema D1 local (idempotente)"
if npx wrangler d1 execute kooni_db --local --file=src/db/schema.sql >/dev/null 2>&1; then
  ok "schema.sql aplicado"
else
  bad "falló aplicar schema.sql"
fi

# ── 3. Server ────────────────────────────────────────────────────────────────
info "3. Server local"
if curl -s --max-time 5 "$BASE/health" >/dev/null 2>&1; then
  ok "server ya corriendo en $BASE"
  SERVER_STARTED=0
else
  info "arrancando wrangler dev (port $PORT)..."
  (npx wrangler dev --port "$PORT" > /tmp/kooni-dev.log 2>&1 &)
  SERVER_STARTED=1
  READY=0
  for i in $(seq 1 60); do
    sleep 2
    if curl -s --max-time 3 "$BASE/health" >/dev/null 2>&1; then READY=1; break; fi
  done
  [ "$READY" = 1 ] && ok "wrangler dev listo ($(($i*2))s)" || bad "no arrancó (revisa /tmp/kooni-dev.log)"
fi

# ── 4. Infra ─────────────────────────────────────────────────────────────────
info "4. Infraestructura"
H="$(curl -s --max-time 8 "$BASE/health")"
[ "$H" = "ok" ] && ok "/health → ok" || bad "/health → '$H'"

A401="$(curl -s --max-time 8 -o /dev/null -w '%{http_code}' "$BASE/admin")"
[ "$A401" = "401" ] && ok "/admin sin auth → 401 (protegido)" || bad "/admin sin auth → $A401"

DPASS="$(grep '^DASHBOARD_PASSWORD=' .dev.vars | cut -d= -f2-)"
ADM="$(curl -s --max-time 10 -u "admin:$DPASS" -L "$BASE/admin")"
if echo "$ADM" | grep -q "Kooni"; then ok "/admin con auth → dashboard Kooni"; else bad "/admin con auth → sin marca Kooni"; fi

# ── 5. Flujo de IA real (Telegram simulado) ─────────────────────────────────
info "5. Flujo de IA real (Telegram simulado → verificación en D1)"
CHAT="$(date +%s)00"   # chat id único por corrida
curl -s --max-time 10 -X POST "$BASE/webhooks/telegram" -H "Content-Type: application/json" \
  -d "{\"update_id\":99,\"message\":{\"message_id\":99,\"chat\":{\"id\":$CHAT},\"from\":{\"id\":$CHAT},\"text\":\"hola, quiero un corte de pelo para el sábado\"}}" >/dev/null
sleep 20
npx wrangler d1 execute kooni_db --local --command "SELECT role, content FROM messages WHERE conversation_id IN (SELECT id FROM conversations WHERE channel='telegram' AND channel_user_id='$CHAT') ORDER BY created_at;" > _q.json 2>/dev/null
BOT_ANS="$(python -c "
import json, io
raw = io.open('_q.json', encoding='utf-8').read()
try:
    data = json.loads(raw[raw.find('['):])
    rows = [r for r in data[0]['results'] if r['role']=='assistant']
    print(rows[-1]['content'][:120] if rows else '')
except Exception:
    print('')")"
if [ -n "$BOT_ANS" ]; then
  ok "la IA respondió: ${BOT_ANS:0:80}…"
  echo "       (si dice 'Algo falló…', revisa la llave de IA en .dev.vars)"
else
  bad "sin respuesta de la IA (¿llave real en .dev.vars?)"
fi

# Continuar el flujo: dar datos → captura de lead
curl -s --max-time 10 -X POST "$BASE/webhooks/telegram" -H "Content-Type: application/json" \
  -d "{\"update_id\":100,\"message\":{\"message_id\":100,\"chat\":{\"id\":$CHAT},\"from\":{\"id\":$CHAT},\"text\":\"5pm, me llamo Luis, teléfono 5551234\"}}" >/dev/null
sleep 20
# Verifica el lead más reciente (los leads se vinculan por conversation_id;
# creado en los últimos 4 min con los datos de prueba = captura OK).
START="$(($(date +%s) - 240))000"
npx wrangler d1 execute kooni_db --local --command "SELECT name, contact, intent FROM leads WHERE created_at >= $START ORDER BY created_at DESC LIMIT 1;" > _q.json 2>/dev/null
LEAD="$(python -c "
import json, io
raw = io.open('_q.json', encoding='utf-8').read()
try:
    data = json.loads(raw[raw.find('['):])
    rows = data[0]['results']
    print(rows[0] if rows else '')
except Exception:
    print('')")"
if [ -n "$LEAD" ]; then
  ok "lead capturado en D1 → $LEAD"
else
  bad "no se capturó lead (¿la IA no completó el flujo?)"
fi
rm -f _q.json

# ── 6. Zernio ────────────────────────────────────────────────────────────────
info "6. Zernio (webhook)"
Z="$(curl -s --max-time 10 -X POST "$BASE/webhooks/zernio" -H "Content-Type: application/json" \
  -d '{"event":"message.received","message":{"direction":"incoming","text":"hola"},"conversation":{"id":"c-test"},"account":{"id":"a-test"}}' -o /dev/null -w '%{http_code}')"
[ "$Z" = "200" ] && ok "POST /webhooks/zernio → 200" || bad "zernio → $Z"
Z2="$(curl -s --max-time 10 -X POST "$BASE/webhooks/zernio" -H "Content-Type: application/json" \
  -d '{"event":"comment.received","comment":{"postId":"p1","text":"claude"},"account":{"id":"a-test"}}' -o /dev/null -w '%{http_code}')"
[ "$Z2" = "200" ] && ok "POST comentario (auto-DM intent) → 200" || bad "zernio comentario → $Z2"

# ── 7. Verificación de código ────────────────────────────────────────────────
info "7. Verificación de código"
if pnpm typecheck >/dev/null 2>&1; then ok "typecheck limpio"; else bad "typecheck con errores"; fi
TOT="$(pnpm test 2>&1 | grep -E '^\s+Tests' | tail -1 | sed 's/^ *//')"
[ -n "$TOT" ] && ok "tests unitarios → $TOT" || bad "tests no corrieron"

# ── 8. Reporte ───────────────────────────────────────────────────────────────
echo ""
echo "══════════════════════════════════════════════════════"
echo "  REPORTE: $PASS OK · $FAIL FAIL"
echo "══════════════════════════════════════════════════════"
[ "$FAIL" = 0 ] && echo "  🎉 Todo listo. Panel: $BASE/admin" || echo "  Revisa los ❌ de arriba (y docs/PRUEBA-LOCAL.md)"
echo ""
exit 0
