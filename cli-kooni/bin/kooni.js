#!/usr/bin/env node
// kooni-bot — instala, configura, despliega y mantiene bots de IA de Kooni en TU
// propia infraestructura (Cloudflare), en un comando. Derivado de Forja (MIT,
// © Horizontes IA). Bilingüe (ES/EN), cero dependencias, Node >= 18.
//
//   npx kooni-bot init [dir]    → descarga el template, te configura el bot y (opcional) despliega
//   npx kooni-bot deploy [dir]  → provisiona Cloudflare y publica el worker
//   npx kooni-bot update [dir]  → trae la versión nueva SIN perder tu config ni datos
//   npx kooni-bot doctor [dir]  → diagnóstico del bot instalado
//   npx kooni-bot version       → versión del CLI
//
// Kooni es open source (MIT). No valida licencia contra servidores: el tier
// free/pro se controla con BOT_TIER en wrangler.toml y un código local en el panel.
import { createInterface } from "node:readline/promises";
import { emitKeypressEvents } from "node:readline";
import { stdin as input, stdout as output } from "node:process";
import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, readdirSync, statSync, cpSync } from "node:fs";
import { realpathSync } from "node:fs";
import { join, basename } from "node:path";
import { homedir } from "node:os";
import { execFileSync, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

const CLI_VERSION = "0.2.13";

const REPO = process.env.KOONI_REPO || "iamnocodeveloper/kooni-bot";
const BRANCH = process.env.KOONI_BRANCH || "main";
const TARBALL = `https://codeload.github.com/${REPO}/tar.gz/refs/heads/${BRANCH}`;
const RAW_VERSION_URL = `https://raw.githubusercontent.com/${REPO}/${BRANCH}/package.json`;
// Control del dueño: check-in al instalar (no bloquea; solo registra quién).
const CHECKIN_URL = process.env.KOONI_CHECKIN_URL || "https://f5gacw7g.function2.insforge.app/registrar-instalacion";

const CFG_DIR = join(homedir(), ".kooni");
const CFG_FILE = join(CFG_DIR, "config.json");
const INSTALLS_FILE = join(CFG_DIR, "installs.json");
const MARKER = ".kooni-bot.json";
const SKILL_DIR = join(homedir(), ".claude", "skills", "kooni");

// ── color ─────────────────────────────────────────────────────────────────────
const C = {
  cyan: (s) => `\x1b[36m${s}\x1b[0m`,
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  b: (s) => `\x1b[1m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
};
const c256 = (n, s) => `\x1b[38;5;${n}m${s}\x1b[0m`;

// ── i18n ─────────────────────────────────────────────────────────────────────
const DICT = {
  es: {
    tagline: "asistentes de IA para tu negocio · open source",
    chooseLang: "Idioma / Language",
    optEs: "Español", optEn: "English",
    commands: "Comandos:",
    // init
    whichDir: "¿En qué carpeta lo instalo? (vacío = actual)",
    download: "Bajando el template de Kooni…",
    templateOk: "template descargado",
    runInit: "El template está listo. Ahora configuramos tu bot:",
    needDir: "No encuentro una instalación de Kooni en:",
    existingProject: "la carpeta ya tiene un proyecto. Usa `kooni-bot update` en su lugar.",
    // onboarding
    prep: "Vamos a preparar tu bot · unas preguntas rápidas (enter = saltar)",
    qSlug: "¿Qué slug quieres para el bot? (corto, ej. mi-negocio)",
    qBusiness: "¿Cómo se llama tu negocio?",
    qBotName: "¿Cómo se llama tu asistente?",
    qLang: "¿En qué idioma debe hablar tu bot?",
    brainQ: "¿Con qué cerebro (modelo de IA) quieres que piense tu bot?",
    brainDesc: "recomendado",
    qApiKey: (label) => `Pega tu API key de ${label} (no se mostrará):`,
    qBaseUrl: "URL base del gateway (ej. https://api.aisa.one/v1)",
    qWhat: "En una frase, ¿a qué se dedica?",
    qOffer: "¿Qué ofreces? (tus servicios o productos principales, con precios si quieres)",
    qHours: "¿Cuál es tu horario de atención?",
    qLoc: "¿Dónde estás? (dirección o 'en línea')",
    qPhone: "¿Un teléfono/WhatsApp de contacto?",
    qWeb: "¿Tienes sitio web o redes sociales? (pega los links, o enter para saltar)",
    qPagos: "¿Qué métodos de pago aceptas? (efectivo, tarjeta, transferencia…)",
    qFaq: "¿Qué es lo que MÁS te pregunta la gente? (separa con |)",
    qReglas: "¿Algo que el bot NO deba hacer o decir? ¿Y cuándo debe pasarte la conversación?",
    qTone: "¿Cómo quieres que suene?",
    toneFriendly: "Cercano", toneFormal: "Formal", tonePlayful: "Divertido",
    tone1: "cercano y amigable, como hablarle a un conocido",
    tone2: "formal y profesional, claro y respetuoso",
    tone3: "relajado y divertido, con chispa pero sin perder claridad",
    configDone: "Config lista · tu bot ya sabe de tu negocio",
    // deploy
    deployAsk: "¿Desplegar en TU cuenta de Cloudflare ahora?",
    login: "Autenticando Cloudflare (abre el navegador)…",
    loginOk: "Cloudflare autenticado",
    creatingResources: "Creando recursos en TU cuenta (D1 + Vectorize + R2)…",
    d1Ok: (id) => `D1 listo (id ${id})`,
    d1Warn: "no se detectó el id de D1 — pégalo a mano en wrangler.toml",
    vectorOk: "Vectorize listo (o ya existía)",
    r2Ok: "R2 listo (o ya existía)",
    r2Warn: "R2 no está habilitado en tu cuenta — el bot funciona sin él (se comenta el binding)",
    secretsTitle: "Guardando secrets en Cloudflare (sin mostrarlos)…",
    secretOk: (k) => `secret ${k} guardado`,
    installing: "Instalando dependencias…",
    migrations: "Aplicando migraciones D1…",
    deploying: "Desplegando el worker…",
    panel: "Panel de administración:",
    next: "Abre tu panel → Conexiones para conectar canales (Telegram, Zernio, WhatsApp…) — ahí mismo se activan y quedan en verde.",
    // update
    updRevalidating: "Buscando la versión nueva…",
    updUpToDate: "Ya estás en la última versión.",
    updDone: (v) => `Actualizado a v${v}  (tu config y tus datos se conservaron)`,
    updBackup: (p) => `Respaldé tu versión anterior en ${p} — por si quieres recuperar algo.`,
    updPreserved: "Se conservaron: tu configuración (member/), tu wrangler.toml y tus datos.",
    updReplaced: "Se actualizó: el motor del bot (todo lo demás).",
    // doctor
    doctorTitle: "Diagnóstico de Kooni",
    okTag: "✓", warnTag: "⚠", badTag: "✗",
    // generic
    ok: "✓", err: "✗",
    noInstallable: "Tu licencia está lista y guardada. El bot Starter llega en breve — te avisamos en la comunidad.",
    // check-in
    qEmail: "¿Tu email? (opcional, para soporte)",
    // error
    templateMissing: "no encontré el instalador en el template.",
    deployFailed: "el deploy falló. Revisa los mensajes de arriba.",
    unknown: "comando desconocido:",
    helpIntro: "instala tu asistente de IA en Cloudflare",
  },
  en: {
    tagline: "AI assistants for your business · open source",
    chooseLang: "Language / Idioma",
    optEs: "Spanish", optEn: "English",
    commands: "Commands:",
    whichDir: "Which folder should I install it in? (empty = current)",
    download: "Downloading the Kooni template…",
    templateOk: "template downloaded",
    runInit: "Template ready. Now let's configure your bot:",
    needDir: "No Kooni install found in:",
    existingProject: "folder already has a project. Use `kooni-bot update` instead.",
    prep: "Let's set up your bot · a few quick questions (enter = skip)",
    qSlug: "What slug do you want? (short, e.g. my-business)",
    qBusiness: "What's your business called?",
    qBotName: "What's your assistant's name?",
    qLang: "What language should your bot speak?",
    brainQ: "Which brain (AI model) should your bot think with?",
    brainDesc: "recommended",
    qApiKey: (label) => `Paste your ${label} API key (hidden):`,
    qBaseUrl: "Gateway base URL (e.g. https://api.aisa.one/v1)",
    qWhat: "In one line, what does it do?",
    qOffer: "What do you offer? (main services or products, with prices if you like)",
    qHours: "What are your hours?",
    qLoc: "Where are you? (address or 'online')",
    qPhone: "A phone/WhatsApp contact?",
    qWeb: "Do you have a website or social profiles? (paste links, or enter to skip)",
    qPagos: "Which payment methods do you accept? (cash, card, transfer…)",
    qFaq: "What do people ask you the MOST? (separate with |)",
    qReglas: "Anything the bot should NOT do or say? And when should it hand the chat to you?",
    qTone: "How should it sound?",
    toneFriendly: "Friendly", toneFormal: "Formal", tonePlayful: "Playful",
    tone1: "friendly and warm, like talking to someone you know",
    tone2: "formal and professional, clear and respectful",
    tone3: "relaxed and playful, with spark but still clear",
    configDone: "Config ready · your bot already knows your business",
    deployAsk: "Deploy to YOUR Cloudflare account now?",
    login: "Authenticating Cloudflare (opens browser)…",
    loginOk: "Cloudflare authenticated",
    creatingResources: "Creating resources on YOUR account (D1 + Vectorize + R2)…",
    d1Ok: (id) => `D1 ready (id ${id})`,
    d1Warn: "couldn't detect the D1 id — paste it manually in wrangler.toml",
    vectorOk: "Vectorize ready (or already existed)",
    r2Ok: "R2 ready (or already existed)",
    r2Warn: "R2 isn't enabled on your account — the bot works without it (binding commented)",
    secretsTitle: "Saving secrets to Cloudflare (without showing them)…",
    secretOk: (k) => `secret ${k} saved`,
    installing: "Installing dependencies…",
    migrations: "Applying D1 migrations…",
    deploying: "Deploying the worker…",
    panel: "Admin dashboard:",
    next: "Open your panel → Connections to connect channels (Telegram, Zernio, WhatsApp…) — they activate and turn green right there.",
    updRevalidating: "Checking for a new version…",
    updUpToDate: "You're on the latest version.",
    updDone: (v) => `Updated to v${v}  (your config and data were preserved)`,
    updBackup: (p) => `Backed up your previous version to ${p} — in case you need to recover.`,
    updPreserved: "Preserved: your config (member/), your wrangler.toml and your data.",
    updReplaced: "Updated: the bot engine (everything else).",
    doctorTitle: "Kooni diagnosis",
    okTag: "✓", warnTag: "⚠", badTag: "✗",
    ok: "✓", err: "✗",
    noInstallable: "Your license is ready and saved. The Starter bot ships shortly.",
    qEmail: "Your email? (optional, for support)",
    templateMissing: "installer not found in template.",
    deployFailed: "deploy failed. Check the messages above.",
    unknown: "unknown command:",
    helpIntro: "install your AI assistant on Cloudflare",
  },
};

let L = "es";
const t = () => DICT[L];
const m = (es, en) => (L === "en" ? en : es);

// Regiones del bot: idioma del panel + moneda + tz. `L` (arriba) es el idioma de
// ESTA CLI; `BOT_LANGUAGE`/memberConfig derivan de la región elegida por el usuario.
const REGIONS = {
  "es-MX": { memberLang: "es", currency: "$", tz: "America/Mexico_City" },
  "es-ES": { memberLang: "es", currency: "€", tz: "Europe/Madrid" },
  "en": { memberLang: "en", currency: "$", tz: "America/New_York" },
  "pt-BR": { memberLang: "pt", currency: "R$", tz: "America/Sao_Paulo" },
};

function normBotLang(v) {
  const s = String(v || "").toLowerCase().replace("_", "-");
  if (["es-mx", "es", "es-419", "latam", "mexico"].includes(s)) return "es-MX";
  if (["es-es", "espana", "españa", "spain"].includes(s)) return "es-ES";
  if (["en", "english", "us", "usa"].includes(s)) return "en";
  if (s.startsWith("pt") || ["brasil", "brazil"].includes(s)) return "pt-BR";
  return "es-MX";
}

const BRAINS = {
  claude: { provider: "anthropic", secret: "ANTHROPIC_API_KEY", label: "Claude" },
  chatgpt: { provider: "openai", secret: "OPENAI_API_KEY", label: "ChatGPT" },
  aisa: { provider: "openai", secret: "OPENAI_API_KEY", label: "AIsa" },
  grok: { provider: "xai", secret: "XAI_API_KEY", label: "Grok" },
  minimax: { provider: "minimax", secret: "MINIMAX_API_KEY", label: "MiniMax" },
  gateway: { provider: "openai", secret: "OPENAI_API_KEY", label: "Gateway" },
};

// ── splash ──────────────────────────────────────────────────────────────────
const KOONI_ART = [
  "██╗  ██╗ ██████╗  ██████╗ ███╗   ██╗██╗",
  "██║ ██╔╝██╔═══██╗██╔═══██╗████╗  ██║██║",
  "█████╔╝ ██║   ██║██║   ██║██╔██╗ ██║██║",
  "██╔═██╗ ██║   ██║██║   ██║██║╚██╗██║██║",
  "██║  ██╗╚██████╔╝╚██████╔╝██║ ╚████║██║",
  "╚═╝  ╚═╝ ╚═════╝  ╚═════╝ ╚═╝  ╚═══╝╚═╝",
];
const KOONI_GRAD = [37, 43, 49, 48, 42, 36];
function kooniSplash() {
  if (process.env.NO_COLOR || process.env.KOONI_NO_ART) {
    console.log("\n  " + C.b("◇ KOONI") + "\n");
    return;
  }
  const out = ["", c256(152, "   · ˚ ✦ ˖ ✧")];
  KOONI_ART.forEach((l, i) => out.push("  " + c256(KOONI_GRAD[i], l)));
  out.push(c256(36, "   ▂▃▄▅▆▇█ tu bot, tu infra █▇▆▅▄▃▂"), "");
  console.log(out.join("\n"));
}
function banner() {
  console.log(C.cyan("\n  ◇ Kooni") + C.dim("  ·  " + t().tagline + "\n"));
}

// ── config ───────────────────────────────────────────────────────────────────
function loadCfg() { try { return JSON.parse(readFileSync(CFG_FILE, "utf8")); } catch { return {}; } }
function saveCfg(o) { mkdirSync(CFG_DIR, { recursive: true }); writeFileSync(CFG_FILE, JSON.stringify(o, null, 2)); }

// Registro local de instalaciones (~/.kooni/installs.json): cada instalación de
// esta computadora queda identificada por su carpeta real + uid de Cloudflare.
// Sirve para que `deploy`/`update`/`doctor` sepan cuál elegir si hay varias.
function loadInstalls() {
  try { return JSON.parse(readFileSync(INSTALLS_FILE, "utf8")); } catch { return []; }
}
function saveInstalls(list) {
  mkdirSync(CFG_DIR, { recursive: true });
  writeFileSync(INSTALLS_FILE, JSON.stringify(list, null, 2));
}
function recordInstall(dir, meta) {
  const real = realpathSync(dir);
  const list = loadInstalls().filter((x) => x && x.dir !== real);
  list.push({ dir: real, ...meta, updatedAt: new Date().toISOString() });
  saveInstalls(list);
}
function listInstalls() {
  return loadInstalls().filter((x) => x && x.dir && existsSync(x.dir));
}

// ── flags / interacción ──────────────────────────────────────────────────────
function parseFlags(args) {
  const flags = {};
  const rest = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = args[i + 1];
      if (next === undefined || next.startsWith("--")) flags[key] = true;
      else { flags[key] = next; i++; }
    } else rest.push(a);
  }
  return { flags, rest };
}

let ASSUME_YES = false;
const interactive = () => !!(input.isTTY && output.isTTY) && !ASSUME_YES;

function agentBriefing(asks, retry) {
  console.log(C.yellow("\n  ── PARA EL AGENTE (Claude Code / Codex) ──  [E-INPUT-REQUIRED]"));
  console.log("  Falta información. Entrevista al usuario EN ESTE ORDEN — UNA pregunta por mensaje,");
  console.log("  espera su respuesta antes de la siguiente:");
  asks.forEach((a, i) => console.log(`   ${i + 1}. ${a}`));
  console.log("  Con sus respuestas, reintenta exactamente así:");
  console.log("  " + C.cyan(retry));
  console.log(C.yellow("  ──────────────────────────────────────────────\n"));
}

async function select(rl, title, items, opts = {}) {
  const def = Math.min(Math.max(opts.default || 0, 0), Math.max(items.length - 1, 0));
  if (!items.length) return def;
  if (opts.value != null && opts.value !== true) {
    const v = String(opts.value).trim().toLowerCase();
    const byKey = items.findIndex((it) => String(it.key || it.label || "").toLowerCase() === v);
    if (byKey >= 0) return byKey;
    const n = parseInt(v, 10);
    if (Number.isInteger(n) && n >= 1 && n <= items.length) return n - 1;
  }
  if (!interactive()) return def;
  let idx = def;
  const hint = opts.hint || (L === "en" ? "↑/↓ move · enter to select" : "↑/↓ para moverte · enter para elegir");
  emitKeypressEvents(input);
  rl.pause();
  const wasRaw = input.isRaw;
  input.setRawMode(true);
  input.resume();
  output.write("\x1b[?25l");
  let count = 0;
  const render = (first) => {
    const lines = [];
    if (title) lines.push(C.b("  " + title));
    items.forEach((it, i) => {
      const on = i === idx;
      const ptr = on ? c256(48, "❯") : " ";
      const lab = on ? c256(48, it.label) : C.dim(it.label);
      lines.push(`  ${ptr} ${lab}${it.desc ? C.dim("   " + it.desc) : ""}`);
    });
    lines.push(C.dim("  " + hint));
    if (!first) output.write(`\x1b[${count}A`);
    output.write("\x1b[0J" + lines.join("\n") + "\n");
    count = lines.length;
  };
  render(true);
  return await new Promise((resolve) => {
    const cleanup = () => {
      input.removeListener("keypress", onKey);
      if (!wasRaw) input.setRawMode(false);
      output.write("\x1b[?25h");
      rl.resume();
    };
    const onKey = (str, key) => {
      key = key || {};
      if (key.name === "up" || key.name === "k") { idx = (idx - 1 + items.length) % items.length; render(false); }
      else if (key.name === "down" || key.name === "j" || key.name === "tab") { idx = (idx + 1) % items.length; render(false); }
      else if (str && /^[1-9]$/.test(str) && Number(str) <= items.length) { idx = Number(str) - 1; render(false); }
      else if (key.name === "return" || key.name === "enter") { cleanup(); resolve(idx); }
      else if (key.ctrl && key.name === "c") { cleanup(); console.log(""); process.exit(130); }
    };
    input.on("keypress", onKey);
  });
}

async function ask(rl, q, val) {
  if (val != null && val !== true) return String(val).trim();
  if (!interactive()) return "";
  return (await rl.question("\n  " + C.b(q) + "\n  " + C.cyan("› "))).trim();
}

// Input oculto para API keys / contraseñas. Reutiliza la MISMA interfaz `rl`
// compartida (crear una segunda readline sobre el mismo stdin competía por los
// datos y nunca recibía Enter → el proceso se quedaba colgado). Enmascara el eco
// parcheando temporalmente `_writeToOutput`: deja pasar solo los saltos de línea.
async function promptSecret(rl, q) {
  if (!interactive()) return "";
  process.stdout.write("\n  " + C.b(q) + "\n  " + C.cyan("› "));

  const orig = rl._writeToOutput;
  let masking = true;
  rl._writeToOutput = (s) => {
    if (!masking) return typeof orig === "function" ? orig.call(rl, s) : process.stdout.write(s);
    // Enmascara lo tecleado; solo deja los saltos de línea.
    if (s === "\r\n" || s === "\n" || s === "\r") process.stdout.write(s);
  };

  try {
    const answer = await rl.question("");
    return answer.trim();
  } finally {
    rl._writeToOutput = orig;
    masking = false;
    process.stdout.write("\n");
  }
}

async function confirm(rl, q) {
  if (!interactive()) return true;
  const a = (await rl.question("\n  " + C.b(q + " (s/N)") + "\n  " + C.cyan("› "))).trim().toLowerCase();
  return ["s", "si", "sí", "y", "yes"].includes(a);
}

// ── red / descarga ───────────────────────────────────────────────────────────
async function fetchTimeout(url, opts = {}, ms = 8000) {
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), ms);
  try { return await fetch(url, { ...opts, signal: ctrl.signal }); } finally { clearTimeout(to); }
}

async function fetchRetry(url, opts = {}, { ms = 15000, tries = 3 } = {}) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetchTimeout(url, opts, ms);
      if (res.status < 500) return res;
      lastErr = new Error(`HTTP ${res.status}`);
    } catch (e) { lastErr = e; }
    if (i < tries - 1) await new Promise((r) => setTimeout(r, 300 * (i + 1)));
  }
  throw lastErr || new Error("network");
}

async function downloadTemplate(dest) {
  const res = await fetchRetry(TARBALL, {}, { ms: 25000, tries: 3 });
  if (!res.ok) {
    throw new Error(m(`no pude bajar el template (HTTP ${res.status}). Revisa tu internet o el repo ${REPO}.`, `could not download template (HTTP ${res.status}). Check internet or repo ${REPO}.`));
  }
  writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
}

// ── extracción (rutas NATIVAS: el tar de Windows no entiende /c/...) ────────
function extractFresh(tgz, dir) {
  mkdirSync(dir, { recursive: true });
  const tmp = join(dir, ".kooni-extract");
  mkdirSync(tmp, { recursive: true });
  execFileSync("tar", ["-xzf", tgz, "-C", tmp]);
  const root = readdirSync(tmp)[0];
  const src = join(tmp, root);
  for (const e of readdirSync(src)) {
    const to = join(dir, e);
    try { rmSync(to, { recursive: true, force: true }); } catch {}
    cpSync(join(src, e), to, { recursive: true });
  }
  rmSync(tmp, { recursive: true, force: true });
  rmSync(tgz, { force: true });
}

// Extrae a un dir TEMP (sin pisar nada) para leer la versión y archivos del template.
function extractToTemp(tgz, outDir) {
  mkdirSync(outDir, { recursive: true });
  execFileSync("tar", ["-xzf", tgz, "-C", outDir]);
  const root = readdirSync(outDir)[0];
  return join(outDir, root);
}

const EXCLUDE_OVER = new Set([
  "member", "wrangler.toml", ".dev.vars", ".dev.vars.example", ".dev.vars.local",
  ".env", ".env.example", ".bot-state.json", ".bot-setup.json", ".git",
  "node_modules", ".wrangler", ".kooni-extract", ".kooni-backups", MARKER, ".bot-version",
]);

function extractOver(tgz, dir) {
  const tmp = join(dir, ".kooni-extract");
  mkdirSync(tmp, { recursive: true });
  const src = extractToTemp(tgz, tmp);
  for (const e of readdirSync(src)) {
    if (EXCLUDE_OVER.has(e)) continue;
    const to = join(dir, e);
    try { rmSync(to, { recursive: true, force: true }); } catch {}
    cpSync(join(src, e), to, { recursive: true });
  }
  rmSync(tmp, { recursive: true, force: true });
  rmSync(tgz, { force: true });
}

function backupBeforeUpdate(dir, version) {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const backDir = join(dir, ".kooni-backups");
  const dest = join(backDir, `${stamp}_v${version}.tgz`);
  try {
    mkdirSync(backDir, { recursive: true });
    execFileSync("tar", ["-czf", dest, "-C", dir,
      "--exclude=./node_modules", "--exclude=./.kooni-backups", "--exclude=./.kooni-extract",
      "--exclude=./.git", "--exclude=./.wrangler", "--exclude=./.dev.vars", "--exclude=./.dev.vars.*",
      "--exclude=./.env", "--exclude=./.env.*", "."]);
    const olds = readdirSync(backDir).filter((f) => f.endsWith(".tgz")).sort();
    for (const f of olds.slice(0, -5)) rmSync(join(backDir, f), { force: true });
    return dest;
  } catch { return null; }
}

// ── markers / detección ──────────────────────────────────────────────────────
function writeMarker(dir, meta) {
  const prev = readMarker(dir) || {};
  writeFileSync(join(dir, MARKER), JSON.stringify({ ...prev, ...meta, updatedAt: new Date().toISOString() }, null, 2));
}

function readMarker(dir) {
  try { return JSON.parse(readFileSync(join(dir, MARKER), "utf8")); } catch { return null; }
}

function readPkgVersion(dir) {
  try {
    const p = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
    return p.version || null;
  } catch { return null; }
}

function isKooni(dir) {
  return existsSync(join(dir, "package.json")) && (existsSync(join(dir, "member")) || existsSync(join(dir, "src", "index.ts")));
}

// Elige la instalación sobre la que actuar. `arg` es una ruta explícita (gana).
// Si no hay ruta, prioriza el cwd; después el registro local `installs.json`;
// y como último recurso escanea los hijos del cwd. Devuelve la ruta o null.
async function resolveBotDir(arg, rl) {
  if (arg && isKooni(arg)) return arg;
  if (isKooni(process.cwd())) return process.cwd();

  const registered = listInstalls();
  if (registered.length === 1) return registered[0].dir;
  if (registered.length > 1) {
    if (!interactive()) {
      console.log(C.yellow("\n  " + m("Hay varias instalaciones de Kooni. Pasa la carpeta explícita:", "Multiple Kooni installs found. Pass an explicit folder:")));
      registered.forEach((x) => console.log("    " + C.cyan(`npx kooni-bot <comando> "${x.dir}"`)));
      process.exit(1);
    }
    const idx = await select(rl, m("¿Cuál instalación?", "Which install?"), registered.map((x) => ({
      key: x.dir,
      label: `${x.slug || basename(x.dir)} · ${x.dir}`,
    })));
    return registered[idx]?.dir || null;
  }

  for (const e of readdirSync(process.cwd())) {
    try {
      const p = join(process.cwd(), e);
      if (statSync(p).isDirectory() && isKooni(p)) return p;
    } catch {}
  }
  return null;
}

// ── exec cross-platform ──────────────────────────────────────────────────────
const isWin = process.platform === "win32";

// Ejecuta un binario de forma segura en Windows/macOS/Linux:
// - Unix/mac: `spawnSync(file, args)` directo.
// - Windows: `npx`/`pnpm` son shims, pero `cmd.exe /c` los resuelve SIN la
//   extensión `.cmd` (probado: `cmd.exe /c pnpm --version` funciona, mientras
//   que `pnpm.cmd` explícito falla con "no se reconoce"). Así que aquí NO se
//   mapea a `.cmd`: se lanza `cmd.exe /c <file> <args...>` con args separados.
//   Nada de `shell: true` ni concatenación → sin EINVAL ni DEP0190.
// - `stdio` hereda por defecto (progreso en vivo); `capture` captura para parsear.
function run(file, args = [], opts = {}) {
  const cwd = opts.cwd;
  const input = opts.input != null ? String(opts.input) : undefined;
  const stdio = opts.stdio || (opts.capture ? ["pipe", "pipe", "pipe"] : "inherit");

  let cmd = file;
  let argv = args;

  if (isWin) {
    cmd = "cmd.exe";
    argv = ["/d", "/c", file, ...args];
  }

  const r = spawnSync(cmd, argv, { cwd, input, stdio, encoding: "utf8" });
  if (r.error) throw r.error;
  if (r.status !== 0) {
    const err = new Error(`Command failed: ${[file, ...args].join(" ")}`);
    err.stdout = r.stdout;
    err.stderr = r.stderr;
    err.status = r.status;
    throw err;
  }
  // En modo capture, combinamos stdout+stderr: wrangler suele imprimir la URL del
  // worker en stderr (progreso/banners), y necesitamos verla para parsearla.
  if (opts.capture) {
    return `${r.stdout || ""}\n${r.stderr || ""}`;
  }
  return (r.stdout || "").toString();
}

// Ejecuta `npx wrangler ...`. `capture` captura stdout/stderr (para parsear);
// por defecto hereda la terminal (progreso visible).
function wrangler(dir, args, opts = {}) {
  return run("npx", ["wrangler", ...args], { cwd: dir, ...opts });
}

// Ejecuta `pnpm ...`, habilitando corepack si no existe pnpm.
function runPnpm(dir, args, opts = {}) {
  try {
    return run("pnpm", args, { cwd: dir, ...opts });
  } catch (e) {
    if (e && /ENOENT|not found|pnpm/.test(String(e.message || ""))) {
      try { run("corepack", ["enable", "pnpm"], { stdio: "ignore" }); } catch {}
      return run("pnpm", args, { cwd: dir, ...opts });
    }
    throw e;
  }
}

// ── config: escribir wrangler.toml / member/config.local.ts / .dev.vars ──────
function sanitizeSlug(s) {
  return String(s || "mi-negocio").toLowerCase().replace(/ /g, "-").replace(/[^a-z0-9-]/g, "").replace(/-+/g, "-").replace(/^-|-$/g, "") || "mi-negocio";
}

function stampWrangler(dir, answers, botUid) {
  const wt = join(dir, "wrangler.toml");
  const example = join(dir, "wrangler.toml.example");
  // El template distribuye wrangler.toml.example; init genera el wrangler.toml real.
  if (!existsSync(wt) && existsSync(example)) {
    cpSync(example, wt);
  }
  if (!existsSync(wt)) return null;
  let s = readFileSync(wt, "utf8");
  const slug = answers.slug;
  // Identidad ÚNICA por instalación: cada bot genera su propio uid de 6 chars y
  // lo usa en worker/D1/Vectorize. Así dos instalaciones en la MISMA cuenta de
  // Cloudflare nunca comparten datos. Si el wrangler.toml ya trae un uid (reinstall
  // en la misma carpeta), se reutiliza.
  const existingUid = (s.match(/name\s*=\s*"kooni-bot-.+-([a-f0-9]{6})"/) || [])[1];
  const uid = existingUid || botUid || randomUUID().replace(/-/g, "").slice(0, 6);
  const resId = slug.replace(/-/g, "_");
  const dbName = `kooni_${resId}_${uid}_db`;
  const kbName = `kooni_${resId}_${uid}_kb`;
  const workerName = `kooni-bot-${slug}-${uid}`;
  const R = REGIONS[answers.lang] || REGIONS["es-MX"];

  const set = (re, val) => { s = s.replace(re, val); };

  set(/^name\s*=\s*"[^"]*"/m, `name = "${workerName}"`);
  set(/BOT_NAME\s*=\s*"[^"]*"/g, `BOT_NAME = "${String(answers.botName).replace(/"/g, "'")}"`);
  set(/BUSINESS_NAME\s*=\s*"[^"]*"/g, `BUSINESS_NAME = "${String(answers.businessName).replace(/"/g, "'")}"`);
  set(/BOT_LANGUAGE\s*=\s*"[^"]*"/g, `BOT_LANGUAGE = "${answers.lang}"`);
  set(/BOT_TIER\s*=\s*"[^"]*"/g, `BOT_TIER = "${answers.tier}"`);
  set(/BUFFER_SECONDS\s*=\s*"[^"]*"/g, `BUFFER_SECONDS = "${answers.bufferSeconds || "15"}"`);
  set(/DASHBOARD_BASE_URL\s*=\s*"[^"]*"/g, `DASHBOARD_BASE_URL = ""`);
  set(/database_name\s*=\s*"[^"]*"/, `database_name = "${dbName}"`);
  set(/index_name\s*=\s*"[^"]*"/, `index_name = "${kbName}"`);
  // El id del demo no sirve: placeholder hasta que `deploy` lo reemplace.
  set(/database_id\s*=\s*"[^"]*"[^\n]*/, `database_id = "{{D1_DATABASE_ID}}"  # pon aquí el id real de: npx wrangler d1 create ${dbName}`);

  // LLM_PROVIDER: en anthropic se omite (es default). Gateway/base-url se agregan.
  // Trabajamos SOLO sobre la sección [vars] (entre "[vars]" y la siguiente "[…]").
  const varsMatch = s.match(/\n\s*\[vars\][\s\S]*?(?=\n\s*\[[^\]]|\n\s*$)/);
  const hasInVars = (key) => {
    if (!varsMatch) return false;
    return new RegExp(`^\\s*${key}\\s*=`, "m").test(varsMatch[0]);
  };

  // Identidad de instalación para ligar licencias (ver src/license.ts + limits.ts).
  if (hasInVars("BOT_INSTANCE_ID")) {
    set(/BOT_INSTANCE_ID\s*=\s*"[^"]*"/g, `BOT_INSTANCE_ID = "${uid}"`);
  } else {
    s = s.replace(/^(\s*\[vars\][^\n]*\n)/m, `$1BOT_INSTANCE_ID = "${uid}"\n`);
  }

  if (answers.provider !== "anthropic") {
    if (hasInVars("LLM_PROVIDER")) {
      set(/LLM_PROVIDER\s*=\s*"[^"]*"/g, `LLM_PROVIDER = "${answers.provider}"`);
    } else {
      s = s.replace(/^(\s*\[vars\][^\n]*\n)/m, `$1LLM_PROVIDER = "${answers.provider}"\n`);
    }
  } else {
    s = s.replace(/^(\s*LLM_PROVIDER\s*=\s*"[^"]*"[^\n]*\n)/gm, "");
  }
  if (answers.baseUrl) {
    if (hasInVars("OPENAI_API_BASE_URL")) {
      set(/OPENAI_API_BASE_URL\s*=\s*"[^"]*"/g, `OPENAI_API_BASE_URL = "${answers.baseUrl}"`);
    } else {
      s = s.replace(/^(\s*\[vars\][^\n]*\n)/m, `$1OPENAI_API_BASE_URL = "${answers.baseUrl}"\n`);
    }
  } else {
    s = s.replace(/^(\s*OPENAI_API_BASE_URL\s*=\s*"[^"]*"[^\n]*\n)/gm, "");
  }

  writeFileSync(wt, s);
  return { uid, dbName, kbName, workerName, tz: R.tz, currency: R.currency };
}

function renderMemberConfig(answers, meta) {
  const j = (v) => JSON.stringify(v ?? "");
  const services = answers.offer
    ? [{ name: answers.offer, price: 0 }]
    : [];
  const paymentMethods = (answers.pagos || "").split(/[,;·]+/).map((x) => x.trim()).filter(Boolean);
  const faqList = (answers.faq || "").split(/\|/).map((x) => x.trim()).filter(Boolean);
  const customFields = {};
  if (answers.what) customFields.queHacemos = answers.what;
  if (answers.offer) customFields.ofrecemos = answers.offer;
  if (faqList.length) customFields.preguntasFrecuentes = faqList.join(" | ");
  if (answers.reglas) customFields.reglasYEscalacion = answers.reglas;
  if (answers.web) customFields.sitioWebYRedes = answers.web;
  if (answers.tone) customFields.tono = answers.tone;

  const memberConfig = {
    businessName: answers.businessName || "",
    botName: answers.botName || "Asistente",
    language: meta.memberLang,
    tier: answers.tier === "pro" ? "pro" : "free",
    timezone: meta.tz,
    currency: meta.currency,
    contactEmail: answers.email || "",
  };

  const businessConfig = {
    hours: answers.hours || "",
    services,
    location: answers.location || "",
    paymentMethods,
    contactPhone: answers.phone || "",
    customFields,
  };

  return `// member/config.local.ts — config del negocio (generado por kooni-bot init)
// NUNCA se sobrescribe en updates. Edita aquí o desde el panel → Configuración.

export const memberConfig = ${JSON.stringify(memberConfig)};

export type MemberConfig = typeof memberConfig;

export const businessConfig = ${JSON.stringify(businessConfig)} as {
  hours: string;
  services: { name: string; price: number }[];
  location: string;
  paymentMethods: string[];
  contactPhone: string;
  customFields: Record<string, string>;
};

export const catalog: { name: string; price: number; description?: string; sku?: string }[] = [];
`;
}

function writeDevVars(dir, answers, kbToken) {
  const lines = [
    "# KOONI — secrets locales (generados por kooni-bot init · NUNCA commitees)",
    `LLM_PROVIDER=${answers.provider}`,
  ];
  if (answers.baseUrl) lines.push(`OPENAI_API_BASE_URL=${answers.baseUrl}`);
  // La API key NO se escribe en disco por defecto: se guarda como secret remoto.
  lines.push("# " + answers.secret + "=<tu-api-key>  ← para wrangler dev local, pégalo aquí (o usa el panel)");
  lines.push(`DASHBOARD_PASSWORD=${answers.dashPassword || "kooni-local-password"}`);
  lines.push(`KB_REINDEX_TOKEN=${kbToken}`);
  writeFileSync(join(dir, ".dev.vars"), lines.join("\n") + "\n");
}

function collectAnswers(flags) {
  const rawBrain = String(flags.cerebro || flags.brain || "").trim().toLowerCase();
  const brainKey = ({ claude: "claude", anthropic: "claude", chatgpt: "chatgpt", openai: "chatgpt", gpt: "chatgpt", aisa: "aisa", grok: "grok", xai: "grok", minimax: "minimax", gateway: "gateway" })[rawBrain] || null;
  const tone = ({ cercano: "cercano", friendly: "cercano", formal: "formal", divertido: "divertido", playful: "divertido" })[String(flags.tono || "").trim().toLowerCase()] || null;

  // Lo que vino por flag se conserva; lo que NO vino queda undefined para que
  // `onboarding()` lo pregunte (interactivo) o use el default (no-interactivo).
  return {
    slug: flags.slug ? sanitizeSlug(flags.slug) : undefined,
    uid: String(flags.uid || "").trim().toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 6) || undefined,
    businessName: String(flags.negocio || flags.nombre || flags.name || "").trim() || undefined,
    botName: String(flags["bot-name"] || "").trim() || undefined,
    lang: flags.lang ? normBotLang(flags.lang) : undefined,
    tier: flags.tier ? (String(flags.tier).trim().toLowerCase() === "pro" ? "pro" : "free") : undefined,
    provider: brainKey ? BRAINS[brainKey].provider : undefined,
    brainKey,
    baseUrl: String(flags["base-url"] || "").trim() || undefined,
    secret: brainKey ? BRAINS[brainKey].secret : undefined,
    apiKey: String(flags["api-key"] || "").trim() || undefined,
    what: String(flags.que || "").trim() || undefined,
    offer: String(flags.ofrece || "").trim() || undefined,
    hours: String(flags.horario || "").trim() || undefined,
    location: String(flags.ubicacion || "").trim() || undefined,
    phone: String(flags.telefono || "").trim() || undefined,
    web: String(flags.web || flags.redes || "").trim() || undefined,
    pagos: String(flags.pagos || "").trim() || undefined,
    faq: String(flags.faq || "").trim() || undefined,
    reglas: String(flags.reglas || "").trim() || undefined,
    tone,
    email: String(flags.email || "").trim() || undefined,
  };
}

// Pregunta lo que falte, uno a uno. En interactivo muestra menús reales; en
// no-interactivo (`--yes`/agente) usa defaults. `defaultDir` alimenta el slug.
async function onboarding(rl, answers, defaultDir) {
  console.log("\n  " + C.dim(t().prep));

  if (!answers.slug) {
    const dflt = sanitizeSlug(defaultDir || "mi-negocio");
    const v = await ask(rl, t().qSlug, undefined);
    answers.slug = v ? sanitizeSlug(v) : dflt;
  }
  if (!answers.businessName) answers.businessName = await ask(rl, t().qBusiness, undefined) || "";
  if (!answers.botName) answers.botName = await ask(rl, t().qBotName, undefined) || "Asistente";

  const langKeys = Object.keys(REGIONS);
  const langIdx = await select(rl, t().qLang, langKeys.map((k) => ({ key: k, label: k })), { value: answers.lang, default: 0 });
  answers.lang = langKeys[langIdx] || "es-MX";

  // El plan NO se pregunta: se instala en free y la activación de plan/clave se
  // hace después desde el dashboard. Aquí solo fijamos el default.
  answers.tier = answers.tier || "free";

  const brainKeys = ["claude", "chatgpt", "aisa", "grok", "minimax", "gateway"];
  const brainIdx = await select(rl, t().brainQ, brainKeys.map((k) => ({
    key: k, label: BRAINS[k].label,
    desc: k === "claude" ? t().brainDesc
      : k === "chatgpt" ? "key directa de OpenAI (sk-proj-…)"
      : k === "aisa" ? "key de AIsa (sk-ais…) · gateway api.aisa.one/v1"
      : k === "gateway" ? "OpenRouter / cualquier gateway" : "",
  })), { value: answers.brainKey, default: 0 });
  answers.brainKey = brainKeys[brainIdx] || "claude";
  answers.provider = BRAINS[answers.brainKey].provider;
  answers.secret = BRAINS[answers.brainKey].secret;
  if (answers.brainKey === "gateway" && !answers.baseUrl) {
    answers.baseUrl = await ask(rl, t().qBaseUrl, undefined) || "https://api.aisa.one/v1";
  }
  if (answers.brainKey === "aisa" && !answers.baseUrl) {
    answers.baseUrl = "https://api.aisa.one/v1";
    console.log("  " + C.yellow("ℹ️  AIsa configurado con OPENAI_API_BASE_URL=https://api.aisa.one/v1."));
  }

  // La API key se pide aquí, apenas se elige el cerebro — y se conserva para el
  // deploy (se guarda como secret sin mostrarla). En no-interactivo se salta.
  if (!answers.apiKey) {
    answers.apiKey = await promptSecret(rl, t().qApiKey(BRAINS[answers.brainKey].label));
  }

  // Guard de gateway: si la key es de AIsa (o un gateway) y NO hay base URL, el
  // bot desplegaría pero contestaría "Algo falló de mi lado" (401 contra OpenAI
  // directo). Detectamos la key y la arreglamos o avisamos en el acto.
  if (answers.provider === "openai" && !answers.baseUrl && answers.apiKey) {
    const raw = String(answers.apiKey).trim();
    const k = raw.toLowerCase();
    if (k.startsWith("sk-ais") || k.includes("aisa")) {
      answers.baseUrl = "https://api.aisa.one/v1";
      console.log("  " + C.yellow("ℹ️  Detecté una key de AIsa — configuré OPENAI_API_BASE_URL=https://api.aisa.one/v1 automáticamente."));
    } else if (!/^sk-proj-/.test(raw) && !/^sk-[A-Za-z0-9]{48}$/.test(raw)) {
      console.warn("  " + C.yellow("⚠️  Tu key de OpenAI no parece directa (sk-proj-…). Si es de un gateway (AIsa/OpenRouter), el bot NO contestará sin OPENAI_API_BASE_URL en wrangler.toml — agrega el var o repite init eligiendo 'Gateway'."));
    }
  }

  answers.what = answers.what ?? (await ask(rl, t().qWhat, undefined) || "");
  answers.offer = answers.offer ?? (await ask(rl, t().qOffer, undefined) || "");
  answers.hours = answers.hours ?? (await ask(rl, t().qHours, undefined) || "");
  answers.location = answers.location ?? (await ask(rl, t().qLoc, undefined) || "");
  answers.phone = answers.phone ?? (await ask(rl, t().qPhone, undefined) || "");
  answers.web = answers.web ?? (await ask(rl, t().qWeb, undefined) || "");
  answers.pagos = answers.pagos ?? (await ask(rl, t().qPagos, undefined) || "");
  answers.faq = answers.faq ?? (await ask(rl, t().qFaq, undefined) || "");
  answers.reglas = answers.reglas ?? (await ask(rl, t().qReglas, undefined) || "");

  const toneIdx = await select(rl, t().qTone, [
    { key: "cercano", label: t().toneFriendly, desc: t().tone1 },
    { key: "formal", label: t().toneFormal, desc: t().tone2 },
    { key: "divertido", label: t().tonePlayful, desc: t().tone3 },
  ], { value: answers.tone, default: 0 });
  answers.tone = ["cercano", "formal", "divertido"][toneIdx] || "cercano";

  return answers;
}

// ── deploy ───────────────────────────────────────────────────────────────────
const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

function parseD1Id(raw) {
  const m = String(raw || "").match(UUID_RE);
  return m ? m[0] : "";
}

// Extrae el id de una D1 por nombre desde la salida de `wrangler d1 list`. Sabe
// leer el JSON de `--json` (objeto por db) y, si no es JSON, cae a regex.
function findD1IdByName(raw, name) {
  const s = String(raw || "");
  try {
    const parsed = JSON.parse(s);
    const arr = Array.isArray(parsed) ? parsed : parsed.result;
    if (Array.isArray(arr)) {
      const hit = arr.find((d) => d && (d.name === name || d.database_name === name));
      if (hit && hit.uuid) return hit.uuid;
    }
  } catch { /* no es JSON → regex */ }
  const m = s.match(new RegExp(`${name}[\\s\\S]{0,200}?(${UUID_RE.source})`, "i"));
  return m ? m[1] : "";
}

function patchWranglerFile(dir, fn) {
  const wt = join(dir, "wrangler.toml");
  if (!existsSync(wt)) return;
  const s = readFileSync(wt, "utf8");
  writeFileSync(wt, fn(s));
}

async function deployBot(dir, { flags = {}, rl } = {}) {
  const wt = join(dir, "wrangler.toml");
  if (!existsSync(wt)) throw new Error(m("no encuentro wrangler.toml en " + dir, "can't find wrangler.toml in " + dir));

  const wantDeploy = await confirm(rl, t().deployAsk);
  if (!wantDeploy) { console.log(C.dim("  " + m("puedes hacerlo luego con: npx kooni-bot deploy", "you can deploy later with: npx kooni-bot deploy"))); return null; }

  // login
  process.stdout.write(C.dim("  " + t().login + "\n"));
  wrangler(dir, ["login"]);
  console.log("  " + C.green("✓") + " " + t().loginOk);

  // recursos (nombres ÚNICOS por instalación, ya estampados en wrangler.toml)
  console.log("\n  " + C.dim(t().creatingResources));
  const wtRaw = readFileSync(wt, "utf8");
  const dbName = (wtRaw.match(/database_name\s*=\s*"([^"]+)"/) || [])[1] || "kooni_db";
  const kbName = (wtRaw.match(/index_name\s*=\s*"([^"]+)"/) || [])[1] || "kooni_kb";

  let d1Id = "";
  try {
    const out = wrangler(dir, ["d1", "create", dbName], { capture: true });
    d1Id = parseD1Id(out);
  } catch {}
  if (!d1Id) {
    try {
      // `--json` da un JSON limpio; si falla, caemos al texto plano.
      let list = "";
      try { list = wrangler(dir, ["d1", "list", "--json"], { capture: true }); }
      catch { list = wrangler(dir, ["d1", "list"], { capture: true }); }
      d1Id = findD1IdByName(list, dbName);
    } catch {}
  }
  if (!d1Id) {
    // Sin id real NO podemos migrar ni desplegar: el placeholder rompe wrangler.
    throw new Error(m(
      `no pude crear/encontrar la base D1 "${dbName}". Córrelo a mano (npx wrangler d1 create ${dbName}) y pega el id en wrangler.toml, luego reintenta kooni-bot deploy.`,
      `couldn't create/find the D1 database "${dbName}". Run it manually (npx wrangler d1 create ${dbName}), paste the id into wrangler.toml, then retry kooni-bot deploy.`,
    ));
  }
  patchWranglerFile(dir, (s) => s.replace(/database_id\s*=\s*"[^"]*"/, `database_id = "${d1Id}"`));
  console.log("  " + C.green("✓") + " " + t().d1Ok(d1Id));

  try { wrangler(dir, ["vectorize", "create", kbName, "--dimensions=1024", "--metric=cosine"], { capture: true }); } catch {}
  console.log("  " + C.green("✓") + " " + t().vectorOk);

  try {
    wrangler(dir, ["r2", "bucket", "create", "kooni-bot-catalog"], { capture: true });
    console.log("  " + C.green("✓") + " " + t().r2Ok);
  } catch {
    console.log("  " + C.yellow("⚠") + " " + t().r2Warn);
    patchWranglerFile(dir, (s) => s
      .replace(/\[\[r2_buckets\]\]/, "# [[r2_buckets]] (R2 no habilitado — opcional)")
      .replace(/^binding\s*=\s*"CATALOG"/m, '# binding = "CATALOG"')
      .replace(/^bucket_name\s*=\s*"[^"]*"/m, '# bucket_name = "kooni-bot-catalog"'));
  }

  // secrets (sin mostrarlos)
  console.log("\n  " + C.dim(t().secretsTitle));

  // API key: viene del onboarding (o de --api-key). Si no está y no-interactivo,
  // se delega al agente (wrangler secret put). No se vuelve a preguntar aquí.
  let apiKey = flags["api-key"] || "";
  if (apiKey) {
    wrangler(dir, ["secret", "put", BRAINS[flags.brainKey || "claude"].secret], { input: apiKey, capture: true });
    console.log("  " + C.green("✓") + " " + t().secretOk(BRAINS[flags.brainKey || "claude"].secret));
  } else if (!interactive()) {
    console.log(C.yellow("\n  ── PARA EL AGENTE ──  falta la API key de IA."));
    console.log("  " + C.cyan(`npx wrangler secret put ${BRAINS[flags.brainKey || "claude"].secret}`));
    console.log("  " + m("Pídele la llave al usuario y guárdala tú (entrada oculta).", "Ask the user for the key and save it (hidden input)."));
  } else {
    console.log("  " + C.yellow("⚠") + " " + m("sin API key — el bot no responderá hasta que la pongas desde el panel (Configuración → Modelo de IA).", "no API key — the bot won't reply until you set it from the panel (Settings → AI Model)."));
  }

  let dash = "";
  if (interactive()) dash = await promptSecret(rl, m("Elige una contraseña para el panel /admin (usuario: admin):", "Choose a password for the /admin dashboard (user: admin):"));
  if (!dash) dash = "kooni-local-password";
  wrangler(dir, ["secret", "put", "DASHBOARD_PASSWORD"], { input: dash, capture: true });
  console.log("  " + C.green("✓") + " " + t().secretOk("DASHBOARD_PASSWORD"));

  // KB token desde .dev.vars
  try {
    const dv = readFileSync(join(dir, ".dev.vars"), "utf8");
    const m = dv.match(/^KB_REINDEX_TOKEN=(.+)$/m);
    if (m && m[1]) {
      wrangler(dir, ["secret", "put", "KB_REINDEX_TOKEN"], { input: m[1], capture: true });
      console.log("  " + C.green("✓") + " " + t().secretOk("KB_REINDEX_TOKEN"));
    }
  } catch {}

  // dependencias + migraciones + deploy (progreso visible en vivo)
  console.log("\n  " + C.dim(t().installing));
  console.log("  " + C.dim(m("esto puede tardar unos minutos la primera vez (descarga el runtime y compila dependencias).", "this may take a few minutes the first time (downloads the runtime and builds native deps).")));
  runPnpm(dir, ["install"]);
  console.log("  " + C.green("✓") + " " + m("dependencias listas", "dependencies ready"));

  console.log("  " + C.dim(t().migrations));
  wrangler(dir, ["d1", "execute", dbName, "--file=src/db/schema.sql", "--remote"]);
  console.log("  " + C.green("✓") + " " + m("migraciones aplicadas", "migrations applied"));

  console.log("  " + C.dim(t().deploying));
  let url = "";
  try {
    const dep = runPnpm(dir, ["run", "deploy"], { capture: true });
    // La URL real incluye el subdominio de la cuenta: <worker>.<cuenta>.workers.dev
    url = (dep.match(/https:\/\/[a-z0-9-]+(?:\.[a-z0-9-]+)*\.workers\.dev/) || [])[0] || "";
  } catch (e) {
    // Muestra el detalle real del deploy en vez de tragarlo: así el usuario ve
    // qué falló (deploy-check, binding, auth…) y puede corregirlo.
    const tail = ((e && (e.stderr || e.stdout || e.message)) || "").toString().trim().split("\n").slice(-12).join("\n");
    if (tail) console.log(C.red("  ✗ " + tail));
    throw new Error(t().deployFailed);
  }
  if (url) {
    patchWranglerFile(dir, (s) => s.replace(/DASHBOARD_BASE_URL\s*=\s*"[^"]*"/g, `DASHBOARD_BASE_URL = "${url}"`));
    try { runPnpm(dir, ["run", "deploy"], { capture: true }); } catch {}
  } else {
    console.log(C.yellow("  ⚠ " + m("no se detectó la URL del worker — revisa la salida del deploy", "couldn't detect the worker URL — check the deploy output")));
  }
  // Persistir identidad de Cloudflare en el marker (para update/doctor/selector).
  writeMarker(dir, { databaseId: d1Id, workerUrl: url || undefined, dbName, kbName });
  return url;
}

// ── check-in (no bloqueante) ─────────────────────────────────────────────────
async function checkin(dir, answers, version) {
  if (process.env.KOONI_NO_CHECKIN === "1" || process.env.KOONI_SILENT === "1") return;
  try {
    const marker = readMarker(dir) || {};
    const slug = answers.slug || marker.slug || basename(dir);
    await fetchTimeout(CHECKIN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: answers.email || undefined,
        slug,
        uid: marker.uid,
        workerName: marker.workerName,
        dbName: marker.dbName,
        kbName: marker.kbName,
        workerUrl: marker.workerUrl || `https://kooni-bot-${slug}.workers.dev`,
        cliVersion: CLI_VERSION,
        botVersion: version,
        tier: answers.tier,
        provider: answers.provider,
        platform: process.platform,
      }),
    }, 4000);
  } catch { /* fire-and-forget */ }
}

// ── skill de agente ─────────────────────────────────────────────────────────
const AGENT_SKILL = `---
name: kooni
description: Guía para operar Kooni con el CLI \`kooni-bot\` — instalar, configurar, desplegar y mantener chatbots de IA open source (MIT) en la Cloudflare del usuario. Actívala cuando el usuario quiera "instalar Kooni", "crear/montar un chatbot", "actualizar mi bot", "diagnosticar mi bot", "configurar mi bot", o mencione kooni-bot, kooni o Kooni.
---

# Kooni — instalar y operar chatbots con el CLI \`kooni-bot\`

Eres el asistente que maneja Kooni POR el usuario. La persona probablemente **no programa**
y casi nunca verá la terminal: **tú corres los comandos y tú haces las preguntas en el chat**.
REGLA DE ORO: **una pregunta por mensaje** — espera la respuesta antes de la siguiente.

## Qué es Kooni
Un asistente de IA multicanal (WhatsApp, Instagram, Messenger, Telegram…) **open source
(MIT)**. El CLI \`kooni-bot\` instala el bot en la **cuenta de Cloudflare del usuario**, con
**sus llaves**. El bot y sus datos son del usuario. Tú NO eres el chatbot: tú eres el
constructor. No hay licencia ni servidor de Horizontes: el tier free/pro se controla con
\`BOT_TIER\` en \`wrangler.toml\` y un código local en el panel.

## Comandos del CLI
- \`npx kooni-bot init [dir]\` — descarga el template, configura (idioma, negocio, cerebro) y ofrece desplegar.
- \`npx kooni-bot deploy [dir]\` — provisiona Cloudflare (login, D1/Vectorize/R2, secrets, migraciones, deploy).
- \`npx kooni-bot update [dir]\` — trae la versión nueva conservando \`member/\`, \`wrangler.toml\` y datos.
- \`npx kooni-bot update --all\` — actualiza TODAS las instalaciones registradas en esta computadora.
- \`npx kooni-bot doctor [dir]\` — diagnostica el bot instalado.
- \`npx kooni-bot version\`.

## Conexión de canales (DESDE el panel, sin redeploy)
- Telegram y Zernio se conectan pegando su token/API key en \`/admin/conexiones\`. Se guardan en D1 (\`settings\`) y el canal se pone verde al instante, SIN \`wrangler secret put\` ni redeploy.
- **Telegram registra su webhook automáticamente** al guardar el token (setWebhook apuntando a <worker>/webhooks/telegram). En la misma card se puede poner el chat id del dueño para los avisos de handoff (alternativa al secret \`OWNER_TELEGRAM_CHAT_ID\`).
- La URL del webhook de cada canal se muestra en su propia card (con botón copiar).

## Regla de oro (memorízala)
| Carpeta / archivo | Qué pasa al actualizar |
|---|---|
| \`member/\` (config, KB) | **SE CONSERVA SIEMPRE.** |
| \`src/\` (motor del bot) | Se sobrescribe con la versión nueva. |
| Secrets de Cloudflare | **No se tocan.** |
| Datos en D1 | **No se borran.** |
| \`wrangler.toml\` | **Se conserva** en update (lo estampó init). |

Si dudas: **member/ es sagrado, src/ se actualiza.**

## Instalación de cero (resumen)
1. \`npx kooni-bot init\` (o \`init --yes --slug <slug> --negocio "…" --cerebro claude\` para agentes/CI).
2. \`npx kooni-bot deploy\` (login de Cloudflare, D1/Vectorize/R2, secrets, migraciones, deploy).
3. Abrir el panel en \`https://<worker>.workers.dev/admin\` (usuario \`admin\` + \`DASHBOARD_PASSWORD\`).
4. Conectar canales DESPUÉS del primer deploy (Telegram primero, ~5 min) desde \`/admin/conexiones\`.

## Secrets y vars (referencia rápida)
- Secrets: \`ANTHROPIC_API_KEY\` / \`OPENAI_API_KEY\` / \`XAI_API_KEY\` (cerebro), \`DASHBOARD_PASSWORD\` (panel), \`KB_REINDEX_TOKEN\` (reindex).
- Canales: \`TELEGRAM_BOT_TOKEN\`, \`MANYCHAT_API_KEY\`, \`TWILIO_ACCOUNT_SID\`+\`TWILIO_AUTH_TOKEN\`+\`TWILIO_WA_FROM\`, \`META_PAGE_ACCESS_TOKEN\`+\`META_VERIFY_TOKEN\`+\`META_APP_SECRET\`, \`ZERNIO_API_KEY\`.
- Avisos al dueño: \`OWNER_TELEGRAM_CHAT_ID\` (o el campo "chat id" de la card Telegram en Conexiones), \`RESEND_API_KEY\`+\`OWNER_EMAIL\`, \`OWNER_WA_NUMBER\`.
- Vars en \`wrangler.toml\`: \`BOT_NAME\`, \`BUSINESS_NAME\`, \`BOT_LANGUAGE\`, \`BOT_TIER\`, \`BUFFER_SECONDS\`, \`DASHBOARD_BASE_URL\`, \`LLM_PROVIDER\` (\`anthropic\` default | \`openai\` | \`xai\`).

## Comandos del proyecto (dentro de la carpeta del bot, con pnpm)
- \`pnpm install\` — dependencias.
- \`pnpm run deploy\` — desplegar (corre el predeploy check).
- \`pnpm db:apply:remote\` — migraciones D1 en producción.
- \`pnpm kb:reindex\` — regenera fixtures desde \`member/kb/\`.
- \`pnpm typecheck\` / \`pnpm test\` — verificación.

## Reglas
- Habla español sencillo (LATAM), una pregunta a la vez.
- **Nunca pegues tokens/keys en el chat** — siempre \`wrangler secret put\`.
- No toques \`member/\` más allá de lo que indican los pasos.
- El panel no tiene login por email: solo Basic Auth (\`admin\` + \`DASHBOARD_PASSWORD\`).

## Skills del template (una vez instalado el bot)
- \`skill/configurar-mi-chatbot.md\` — instalación guiada en 4 fases.
- \`skill/actualizar-mi-bot.md\` — actualización paso a paso.
- \`skill/reporte.md\` / \`skill/exportar.md\` — operación diaria.
`;

function installAgentSkill(flags = {}) {
  if (flags["no-agent-skill"] || process.env.KOONI_NO_AGENT_SKILL) return;
  try {
    const file = join(SKILL_DIR, "SKILL.md");
    let prev = null;
    try { prev = readFileSync(file, "utf8"); } catch {}
    if (prev === AGENT_SKILL) return;
    mkdirSync(SKILL_DIR, { recursive: true });
    writeFileSync(file, AGENT_SKILL);
    console.log(C.dim(prev == null
      ? "  ✎ guía de Kooni instalada para tu agente  →  ~/.claude/skills/kooni/"
      : "  ✎ guía de tu agente actualizada"));
  } catch { /* no romper el flujo por esto */ }
}

// ── comandos ─────────────────────────────────────────────────────────────────
async function cmdInit(flags, rest) {
  const cfg = loadCfg();
  ASSUME_YES = !!(flags.yes || process.env.KOONI_YES);
  if (flags.lang === "en" || cfg.lang === "en") L = "en";

  kooniSplash();
  installAgentSkill(flags);

  const rl = createInterface({ input, output });
  try {
    const langKeys = ["es", "en"];
    if (!cfg.lang) {
      const i = await select(rl, t().chooseLang, langKeys.map((k) => ({ key: k, label: k === "es" ? DICT.es.optEs : DICT.en.optEn })));
      L = langKeys[i] || "es";
      cfg.lang = L; saveCfg(cfg);
    } else {
      console.log("");
    }
    console.log(C.dim("  " + t().tagline + "\n"));

    // directorio destino
    let dir = rest[0] ? join(process.cwd(), rest[0]) : process.cwd();
    if (!rest[0]) {
      const ans = await ask(rl, t().whichDir, flags.dir);
      if (ans) dir = join(process.cwd(), ans);
    }
    mkdirSync(dir, { recursive: true });
    if (!isKooni(dir) && existsSync(join(dir, "package.json"))) {
      console.log(C.red("  ✗ " + t().existingProject) + "\n");
      process.exit(1);
    }

    // descargar + extraer
    const tgz = join(dir, ".kooni-template.tgz");
    process.stdout.write(C.dim("  " + t().download + "\n"));
    await downloadTemplate(tgz);
    extractFresh(tgz, dir);
    console.log("  " + C.green("✓") + " " + t().templateOk);
    const version = readPkgVersion(dir) || "0.0.0";

    // config
    console.log("\n  " + C.cyan("◇ ") + C.b(t().runInit));
    const answers = collectAnswers(flags);
    await onboarding(rl, answers, basename(dir));

    const meta = stampWrangler(dir, answers, answers.uid);
    const kbToken = "kooni-reindex-" + randomUUID().replace(/-/g, "").slice(0, 12);
    if (existsSync(join(dir, "member"))) {
      const region = REGIONS[answers.lang] || REGIONS["es-MX"];
      writeFileSync(join(dir, "member", "config.local.ts"), renderMemberConfig(answers, {
        memberLang: region.memberLang,
        tz: (meta && meta.tz) || region.tz,
        currency: (meta && meta.currency) || region.currency,
      }));
    }
    writeDevVars(dir, answers, kbToken);
    writeMarker(dir, {
      slug: answers.slug,
      version,
      lang: L,
      uid: (meta && meta.uid) || answers.uid,
      workerName: meta && meta.workerName,
      dbName: meta && meta.dbName,
      kbName: meta && meta.kbName,
    });
    console.log("\n  " + C.green("✓") + " " + t().configDone);
    console.log("  " + C.green("✓") + " " + m(`Bot instalado  →  ${dir}`, `Bot installed  →  ${dir}`));

    // Registrar la instalación local para el selector multi-bot.
    recordInstall(dir, {
      slug: answers.slug,
      uid: (meta && meta.uid) || answers.uid,
      workerName: meta && meta.workerName,
      dbName: meta && meta.dbName,
      kbName: meta && meta.kbName,
    });

    // deploy (si no lo deshabilitan)
    if (!flags["no-deploy"] && !process.env.KOONI_NO_DEPLOY) {
      const deployFlags = { ...flags, brainKey: answers.brainKey, "api-key": answers.apiKey || "" };
      const url = await deployBot(dir, { flags: deployFlags, rl });
      if (url) {
        console.log("\n  " + C.green(C.b(m("🎉 BOT EN LÍNEA", "🎉 BOT LIVE"))));
        console.log("  " + C.cyan(t().panel) + " " + C.b(url + "/admin"));
        console.log("\n  " + C.b(m("Lo que sigue (tu agente de Claude Code lo hace por ti):", "Next steps (your Claude Code agent does them for you):")));
        console.log("  1. " + C.dim(m("abre tu panel en el link de arriba (usuario admin + tu contraseña)", "open your panel at the link above (user admin + your password)")));
        console.log("  2. " + C.dim(m("Conexiones → pega tu token de Telegram: lo valida y registra el webhook solo", "Connections → paste your Telegram token: it validates and registers the webhook automatically")));
        console.log("  3. " + C.dim(m("en la misma card, pega tu chat id (mándale /start a tu bot y míralo con @userinfobot) para recibir los avisos de handoff", "on the same card, paste your chat id (send /start to your bot and see it with @userinfobot) to get handoff alerts")));
        console.log("  4. " + C.dim(m("conecta el resto de canales (Zernio, WhatsApp…) desde el mismo panel — se ponen verdes al instante", "connect the other channels (Zernio, WhatsApp…) from the same panel — they turn green instantly")));
        console.log("\n  " + C.dim(m("Actualiza cuando saquemos mejoras: npx kooni-bot update", "Update when we ship improvements: npx kooni-bot update")) + "\n");
      } else {
        console.log("\n  " + C.yellow(m("No desplegaste todavía. Cuando quieras:", "You haven't deployed yet. When you're ready:")));
        console.log("  " + C.cyan("npx kooni-bot deploy"));
        console.log("  " + C.dim(m("levanta el bot en TU Cloudflare y te da la URL del panel /admin.", "it deploys the bot on YOUR Cloudflare and gives you the /admin panel URL.")) + "\n");
      }
    }

    await checkin(dir, answers, version);
  } catch (e) {
    console.log("\n  " + C.red("✗ " + (e.message || e)) + "\n");
    process.exit(1);
  } finally {
    rl.close();
  }
}

async function cmdDeploy(flags, rest) {
  const cfg = loadCfg();
  ASSUME_YES = !!(flags.yes || process.env.KOONI_YES);
  if (flags.lang === "en" || cfg.lang === "en") L = "en";
  banner();
  installAgentSkill(flags);

  const rl = createInterface({ input, output });
  try {
    const dir = await resolveBotDir(rest[0], rl);
    if (!dir) { console.log("  " + C.red(t().needDir) + " " + (rest[0] || process.cwd()) + "\n"); process.exit(1); }

    // provider para elegir el secret correcto
    let brainKey = "claude";
    try {
      const wt = readFileSync(join(dir, "wrangler.toml"), "utf8");
      const p = (wt.match(/LLM_PROVIDER\s*=\s*"([^"]+)"/) || [])[1] || "anthropic";
      brainKey = ({ anthropic: "claude", openai: "chatgpt", aisa: "aisa", xai: "grok", minimax: "minimax" })[p] || "claude";
    } catch {}
    flags.brainKey = brainKey;
    await deployBot(dir, { flags, rl });
  } catch (e) {
    console.log("\n  " + C.red("✗ " + (e.message || e)) + "\n");
    process.exit(1);
  } finally {
    rl.close();
  }
}

// Actualiza UNA instalación. Devuelve un resumen; NO hace process.exit (para que
// `--all` pueda recorrer varias sin cortar el proceso).
async function updateOne(dir, flags = {}) {
  const marker = readMarker(dir) || {};
  const slug = marker.slug || basename(dir);
  const current = marker.version || readPkgVersion(dir) || "0.0.0";

  const tgz = join(dir, ".kooni-template.tgz");
  await downloadTemplate(tgz);

  const tmp = join(dir, ".kooni-extract");
  mkdirSync(tmp, { recursive: true });
  const src = extractToTemp(tgz, tmp);
  const next = readPkgVersion(src) || "0.0.0";

  const verLt = (a, b) => {
    const pa = String(a).split(".").map(Number), pb = String(b).split(".").map(Number);
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) { const x = pa[i] || 0, y = pb[i] || 0; if (x !== y) return x < y; }
    return false;
  };

  if (!verLt(current, next)) {
    rmSync(tmp, { recursive: true, force: true });
    rmSync(tgz, { force: true });
    return { dir, slug, updated: false, from: current, to: next };
  }

  const backupPath = backupBeforeUpdate(dir, current);
  extractOver(tgz, dir);
  writeMarker(dir, { slug, version: next, lang: marker.lang || L });

  console.log("  " + C.green("✓") + " " + t().updDone(next));
  if (backupPath) console.log("  " + C.dim(t().updBackup(backupPath.slice(dir.length + 1))));
  console.log("  " + C.dim(t().updPreserved));
  console.log("  " + C.dim(t().updReplaced));

  console.log("\n  " + C.dim(t().installing));
  runPnpm(dir, ["install"]);
  const dbName = marker.dbName || (readFileSync(join(dir, "wrangler.toml"), "utf8").match(/database_name\s*=\s*"([^"]+)"/) || [])[1] || "kooni_db";
  try { wrangler(dir, ["d1", "execute", dbName, "--file=src/db/schema.sql", "--remote"]); } catch { /* best-effort */ }
  try { runPnpm(dir, ["kb:reindex"]); } catch { /* best-effort */ }
  console.log("  " + C.dim(t().deploying));
  try { runPnpm(dir, ["run", "deploy"]); } catch { /* el deploy-check imprime el detalle */ }

  try {
    const st = JSON.parse(readFileSync(join(dir, ".bot-state.json"), "utf8"));
    if (st.worker_url) {
      const dv = readFileSync(join(dir, ".dev.vars"), "utf8");
      const tok = (dv.match(/^KB_REINDEX_TOKEN=(.+)$/m) || [])[1];
      if (tok) await fetchTimeout(`${st.worker_url}/kb/reindex`, { method: "POST", headers: { "X-Reindex-Token": tok } }, 15000);
    }
  } catch {}

  return { dir, slug, updated: true, from: current, to: next };
}

async function cmdUpdate(flags, rest) {
  const cfg = loadCfg();
  ASSUME_YES = !!(flags.yes || process.env.KOONI_YES);
  if (flags.lang === "en" || cfg.lang === "en") L = "en";
  banner();
  installAgentSkill(flags);

  // --all: actualiza todas las instalaciones registradas en ~/.kooni/installs.json.
  if (flags.all) {
    const dirs = listInstalls().map((x) => x.dir);
    if (dirs.length === 0) {
      console.log("  " + C.red(t().needDir) + " (sin instalaciones registradas)\n");
      process.exit(1);
    }
    console.log("  " + C.dim(m(`Actualizando ${dirs.length} instalaciones…`, `Updating ${dirs.length} installs…`)) + "\n");
    const results = [];
    for (const d of dirs) {
      const marker = readMarker(d) || {};
      const slug = marker.slug || basename(d);
      console.log(C.b("\n  ◇ " + slug));
      try {
        const r = await updateOne(d, flags);
        results.push(r);
        console.log(r.updated
          ? "  " + C.green(`✓ ${slug}: ${r.from} → ${r.to}`)
          : "  " + C.green(`✓ ${slug}: ${t().updUpToDate} (v${r.to})`));
      } catch (e) {
        results.push({ dir: d, slug, error: e.message || String(e) });
        console.log("  " + C.red(`✗ ${slug}: ${e.message || e}`));
      }
    }
    console.log("");
    return;
  }

  const rl = createInterface({ input, output });
  let dir;
  try {
    dir = await resolveBotDir(rest[0], rl);
  } finally {
    rl.close();
  }
  if (!dir) { console.log("  " + C.red(t().needDir) + " " + (rest[0] || process.cwd()) + "\n"); process.exit(1); }

  const marker = readMarker(dir) || {};
  const slug = marker.slug || basename(dir);
  console.log(C.b("\n  ◇ " + slug));
  const r = await updateOne(dir, flags);
  if (!r.updated) {
    console.log("  " + C.green("✓") + " " + t().updUpToDate + "  (v" + r.to + ")\n");
  }
  console.log("");
}

async function cmdDoctor(flags, rest) {
  const cfg = loadCfg();
  if (flags.lang === "en" || cfg.lang === "en") L = "en";
  banner();

  const ok = (s) => console.log("  " + C.green("✓") + " " + s);
  const warn = (s, h) => { console.log("  " + C.yellow("⚠") + " " + s); if (h) console.log("    " + C.dim(h)); };
  const bad = (s, h) => { console.log("  " + C.red("✗") + " " + s); if (h) console.log("    " + C.dim(h)); };

  const rl = createInterface({ input, output });
  let dir;
  try {
    dir = await resolveBotDir(rest[0], rl);
  } finally {
    rl.close();
  }
  if (!dir) { bad(t().needDir + " " + (rest[0] || process.cwd())); process.exit(1); }
  ok(m("Bot encontrado en ", "Bot found in ") + C.cyan(dir));

  let marker = readMarker(dir) || {};
  const pkgVer = readPkgVersion(dir);
  const installed = marker.version || pkgVer || "?";
  if (marker.version) ok(m("Instalado: ", "Installed: ") + C.cyan(marker.slug) + " v" + installed);
  else if (pkgVer) warn(m("Sin marker; versión del package.json: ", "No marker; package.json version: ") + C.cyan("v" + pkgVer));

  if (existsSync(join(dir, "wrangler.toml"))) ok("wrangler.toml " + m("presente", "present"));
  else { bad(m("Falta wrangler.toml", "wrangler.toml missing")); }
  if (existsSync(join(dir, "package.json"))) ok("package.json " + m("presente", "present"));
  else { warn(m("Falta package.json", "package.json missing")); }
  if (existsSync(join(dir, "node_modules"))) ok(m("Dependencias instaladas", "Dependencies installed"));
  else warn(m("Dependencias sin instalar", "Dependencies not installed"), "pnpm install");
  if (existsSync(join(dir, "member", "config.local.ts"))) ok(m("Negocio configurado (member/config.local.ts)", "Business configured (member/config.local.ts)"));
  else warn(m("El negocio aún no está configurado", "Business not configured yet"), "kooni-bot init");

  let wt = "";
  try { wt = readFileSync(join(dir, "wrangler.toml"), "utf8"); } catch {}
  const val = (k) => { const mm = wt.match(new RegExp(`^\\s*${k}\\s*=\\s*["']([^"']*)`, "m")); return mm ? mm[1] : null; };
  const botName = val("BOT_NAME"), botLang = val("BOT_LANGUAGE"), tier = val("BOT_TIER"), baseUrl = val("DASHBOARD_BASE_URL");
  if (botName) ok(m("Nombre del bot: ", "Bot name: ") + C.cyan(botName));
  else warn(m("BOT_NAME sin definir", "BOT_NAME not set"));
  if (botLang) ok(m("Idioma: ", "Language: ") + C.cyan(botLang));
  if (tier) ok(m("Tier: ", "Tier: ") + C.cyan(tier));

  // versión más reciente (best-effort)
  try {
    const r = await fetchTimeout(RAW_VERSION_URL, {}, 8000);
    if (r.ok) {
      const latest = (await r.json()).version;
      if (latest && latest !== installed) warn(m(`Hay una versión nueva: v${latest} (tienes v${installed})`, `New version: v${latest} (you have v${installed})`), "kooni-bot update");
      else if (latest === installed) ok(m("Estás en la última versión", "You're on the latest version"));
    }
  } catch { /* sin red */ }

  if (baseUrl) {
    try {
      const r = await fetchTimeout(baseUrl.replace(/\/$/, "") + "/health", {}, 8000);
      if (r.ok) ok(m("El bot responde en línea (", "The bot is online (") + baseUrl + ")");
      else warn(m(`El bot respondió HTTP ${r.status}`, `Bot responded HTTP ${r.status}`));
    } catch { warn(m("El bot no respondió", "The bot didn't respond"), "¿Ya desplegaste? kooni-bot deploy"); }
  } else {
    warn(m("Sin DASHBOARD_BASE_URL", "No DASHBOARD_BASE_URL"), m("Se llena al desplegar", "Filled in on deploy"));
  }

  console.log("");
}

// ── ayuda ────────────────────────────────────────────────────────────────────
function help() {
  console.log(`
${C.cyan("kooni-bot")} — ${t().helpIntro}

  ${C.cyan("npx kooni-bot init [dir]")}    ${m("instala (descarga template + config + deploy)", "install (download template + config + deploy)")}
  ${C.cyan("npx kooni-bot deploy [dir]")}  ${m("provisiona Cloudflare y publica el worker", "provision Cloudflare and publish the worker")}
  ${C.cyan("npx kooni-bot update [dir]")}  ${m("actualiza sin perder tu configuración", "update without losing config")}
  ${C.cyan("npx kooni-bot update --all")}   ${m("actualiza TODAS las instalaciones registradas", "update ALL registered installs")}
  ${C.cyan("npx kooni-bot doctor [dir]")}  ${m("diagnóstico del bot instalado", "diagnose the installed bot")}
  ${C.cyan("npx kooni-bot version")}       ${m("versión del CLI", "CLI version")}

${C.dim("  Flags de init (modo no-interactivo, para agentes):")}
${C.dim("    --yes  --slug <slug>  --negocio <nombre>  --bot-name <nombre>  --lang es-MX|es-ES|en|pt-BR")}
${C.dim("    --tier free|pro  --cerebro claude|chatgpt|grok|gateway  --base-url <url>")}
${C.dim("    --que --ofrece --horario --ubicacion --telefono --web --pagos --faq --reglas --tono")}
${C.dim("    --no-deploy  --no-agent-skill  --email <correo>")}
`);
}

// ── main ─────────────────────────────────────────────────────────────────────
const IS_MAIN = (() => {
  const argv1 = process.argv[1] || "";
  try { if (realpathSync(argv1) === fileURLToPath(import.meta.url)) return true; } catch {}
  const base = argv1.replace(/\\/g, "/").split("/").pop() || "";
  return base === "kooni.js" || base === "kooni-bot";
})();

if (IS_MAIN) {
  const [cmd, ...args] = process.argv.slice(2);
  const { flags, rest } = parseFlags(args);
  (async () => {
    if (cmd === "help" || cmd === "--help" || cmd === "-h") return help();
    if (cmd === "version" || cmd === "--version" || cmd === "-v") { console.log("kooni-bot " + CLI_VERSION); return; }
    if (cmd === "init") return cmdInit(flags, rest);
    if (cmd === "deploy") return cmdDeploy(flags, rest);
    if (cmd === "update") return cmdUpdate(flags, rest);
    if (cmd === "doctor") return cmdDoctor(flags, rest);
    console.log(t().unknown + " " + cmd);
    help();
  })().catch((e) => {
    console.error(C.red("✗ " + (e?.message || e)));
    process.exit(1);
  });
}

export { parseFlags, renderMemberConfig, stampWrangler, sanitizeSlug, normBotLang, collectAnswers };
