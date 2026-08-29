/**
 * Pre-deploy config check (LOCAL — no network, no Skool/tier API).
 *
 * The Free vs Pro distinction lives in separate repos, so there is nothing to
 * validate against a remote service: we just make sure the secrets and vars
 * this bot needs are present before `wrangler deploy` runs. Run via
 * `pnpm exec tsx scripts/deploy-check.ts` (or wire it as a predeploy step).
 */

export interface DeployConfig {
  ANTHROPIC_API_KEY?: string;
  BOT_NAME?: string;
  BOT_TIER?: string;
  DASHBOARD_PASSWORD?: string;
  // at least one customer channel:
  TELEGRAM_BOT_TOKEN?: string;
  MANYCHAT_API_KEY?: string;
  TWILIO_ACCOUNT_SID?: string;
  [k: string]: string | undefined;
}

export interface DeployCheckResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
}

/** Pure validator — easy to unit test, no process/network access. */
export function validateDeployConfig(cfg: DeployConfig): DeployCheckResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!cfg.ANTHROPIC_API_KEY) errors.push("Falta ANTHROPIC_API_KEY (Claude API).");
  if (!cfg.BOT_NAME) errors.push("Falta BOT_NAME.");
  if (!cfg.BOT_TIER) errors.push("Falta BOT_TIER ('free' | 'pro').");

  const hasChannel = Boolean(
    cfg.TELEGRAM_BOT_TOKEN || cfg.MANYCHAT_API_KEY || cfg.TWILIO_ACCOUNT_SID,
  );
  if (!hasChannel) {
    errors.push(
      "No hay ningún canal configurado: define al menos TELEGRAM_BOT_TOKEN, MANYCHAT_API_KEY o TWILIO_ACCOUNT_SID.",
    );
  }

  if (cfg.BOT_TIER === "pro" && !cfg.DASHBOARD_PASSWORD) {
    errors.push("BOT_TIER=pro requiere DASHBOARD_PASSWORD (Basic Auth del dashboard).");
  }

  // Guard de gateway: con OPENAI_API_KEY que NO es de OpenAI directo, falta
  // OPENAI_API_BASE_URL → el bot contesta "Algo falló de mi lado" (401).
  if (cfg.OPENAI_API_KEY && !cfg.OPENAI_API_BASE_URL) {
    const key = String(cfg.OPENAI_API_KEY);
    // OpenAI directo: sk-proj-… (nuevo) o sk- + exactamente 48 alfanuméricos (clásico).
    const directa = /^sk-proj-/.test(key) || /^sk-[A-Za-z0-9]{48}$/.test(key);
    if (!directa) {
      warnings.push("Tu OPENAI_API_KEY parece de un GATEWAY (AIsa/OpenRouter), no de OpenAI directo. Sin OPENAI_API_BASE_URL en [vars] de wrangler.toml, el bot contestará \"Algo falló de mi lado\". Agrega: OPENAI_API_BASE_URL = \"https://api.aisa.one/v1\" (o la URL de tu gateway).");
    }
  }

  return { ok: errors.length === 0, errors, warnings };
}

// Run as a script: read from process.env and exit non-zero on failure.
// Guarded so importing this module in tests does not call process.exit.
declare const process: { env: Record<string, string | undefined>; exit(code: number): never; platform: string };
const isMain =
  typeof process !== "undefined" &&
  typeof (process as any).argv !== "undefined" &&
  /deploy-check\.ts$/.test(String((process as any).argv?.[1] ?? ""));

