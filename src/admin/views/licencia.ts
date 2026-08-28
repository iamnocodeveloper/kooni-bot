// "Licencia" — activa Pro pegando un código KOONI-PRO-... (validación local HMAC).
import type { Env } from "../../env";
import { layout } from "./layout";
import { Db } from "../../db/client";
import { SettingsRepo, SETTING_KEYS } from "../../db/settings";
import { verifyLicense } from "../../license";
import { FREE_LIMITS } from "../../limits";
import { PAID_MODULES, unlockedModules } from "../../modules";

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]!));
}

export async function renderLicencia(env: Env, msg?: string, isError?: boolean): Promise<string> {
  const repo = new SettingsRepo(new Db(env.DB));
  const code = (await repo.get(SETTING_KEYS.proLicense).catch(() => null)) ?? "";
  const payload = code ? verifyLicense(code, env) : null;
  const isPro = payload !== null || env.BOT_TIER === "pro";

  const banner = msg
    ? `<div style="border:1px solid ${isError ? "var(--bad)" : "var(--ok)"};color:${isError ? "var(--bad)" : "var(--ok)"};padding:10px 14px;font-size:12px;background:${isError ? "rgba(248,113,113,.06)" : "rgba(52,211,153,.06)"}">${esc(msg)}</div>`
    : "";

  const statusCard = isPro
    ? `<div class="bg-panel border" style="padding:18px 20px;border-color:rgba(127,183,126,.45);display:flex;flex-direction:column;gap:8px">
         <div style="display:flex;align-items:center;gap:9px">
           <span style="font-size:10px;letter-spacing:.14em;color:var(--ok);border:1px solid var(--ok);background:rgba(127,183,126,.08);padding:3px 10px;font-weight:700">● PRO ACTIVO</span>
           ${payload ? `<span class="text-dim text-[11px] font-mono">${esc(payload.kind)}${payload.expiry ? " · expira " + new Date(payload.expiry).toLocaleDateString("es") : ""}</span>` : `<span class="text-dim text-[11px]">(tier por configuración)</span>`}
         </div>
         <p class="text-muted text-[12px]" style="margin:0">Sin límites: contactos, mensajes, canales, automatizaciones, links trackeados y más.</p>
       </div>`
    : `<div class="bg-panel border" style="padding:18px 20px;display:flex;flex-direction:column;gap:8px">
         <div style="display:flex;align-items:center;gap:9px">
           <span style="font-size:10px;letter-spacing:.14em;color:var(--dim);border:1px solid var(--line);padding:3px 10px;font-weight:600">○ PLAN GRATIS</span>
         </div>
         <p class="text-muted text-[12px]" style="margin:0">Todas las funciones disponibles, con límites de uso. Activa Pro para quitar los límites.</p>
       </div>`;

  const limitsList = Object.entries({
    "Contactos únicos": `${FREE_LIMITS.maxContacts}`,
    "Mensajes IA / mes": `${FREE_LIMITS.maxMessagesPerMonth}`,
    "Canales conectados": `${FREE_LIMITS.maxChannels}`,
    "Reglas de automatización": `${FREE_LIMITS.maxRules}`,
    "Respuestas automáticas / mes": `${FREE_LIMITS.maxAutoDmsPerMonth}`,
    "Links trackeados": `${FREE_LIMITS.maxTrackedLinks}`,
    "Cuentas Zernio": `${FREE_LIMITS.maxZernioAccounts}`,
    "Historial de logs": `${FREE_LIMITS.logRetentionDays} días`,
  })
    .map(([k, v]) => `<div style="display:flex;justify-content:space-between;border:1px solid var(--line);background:var(--panel2);padding:7px 10px;font-size:12px"><span class="text-muted">${esc(k)}</span><span class="font-mono text-cream">${esc(v)}</span></div>`)
    .join("");

  // ── Módulos de pago (Forja+ a la carta) ──────────────────────────────────
  const mods = await unlockedModules(env);
  const moduleRows = PAID_MODULES.map((m) => {
    const on = mods.has(m.id);
    return `<div style="display:flex;align-items:flex-start;gap:12px;border:1px solid ${on ? "rgba(127,183,126,.4)" : "var(--line)"};background:var(--panel2);padding:11px 12px">
      <span style="font-size:14px;flex:none;margin-top:1px">${on ? "🔓" : "🔒"}</span>
      <div style="min-width:0;flex:1">
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          <span class="text-[13px] font-semibold text-cream">${esc(m.nombre)}</span>
          <span class="text-[9px] tracking-wide border px-1.5" style="color:var(--dim);border-color:var(--line)">${m.tipo === "pago_unico" ? "PAGO ÚNICO" : "MEMBRESÍA"}</span>
          ${on ? `<span class="text-[9px] tracking-wide border px-1.5" style="color:var(--ok);border-color:var(--ok)">ACTIVO</span>` : `<span class="text-[9px] tracking-wide border px-1.5" style="color:var(--accent2);border-color:var(--accent2)">BLOQUEADO</span>`}
        </div>
        <p class="text-dim text-[11.5px]" style="margin:3px 0 0">${esc(m.descripcion)}</p>
      </div>
    </div>`;
  }).join("");

  const modulesCard = `
    <div class="bg-panel border" style="padding:18px 20px;display:flex;flex-direction:column;gap:10px">
      <div style="display:flex;flex-direction:column;gap:2px">
        <h3 class="font-display font-semibold text-[13.5px] text-cream">Módulos de pago (a la carta)</h3>
        <p class="text-muted text-[12px]">Features premium vendibles por separado. Un código Pro sin módulos activa TODO (licencia completa); un código con módulos activa solo los incluidos. ${payload?.modules ? `Tu código actual incluye: <span class="font-mono">${esc(payload.modules.join(", "))}</span>.` : ""}</p>
      </div>
      <div style="display:flex;flex-direction:column;gap:6px">${moduleRows}</div>
    </div>`;

  const body = `
    <div style="display:flex;flex-direction:column;gap:18px">
      <div style="display:flex;flex-direction:column;gap:2px">
        <h2 class="font-display font-semibold text-[15px] text-cream">Licencia</h2>
        <p class="text-muted text-[12.5px]">Activa el plan Pro pegando tu código. Se valida localmente (sin servidores).</p>
      </div>
      ${banner}
      ${statusCard}
      <div class="bg-panel border" style="padding:18px 20px;display:flex;flex-direction:column;gap:14px">
        <h3 class="font-display font-semibold text-[13.5px] text-cream">${isPro ? "Tu código activo" : "Activar Pro con un código"}</h3>
        ${code ? `<div class="font-mono text-[11px]" style="border:1px solid var(--line);background:var(--bg);padding:10px 12px;color:var(--accent2);word-break:break-all">${esc(code)}</div>` : ""}
        <form method="POST" action="/admin/licencia" style="display:flex;flex-direction:column;gap:10px">
          <input type="text" name="code" placeholder="KOONI-PRO-..." style="background:var(--bg);border:1px solid var(--line);color:var(--cream);padding:10px 12px;font-size:12.5px;outline:none;width:100%">
          <div style="display:flex;gap:8px">
            <button type="submit" style="background:var(--accent);color:#06251f;font-weight:700;border:none;padding:10px 18px;font-size:12.5px;cursor:pointer">${isPro ? "Reemplazar código" : "Activar Pro"}</button>
            ${isPro ? `<button type="submit" name="clear" value="1" style="background:none;border:1px solid var(--bad);color:var(--bad);padding:10px 18px;font-size:12.5px;cursor:pointer">Quitar licencia</button>` : ""}
          </div>
        </form>
      </div>
      ${modulesCard}
      <div class="bg-panel border" style="padding:18px 20px;display:flex;flex-direction:column;gap:10px">
        <h3 class="font-display font-semibold text-[13.5px] text-cream">Límites del plan gratis</h3>
        <div style="display:flex;flex-direction:column;gap:6px">${limitsList}</div>
        <p class="text-dim text-[11px]" style="margin:0">Pro quita todos los límites.</p>
      </div>
    </div>`;

  return layout({ title: "Licencia", activeTab: "licencia", body, env });
}
