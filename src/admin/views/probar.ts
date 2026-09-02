import type { Env } from "../../env";
import { layout } from "./layout";

// "Probar el bot" — chat de prueba dentro del panel. El dueño escribe como si
// fuera un cliente y ve la respuesta REAL del bot (mismo prompt, modelo y KB),
// sin que se guarde nada ni se mande por ningún canal. Ver src/admin/playground.ts.

export function renderProbar(env: Env): Promise<string> {
  const body = `
  <div style="display:flex;flex-direction:column;gap:6px;margin-bottom:14px">
    <h2 class="font-display font-semibold text-[15px] text-cream">🧪 Probar el bot</h2>
    <p class="text-muted text-[12.5px]" style="max-width:60ch">
      Escribe como lo haría un cliente y mira cómo responde el bot con tu
      configuración y tu base de conocimiento actuales. <b>No se guarda nada</b> y
      no se manda por ningún canal. Las acciones (capturar lead, agendar) no se
      ejecutan en prueba — el bot te dice lo que haría.
    </p>
  </div>

  <div class="probar bg-panel border border-line" style="display:flex;flex-direction:column;height:calc(100dvh - 230px);min-height:420px;overflow:hidden">
    <div id="pb-log" style="flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:12px;background:var(--bg)">
      <div class="text-dim text-[12px]" style="text-align:center;padding:24px 0">
        Empieza escribiendo un mensaje abajo — por ejemplo:
        <span class="text-muted">"¿tienen un Kia usado por menos de 15 mil?"</span>
      </div>
    </div>
    <form id="pb-form" style="border-top:1px solid var(--line);background:var(--panel);padding:12px;padding-bottom:max(12px,env(safe-area-inset-bottom));display:flex;gap:9px;align-items:flex-end">
      <textarea id="pb-input" rows="2" required placeholder="Escribe un mensaje como cliente…"
        style="flex:1;background:var(--bg);border:1px solid var(--line);color:var(--cream);padding:10px 12px;font-size:12.5px;resize:none;outline:none;border-radius:9px"></textarea>
      <button id="pb-send" type="submit" class="bigbtn"
        style="background:var(--accent);border:1px solid var(--accent);color:var(--on-accent);padding:11px 18px;font-size:12.5px;font-weight:700;font-family:'Sora';cursor:pointer;white-space:nowrap">Enviar</button>
    </form>
  </div>
  <div style="margin-top:10px;display:flex;gap:10px">
    <button id="pb-reset" class="ghostbtn" style="background:var(--panel);border:1px solid var(--line);color:var(--muted);padding:7px 13px;font-size:11.5px;cursor:pointer">Reiniciar chat</button>
  </div>

  <script>
  (function(){
    var log = document.getElementById('pb-log');
    var form = document.getElementById('pb-form');
    var input = document.getElementById('pb-input');
    var send = document.getElementById('pb-send');
    var history = [];

    function esc(s){ return String(s).replace(/[&<>"]/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); }

    function bubble(role, text, meta){
      var mine = role === 'user';
      var wrap = document.createElement('div');
      wrap.style.cssText = 'display:flex;flex-direction:column;gap:3px;max-width:80%;' + (mine ? 'align-self:flex-end;align-items:flex-end' : 'align-self:flex-start');
      var b = document.createElement('div');
      b.style.cssText = 'padding:9px 13px;font-size:12.5px;line-height:1.5;white-space:pre-wrap;border-radius:12px;' +
        (mine ? 'background:var(--accent-soft);border:1px solid var(--accent);color:var(--cream)' : 'background:var(--panel2);border:1px solid var(--line);color:var(--cream)');
      b.textContent = text;
      wrap.appendChild(b);
      if (meta) {
        var m = document.createElement('div');
        m.style.cssText = 'font-size:9.5px;color:var(--dim);font-family:"IBM Plex Mono",monospace';
        m.textContent = meta;
        wrap.appendChild(m);
      }
      log.appendChild(wrap);
      log.scrollTop = log.scrollHeight;
      return b;
    }

    form.addEventListener('submit', async function(e){
      e.preventDefault();
      var text = input.value.trim();
      if (!text) return;
      // primera vez: limpiar el placeholder
      if (history.length === 0) log.innerHTML = '';
      bubble('user', text);
      history.push({ role: 'user', content: text });
      input.value = '';
      send.disabled = true; input.disabled = true;
      var thinking = bubble('assistant', '…', 'pensando');
      try {
        var r = await fetch('/admin/probar/send', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: text, history: history.slice(0, -1) })
        });
        var j = await r.json();
        if (!r.ok || j.error) throw new Error(j.error || ('HTTP ' + r.status));
        thinking.textContent = j.reply;
        thinking.parentNode.querySelector('div:last-child').textContent =
          (j.model ? j.model.replace(/^.*\\//,'').slice(0,22) : '') +
          (j.toolCalls && j.toolCalls.length ? ' · usó: ' + j.toolCalls.map(function(t){return t.toolName;}).join(', ') : '');
        history.push({ role: 'assistant', content: j.reply });
      } catch (err) {
        thinking.textContent = '✗ ' + err.message;
        thinking.style.borderColor = 'var(--bad)';
        thinking.parentNode.querySelector('div:last-child').textContent = 'error';
      }
      send.disabled = false; input.disabled = false; input.focus();
    });

    document.getElementById('pb-reset').addEventListener('click', function(){
      history = [];
      log.innerHTML = '<div class="text-dim text-[12px]" style="text-align:center;padding:24px 0">Chat reiniciado. Escribe un mensaje para empezar.</div>';
    });

    input.addEventListener('keydown', function(e){
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); form.requestSubmit(); }
    });
  })();
  </script>`;

  return layout({ title: "Probar el bot", activeTab: "probar", body, env });
}
