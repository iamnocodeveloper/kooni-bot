#!/usr/bin/env node
// kooni-bot — instala y actualiza bots de IA de Kooni en TU propia infra, en un
// comando. Derivado de Forja (MIT, © Horizontes IA). Bilingüe (ES/EN).
//
//   npx kooni-bot init [dir]          → descarga el template, configura y despliega
//   npx kooni-bot update [dir]        → trae la versión nueva SIN perder tu config
//   npx kooni-bot version             → versión del CLI
//
// El template vive en el repo público del dueño (GitHub). El CLI lo descarga
// como tarball (como forja), NO clona git, así funciona en Mac/Linux/Windows.
// Kooni es open source (MIT): NO valida licencia contra servidores — el tier
// Pro se activa con un código local en el panel (ver docs del proyecto).
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, chmodSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

const REPO = process.env.KOONI_REPO || "iamnocodeveloper/kooni-bot";
const BRANCH = process.env.KOONI_BRANCH || "main";
const TARBALL = `https://codeload.github.com/${REPO}/tar.gz/refs/heads/${BRANCH}`;
// Control del dueño: check-in al instalar (no bloquea; solo registra quién).
const CHECKIN_URL = process.env.KOONI_CHECKIN_URL || "https://f5gacw7g.function2.insforge.app/registrar-instalacion";

// El tar de Windows (MSYS) confunde las rutas C:\... con host remoto. Normaliza
// a rutas POSIX (/c/...) para que tar las entienda.
function posixPath(p) {
  if (process.platform !== "win32") return p;
  return p.replace(/\\/g, "/").replace(/^([A-Za-z]):\//, "/$1/");
}

const LANG = process.env.KOONI_LANG === "en" ? "en" : "es";
const I = {
  es: {
    init: "Instala un bot de Kooni en TU Cloudflare (en un comando).",
    update: "Trae la versión nueva del template SIN perder tu configuración ni tus datos.",
    download: (u) => `Bajando el template de Kooni… (${u})`,
    ok: (s) => `✓ ${s}`,
    err: (m) => `✗ ${m}`,
    extractDir: "directorio",
    whichDir: "¿En qué carpeta lo instalo? (vacío = actual)",
    runInit: "El template está listo. Ahora configura tu bot:",
    updateDone: "Actualizado. Revisa que nada en member/ cambió.",
    needDir: "No encuentro una instalación de Kooni en:",
  },
  en: {
    init: "Install a Kooni bot on YOUR Cloudflare (one command).",
    update: "Fetch the new template version WITHOUT losing your config or data.",
    download: (u) => `Downloading the Kooni template… (${u})`,
    ok: (s) => `✓ ${s}`,
    err: (m) => `✗ ${m}`,
    extractDir: "directory",
    whichDir: "Which folder should I install it in? (empty = current)",
    runInit: "Template ready. Now configure your bot:",
    updateDone: "Updated. Make sure nothing in member/ changed.",
    needDir: "No Kooni install found in:",
  },
}[LANG];

const t = (es, en) => (LANG === "es" ? es : en);

function help() {
  console.log(`
kooni-bot — ${t("instala tu asistente de IA en Cloudflare", "install your AI assistant on Cloudflare")}

  npx kooni-bot init [dir]    ${t("instala (descarga template + config + deploy)", "install (download template + config + deploy)")}
  npx kooni-bot update [dir]  ${t("actualiza sin perder tu configuración", "update without losing config")}
  npx kooni-bot version       ${t("versión del CLI", "CLI version")}
`);
}

async function ask(q, dflt = "") {
  const rl = createInterface({ input, output });
  const ans = await rl.question(dflt ? `${q} [${dflt}] ` : `${q} `);
  rl.close();
  return ans.trim() || dflt;
}

async function download(url, dest) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(t(`no pude bajar el template (HTTP ${res.status}). Revisa tu internet o el repo ${REPO}.`, `could not download template (HTTP ${res.status}). Check internet or repo ${REPO}.`));
  }
  const buf = Buffer.from(await res.arrayBuffer());
  writeFileSync(dest, buf);
}

function extractFresh(tgz, dir) {
  mkdirSync(dir, { recursive: true });
  // El tarball de GitHub trae una carpeta raíz (kooni-bot-main/). Extraemos a
  // una carpeta temporal y movemos el contenido (más robusto en Windows que
  // --strip-components con el tar nativo).
  const tmp = join(dir, ".kooni-extract");
  mkdirSync(tmp, { recursive: true });
  execFileSync("tar", ["-xzf", posixPath(tgz), "-C", posixPath(tmp)]);
  const root = readdirSync(tmp)[0];
  const src = join(tmp, root);
  const entries = readdirSync(src);
  for (const e of entries) {
    const from = join(src, e);
    const to = join(dir, e);
    try { rmSync(to, { recursive: true, force: true }); } catch {}
    // moveSync manual: rename falla entre unidades en Windows, copiamos.
    execFileSync("cp", ["-r", from, dir]);
  }
  rmSync(tmp, { recursive: true, force: true });
  rmSync(tgz, { force: true });
  writeFileSync(join(dir, ".kooni-version"), "cli-0.1.2");
}

