# =============================================================================
# KOONI — prueba local automática (PowerShell nativo)
# -----------------------------------------------------------------------------
# Checklist completo (igual que scripts/test-local.sh):
#   preflight → esquema D1 → server → /health → /admin (401 + dashboard) →
#   flujo de IA real (mensaje → respuesta → lead en D1) → Zernio → typecheck+tests
# Uso: .\scripts\test-local.ps1
# =============================================================================
$ErrorActionPreference = "Continue"
$Port = if ($env:PORT) { $env:PORT } else { 8787 }
$Base = "http://localhost:$Port"
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $Root
try { [Console]::OutputEncoding = [Text.Encoding]::UTF8 } catch {}

$OKCount = 0; $FailCount = 0
function OK([string]$m)  { Write-Host "  ✅ $m" -ForegroundColor Green; $script:OKCount++ }
function BAD([string]$m) { Write-Host "  ❌ $m" -ForegroundColor Red;   $script:FailCount++ }
function Info([string]$m){ Write-Host "── $m" }
function D1Rows([string]$sql) {
  # --json: wrangler imprime SOLO el JSON (sin banner) → parse directo y robusto.
  $out = Exec $NPX @("wrangler","d1","execute","kooni_db","--local","--command",$sql,"--json")
  try { return @(($out.Trim() | ConvertFrom-Json)[0].results) } catch { return @() }
}
function Exec([string]$cmd, [string[]]$ArgsList) { & $cmd @ArgsList 2>&1 | Out-String }
function Find-Exe([string]$name) {
  foreach ($c in @("$name.cmd", "$name.exe", "$name.ps1", $name)) {
    if (Get-Command $c -ErrorAction SilentlyContinue) { return $c }
  }
  return $name
}
$PNPM = Find-Exe "pnpm"
$NPX = Find-Exe "npx"

Write-Host ""
Write-Host "══════════════════════════════════════════════════════"
Write-Host "  KOONI · PRUEBA LOCAL · $(Get-Date -Format 'yyyy-MM-dd HH:mm')"
Write-Host "══════════════════════════════════════════════════════"

# ── 1. Preflight ─────────────────────────────────────────────────────────────
Info "1. Preflight"
$hasKey = @(Get-Content ".dev.vars" -ErrorAction SilentlyContinue | Where-Object { $_ -match '^(ANTHROPIC_API_KEY|OPENAI_API_KEY)=.{8,}' }).Count
if ($hasKey -ge 1) { OK "llave de IA presente en .dev.vars" } else { BAD "sin llave de IA real (la IA no responderá)" }
$hasPass = @(Get-Content ".dev.vars" -ErrorAction SilentlyContinue | Where-Object { $_ -match '^DASHBOARD_PASSWORD=.{4,}' }).Count
if ($hasPass -ge 1) { OK "DASHBOARD_PASSWORD presente" } else { BAD "falta DASHBOARD_PASSWORD" }

# ── 2. Esquema D1 ────────────────────────────────────────────────────────────
Info "2. Esquema D1 local (idempotente)"
Exec $NPX @("wrangler","d1","execute","kooni_db","--local","--file=src/db/schema.sql") | Out-Null
if ($LASTEXITCODE -eq 0) { OK "schema.sql aplicado" } else { BAD "falló aplicar schema.sql" }

