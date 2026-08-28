// Menú "Extras" (Forja+) — cuadrícula de funciones de pago que el dueño
// enciende/apaga. Cada tarjeta muestra: emoji, nombre, descripción, dónde actúa
// (bot / panel) y su estado: ACTIVO (toggle on + módulo pago desbloqueado),
// DESACTIVADO (toggle off), o 🔒 BLOQUEADO (módulo no incluido en la licencia).
import type { Env } from "../../env";
import { Db } from "../../db/client";
import { SettingsRepo, SETTING_KEYS } from "../../db/settings";
import { EXTRA_FEATURES, extrasState } from "../../features";
import { layout } from "./layout";

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]!));
}

export async function renderExtras(env: Env, saved = false, report?: string): Promise<string> {
  const settings = await new SettingsRepo(new Db(env.DB)).all();
  const state = await extrasState(env, settings);

  const savedBanner = saved
    ? `<div style="border:1px solid var(--ok);background:rgba(127,183,126,.1);color:var(--ok);padding:10px 14px;font-size:12.5px;font-weight:600">Guardado ✓</div>`
    : "";

  let reportBanner = "";
  if (report?.startsWith("ok:")) {
    const ch = report.slice(3).split("+").join(" + ");
    reportBanner = `<div style="border:1px solid var(--ok);background:rgba(127,183,126,.1);color:var(--ok);padding:9px 12px;font-size:12px;font-weight:600">✓ Reporte enviado por: ${esc(ch)}</div>`;
  } else if (report?.startsWith("err:")) {
    const msg = report.slice(4).slice(0, 180);
    reportBanner = `<div style="border:1px solid var(--danger,#e0654d);background:rgba(224,101,77,.1);color:var(--danger,#e0654d);padding:9px 12px;font-size:12px;font-weight:600">✕ ${esc(msg)}</div>`;
  }

  const actuaBadge = (a: string) => {
    const txt = a === "bot" ? "Actúa en el bot" : a === "panel" ? "Actúa en el panel" : "Actúa en bot y panel";
    return `<span class="text-[9px] tracking-wide border px-1.5" style="color:var(--dim);border-color:var(--line)">${txt}</span>`;
  };

  const SELECT_STYLE =
    "background:var(--bg);border:1px solid var(--line);color:var(--cream);padding:8px 10px;font-size:12px;outline:none;width:100%";

  const cards = EXTRA_FEATURES.map((f) => {
    const st = state[f.id];
    const on = st.on && st.unlocked;
    const statusBadge = !st.unlocked
      ? `<span class="text-[9px] tracking-wide border px-1.5" style="color:var(--accent2);border-color:var(--accent2)">🔒 BLOQUEADO</span>`
      : on
        ? `<span class="text-[9px] tracking-wide border px-1.5" style="color:var(--ok);border-color:var(--ok)">● ACTIVO</span>`
        : `<span class="text-[9px] tracking-wide border px-1.5" style="color:var(--dim);border-color:var(--line)">○ DESACTIVADO</span>`;
    const toggle = st.unlocked
      ? `<label style="display:flex;align-items:center;gap:9px;cursor:pointer;flex:none">
           <input type="checkbox" name="${esc(f.toggleKey)}" value="1" ${on ? "checked" : ""} style="accent-color:var(--accent);width:16px;height:16px">
           <span class="text-[11.5px] text-muted">${on ? "Encendida" : "Apagada"}</span>
         </label>`
      : `<span class="text-[11px] text-accent2" style="flex:none">Requiere licencia → <a href="/admin/licencia" style="color:var(--accent2)">Licencia</a></span>`;

    // El Reporte nocturno tiene config extra: canal (Telegram/correo) y botón
    // de prueba (POST a /admin/config/report-test, vive fuera de este form).
    let extra = "";
    if (f.kind === "reporte" && st.unlocked) {
      const channel = settings[SETTING_KEYS.nightlyReportChannel] ?? "telegram";
      const opts = [
        { v: "telegram", l: "Telegram" },
        { v: "email", l: "Correo" },
        { v: "both", l: "Telegram + correo" },
      ]
        .map((o) => `<option value="${o.v}" ${channel === o.v ? "selected" : ""}>${o.l}</option>`)
        .join("");
      extra = `
        <div style="display:flex;align-items:flex-end;gap:10px;flex-wrap:wrap;margin-top:4px">
          <div style="display:flex;flex-direction:column;gap:4px;max-width:220px">
            <label class="text-[11px] text-dim" for="${esc(SETTING_KEYS.nightlyReportChannel)}">¿Por dónde te lo mando?</label>
            <select id="${esc(SETTING_KEYS.nightlyReportChannel)}" name="${esc(SETTING_KEYS.nightlyReportChannel)}" style="${SELECT_STYLE}">${opts}</select>
          </div>
          <button type="submit" form="report-test-form"
                  class="text-[11.5px] font-display font-semibold cursor-pointer"
                  style="border:1px solid var(--line);color:var(--cream);padding:8px 12px;background:var(--panel2);white-space:nowrap">📨 Enviar prueba ahora</button>
        </div>`;
    }

    return `
      <div class="bg-panel border border-line" style="padding:18px;display:flex;flex-direction:column;gap:12px;${!st.unlocked ? "opacity:.82" : ""}">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px">
          <div style="display:flex;align-items:center;gap:10px;min-width:0">
            <span style="font-size:22px;flex:none">${f.emoji}</span>
            <div style="min-width:0">
              <div class="font-display font-semibold text-[14px] text-cream">${esc(f.nombre)}</div>
              <div style="display:flex;gap:6px;margin-top:5px;flex-wrap:wrap">
                ${statusBadge}
                ${actuaBadge(f.actuaEn)}
                <span class="text-[9px] tracking-wide border px-1.5" style="color:var(--dim);border-color:var(--line)">${f.tipo === "pago_unico" ? "PAGO ÚNICO" : "MEMBRESÍA"}</span>
              </div>
            </div>
          </div>
          ${toggle}
        </div>
        <p class="text-muted text-[12px] leading-relaxed" style="margin:0">${esc(f.descripcion)}</p>
        ${extra}
        ${f.id === "reporte" ? reportBanner : ""}
      </div>`;
  }).join("");

  const body = `
    <form method="POST" action="/admin/extras" style="display:flex;flex-direction:column;gap:18px;max-width:1080px">
      ${savedBanner}
      <div style="display:flex;flex-direction:column;gap:2px">
        <h2 class="font-display font-semibold text-[15px] text-cream">Extras — funciones de pago</h2>
        <p class="text-muted text-[12.5px]">Enciende o apaga cada función con su interruptor. Las bloqueadas (🔒) necesitan una licencia que las incluya — revisa la pestaña Licencia. Los cambios se guardan al presionar el botón de abajo.</p>
      </div>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">${cards}</div>
      <button type="submit" class="bigbtn font-display font-bold text-[13px] cursor-pointer"
              style="width:fit-content;background:var(--accent);border:1px solid var(--accent);color:#1a1206;box-shadow:4px 4px 0 var(--linelit);padding:13px 24px;display:flex;align-items:center;gap:9px">
        <i data-lucide="check" width="16" height="16"></i> Guardar cambios
      </button>
    </form>
    <!-- Form del botón "Enviar prueba ahora" del Reporte nocturno: vive FUERA del
         form principal (HTML no permite forms anidados); el botón lo referencia
         con form="report-test-form". -->
    <form id="report-test-form" method="POST" action="/admin/config/report-test" style="display:none"></form>`;

  return layout({ title: "Extras", activeTab: "extras", body, env });
}
