// "Comandos" — cheat sheet: los comandos de terminal y los prompts del agente,
// listos para copiar. Solo lectura.
import type { Env } from "../../env";
import { layout } from "./layout";
import { panelI18n, type T } from "../i18n";

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]!));
}

function row(t: T, c: { cmd: string; desc: string }): string {
  return `
    <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;border:1px solid var(--line);background:var(--panel2);padding:10px 12px">
      <div style="min-width:0">
        <div class="font-mono text-[12.5px]" style="color:var(--accent2)">${esc(c.cmd)}</div>
        <div class="text-muted text-[11.5px]" style="margin-top:2px">${esc(c.desc)}</div>
      </div>
      <button type="button" class="copybtn text-[11px] font-display font-semibold"
              data-copy="${esc(c.cmd)}"
              style="flex:none;border:1px solid var(--line);color:var(--cream);padding:7px 12px;background:var(--panel);cursor:pointer">${t("cmd.copy")}</button>
    </div>`;
}

export async function renderComandos(env: Env): Promise<string> {
  const { t } = await panelI18n(env);

  const TERMINAL: { cmd: string; desc: string }[] = [
    { cmd: "npx kooni-bot init", desc: t("cmd.terminal.init") },
    { cmd: "npx kooni-bot list", desc: t("cmd.terminal.list") },
    { cmd: "npx kooni-bot install <giro>", desc: t("cmd.terminal.install") },
    { cmd: "npx kooni-bot login", desc: t("cmd.terminal.login") },
    { cmd: "npx kooni-bot whoami", desc: t("cmd.terminal.whoami") },
    { cmd: "npx kooni-bot pair", desc: t("cmd.terminal.pair") },
    { cmd: "npx kooni-bot update", desc: t("cmd.terminal.update") },
    { cmd: "npx kooni-bot deploy", desc: t("cmd.terminal.deploy") },
    { cmd: "npx kooni-bot doctor", desc: t("cmd.terminal.doctor") },
    { cmd: "npx kooni-bot version", desc: t("cmd.terminal.version") },
  ];

  const AGENTE: { cmd: string; desc: string }[] = [
    { cmd: "/configurar-mi-chatbot", desc: t("cmd.agent.setup") },
    { cmd: "/reporte", desc: t("cmd.agent.report") },
    { cmd: "/exportar", desc: t("cmd.agent.export") },
    { cmd: "/actualizar-mi-bot", desc: t("cmd.agent.update") },
    { cmd: "/prompt", desc: t("cmd.agent.prompt") },
    { cmd: "/limpiar-prompt", desc: t("cmd.agent.cleanPrompt") },
    { cmd: "/versionar-prompt", desc: t("cmd.agent.versionPrompt") },
    { cmd: "/lab-prompt", desc: t("cmd.agent.labPrompt") },
    { cmd: "/prompt-por-canal", desc: t("cmd.agent.perChannel") },
    { cmd: "/auditar-prompt", desc: t("cmd.agent.audit") },
    { cmd: "/ejemplos-prompt", desc: t("cmd.agent.examples") },
  ];

  const body = `
    <div style="display:flex;flex-direction:column;gap:20px;max-width:880px">
      <div style="display:flex;flex-direction:column;gap:4px">
        <h2 class="font-display font-semibold text-[15px] text-cream">${t("cmd.heading")}</h2>
        <p class="text-muted text-[12.5px]">${t("cmd.subtitle")}</p>
      </div>

      <div style="display:flex;flex-direction:column;gap:8px">
        <h3 class="font-display font-semibold text-[13.5px] text-cream">${t("cmd.terminal.title")} <span class="font-mono text-muted">kooni-bot</span></h3>
        ${TERMINAL.map((c) => row(t, c)).join("")}
      </div>

      <div style="display:flex;flex-direction:column;gap:8px">
        <h3 class="font-display font-semibold text-[13.5px] text-cream">${t("cmd.agent.title")}</h3>
        ${AGENTE.map((c) => row(t, c)).join("")}
      </div>
    </div>
    <script>
      document.querySelectorAll('.copybtn').forEach(function(b){
        b.addEventListener('click', function(){
          var t = b.getAttribute('data-copy');
          if (navigator.clipboard) navigator.clipboard.writeText(t);
          var o = b.textContent; b.textContent = '${t("cmd.copied")}';
          setTimeout(function(){ b.textContent = o; }, 1500);
        });
      });
    </script>`;

  return layout({ title: t("cmd.title"), activeTab: "comandos", body, env });
}