# ── 3. Server ────────────────────────────────────────────────────────────────
Info "3. Server local"
$running = $false
try { $r = Invoke-WebRequest -Uri "$Base/health" -UseBasicParsing -TimeoutSec 5; if ($r.StatusCode -eq 200) { $running = $true } } catch {}
if ($running) {
  OK "server ya corriendo en $Base"
} else {
  Info "arrancando wrangler dev (port $Port)..."
  $log = Join-Path $env:TEMP "kooni-dev.log"
  Start-Process -FilePath "cmd.exe" -ArgumentList "/c npx wrangler dev --port $Port > `"$log`" 2>&1" -WindowStyle Hidden
  $ready = $false
  for ($i = 0; $i -lt 60; $i++) {
    Start-Sleep -Seconds 2
    try { $r = Invoke-WebRequest -Uri "$Base/health" -UseBasicParsing -TimeoutSec 3; if ($r.StatusCode -eq 200) { $ready = $true; break } } catch {}
  }
  if ($ready) { OK "wrangler dev listo ($(($i+1)*2)s)" } else { BAD "no arrancó (log: $log)" }
}

# ── 4. Infra ─────────────────────────────────────────────────────────────────
Info "4. Infraestructura"
$h = (Invoke-WebRequest -Uri "$Base/health" -UseBasicParsing -TimeoutSec 8 -ErrorAction SilentlyContinue).Content
if ($h -eq "ok") { OK "/health → ok" } else { BAD "/health → '$h'" }

$code401 = 0
try { Invoke-WebRequest -Uri "$Base/admin" -UseBasicParsing -TimeoutSec 8 | Out-Null } catch { $code401 = [int]$_.Exception.Response.StatusCode }
if ($code401 -eq 401) { OK "/admin sin auth → 401 (protegido)" } else { BAD "/admin sin auth → $code401" }

$dash = (Get-Content ".dev.vars" | Where-Object { $_ -match '^DASHBOARD_PASSWORD=' } | Select-Object -First 1) -split '=',2
$pw = $dash[1]
# curl.exe (nativo de Windows) maneja el Basic Auth + redirect igual que la línea de comandos.
$adm = ""
for ($t = 0; $t -lt 3; $t++) {
  $adm = Exec "curl.exe" @("-s", "-u", "admin:$pw", "-L", "$Base/admin")
  if ($adm -match "Kooni") { break }
  Start-Sleep -Seconds 3
}
if ($adm -match "Kooni") { OK "/admin con auth → dashboard Kooni" } else { BAD "/admin con auth → sin marca Kooni" }

# ── 5. Flujo de IA real (Telegram simulado) ──────────────────────────────────
Info "5. Flujo de IA real (Telegram simulado → verificación en D1)"
$chat = "$([DateTimeOffset]::UtcNow.ToUnixTimeSeconds())00"
$body1 = @{ update_id = 99; message = @{ message_id = 99; chat = @{ id = [int64]$chat }; from = @{ id = [int64]$chat }; text = "hola, quiero un corte de pelo para el sábado" } } | ConvertTo-Json -Depth 5
try { Invoke-RestMethod -Uri "$Base/webhooks/telegram" -Method Post -ContentType "application/json" -Body $body1 -TimeoutSec 10 | Out-Null; OK "POST webhook Telegram → 200" } catch { BAD "POST webhook Telegram falló: $_" }

Start-Sleep -Seconds 15
$nAns = @()
for ($t = 0; $t -lt 5; $t++) {
  $nAns = @(D1Rows "SELECT COUNT(*) AS n FROM messages WHERE conversation_id IN (SELECT id FROM conversations WHERE channel='telegram' AND channel_user_id='$chat') AND role='assistant';")
  if ($nAns.Count -gt 0 -and [int]$nAns[0].n -ge 1) { break }
  Start-Sleep -Seconds 8
}
if ($nAns.Count -gt 0 -and [int]$nAns[0].n -ge 1) {
  OK "la IA respondió al mensaje ($($nAns[0].n) respuesta(s) en D1)"
} else { BAD "sin respuesta de la IA (¿llave real en .dev.vars?)" }

$body2 = @{ update_id = 100; message = @{ message_id = 100; chat = @{ id = [int64]$chat }; from = @{ id = [int64]$chat }; text = "5pm, me llamo Luis, teléfono 5551234" } } | ConvertTo-Json -Depth 5
try { Invoke-RestMethod -Uri "$Base/webhooks/telegram" -Method Post -ContentType "application/json" -Body $body2 -TimeoutSec 10 | Out-Null } catch {}
Start-Sleep -Seconds 10
$since = ([DateTimeOffset]::UtcNow.ToUnixTimeSeconds() - 360) * 1000
$before = @(D1Rows "SELECT COUNT(*) AS n FROM leads WHERE created_at >= $since;")
$baseN = if ($before.Count -gt 0) { [int]$before[0].n } else { 0 }
$nLeads = @()
for ($t = 0; $t -lt 8; $t++) {
  $nLeads = @(D1Rows "SELECT COUNT(*) AS n FROM leads WHERE created_at >= $since;")
  $nNow = if ($nLeads.Count -gt 0) { [int]$nLeads[0].n } else { 0 }
  if ($nNow -gt $baseN) { break }
  Start-Sleep -Seconds 10
}
$nNow = if ($nLeads.Count -gt 0) { [int]$nLeads[0].n } else { 0 }
if ($nNow -gt $baseN) { OK "lead capturado en D1 (nuevo lead detectado)" } else { BAD "no se capturó lead" }

# ── 6. Zernio ────────────────────────────────────────────────────────────────
Info "6. Zernio (webhook)"
$z1 = '{"event":"message.received","message":{"direction":"incoming","text":"hola"},"conversation":{"id":"c-test"},"account":{"id":"a-test"}}'
$z2 = '{"event":"comment.received","comment":{"postId":"p1","text":"claude"},"account":{"id":"a-test"}}'
try { Invoke-RestMethod -Uri "$Base/webhooks/zernio" -Method Post -ContentType "application/json" -Body $z1 -TimeoutSec 10 | Out-Null; OK "POST /webhooks/zernio (DM) → 200" } catch { BAD "zernio DM falló: $_" }
try { Invoke-RestMethod -Uri "$Base/webhooks/zernio" -Method Post -ContentType "application/json" -Body $z2 -TimeoutSec 10 | Out-Null; OK "POST comentario (auto-DM intent) → 200" } catch { BAD "zernio comentario falló: $_" }

# ── 7. Verificación de código ────────────────────────────────────────────────
Info "7. Verificación de código"
Exec $PNPM @("typecheck") | Out-Null
if ($LASTEXITCODE -eq 0) { OK "typecheck limpio" } else { BAD "typecheck con errores" }
$tests = Exec $PNPM @("test")
$m = [regex]::Match($tests, 'Tests\s+(\d+)\s+passed')
if ($LASTEXITCODE -eq 0) {
  if ($m.Success) { OK "tests unitarios → $($m.Value)" } else { OK "tests unitarios pasaron (exit 0)" }
} else { BAD "tests fallaron (exit $LASTEXITCODE)" }

# ── 8. Reporte ───────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "══════════════════════════════════════════════════════"
Write-Host "  REPORTE: $OKCount OK · $FailCount FAIL"
Write-Host "══════════════════════════════════════════════════════"
if ($FailCount -eq 0) { Write-Host "  🎉 Todo listo. Panel: $Base/admin" -ForegroundColor Green } else { Write-Host "  Revisa los ❌ (y docs/PRUEBA-LOCAL.md)" -ForegroundColor Yellow }
Write-Host ""
