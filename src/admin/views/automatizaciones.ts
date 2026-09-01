// "Automatizaciones" tab — flujos keyword → respuesta (comentarios y DMs).
// El dueño crea reglas SIN tocar código: cuando un comentario o DM matchea una
// keyword, la regla gana y el mensaje no entra al agente. Viven en D1 (tabla
// auto_rules).
//
// Los comentarios SIEMPRE se responden en PÚBLICO (como comentario), nunca por
// DM automático. Los tipos viejos `comment_dm` / `comment_dm_public` ya no se
// ofrecen: siguen existiendo para las reglas guardadas, pero el motor las trata
// como respuesta pública (ver src/channels/zernio.ts).
import type { Env } from "../../env";
import { layout } from "./layout";
import { AutoRulesRepo, type AutoRule, type AutoRuleKind } from "../../db/autoRules";
import { CAMPAIGN_TEMPLATES } from "../../templates/campaigns";

const KIND_LABELS: Record<AutoRuleKind, { title: string; desc: string }> = {
  comment_reply: {
    title: "Comentario → respuesta pública",
    desc: "Alguien comenta una keyword → respondes su comentario en público (visible para todos). Si la regla tiene un link, se suma al texto.",
  },
  dm_reply: {
    title: "DM → respuesta automática",
    desc: "Alguien te escribe por privado una keyword → le respondes al momento, sin pasar por la IA.",
  },
  comment_dm: {
    title: "Comentario → respuesta pública (antes: DM)",
    desc: "Tipo antiguo. Ya no se envía DM automático a quien comenta: esta regla responde en público como las demás.",
  },
  comment_dm_public: {
    title: "Comentario → respuesta pública (antes: DM + público)",
    desc: "Tipo antiguo. El DM automático quedó desactivado; esta regla responde solo en público.",
  },
};

const PLATFORMS = [
  { value: "all", label: "Todas las plataformas" },
  { value: "instagram", label: "Instagram" },
  { value: "facebook", label: "Facebook / Messenger" },
];

function esc(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]!),
  );
}

const INPUT_STYLE =
  "background:var(--bg);border:1px solid var(--line);color:var(--cream);padding:10px 12px;font-size:12.5px;outline:none;width:100%";

