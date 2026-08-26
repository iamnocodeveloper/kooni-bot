# =============================================================================
# KOONI — instalador interactivo (PowerShell nativo, como el forjabot de Forja)
# -----------------------------------------------------------------------------
# Flujo guiado por Forja, adaptado a Kooni:
#
#   PASO 0 · El plan (qué va a pasar y cuántos pasos faltan)
#   PASO 1 · Configuración  — te pregunta todo y escribe las variables
#   PASO 2 · Prueba local   — 14 pruebas automáticas (modo local)
#   PASO 3 · Login          — autorizas Cloudflare en el navegador
#   PASO 4 · Recursos       — D1 + Vectorize + R2 en TU cuenta
#   PASO 5 · Secrets        — llave de IA, panel y reindex
#   PASO 6 · Deploy         — migraciones + publicar
#   → DASHBOARD VIVO en https://kooni-bot-<slug>.workers.dev/admin
#
# Uso:
#   .\scripts\kooni-init.ps1 config   # solo configura
#   .\scripts\kooni-init.ps1 local    # configura + prueba local (default)
#   .\scripts\kooni-init.ps1 deploy   # configura + despliega en Cloudflare
#
# Modo silencioso (automatización): $env:KOONI_SILENT=1 + variables KOONI_*.
# =============================================================================
param([ValidateSet("config","local","deploy")][string]$Mode = "local")

$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $Root
$Silent = ($env:KOONI_SILENT -eq "1")
try { [Console]::OutputEncoding = [Text.Encoding]::UTF8 } catch {}
$script:Step = 0

# ── helpers ──────────────────────────────────────────────────────────────────
function Ask([string]$Name, [string]$Prompt, [string]$Default = "") {
  if ($Silent) { return [string][Environment]::GetEnvironmentVariable($Name) }
  if ($Default) { $r = Read-Host "  $Prompt [$Default]" } else { $r = Read-Host "  $Prompt" }
  if ([string]::IsNullOrWhiteSpace($r) -and $Default) { return $Default }
  return $r
}
function Ask-Secret([string]$Name, [string]$Prompt) {
  if ($Silent) { return [string][Environment]::GetEnvironmentVariable($Name) }
  $sec = Read-Host -AsSecureString "  $Prompt"
  $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec)
  try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr) } finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
  }
}
function Confirm-Yes([string]$Prompt) {
  if ($Silent) { return $true }
  $r = Read-Host "  $Prompt (s/N)"
  return ($r -match "^(s|si|y|yes)$")
}
function Info([string]$m)  { Write-Host "── $m" }
function OK([string]$m)    { Write-Host "  ✅ $m" -ForegroundColor Green }
function Warn([string]$m)  { Write-Host "  ⚠️  $m" -ForegroundColor Yellow }
function Step([int]$n, [int]$total, [string]$title) {
  $rest = $total - $n
  Write-Host ""
  Write-Host "  ▶ PASO $n/$total · $title   (faltan $rest para ver tu dashboard)" -ForegroundColor Cyan
}
function Exec([string]$cmd, [string[]]$ArgsList) {
  $out = & $cmd @ArgsList 2>&1 | Out-String
  return $out
}
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
Write-Host "  🔨 KOONI · instalador (como el de Forja)"
Write-Host "══════════════════════════════════════════════════════"

# ── PASO 0 · EL PLAN (como Forja: primero el mapa, después el trabajo) ───────
if ($Mode -ne "config" -and -not $Silent) {
  Step 0 6 "El plan (30 segundos)"
  Write-Host "  • Tu bot va a vivir en TU cuenta de Cloudflare (gratis para empezar)."
  Write-Host "  • El cerebro lo pone tu llave de IA (Claude/GPT/Grok) — pagas solo lo que piensa."
  Write-Host "  • Yo te pregunto la config y escribo las variables; luego pruebo y/o publico."
  if ($Mode -eq "deploy") {
    Write-Host "  • Total: 6 pasos → al terminar el PASO 6 tienes TU DASHBOARD en vivo."
  } else {
    Write-Host "  • Hoy: PASO 1 (config) + PASO 2 (prueba local). Producción: kooni-init.ps1 deploy"
  }
  if (-not (Confirm-Yes "¿Le entramos?")) { Write-Host "  Adiós 👋"; exit 0 }
}

# ── PASO 1 · CONFIGURACIÓN ───────────────────────────────────────────────────
Step 1 6 "Configuración del bot"
if ($Mode -ne "config") { Write-Host "  (en deploy son 6 pasos; en local solo este + la prueba)" }

