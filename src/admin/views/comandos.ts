// "Comandos" — cheat sheet: los comandos de terminal y los prompts del agente,
// listos para copiar. Solo lectura.
import type { Env } from "../../env";
import { layout } from "./layout";

const TERMINAL: { cmd: string; desc: string }[] = [
  { cmd: "npx kooni-bot init", desc: "Instala: descarga el template, configura el bot y despliega." },
  { cmd: "npx kooni-bot list", desc: "Lista los giros (nichos) disponibles." },
  { cmd: "npx kooni-bot install <giro>", desc: "Instala el bot de un giro (ej. restaurante)." },
  { cmd: "npx kooni-bot login", desc: "Conecta el CLI a tu cuenta Kooni (abre el navegador)." },
  { cmd: "npx kooni-bot whoami", desc: "Muestra con qué cuenta estás conectado." },
  { cmd: "npx kooni-bot pair", desc: "Vincula un bot ya desplegado a tu cuenta." },
  { cmd: "npx kooni-bot update", desc: "Actualiza tu bot sin perder tu config ni tus datos." },
  { cmd: "npx kooni-bot deploy", desc: "Provisiona Cloudflare y publica el worker." },
  { cmd: "npx kooni-bot doctor", desc: "Diagnóstico del bot instalado." },
  { cmd: "npx kooni-bot version", desc: "Versión del CLI." },
];

const AGENTE: { cmd: string; desc: string }[] = [
  { cmd: "/configurar-mi-chatbot", desc: "Setup inicial completo (negocio, canales, deploy)." },
  { cmd: "/reporte", desc: "Informe de valor de lo que hizo tu bot." },
  { cmd: "/exportar", desc: "Exporta tus datos (leads, conversaciones)." },
  { cmd: "/actualizar-mi-bot", desc: "Actualiza el bot a la última versión." },
  { cmd: "/prompt", desc: "Ve y editá tu prompt por secciones (puerta de entrada)." },
  { cmd: "/limpiar-prompt", desc: "Desinfla un prompt largo: mueve datos a la KB y quita duplicados." },
  { cmd: "/versionar-prompt", desc: "Historial del prompt: guardá versiones y volvé a cualquiera." },
  { cmd: "/lab-prompt", desc: "A/B del prompt: variantes + conversaciones simuladas." },
  { cmd: "/prompt-por-canal", desc: "Una personalidad por canal (WhatsApp, Instagram…)." },
  { cmd: "/auditar-prompt", desc: "Califica tu prompt contra las buenas prácticas." },
  { cmd: "/ejemplos-prompt", desc: "Convierte tus mejores chats en ejemplos (few-shot)." },
];

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]!));
}

function row(c: { cmd: string; desc: string }): string {
  return `
    <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;border:1px solid var(--line);background:var(--panel2);padding:10px 12px">
      <div style="min-width:0">
        <div class="font-mono text-[12.5px]" style="color:var(--accent2)">${esc(c.cmd)}</div>
        <div class="text-muted text-[11.5px]" style="margin-top:2px">${esc(c.desc)}</div>
      </div>
      <button type="button" class="copybtn text-[11px] font-display font-semibold"
              data-copy="${esc(c.cmd)}"
              style="flex:none;border:1px solid var(--line);color:var(--cream);padding:7px 12px;background:var(--panel);cursor:pointer">Copiar</button>
    </div>`;
}

export async function renderComandos(env: Env): Promise<string> {
  const body = `
    <div style="display:flex;flex-direction:column;gap:20px;max-width:880px">
      <div style="display:flex;flex-direction:column;gap:4px">
        <h2 class="font-display font-semibold text-[15px] text-cream">Comandos</h2>
        <p class="text-muted text-[12.5px]">El cheat sheet completo. Los de terminal se corren directo; los que empiezan con <span class="font-mono">/</span> son prompts — copialos y pegáselos a tu agente (Claude Code / Codex) en la carpeta del bot.</p>
      </div>

      <div style="display:flex;flex-direction:column;gap:8px">
        <h3 class="font-display font-semibold text-[13.5px] text-cream">Terminal · CLI <span class="font-mono text-muted">kooni-bot</span></h3>
        ${TERMINAL.map(row).join("")}
      </div>

      <div style="display:flex;flex-direction:column;gap:8px">
        <h3 class="font-display font-semibold text-[13.5px] text-cream">Agente · prompts</h3>
        ${AGENTE.map(row).join("")}
      </div>
    </div>
    <script>
      document.querySelectorAll('.copybtn').forEach(function(b){
        b.addEventListener('click', function(){
          var t = b.getAttribute('data-copy');
          if (navigator.clipboard) navigator.clipboard.writeText(t);
          var o = b.textContent; b.textContent = '✓ Copiado';
          setTimeout(function(){ b.textContent = o; }, 1500);
        });
      });
    </script>`;

  return layout({ title: "Comandos", activeTab: "comandos", body, env });
}