function extractOver(tgz, dir) {
  // Actualización: NO pisar la config del miembro ni los datos.
  const tmp = join(dir, ".kooni-extract");
  mkdirSync(tmp, { recursive: true });
  execFileSync("tar", ["-xzf", tgz, "-C", tmp]);
  const root = readdirSync(tmp)[0];
  const src = join(tmp, root);
  const EXCLUDE = ["member", "wrangler.toml", ".dev.vars", ".dev.vars.example", ".dev.vars.local", ".env", ".env.example", ".bot-state.json", ".bot-setup.json", ".git", ".kooni-extract"];
  const entries = readdirSync(src);
  for (const e of entries) {
    if (EXCLUDE.includes(e)) continue;
    const from = join(src, e);
    const to = join(dir, e);
    try { rmSync(to, { recursive: true, force: true }); } catch {}
    execFileSync("cp", ["-r", from, dir]);
  }
  rmSync(tmp, { recursive: true, force: true });
  rmSync(tgz, { force: true });
  writeFileSync(join(dir, ".kooni-version"), "cli-0.1.2");
}

function isKooni(dir) {
  return existsSync(join(dir, "package.json")) && (existsSync(join(dir, "member")) || existsSync(join(dir, "src/index.ts")));
}

async function cmdInit() {
  const dirArg = process.argv[3] || "";
  let dir = dirArg ? join(process.cwd(), dirArg) : process.cwd();
  if (!dirArg) {
    const ans = await ask(t("¿En qué carpeta lo instalo? (vacío = actual)", "Install in which folder? (empty = current)"), "kooni-bot");
    dir = ans === "kooni-bot" ? join(process.cwd(), "kooni-bot") : join(process.cwd(), ans);
  }
  mkdirSync(dir, { recursive: true });
  if (!isKooni(dir) && existsSync(join(dir, "package.json"))) {
    console.log(I.err(t("la carpeta ya tiene un proyecto. Usa `kooni-bot update` en su lugar.", "folder already has a project. Use `kooni-bot update` instead.")));
    process.exit(1);
  }
  const tgz = join(dir, ".kooni-template.tgz");
  console.log(I.download(TARBALL));
  await download(TARBALL, tgz);
  extractFresh(tgz, dir);
  console.log(I.ok(t("template descargado.", "template downloaded.")));

  // Instalar dependencias y correr el instalador (configura slug, secrets, deploy).
  console.log(I.runInit);
  const installer = process.platform === "win32" ? "scripts/kooni-init.ps1" : "scripts/kooni-init.sh";
  const cmd = process.platform === "win32" ? "powershell" : "bash";
  const script = join(dir, installer);
  if (!existsSync(script)) {
    console.log(I.err(t("no encontré el instalador en el template.", "installer not found in template.")));
    process.exit(1);
  }
  try {
    execFileSync(cmd, [script, "deploy"], { cwd: dir, stdio: "inherit" });
  } catch {
    console.log(I.err(t("el instalador falló. Revisa los mensajes de arriba.", "installer failed. Check messages above.")));
    process.exit(1);
  }
  console.log(I.ok(t("¡Bot listo! Tu panel: https://<slug>.workers.dev/admin", "Bot ready! Your panel: https://<slug>.workers.dev/admin")));

  // Check-in (opcional, no bloquea): registrar quién instaló, para el control
  // del dueño. Si KOONI_SILENT=1, no pregunta email y registra sin él.
  try {
    let email = "";
    if (process.env.KOONI_SILENT !== "1" && process.env.KOONI_NO_CHECKIN !== "1") {
      email = await ask(t("¿Tu email? (opcional, para soporte)", "Your email? (optional, for support)"), "");
    }
    const slug = dir.split(/[\\/]/).pop() || "kooni-bot";
    const res = await fetch(CHECKIN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: email || undefined,
        slug,
        workerUrl: `https://${slug}.workers.dev`,
        cliVersion: "0.1.2",
        platform: process.platform,
      }),
      signal: AbortSignal.timeout(4000),
    });
    void res;
  } catch {
    // fire-and-forget: nunca falla la instalación por el check-in
  }
}

async function cmdUpdate() {
  const dir = join(process.cwd(), process.argv[3] || "");
  if (!isKooni(dir)) {
    console.log(I.err(`${I.needDir} ${dir}`));
    process.exit(1);
  }
  const tgz = join(dir, ".kooni-template.tgz");
  console.log(I.download(TARBALL));
  await download(TARBALL, tgz);
  extractOver(tgz, dir);
  console.log(I.ok(I.updateDone));
  console.log(t("Luego corre: pnpm run deploy (o bash scripts/kooni-init.sh deploy)", "Then run: pnpm run deploy (or bash scripts/kooni-init.sh deploy)"));
}

async function main() {
  const cmd = process.argv[2] || "help";
  if (cmd === "help" || cmd === "--help" || cmd === "-h") return help();
  if (cmd === "version" || cmd === "--version" || cmd === "-v") { console.log("kooni-bot 0.1.2"); return; }
  if (cmd === "init") return cmdInit();
  if (cmd === "update") return cmdUpdate();
  console.log(t(`comando desconocido: ${cmd}`, `unknown command: ${cmd}`));
  help();
}

main().catch((e) => {
  console.error(I.err(e?.message || e));
  process.exit(1);
});
