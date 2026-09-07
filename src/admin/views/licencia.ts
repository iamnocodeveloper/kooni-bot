// "Licencia" — activa Pro pegando un código KOONI-PRO-... (validación local HMAC).
import type { Env } from "../../env";
import { layout } from "./layout";
import { Db } from "../../db/client";
import { SettingsRepo, SETTING_KEYS } from "../../db/settings";
import { inspectLicense } from "../../license";
import { FREE_LIMITS } from "../../limits";

const fecha = (ms: number) => new Date(ms).toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" });

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]!));
}

export async function renderLicencia(env: Env, msg?: string, isError?: boolean): Promise<string> {
  const repo = new SettingsRepo(new Db(env.DB));
  const code = (await repo.get(SETTING_KEYS.proLicense).catch(() => null)) ?? "";
  const ins = code ? inspectLicense(code, env) : null;
  const payload = ins && (ins.state === "active" || ins.state === "grace") ? ins.payload : null;
  const isPro = payload !== null;

  const banner = msg
    ? `<div style="border:1px solid ${isError ? "var(--bad)" : "var(--ok)"};color:${isError ? "var(--bad)" : "var(--ok)"};padding:10px 14px;font-size:12px;background:${isError ? "rgba(248,113,113,.06)" : "rgba(52,211,153,.06)"}">${esc(msg)}</div>`
    : "";

  // Detalle de vigencia según el estado del código.
  let vigencia = "";
  if (ins?.state === "active") {
    if (!ins.expiresAt) vigencia = "de por vida";
    else if ((ins.daysLeft ?? 0) <= 0) vigencia = `mensual · vence hoy (${fecha(ins.expiresAt)})`;
    else vigencia = `mensual · vence en ${ins.daysLeft} ${ins.daysLeft === 1 ? "día" : "días"} (${fecha(ins.expiresAt)})`;
  } else if (ins?.state === "grace") {
    const left = 7 + (ins.daysLeft ?? 0); // daysLeft es negativo tras vencer
    vigencia = `venció el ${fecha(ins.expiresAt!)} · periodo de gracia (${Math.max(0, left)} ${left === 1 ? "día" : "días"})`;
  } else if (ins?.state === "expired") {
    vigencia = `venció el ${fecha(ins.expiresAt!)}`;
  }

  const soon = ins?.state === "active" && ins.daysLeft !== null && ins.daysLeft <= 7;

  const statusCard =
    ins?.state === "grace"
      ? `<div class="bg-panel border" style="padding:18px 20px;border-color:var(--bad);display:flex;flex-direction:column;gap:8px">
           <div style="display:flex;align-items:center;gap:9px;flex-wrap:wrap">
             <span style="font-size:10px;letter-spacing:.14em;color:var(--bad);border:1px solid var(--bad);background:rgba(248,113,113,.08);padding:3px 10px;font-weight:700">⚠ LICENCIA VENCIDA — GRACIA</span>
             <span class="text-dim text-[11px] font-mono">${esc(vigencia)}</span>
           </div>
           <p class="text-muted text-[12px]" style="margin:0">El Pro sigue activo por ahora. Pídele a tu proveedor el código nuevo y pégalo abajo, o el bot pasará al plan gratis con sus límites.</p>
         </div>`
      : isPro
        ? `<div class="bg-panel border" style="padding:18px 20px;border-color:${soon ? "var(--warn)" : "var(--ok)"};display:flex;flex-direction:column;gap:8px">
           <div style="display:flex;align-items:center;gap:9px;flex-wrap:wrap">
             <span style="font-size:10px;letter-spacing:.14em;color:var(--ok);border:1px solid var(--ok);background:var(--ok-soft);padding:3px 10px;font-weight:700">● PRO ACTIVO</span>
             <span class="text-dim text-[11px] font-mono">${esc(vigencia)}</span>
           </div>
           <p class="text-muted text-[12px]" style="margin:0">Todas las funciones activas y <b class="text-cream">sin límites de uso</b>: contactos, mensajes/mes, canales, automatizaciones y links trackeados.${soon ? " <b class=\"text-cream\">Tu código vence pronto</b> — pídele el nuevo a tu proveedor." : ""}</p>
         </div>`
        : `<div class="bg-panel border" style="padding:18px 20px;display:flex;flex-direction:column;gap:8px">
           <div style="display:flex;align-items:center;gap:9px">
             <span style="font-size:10px;letter-spacing:.14em;color:var(--dim);border:1px solid var(--line);padding:3px 10px;font-weight:600">○ PLAN GRATIS</span>
             ${ins?.state === "expired" ? `<span class="text-dim text-[11px] font-mono">${esc(vigencia)}</span>` : ""}
           </div>
           <p class="text-muted text-[12px]" style="margin:0">${ins?.state === "expired" ? "Tu licencia venció. Pega un código nuevo para volver a Pro." : "<b class=\"text-cream\">Todas las funciones están activas</b> — igual que en Pro. El plan gratis solo tiene límites de cantidad (abajo); Pro los quita."}</p>
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

  const body = `
    <div style="display:flex;flex-direction:column;gap:18px">
      <div style="display:flex;flex-direction:column;gap:2px">
        <h2 class="font-display font-semibold text-[15px] text-cream">Licencia</h2>
        <p class="text-muted text-[12.5px]">Todas las funciones vienen activas en el plan gratis. Pro solo quita los límites de cantidad. Se valida localmente (sin servidores).</p>
      </div>
      ${banner}
      ${statusCard}
      <div class="bg-panel border" style="padding:18px 20px;display:flex;flex-direction:column;gap:14px">
        <h3 class="font-display font-semibold text-[13.5px] text-cream">${isPro ? "Tu código activo" : "Activar Pro con un código"}</h3>
        ${code ? `<div class="font-mono text-[11px]" style="border:1px solid var(--line);background:var(--bg);padding:10px 12px;color:var(--accent2);word-break:break-all">${esc(code)}</div>` : ""}
        <form method="POST" action="/admin/licencia" style="display:flex;flex-direction:column;gap:10px">
          <input type="text" name="code" placeholder="KOONI-PRO-..." style="background:var(--bg);border:1px solid var(--line);color:var(--cream);padding:10px 12px;font-size:12.5px;outline:none;width:100%">
          <div style="display:flex;gap:8px">
            <button type="submit" style="background:var(--accent);color:var(--on-accent);font-weight:700;border:none;padding:10px 18px;font-size:12.5px;cursor:pointer">${isPro ? "Reemplazar código" : "Activar Pro"}</button>
            ${isPro ? `<button type="submit" name="clear" value="1" style="background:none;border:1px solid var(--bad);color:var(--bad);padding:10px 18px;font-size:12.5px;cursor:pointer">Quitar licencia</button>` : ""}
          </div>
        </form>
      </div>
      <div class="bg-panel border" style="padding:18px 20px;display:flex;flex-direction:column;gap:10px">
        <h3 class="font-display font-semibold text-[13.5px] text-cream">Límites del plan gratis</h3>
        <div style="display:flex;flex-direction:column;gap:6px">${limitsList}</div>
        <p class="text-dim text-[11px]" style="margin:0">Ninguna función está bloqueada — estos son los únicos topes. Pro los quita todos.</p>
      </div>
    </div>`;

  return layout({ title: "Licencia", activeTab: "licencia", body, env });
}
