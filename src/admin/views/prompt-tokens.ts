// Barra de inserción para el prompt MANUAL ("Prompt del agente (avanzado)"):
// chips que insertan una etiqueta `{{...}}` o el nombre de una herramienta en el
// cursor del textarea, más un menú que aparece al escribir "/".
//
// Las etiquetas `{{...}}` las sustituye el worker al construir el prompt
// (src/system-prompt.ts → applyPromptTokens), así que un prompt manual puede
// re-inyectar la info del negocio, la lista de herramientas, etc. El motor JS
// que las inserta vive UNA vez en layout.ts (GLOBAL_SCRIPT) y usa delegación de
// eventos; aquí solo se emiten los chips, el contenedor del menú y sus datos.
import type { T, MessageKey } from "../i18n";

interface PromptTokenSpec {
  token: string;
  /** Descripción (tooltip + resultado del menú "/"). */
  descKey: MessageKey;
}

/** Etiquetas del prompt automático que el dueño puede reutilizar en el suyo. */
const PROMPT_TOKEN_SPECS: PromptTokenSpec[] = [
  { token: "{{BUSINESS_CONTEXT}}", descKey: "pt.tok.business" },
  { token: "{{TOOL_LIST}}", descKey: "pt.tok.tools" },
  { token: "{{NICHO_PLAYBOOK}}", descKey: "pt.tok.playbook" },
  { token: "{{LECCIONES}}", descKey: "pt.tok.lessons" },
  { token: "{{INSTRUCCIONES}}", descKey: "pt.tok.instr" },
  { token: "{{BOT_NAME}}", descKey: "pt.tok.botName" },
  { token: "{{BUSINESS_NAME}}", descKey: "pt.tok.bizName" },
  { token: "{{LANGUAGE}}", descKey: "pt.tok.lang" },
];

/** Nombres de tokens que el motor puede sustituir (para tests/verificación). */
export const PROMPT_TOKEN_NAMES: string[] = PROMPT_TOKEN_SPECS.map((s) => s.token);

function esc(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]!),
  );
}

const CHIP_STYLE =
  "font-family:'IBM Plex Mono',monospace;font-size:10.5px;border:1px solid var(--line);" +
  "background:var(--panel2);color:var(--accent2);padding:3px 8px;cursor:pointer";

function chip(textareaId: string, label: string, value: string, title: string): string {
  return `<button type="button" data-pt-insert="${esc(textareaId)}" data-pt-token="${esc(value)}"` +
    ` title="${esc(title)}" style="${CHIP_STYLE}">${esc(label)}</button>`;
}

/**
 * Render de la barra: una línea de etiquetas, otra de herramientas, el hint del
 * "/" y el contenedor del menú. `toolNames` = herramientas activas de esta
 * instalación (el nombre real que el modelo ve, p. ej. `scheduleAppointment`).
 */
export function renderPromptInsertBar(t: T, textareaId: string, toolNames: string[]): string {
  const tokenChips = PROMPT_TOKEN_SPECS
    .map((s) => chip(textareaId, s.token, s.token, t(s.descKey)))
    .join("");

  const toolChips = toolNames
    .map((n) => chip(textareaId, n, n, t("pt.tok.tool")))
    .join("");

  // Datos que consume el motor del layout: token → descripción y herramientas.
  const menuItems = [
    ...PROMPT_TOKEN_SPECS.map((s) => ({ v: s.token, d: t(s.descKey) })),
    ...toolNames.map((n) => ({ v: n, d: t("pt.tok.tool") })),
  ];

  return `
    <div style="position:relative;display:flex;flex-direction:column;gap:8px">
      <div id="${esc(textareaId)}-slash" class="pt-slash" data-pt-menu="${esc(textareaId)}" hidden
           style="position:absolute;left:0;top:0;z-index:40;min-width:300px;max-width:100%;max-height:240px;overflow:auto;background:var(--panel);border:1px solid var(--accent);box-shadow:var(--shadow)"></div>
      <span class="text-dim text-[10.5px] leading-relaxed">${esc(t("pt.tokensHelp"))}</span>
      <div style="display:flex;flex-wrap:wrap;gap:6px;align-items:center">
        <span class="text-dim text-[10.5px]">${esc(t("pt.tokensLabel"))}</span>
        ${tokenChips}
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:6px;align-items:center">
        <span class="text-dim text-[10.5px]">${esc(t("pt.toolsLabel"))}</span>
        ${toolChips || `<span class="text-dim text-[10.5px]">—</span>`}
      </div>
      <span class="text-dim text-[10.5px]">${esc(t("pt.slashHint"))}</span>
    </div>
    <script>window.__ptData=window.__ptData||{};window.__ptData[${JSON.stringify(textareaId)}]=${JSON.stringify(menuItems)};</script>`;
}