$Slug = (Ask "KOONI_SLUG" "slug del bot (corto, ej. mi-negocio)" "mi-negocio").ToLower() -replace ' ','-' -replace '[^a-z0-9-]',''
if (-not $Slug) { $Slug = "mi-negocio" }
$Business = Ask "KOONI_BUSINESS_NAME" "nombre del negocio" ""
$BotName  = Ask "KOONI_BOT_NAME" "cómo se llama tu asistente" "Asistente"
$Lang     = Ask "KOONI_LANGUAGE" "idioma del bot (es | en | pt-BR)" "es"
$Tier     = Ask "KOONI_TIER" "plan (free | pro)" "free"

Info "   proveedor de IA (el 'cerebro'):"
Write-Host "     1) Anthropic (Claude)  — recomendado"
Write-Host "     2) OpenAI (GPT)        — más económico"
Write-Host "     3) xAI (Grok)"
Write-Host "     4) Gateway OpenAI-compatible (AIsa/OpenRouter — pide base URL)"
if ($Silent) { $Prov = $env:KOONI_PROVIDER; if (-not $Prov) { $Prov = "1" } }
else { $Prov = Read-Host "  elige 1-4 [1]"; if (-not $Prov) { $Prov = "1" } }
switch ($Prov) {
  "2" { $LLMProvider = "openai";   $ProvName = "OpenAI" }
  "3" { $LLMProvider = "xai";      $ProvName = "xAI (Grok)" }
  "4" { $LLMProvider = "openai";   $ProvName = "Gateway (AIsa/OpenRouter)"
        $BaseURL = Ask "KOONI_BASE_URL" "URL base del gateway" "https://api.aisa.one/v1" }
  default { $LLMProvider = "anthropic"; $ProvName = "Anthropic (Claude)" }
}
$ApiKey = Ask-Secret "KOONI_API_KEY" "API key de $ProvName (no se mostrará)"
if (-not $ApiKey) { Warn "sin API key — la IA no responderá hasta que la pongas en .dev.vars" }

$DashPass = Ask-Secret "KOONI_DASH_PASS" "contraseña del panel /admin (usuario: admin)"
if (-not $DashPass) { $DashPass = "kooni-local-password" }
$KbToken = $env:KOONI_KB_TOKEN
if (-not $KbToken) { $KbToken = "kooni-reindex-" + [DateTimeOffset]::UtcNow.ToUnixTimeSeconds() }

Info "   datos del negocio (opcional — también se editan en el panel):"
$Offers  = Ask "KOONI_OFFERS"  "qué ofrece el negocio (ej. cortes de pelo y barba)" ""
$Hours   = Ask "KOONI_HOURS"   "horario (ej. Lun-Sáb 10am-8pm)" ""
$Loc     = Ask "KOONI_LOCATION" "ubicación" ""
$Phone   = Ask "KOONI_PHONE"   "teléfono de contacto" ""
$Payments = Ask "KOONI_PAYMENTS" "métodos de pago (ej. efectivo, tarjeta)" ""
$Faq     = Ask "KOONI_FAQ"     "preguntas frecuentes, separadas por |" ""
$Tone    = Ask "KOONI_TONE"    "tono del bot (cercano | formal | divertido)" "cercano"

# ── ESCRIBIR CONFIGURACIÓN ───────────────────────────────────────────────────
$devVars = @"
# KOONI — secrets locales (generados por scripts/kooni-init.ps1 · NUNCA commitees)
LLM_PROVIDER=$LLMProvider
OPENAI_API_KEY=$ApiKey
ANTHROPIC_API_KEY=$ApiKey
XAI_API_KEY=$ApiKey
$($(if ($BaseURL) { "OPENAI_API_BASE_URL=$BaseURL" }))
DASHBOARD_PASSWORD=$DashPass
KB_REINDEX_TOKEN=$KbToken
"@
[IO.File]::WriteAllText((Join-Path $Root ".dev.vars"), $devVars, (New-Object Text.UTF8Encoding $false))
OK ".dev.vars escrito (secrets: IA, panel, reindex)"

