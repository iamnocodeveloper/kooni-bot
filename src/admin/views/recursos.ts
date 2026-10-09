// Vista "Galería" (/admin/recursos) — la biblioteca de recursos multimedia del
// bot: imágenes, audios (nota de voz) y PDF. Se suben desde acá (o se pega una
// URL) y el bot los envía con la tool enviarRecurso. Cada recurso lleva un
// "cuándo usarlo" que se inyecta al prompt para que el bot sepa elegir.
import type { Env } from "../../env";
import { Db } from "../../db/client";
import { SettingsRepo, SETTING_KEYS } from "../../db/settings";
import { parseResourceLibrary, type LibraryResource } from "../../resources/library";
import { maxMediaBytes } from "../../media/store";
import { layout } from "./layout";
import { panelI18n, type T } from "../i18n";

function esc(s: string | null | undefined): string {
  return (s ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]!));
}

const inputStyle = "background:var(--bg);border:1px solid var(--line);color:var(--cream);padding:6px 8px;font-size:12.5px";

function preview(r: LibraryResource): string {
  if (r.kind === "image") {
    return `<img src="${esc(r.url)}" alt="${esc(r.name)}" style="width:72px;height:72px;object-fit:cover;border:1px solid var(--line);border-radius:6px">`;
  }
  if (r.kind === "audio") {
    return `<audio controls preload="none" src="${esc(r.url)}" style="height:34px"></audio>`;
  }
  return `<a href="${esc(r.url)}" target="_blank" rel="noopener" class="text-accent text-[12px]">Ver documento</a>`;
}

function resourceRow(t: T, r: LibraryResource): string {
  const kindLabel = r.kind === "audio" && r.asVoice !== false ? t("rec.kind.voice") : t(`rec.kind.${r.kind}` as never);
  const when = r.when ? `<span class="text-dim text-[11px]">${esc(t("rec.when"))}: ${esc(r.when)}</span>` : "";
  const kw = r.keywords?.length ? `<span class="text-dim text-[11px]">${esc(t("rec.keywords"))}: ${esc(r.keywords.join(", "))}</span>` : "";
  return `<div class="bg-panel border border-line" style="padding:12px 14px;display:flex;gap:14px;align-items:center">
    <div style="min-width:72px">${preview(r)}</div>
    <div style="display:flex;flex-direction:column;gap:3px;flex:1;min-width:0">
      <span class="font-display font-semibold text-[13px] text-cream">${esc(r.name)} <span class="text-dim text-[11px]">· ${esc(kindLabel)}</span></span>
      ${r.caption ? `<span class="text-muted text-[12px]">${esc(r.caption)}</span>` : ""}
      ${when}
      ${kw}
    </div>
    <div style="display:flex;gap:6px">
      <a href="/admin/recursos?edit=${encodeURIComponent(r.name)}" class="text-accent text-[11.5px]" style="padding:5px 10px;border:1px solid var(--line)">${esc(t("rec.edit"))}</a>
      <form method="POST" action="/admin/recursos/delete" style="display:inline">
        <input type="hidden" name="name" value="${esc(r.name)}">
        <button type="submit" style="background:transparent;border:1px solid var(--bad);color:var(--bad);padding:5px 10px;font-size:11.5px;cursor:pointer">${esc(t("rec.delete"))}</button>
      </form>
    </div>
  </div>`;
}