function ruleCard(rule: AutoRule, clicks: number): string {
  const kind = KIND_LABELS[rule.kind] ?? KIND_LABELS.comment_reply;
  const platform = PLATFORMS.find((p) => p.value === rule.platform)?.label ?? rule.platform;
  const keywords = rule.keywords.map(esc).join(", ");
  const chip = (label: string, accent: boolean): string =>
    `<span style="font-size:10px;letter-spacing:.12em;padding:3px 9px;border:1px solid ${accent ? "var(--accent)" : "var(--line)"};color:${accent ? "var(--accent2)" : "var(--muted)"};background:${accent ? "rgba(45,212,191,.07)" : "transparent"}">${esc(label)}</span>`;

  const actions = [
    `<a href="/admin/automatizaciones/${esc(rule.id)}/edit" class="text-[11px]" style="border:1px solid var(--line);color:var(--accent2);padding:5px 10px;cursor:pointer;background:none;text-decoration:none">✏️ Editar</a>`,
    `<button type="submit" form="toggle-${esc(rule.id)}" class="text-[11px]" style="border:1px solid var(--line);color:var(--cream);padding:5px 10px;cursor:pointer;background:none">${rule.isActive ? "⏸ Pausar" : "▶ Activar"}</button>`,
    `<button type="submit" form="delete-${esc(rule.id)}" class="text-[11px]" style="border:1px solid var(--bad);color:var(--bad);padding:5px 10px;cursor:pointer;background:none">🗑 Eliminar</button>`,
  ].join("");

  return `
    <div class="bg-panel border" style="padding:16px 18px;display:flex;flex-direction:column;gap:9px;${rule.isActive ? "border-color:rgba(127,183,126,.4)" : "border-color:var(--line);opacity:.75"}">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap">
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          ${chip(kind.title, true)}
          ${chip(platform, false)}
        </div>
        <div style="display:flex;gap:6px">${actions}</div>
      </div>
      <p class="text-dim text-[11.5px]" style="margin:0">${esc(kind.desc)}</p>
      <div style="display:flex;flex-wrap:wrap;gap:5px;align-items:center">
        <span class="text-muted text-[11.5px] font-mono" style="color:var(--dim)">keywords:</span>
        ${rule.keywords.map((k) => `<span class="font-mono" style="font-size:11px;border:1px solid var(--line);background:var(--panel2);padding:2px 7px;color:var(--accent2)">${esc(k)}</span>`).join("")}
      </div>
      <div class="text-[12px]" style="color:var(--cream);border-left:2px solid var(--accent);padding-left:10px;margin-top:2px">${esc(rule.message)}</div>
      ${clicks > 0 ? `<div class="text-[11px] font-mono" style="color:var(--accent2)">👆 ${clicks} click${clicks === 1 ? "" : "s"} en los links de esta regla</div>` : ""}
      ${rule.replyToComment ? `<div class="text-[11.5px]" style="color:var(--muted)">↩ Respuesta pública: <span style="color:var(--cream)">${esc(rule.replyToComment)}</span></div>` : ""}
      ${rule.requireFollow ? `<div class="text-[11.5px]" style="color:var(--accent2)">🔒 Follow gate: exige follow antes de entregar el link</div>` : ""}
      ${rule.buttonLabel ? `<div class="text-[11.5px]" style="color:var(--muted)">🔘 <span class="font-mono">${esc(rule.buttonLabel)}</span> → ${esc(rule.buttonUrl ?? "")}</div>` : ""}
      <form id="toggle-${esc(rule.id)}" method="POST" action="/admin/automatizaciones/${esc(rule.id)}/toggle" style="display:none"></form>
      <form id="delete-${esc(rule.id)}" method="POST" action="/admin/automatizaciones/${esc(rule.id)}/delete" style="display:none"></form>
    </div>`;
}