if (isMain) {
  // El check corre en la MÁQUINA DEL MIEMBRO, donde process.env está vacío: la
  // verdad vive en wrangler.toml ([vars] estampadas por el CLI) y en los SECRETS
  // remotos de Cloudflare. Además, el flujo documentado conecta canales DESPUÉS
  // del primer deploy (FASE 3) y la llave de IA puede ponerse desde el panel —
  // así que canal/llave son AVISOS, no errores que bloqueen.
  const cfg: DeployConfig = { ...process.env };

  try {
    const { readFileSync } = await import("node:fs");
    const toml = readFileSync("wrangler.toml", "utf8");
    for (const k of ["BOT_NAME", "BOT_TIER"] as const) {
      if (!cfg[k]) cfg[k] = toml.match(new RegExp(`^${k}\\s*=\\s*"([^"]*)"`, "m"))?.[1];
    }
  } catch { /* sin wrangler.toml: lo reportará el error de BOT_TIER */ }

  try {
    const { execFileSync } = await import("node:child_process");
    // Windows: npx es un shim .cmd — execFileSync necesita npx.cmd + shell:true
    // (si no, lanza EINVAL y los secrets remotos se ignoran → falsos bloqueos).
    const isWin = process.platform === "win32";
    const raw = execFileSync(isWin ? "npx.cmd" : "npx", ["wrangler", "secret", "list"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      ...(isWin ? { shell: true } : {}),
    });
    for (const s of JSON.parse(raw.slice(raw.indexOf("["))) as { name: string }[]) {
      if (!cfg[s.name]) cfg[s.name] = "(remote)";
    }
  } catch { /* sin red o sin login: seguimos solo con lo local */ }

  const errors: string[] = [];
  const warnings: string[] = [];
  if (!cfg.BOT_NAME) errors.push("Falta BOT_NAME en wrangler.toml.");
  if (!cfg.BOT_TIER) errors.push("Falta BOT_TIER ('free' | 'pro') en wrangler.toml.");
  if (!cfg.DASHBOARD_PASSWORD) errors.push("Falta el secret DASHBOARD_PASSWORD (créalo: pnpm exec wrangler secret put DASHBOARD_PASSWORD).");
  if (!cfg.ANTHROPIC_API_KEY && !cfg.OPENAI_API_KEY && !cfg.XAI_API_KEY && !cfg.MINIMAX_API_KEY) {
    warnings.push("Aún no hay llave de IA como secret — el bot desplegará pero no contestará. Ponla con `wrangler secret put ANTHROPIC_API_KEY` (o desde el panel: Configuración → Modelo de IA).");
  }
  // Guard de gateway: con LLM_PROVIDER=openai y una key que NO es de OpenAI
  // directo, falta OPENAI_API_BASE_URL → el bot contesta "Algo falló de mi lado".
  if (cfg.OPENAI_API_KEY && !cfg.OPENAI_API_BASE_URL) {
    const key = String(cfg.OPENAI_API_KEY);
    const directa = /^sk-proj-/.test(key) || /^sk-[A-Za-z0-9]{40,}$/.test(key);
    if (!directa) {
      warnings.push("Tu OPENAI_API_KEY parece de un GATEWAY (AIsa/OpenRouter), no de OpenAI directo. Sin OPENAI_API_BASE_URL en [vars] de wrangler.toml, el bot contestará \"Algo falló de mi lado\". Agrega: OPENAI_API_BASE_URL = \"https://api.aisa.one/v1\" (o la URL de tu gateway).");
    }
  }
  if (!cfg.TELEGRAM_BOT_TOKEN && !cfg.MANYCHAT_API_KEY && !cfg.TWILIO_ACCOUNT_SID && !cfg.META_PAGE_ACCESS_TOKEN && !cfg.ZERNIO_API_KEY) {
    warnings.push("Aún no hay canales conectados — normal antes de la FASE 3 (se conectan con el panel abierto en /admin/conexiones).");
  }

  if (warnings.length) console.warn("⚠️  Avisos:\n - " + warnings.join("\n - "));
  if (errors.length) {
    console.error("❌ Config incompleta para deploy:\n - " + errors.join("\n - "));
    process.exit(1);
  }
  console.log("✅ Config de deploy OK." + (warnings.length ? " (con avisos)" : ""));
}