export async function renderRecursos(
  env: Env,
  flash?: { saved?: boolean; deleted?: boolean; error?: string },
  editName?: string,
): Promise<string> {
  const { t } = await panelI18n(env);
  const repo = new SettingsRepo(new Db(env.DB));
  const raw = await repo.get(SETTING_KEYS.resourceLibrary).catch(() => null);
  const lib = parseResourceLibrary(raw);
  const names = Object.keys(lib);
  const editing = editName ? lib[editName] ?? null : null;

  const maxMb = (maxMediaBytes(env) / 1_048_576).toFixed(1);
  const bannerHtml = flash?.saved
    ? `<div class="border border-ok text-ok" style="padding:9px 12px;font-size:12px;background:var(--panel2)">${esc(t("rec.saved"))}</div>`
    : flash?.deleted
      ? `<div class="border border-line text-muted" style="padding:9px 12px;font-size:12px;background:var(--panel2)">${esc(t("rec.deleted"))}</div>`
      : flash?.error
        ? `<div class="border border-bad text-bad" style="padding:9px 12px;font-size:12px;background:var(--panel2)">${esc(flash.error)}</div>`
        : "";

  const body = `
    <div style="display:flex;flex-direction:column;gap:16px">
      <div style="display:flex;flex-direction:column;gap:3px">
        <h2 class="font-display font-semibold text-[15px] text-cream">${esc(t("rec.title"))}</h2>
        <p class="text-muted text-[12.5px]">${esc(t("rec.subtitle"))}</p>
      </div>
      ${bannerHtml}

      <form id="rec-form" method="POST" action="/admin/recursos/save" enctype="multipart/form-data" class="bg-panel border border-line" style="padding:14px 16px;display:flex;flex-direction:column;gap:8px">
        <span class="font-display font-semibold text-[13px] text-cream">${editing ? esc(t("rec.editing", { name: editing.name })) : esc(t("rec.new"))}</span>
        <div style="display:grid;grid-template-columns:1.4fr 1fr;gap:8px">
          <input name="name" required placeholder="${esc(t("rec.namePh"))}" value="${esc(editing?.name ?? "")}" style="${inputStyle}">
          <select name="kind" style="${inputStyle}">
            <option value="image" ${editing?.kind === "image" ? "selected" : ""}>${esc(t("rec.kind.image"))}</option>
            <option value="audio" ${editing?.kind === "audio" ? "selected" : ""}>${esc(t("rec.kind.audio"))}</option>
            <option value="document" ${editing?.kind === "document" ? "selected" : ""}>${esc(t("rec.kind.document"))}</option>
          </select>
        </div>
        <label style="font-size:11.5px;color:var(--muted)">${esc(t("rec.file", { mb: maxMb }))}
          <input type="file" name="file" accept="image/*,audio/*,application/pdf" style="display:block;margin-top:4px;font-size:12px">
        </label>
        <input name="url" placeholder="${esc(t("rec.urlPh"))}" value="${esc(editing?.url ?? "")}" style="${inputStyle}">
        <input name="caption" placeholder="${esc(t("rec.captionPh"))}" value="${esc(editing?.caption ?? "")}" style="${inputStyle}">
        <input name="when" placeholder="${esc(t("rec.whenPh"))}" value="${esc(editing?.when ?? "")}" style="${inputStyle}">
        <input name="keywords" placeholder="${esc(t("rec.keywordsPh"))}" value="${esc(editing?.keywords?.join(", ") ?? "")}" style="${inputStyle}">
        <label style="font-size:11.5px;color:var(--muted);display:inline-flex;gap:6px;align-items:center">
          <input type="checkbox" name="asVoice" ${editing ? (editing.asVoice !== false ? "checked" : "") : "checked"}> ${esc(t("rec.asVoice"))}
        </label>
        <div style="display:flex;gap:8px;align-items:center">
          <button type="submit" style="background:var(--accent);color:var(--on-accent);border:none;padding:8px 16px;font-size:12.5px;font-weight:700;cursor:pointer">${esc(editing ? t("rec.update") : t("rec.create"))}</button>
          ${editing ? `<a href="/admin/recursos" class="text-dim text-[11.5px]">${esc(t("rec.cancel"))}</a>` : ""}
        </div>
        <span class="text-dim text-[11px]">${esc(t("rec.hint"))}</span>
      </form>

      ${names.length ? names.map((n) => resourceRow(t, lib[n])).join("") : `<div class="text-dim text-[12.5px]" style="padding:20px;text-align:center">${esc(t("rec.empty"))}</div>`}

      <p class="text-dim text-[11.5px]">${esc(t("rec.footer"))}</p>
    </div>

    <script>
      // Comprime imágenes en el navegador (max 1400px, JPEG q0.82) antes de
      // subirlas: mantiene el archivo bajo el límite del fallback D1. Si el
      // navegador no soporta canvas/DataTransfer, sube el original.
      (function(){
        var form = document.getElementById('rec-form');
        if (!form) return;
        var fileInput = form.querySelector('input[name=file]');
        var kindSel = form.querySelector('select[name=kind]');
        fileInput && fileInput.addEventListener('change', function(){
          var f = this.files && this.files[0];
          if (f && kindSel) {
            if (/^image\\//.test(f.type)) kindSel.value = 'image';
            else if (/^audio\\//.test(f.type)) kindSel.value = 'audio';
            else if (/pdf/.test(f.type)) kindSel.value = 'document';
          }
        });
        var submitting = false;
        form.addEventListener('submit', function(e){
          if (submitting) return;
          var f = fileInput && fileInput.files && fileInput.files[0];
          if (!f || !/^image\\//.test(f.type) || !window.createImageBitmap || !window.DataTransfer) return;
          e.preventDefault();
          createImageBitmap(f).then(function(bmp){
            var MAX = 1400, scale = Math.min(1, MAX / Math.max(bmp.width, bmp.height));
            var w = Math.max(1, Math.round(bmp.width * scale)), h = Math.max(1, Math.round(bmp.height * scale));
            var canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h;
            canvas.getContext('2d').drawImage(bmp, 0, 0, w, h);
            canvas.toBlob(function(blob){
              try {
                var dt = new DataTransfer();
                dt.items.add(new File([blob], (f.name || 'imagen').replace(/\\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' }));
                fileInput.files = dt.files;
              } catch (err) { /* si falla, sube el original */ }
              submitting = true;
              form.submit();
            }, 'image/jpeg', 0.82);
          }).catch(function(){ submitting = true; form.submit(); });
        });
      })();
    </script>`;

  return layout({ title: t("nav.recursos"), activeTab: "recursos", body, env });
}