export async function renderAutomatizaciones(env: Env, saved?: boolean, error?: string, editRule?: AutoRule | null): Promise<string> {
  const { Db } = await import("../../db/client");
  const repo = new AutoRulesRepo(new Db(env.DB));
  let rules: AutoRule[] = [];
  try {
    rules = await repo.list();
  } catch (e) {
    error = error ?? "No se pudieron cargar las reglas: " + String((e as Error)?.message ?? e);
  }

  // Clicks por regla (links trackeados) para mostrar en cada card.
  const clicksByRule: Record<string, number> = {};
  try {
    const { TrackedLinksRepo } = await import("../../db/trackedLinks");
    const linksRepo = new TrackedLinksRepo(new Db(env.DB));
    for (const rule of rules) {
      const links = await linksRepo.listByRule(rule.id);
      let total = 0;
      for (const l of links) total += await linksRepo.clickCount(l.slug);
      clicksByRule[rule.id] = total;
    }
  } catch {
    // sin tracking: no se muestran clicks
  }

  // Historial reciente de envíos (Fase 6 OpenReply): dm_logs.
  let recentLogs: {
    id: string; ruleId: string | null; kind: string; platform: string | null; target: string | null; username: string | null; message: string | null; status: string; error: string | null; createdAt: number;
  }[] = [];
  try {
    const { DmLogsRepo } = await import("../../db/dmLogs");
    recentLogs = await new DmLogsRepo(new Db(env.DB)).recent(30);
  } catch {
    // sin logs aún
  }

  const cards = rules.length
    ? rules.map((r) => ruleCard(r, clicksByRule[r.id] ?? 0)).join("")
    : `<div class="bg-panel border" style="padding:24px;text-align:center;color:var(--dim);font-size:12.5px">Aún no hay automatizaciones. Crea la primera con el formulario de abajo.</div>`;

  const banner = saved
    ? `<div style="border:1px solid var(--ok);color:var(--ok);padding:10px 14px;font-size:12px;background:rgba(52,211,153,.06)">✓ Guardado</div>`
    : error
      ? `<div style="border:1px solid var(--bad);color:var(--bad);padding:10px 14px;font-size:12px;background:rgba(248,113,113,.06)">⚠ ${esc(error)}</div>`
      : "";

  // Solo se ofrecen los tipos vigentes. Si se está editando una regla con un
  // tipo antiguo (comment_dm*), se añade su opción para no romper el select.
  const OFFERED_KINDS: AutoRuleKind[] = ["comment_reply", "dm_reply"];
  const kindsToShow = editRule && !OFFERED_KINDS.includes(editRule.kind)
    ? [...OFFERED_KINDS, editRule.kind]
    : OFFERED_KINDS;
  const kindOptions = kindsToShow
    .map((k) => `<option value="${k}">${esc(KIND_LABELS[k].title)}</option>`)
    .join("");
  const platformOptions = PLATFORMS.map((p) => `<option value="${p.value}">${esc(p.label)}</option>`).join("");

  const body = `
    <div style="display:flex;flex-direction:column;gap:18px">
      <div style="display:flex;flex-direction:column;gap:2px">
        <h2 class="font-display font-semibold text-[15px] text-cream">Automatizaciones</h2>
        <p class="text-muted text-[12.5px]">Reglas keyword → respuesta para comentarios y DMs. Cuando una regla matchea, gana ella (la IA no interviene). Se aplican en Instagram, Facebook y más vía Zernio.</p>
      </div>
      ${banner}
      <div style="display:flex;flex-direction:column;gap:12px">${cards}</div>
      <div class="bg-panel border" style="padding:18px 20px;display:flex;flex-direction:column;gap:14px">
        <h3 class="font-display font-semibold text-[13.5px] text-cream">${editRule ? `✏️ Editar automatización` : "Nueva automatización"}</h3>
        <div style="display:flex;flex-direction:column;gap:6px">
          <label class="font-display font-semibold text-[12px] text-cream" for="template_picker">O empezar de una plantilla</label>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            ${CAMPAIGN_TEMPLATES.map(
              (t) =>
                `<button type="button" class="tpl-btn" data-tpl="${esc(t.id)}" style="border:1px solid var(--line);background:var(--panel2);color:var(--cream);padding:8px 12px;font-size:11.5px;cursor:pointer">${esc(t.label)}</button>`,
            ).join("")}
            <button type="button" class="tpl-btn" data-tpl="" style="border:1px solid var(--line);background:none;color:var(--dim);padding:8px 12px;font-size:11.5px;cursor:pointer">✕ Vaciar</button>
          </div>
          <span class="text-dim text-[10.5px]">Toca una plantilla y el formulario se rellena solo; ajusta keywords y mensajes a tu negocio.</span>
        </div>
        <form method="POST" action="${editRule ? `/admin/automatizaciones/${esc(editRule.id)}/save` : "/admin/automatizaciones/save"}" id="auto-form" style="display:flex;flex-direction:column;gap:14px">
          ${editRule ? `<input type="hidden" name="editing_id" value="${esc(editRule.id)}">` : ""}
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px">
            <div style="display:flex;flex-direction:column;gap:5px">
              <label class="font-display font-semibold text-[12px] text-cream" for="kind">Tipo de flujo</label>
              <select id="kind" name="kind" style="${INPUT_STYLE}">${kindOptions.replace(`value="${esc(editRule?.kind ?? "")}"`, `value="${esc(editRule?.kind ?? "")}" selected`)}</select>
            </div>
            <div style="display:flex;flex-direction:column;gap:5px">
              <label class="font-display font-semibold text-[12px] text-cream" for="platform">Plataforma</label>
              <select id="platform" name="platform" style="${INPUT_STYLE}">${platformOptions.replace(`value="${esc(editRule?.platform ?? "")}"`, `value="${esc(editRule?.platform ?? "")}" selected`)}</select>
            </div>
          </div>
          <div style="display:flex;flex-direction:column;gap:5px">
            <label class="font-display font-semibold text-[12px] text-cream" for="keywords">Keywords (separadas por coma)</label>
            <input id="keywords" name="keywords" required value="${esc(editRule?.keywords.join(", ") ?? "")}" placeholder="precio, cuánto cuesta, cotización" style="${INPUT_STYLE}">
          </div>
          <div style="display:flex;flex-direction:column;gap:5px">
            <label class="font-display font-semibold text-[12px] text-cream" for="message">Mensaje de la respuesta</label>
            <textarea id="message" name="message" required rows="3" placeholder="¡Hola {username}! 👋 Gracias por tu interés. Aquí tienes el catálogo:" style="${INPUT_STYLE}">${esc(editRule?.message ?? "")}</textarea>
            <span class="text-dim text-[10.5px]">Para comentarios se publica como respuesta pública (nunca DM). Puedes usar <span class="font-mono">{"{username}"}</span> para saludar al cliente por su nombre.</span>
          </div>
          <div style="display:flex;align-items:center;gap:10px">
            <label style="display:flex;align-items:center;gap:8px;font-size:12px;color:var(--muted);cursor:pointer">
              <input type="checkbox" name="whole_word_match" value="1" ${editRule?.wholeWordMatch !== false ? "checked" : ""} style="accent-color:var(--accent)">
              La keyword debe ser palabra completa (recomendado). Desmárcalo para matchear también dentro de otras palabras (ej. "link" matchea "linking").
            </label>
          </div>
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px">
            <div style="display:flex;flex-direction:column;gap:5px">
              <label class="font-display font-semibold text-[12px] text-cream" for="button_label">Texto antes del link (opcional)</label>
              <input id="button_label" name="button_label" value="${esc(editRule?.buttonLabel ?? "")}" placeholder="Ver catálogo" style="${INPUT_STYLE}">
            </div>
            <div style="display:flex;flex-direction:column;gap:5px">
              <label class="font-display font-semibold text-[12px] text-cream" for="button_url">Link (opcional)</label>
              <input id="button_url" name="button_url" value="${esc(editRule?.buttonUrl ?? "")}" placeholder="https://tusitio.com/catalogo" style="${INPUT_STYLE}">
            </div>
          </div>
          <span class="text-dim text-[10.5px]" style="margin-top:-6px">El link se agrega al final de la respuesta pública (los comentarios no admiten botones). Se sirve vía enlace trackeado para contar clics.</span>
          <div style="display:flex;flex-direction:column;gap:5px">
            <label class="font-display font-semibold text-[12px] text-cream" for="ai_reply_prompt">Respuesta pública con IA (opcional, reemplaza la fija)</label>
            <textarea id="ai_reply_prompt" name="ai_reply_prompt" rows="2" placeholder="Ej. Responde breve y cálido, en mi tono, agradeciendo el comentario e invitando a escribir por privado. Máximo 2 oraciones." style="${INPUT_STYLE}">${esc(editRule?.aiReplyPrompt ?? "")}</textarea>
            <span class="text-dim text-[10.5px]">La IA genera la respuesta pública usando la llave/configuración del bot, en tu tono. Si falla, usa la respuesta fija de arriba (si la hay).</span>
          </div>
          <div style="display:flex;align-items:center;gap:10px">
            <button type="submit" style="background:var(--accent);color:#06251f;font-weight:700;border:none;padding:10px 18px;font-size:12.5px;cursor:pointer">${editRule ? "💾 Guardar cambios" : "+ Crear automatización"}</button>
            ${editRule ? `<a href="/admin/automatizaciones" class="text-[11px]" style="border:1px solid var(--line);color:var(--dim);padding:10px 18px;text-decoration:none">Cancelar</a>` : `<span class="text-dim text-[11px]">La regla queda activa de inmediato.</span>`}
          </div>
        </form>
      </div>

      <div class="bg-panel border" style="padding:18px 20px;display:flex;flex-direction:column;gap:12px">
        <h3 class="font-display font-semibold text-[13.5px] text-cream">Historial de envíos</h3>
        <p class="text-muted text-[12px]" style="margin:0">Cada intento de DM o respuesta pública: quién, qué, estado y motivo. <span class="font-mono">sent</span> = enviado · <span class="font-mono">skipped</span> = omitido (dedup/regla) · <span class="font-mono">failed</span> = falló.</p>
        ${recentLogs.length === 0
          ? `<div class="text-dim text-[12px]" style="padding:10px 0">Aún no hay envíos registrados.</div>`
          : `<div style="display:flex;flex-direction:column;gap:6px">${recentLogs
              .map((l) => {
                const color =
                  l.status === "sent" ? "var(--ok)" : l.status === "skipped" ? "var(--warn,#e9ad4f)" : "var(--bad)";
                const when = new Date(l.createdAt).toLocaleString("es", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
                const kindLabel = l.kind === "comment_dm" ? "comentario→DM" : l.kind === "comment_reply" ? "comentario→público" : l.kind === "comment_dm_public" ? "comentario→DM+público" : "DM→respuesta";
                return `<div style="display:flex;gap:10px;align-items:flex-start;border:1px solid var(--line);background:var(--panel2);padding:8px 10px">
                  <span class="font-mono text-[10px]" style="color:${color};border:1px solid ${color};padding:2px 6px;flex:none">${esc(l.status.toUpperCase())}</span>
                  <span style="flex:1;min-width:0">
                    <span class="text-[12px] text-cream" style="display:block">${esc(kindLabel)}${l.username ? " · " + esc(l.username) : ""} ${l.platform ? "· " + esc(l.platform) : ""}</span>
                    <span class="text-[11px] text-dim" style="display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(l.message ?? "")}</span>
                    ${l.error ? `<span class="text-[10.5px]" style="color:var(--bad);display:block">⚠ ${esc(l.error)}</span>` : ""}
                  </span>
                  <span class="text-[10px] font-mono" style="color:var(--dim);flex:none">${esc(when)}</span>
                </div>`;
              })
              .join("")}</div>`}
      </div>
    </div>
    <script>
    (function () {
      const TEMPLATES = ${JSON.stringify(CAMPAIGN_TEMPLATES)};
      const $ = (id) => document.getElementById(id);
      const set = (id, v) => { const el = $(id); if (el) el.value = v; };
      const check = (id, v) => { const el = $(id); if (el) el.checked = v; };
      const normKind = (k) => (k === "comment_dm" || k === "comment_dm_public") ? "comment_reply" : (k || "comment_reply");
      function fill(t) {
        if (!t) { // vaciar
          set("kind", "comment_reply");
          set("platform", "all");
          set("keywords", "");
          set("message", "");
          set("button_label", "");
          set("button_url", "");
          check("whole_word_match", true);
          return;
        }
        const d = t.defaults || {};
        set("kind", normKind(d.kind));
        set("platform", d.platform || "all");
        set("keywords", (d.keywords || []).join(", "));
        set("message", d.message || "");
        set("button_label", d.buttonLabel || "");
        set("button_url", d.buttonUrl || "");
        check("whole_word_match", d.wholeWordMatch !== false);
        $("auto-form").scrollIntoView({ behavior: "smooth", block: "start" });
      }
      document.querySelectorAll(".tpl-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
          const tpl = TEMPLATES.find((t) => t.id === btn.dataset.tpl);
          fill(tpl);
        });
      });
    })();
    </script>`;

  return layout({ title: "Automatizaciones", activeTab: "automatizaciones", body, env });
}