$toml = Get-Content "wrangler.toml" -Raw -Encoding utf8
$toml = [regex]::Replace($toml, 'name = "kooni-bot-[^"]*"', 'name = "kooni-bot-' + $Slug + '"')
$toml = [regex]::Replace($toml, 'BOT_NAME = "[^"]*"', 'BOT_NAME = "' + $BotName + '"')
$toml = [regex]::Replace($toml, 'BUSINESS_NAME = "[^"]*"', 'BUSINESS_NAME = "' + $Business + '"')
$toml = [regex]::Replace($toml, 'BOT_LANGUAGE = "[^"]*"', 'BOT_LANGUAGE = "' + $Lang + '"')
$toml = [regex]::Replace($toml, 'BOT_TIER = "[^"]*"', 'BOT_TIER = "' + $Tier + '"')
$toml = [regex]::Replace($toml, 'DASHBOARD_BASE_URL = "[^"]*"', 'DASHBOARD_BASE_URL = "https://kooni-bot-' + $Slug + '.workers.dev"')
if ($LLMProvider -ne "anthropic") {
  $varsBlock = $toml.Substring($toml.IndexOf("[vars]"))
  $endIdx = $varsBlock.IndexOf("[[")
  if ($endIdx -lt 0) { $endIdx = $varsBlock.Length }
  $varsBlock = $varsBlock.Substring(0, $endIdx)
  if (-not $varsBlock.Contains("LLM_PROVIDER")) {
    $toml = $toml.Replace("[vars]", "[vars]`nLLM_PROVIDER = `"$LLMProvider`"", 1)
  }
}
[IO.File]::WriteAllText((Join-Path $Root "wrangler.toml"), $toml, (New-Object Text.UTF8Encoding $false))
OK "wrangler.toml escrito (slug=$Slug · tier=$Tier · provider=$LLMProvider)"

$faqList = @($Faq -split '\|' | ForEach-Object { $_.Trim() } | Where-Object { $_ })
$services = @()
if ($Offers) { $services = @([ordered]@{ name = $Offers; price = 0 }) }
$payList = @($Payments -split ',' | ForEach-Object { $_.Trim() } | Where-Object { $_ })
$custom = @{}
if ($Offers -or $faqList.Count -gt 0) {
  $custom = [ordered]@{ ofrecemos = $Offers; preguntasFrecuentes = ($faqList -join " | "); tono = $Tone }
}
$memberConfigJson = [ordered]@{
  businessName = $Business; botName = "Asistente"; language = "es"
  tier = "free"; timezone = "America/Mexico_City"; contactEmail = ""
} | ConvertTo-Json -Compress
$businessJson = [ordered]@{
  hours = $Hours; services = $services; location = $Loc
  paymentMethods = $payList; contactPhone = $Phone; customFields = $custom
} | ConvertTo-Json -Compress
$memberTs = @"
// member/config.local.ts — config del negocio (generado por scripts/kooni-init.ps1)
// NUNCA se sobrescribe en updates. Edita aquí o desde el panel → Configuración.

export const memberConfig = $memberConfigJson;

export type MemberConfig = typeof memberConfig;

export const businessConfig = $businessJson as {
  hours: string;
  services: { name: string; price: number }[];
  location: string;
  paymentMethods: string[];
  contactPhone: string;
  customFields: Record<string, string>;
};

export const catalog: { name: string; price: number; description?: string; sku?: string }[] = [];
"@
[IO.File]::WriteAllText((Join-Path $Root "member/config.local.ts"), $memberTs, (New-Object Text.UTF8Encoding $false))
OK "member/config.local.ts escrito (negocio + FAQ)"

Write-Host ""
Write-Host "══════════════════════════════════════════════════════"
Write-Host "  RESUMEN:  kooni-bot-$Slug ($Tier) · $Business · $ProvName"
Write-Host "══════════════════════════════════════════════════════"

# ── PASO 2 · PRUEBA LOCAL (modo local) ───────────────────────────────────────
if ($Mode -eq "local") {
  Step 2 6 "Prueba local automática (14 pruebas)"
  & "$PSScriptRoot\test-local.ps1"
  Write-Host "  → Panel local: http://localhost:8787/admin  (usuario: admin)"
  Write-Host "  → Producción: .\scripts\kooni-init.ps1 deploy  (4 pasos más y tienes el dashboard)"
}

# ── PASOS 3-6 · DESPLIEGUE EN CLOUDFLARE (modo deploy) ───────────────────────
if ($Mode -eq "deploy") {
  if (-not (Confirm-Yes "¿Desplegar en TU cuenta de Cloudflare ahora? (PASOS 3-6)")) {
    Warn "puedes hacerlo luego con: .\scripts\kooni-init.ps1 deploy"; exit 0
  }

  Step 3 6 "Login de Cloudflare (abre el navegador)"
  Exec $NPX @("wrangler","login") | Out-Null
  OK "Cloudflare autenticado"

  Step 4 6 "Recursos en TU cuenta (D1 + Vectorize + R2)"
  $d1out = Exec $NPX @("wrangler","d1","create","kooni_db")
  $m = [regex]::Match($d1out, '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}')
  $D1Id = $m.Value
  if (-not $D1Id) {
    $d1list = Exec $NPX @("wrangler","d1","list")
    $m = [regex]::Match($d1list, 'kooni_db.{0,120}?([0-9a-f-]{36})')
    $D1Id = $m.Groups[1].Value
  }
  if ($D1Id) {
    $toml = Get-Content "wrangler.toml" -Raw -Encoding utf8
    $toml = [regex]::Replace($toml, 'database_id = "[^"]*"', "database_id = `"$D1Id`"")
    [IO.File]::WriteAllText((Join-Path $Root "wrangler.toml"), $toml, (New-Object Text.UTF8Encoding $false))
    OK "D1 kooni_db listo (id $D1Id)"
  } else { Warn "no se detectó el id de D1 — pégalo a mano en wrangler.toml" }
  Exec $NPX @("wrangler","vectorize","create","kooni_kb","--dimensions=1024","--metric=cosine") | Out-Null
  OK "Vectorize kooni_kb listo (o ya existía)"
  $r2out = Exec $NPX @("wrangler","r2","bucket","create","kooni-bot-catalog")
  if ($r2out -match "10042" -or $r2out -match "enable R2") {
    Warn "R2 no está habilitado en tu cuenta (gratis: dash.cloudflare.com → R2). El bot funciona sin él (código no usa CATALOG); se agrega después."
    $toml = Get-Content "wrangler.toml" -Raw -Encoding utf8
    $toml = $toml -replace '\[\[r2_buckets\]\]', '# [[r2_buckets]] (R2 no habilitado — opcional)'
    $toml = $toml -replace 'binding = "CATALOG"', '# binding = "CATALOG"'
    $toml = $toml -replace 'bucket_name = "[^"]*"', '# bucket_name = "kooni-bot-catalog"'
    [IO.File]::WriteAllText((Join-Path $Root "wrangler.toml"), $toml, (New-Object Text.UTF8Encoding $false))
  } else { OK "R2 kooni-bot-catalog listo (o ya existía)" }

  # Si la llave es de un gateway (AIsa/OpenRouter), la base URL debe desplegarse
  # como var — sin ella el bot desplegado llama al endpoint equivocado y falla.
  $dvVars = Get-Content ".dev.vars" | Where-Object { $_ -match '^OPENAI_API_BASE_URL=' }
  if ($dvVars -and -not $toml.Contains("OPENAI_API_BASE_URL")) {
    $burl = ($dvVars[0] -split '=',2)[1]
    $toml = Get-Content "wrangler.toml" -Raw -Encoding utf8
    $toml = $toml.Replace('[vars]', "[vars]`nOPENAI_API_BASE_URL = `"$burl`"", 1)
    [IO.File]::WriteAllText((Join-Path $Root "wrangler.toml"), $toml, (New-Object Text.UTF8Encoding $false))
    OK "OPENAI_API_BASE_URL agregado a [vars] (gateway)"
  }

  Step 5 6 "Secrets (llave de IA, panel, reindex) — sin mostrarlos"
  function Put-Secret([string]$k, [string]$v) {
    if (-not $v) { return }
    $v | & $NPX wrangler secret put $k 2>&1 | Out-Null
    OK "secret $k guardado"
  }
  $dv = Get-Content ".dev.vars" | Where-Object { $_ -match '^[A-Z_]+=' }
  $map = @{}; foreach ($line in $dv) { $kv = $line -split '=',2; $map[$kv[0]] = $kv[1] }
  Put-Secret "ANTHROPIC_API_KEY" $map["ANTHROPIC_API_KEY"]
  Put-Secret "OPENAI_API_KEY" $map["OPENAI_API_KEY"]
  Put-Secret "XAI_API_KEY" $map["XAI_API_KEY"]
  Put-Secret "DASHBOARD_PASSWORD" $map["DASHBOARD_PASSWORD"]
  Put-Secret "KB_REINDEX_TOKEN" $map["KB_REINDEX_TOKEN"]

  Step 6 6 "Migraciones + Deploy (publicar)"
  Exec $PNPM @("install") | Out-Null
  Exec $PNPM @("db:apply:remote") | Out-Null
  $dep = Exec $PNPM @("run","deploy")
  $url = [regex]::Match($dep, 'https://[a-z0-9-]+\.workers\.dev').Value
  if ($url) {
    $toml = Get-Content "wrangler.toml" -Raw -Encoding utf8
    $toml = [regex]::Replace($toml, 'DASHBOARD_BASE_URL = "[^"]*"', "DASHBOARD_BASE_URL = `"$url`"")
    [IO.File]::WriteAllText((Join-Path $Root "wrangler.toml"), $toml, (New-Object Text.UTF8Encoding $false))
    Exec $PNPM @("run","deploy") | Out-Null
    Write-Host ""
    Write-Host "  🎉 DASHBOARD INSTALADO Y EN VIVO" -ForegroundColor Green
    Write-Host "  ═══════════════════════════════════"
    Write-Host "   Bot:      $url"
    Write-Host "   Panel:    $url/admin   (usuario: admin · tu contraseña)"
    Write-Host "   Próximo:  conecta tu primer canal (Telegram ~5 min) → docs/DESPLIEGUE.md §8"
  } else {
    Warn "no se detectó la URL del worker — revisa la salida del deploy arriba"
  }
}

Write-Host ""
Write-Host "  Documentación: docs/PRUEBA-LOCAL.md · docs/DESPLIEGUE.md · docs/PLANES.md"
Write-Host ""
