// "Conexiones" tab — el mapa de canales del bot. Cada canal es una card con
// estado VERDE (conectado) o gris (sin conectar), qué falta exactamente para
// conectarlo, y su webhook URL lista para copiar. Es la vista que guía el
// paso 4 del onboarding (CLAUDE.md): conectar canales uno por uno y verlos
// ponerse verdes.
import type { Env } from "../../env";
import { layout } from "./layout";
import type { ZernioAccount } from "../../channels/zernioAccounts";
import { zernioPlatformIcon, zernioPlatformLabel } from "../../channels/zernioAccounts";
import type { ZernioCredentials } from "../../channels/zernioCredentials";

interface ChannelStatus {
  id: string;
  name: string;
  icon: string; // lucide icon name
  desc: string;
  ok: boolean;
  /** Piezas faltantes (nombre de secret/var) cuando NO está conectado. */
  missing: string[];
  /** Ruta del webhook a registrar en el proveedor (si aplica). */
  webhookPath?: string;
  /** Nota de seguridad opcional (ej. secret del webhook sin configurar). */
  securityNote?: string;
  /** Cómo conectar, en 1-2 líneas. */
  howTo: string;
}

function channelStatuses(env: Env, zernioCreds: ZernioCredentials, telegramToken?: string): ChannelStatus[] {
  const has = (v?: string) => Boolean(v && v.trim() !== "");

  const telegramMissing = [!has(telegramToken) && "TELEGRAM_BOT_TOKEN"].filter(
    Boolean,
  ) as string[];
  const twilioMissing = [
    !has(env.TWILIO_ACCOUNT_SID) && "TWILIO_ACCOUNT_SID",
    !has(env.TWILIO_AUTH_TOKEN) && "TWILIO_AUTH_TOKEN",
    !has(env.TWILIO_WA_FROM) && "TWILIO_WA_FROM",
  ].filter(Boolean) as string[];
  const metaMissing = [
    !has(env.META_PAGE_ACCESS_TOKEN) && "META_PAGE_ACCESS_TOKEN",
    !has(env.META_VERIFY_TOKEN) && "META_VERIFY_TOKEN",
    !has(env.META_APP_SECRET) && "META_APP_SECRET",
  ].filter(Boolean) as string[];
  const manychatMissing = [!has(env.MANYCHAT_API_KEY) && "MANYCHAT_API_KEY"].filter(
    Boolean,
  ) as string[];
  // La API key es lo único que conecta Zernio de verdad. El webhook secret es
  // opcional (valida la firma), pero NO bloquea la conexión.
  const zernioMissing = [!has(zernioCreds.apiKey) && "ZERNIO_API_KEY"].filter(
    Boolean,
  ) as string[];
  const whatsappCloudMissing = [
    !has(env.WHATSAPP_PHONE_NUMBER_ID) && "WHATSAPP_PHONE_NUMBER_ID",
    !has(env.WHATSAPP_ACCESS_TOKEN) && "WHATSAPP_ACCESS_TOKEN",
    !has(env.WHATSAPP_VERIFY_TOKEN || env.META_VERIFY_TOKEN) && "WHATSAPP_VERIFY_TOKEN",
    !has(env.WHATSAPP_APP_SECRET || env.META_APP_SECRET) && "WHATSAPP_APP_SECRET",
  ].filter(Boolean) as string[];

  return [
    {
      id: "telegram",
      name: "Telegram",
      icon: "send",
      desc: "Bot de Telegram — gratis y el más rápido de conectar.",
      ok: telegramMissing.length === 0,
      missing: telegramMissing,
      webhookPath: "/webhooks/telegram",
      howTo: "Crea el bot con @BotFather y pega el token abajo: lo valida y registra el webhook automáticamente. Opcional: tu chat id para los avisos al dueño.",
    },
    {
      id: "whatsapp",
      name: "WhatsApp (Twilio)",
      icon: "phone",
      desc: "WhatsApp Business vía Twilio — el canal que más venden.",
      ok: twilioMissing.length === 0,
      missing: twilioMissing,
      webhookPath: "/webhooks/twilio",
      securityNote:
        twilioMissing.length === 0 && !has(env.TWILIO_HANDOFF_CONTENT_SID)
          ? "Sin TWILIO_HANDOFF_CONTENT_SID: el aviso de handoff por WhatsApp requiere una plantilla (HSM) aprobada."
          : undefined,
      howTo: "En Twilio: número WhatsApp aprobado → apunta el webhook de mensajes entrantes a la URL de abajo.",
    },
    {
      id: "whatsapp-cloud",
      name: "WhatsApp (Oficial · Cloud API)",
      icon: "message-circle",
      desc: "WhatsApp directo con Meta, sin intermediario — mejor margen.",
      ok: whatsappCloudMissing.length === 0,
      missing: whatsappCloudMissing,
      webhookPath: "/webhooks/whatsapp",
      howTo:
        "App de Meta → WhatsApp → Configuration: apunta el webhook a la URL de abajo, suscribe el campo messages, y guarda tu Phone Number ID y token. Pruébalo con el número de prueba gratis.",
    },
    {
      id: "meta",
      name: "Instagram + Messenger (Meta)",
      icon: "instagram",
      desc: "DMs de Instagram y Messenger con la API oficial de Meta.",
      ok: metaMissing.length === 0,
      missing: metaMissing,
      webhookPath: "/webhooks/meta",
      howTo: "App de Meta → Webhooks → suscribe messages con tu VERIFY_TOKEN; la firma se valida sola.",
    },
    {
      id: "manychat",
      name: "ManyChat",
      icon: "bot",
      desc: "Si ya usas ManyChat, el bot puede vivir detrás de tus flujos.",
      ok: manychatMissing.length === 0,
      missing: manychatMissing,
      webhookPath: "/webhooks/manychat",
      howTo: "En ManyChat: External Request hacia la URL de abajo.",
    },
    {
      id: "zernio",
      name: "Zernio (multicanal)",
      icon: "globe",
      desc: "Todas tus redes con una api key: Instagram, Facebook/Messenger, X, Telegram, WhatsApp, Bluesky, Reddit… Conecta TU cuenta personal (no el bot) — la IA responde tus DMs y quedan en el panel.",
      ok: zernioMissing.length === 0,
      missing: zernioMissing,
      webhookPath: "/webhooks/zernio",
      securityNote:
        !has(zernioCreds.webhookSecret)
          ? "Sin ZERNIO_WEBHOOK_SECRET el webhook acepta todo (fail-open). Recomendado: ponlo para validar la firma."
          : undefined,
      howTo: "zernio.com → copia tu API key y pégala aquí. El canal queda conectado y su webhook se registra automáticamente (message.received + comment.received); el webhook secret es opcional para validar la firma.",
    },
  ];
}

function esc(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]!),
  );
}

export async function renderConexiones(
  env: Env,
  pausedChannels: string[] = [],
  zernioAccounts: ZernioAccount[] = [],
  rateUsage: Record<string, { used: number; windowStart: number }> = {},
  opts: { zernioCreds?: ZernioCredentials; telegramToken?: string; ownerChatId?: string; baseUrl?: string; savedKind?: "telegram" | "zernio"; error?: string } = {},
): Promise<string> {
  const zernioCreds = opts.zernioCreds ?? {
    apiKey: env.ZERNIO_API_KEY,
    webhookSecret: env.ZERNIO_WEBHOOK_SECRET,
  };
  const telegramToken = opts.telegramToken ?? env.TELEGRAM_BOT_TOKEN;
  const ownerChatId = opts.ownerChatId ?? env.OWNER_TELEGRAM_CHAT_ID;
  const channels = channelStatuses(env, zernioCreds, telegramToken);
  const connected = channels.filter((ch) => ch.ok).length;
  // Fallback de base: la ruta GET pasa el origin real si DASHBOARD_BASE_URL está
  // vacío, para que las cards SIEMPRE muestren su webhook URL.
  const base = (opts.baseUrl ?? env.DASHBOARD_BASE_URL ?? "").replace(/\/$/, "");

  // Formulario de conexión de Zernio: pegar API key + webhook secret y listo.
  // Se guarda en D1 (settings) y el canal se pone verde SIN redeploy.
  const zernioForm = (ch: ChannelStatus) => {
    if (ch.id !== "zernio") return "";
    const keyTail = (zernioCreds.apiKey ?? "").trim().slice(-4);
    const hasSecret = (zernioCreds.webhookSecret ?? "").trim() !== "";
    return `
      <form method="POST" action="/admin/conexiones/zernio" style="display:flex;flex-direction:column;gap:10px;margin-top:4px">
        <div style="display:flex;flex-direction:column;gap:6px">
          <label class="font-display font-semibold text-[12.5px] text-cream">API key de Zernio</label>
          <input type="password" name="zernio_api_key" value="" autocomplete="off"
                 placeholder="${keyTail ? `hay una key guardada (…${keyTail})` : "Pega tu API key de zernio.com"}"
                 style="background:var(--bg);border:1px solid var(--line);color:var(--cream);padding:10px 12px;font-size:12.5px;outline:none">
        </div>
        <div style="display:flex;flex-direction:column;gap:6px">
          <label class="font-display font-semibold text-[12.5px] text-cream">Webhook secret (recomendado)</label>
          <input type="password" name="zernio_webhook_secret" value="" autocomplete="off"
                 placeholder="${hasSecret ? "secreto guardado — escribe para reemplazar" : "opcional: firma HMAC de los webhooks"}"
                 style="background:var(--bg);border:1px solid var(--line);color:var(--cream);padding:10px 12px;font-size:12.5px;outline:none">
        </div>
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          <button type="submit" class="text-[12px] font-display font-semibold"
                  style="border:1px solid var(--line);color:var(--cream);padding:9px 14px;cursor:pointer;background:none">${ch.ok ? "Actualizar conexión" : "Conectar Zernio"}</button>
          ${ch.ok ? `<label class="text-dim text-[11.5px]" style="display:flex;align-items:center;gap:7px;cursor:pointer"><input type="checkbox" name="clear" value="1"> Quitar conexión</label>` : ""}
        </div>
      </form>`;
  };

  // Formulario de Telegram: token del bot (validado con getMe + webhook
  // registrado solo) y chat id del dueño para avisos de handoff.
  const telegramForm = (ch: ChannelStatus) => {
    if (ch.id !== "telegram") return "";
    const hasToken = (telegramToken ?? "").trim() !== "";
    const hasOwner = (ownerChatId ?? "").trim() !== "";
    const ownerTail = hasOwner ? String(ownerChatId ?? "").trim().slice(-4) : "";
    return `
      <form method="POST" action="/admin/conexiones/telegram" style="display:flex;flex-direction:column;gap:10px;margin-top:4px">
        <div style="display:flex;flex-direction:column;gap:6px">
          <label class="font-display font-semibold text-[12.5px] text-cream">Token del bot (BotFather)</label>
          <input type="password" name="telegram_bot_token" value="" autocomplete="off"
                 placeholder="${hasToken ? "token guardado — escribe para reemplazar" : "Pega el token de @BotFather"}"
                 style="background:var(--bg);border:1px solid var(--line);color:var(--cream);padding:10px 12px;font-size:12.5px;outline:none">
        </div>
        <div style="display:flex;flex-direction:column;gap:6px">
          <label class="font-display font-semibold text-[12.5px] text-cream">Tu chat id de Telegram (avisos al dueño)</label>
          <input type="text" name="owner_telegram_chat_id" value="" autocomplete="off"
                 placeholder="${hasOwner ? `hay un id guardado (…${ownerTail}) — escribe para reemplazar` : "opcional: mándale /start a tu bot y mira tu id con @userinfobot"}"
                 style="background:var(--bg);border:1px solid var(--line);color:var(--cream);padding:10px 12px;font-size:12.5px;outline:none">
        </div>
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          <button type="submit" class="text-[12px] font-display font-semibold"
                  style="border:1px solid var(--line);color:var(--cream);padding:9px 14px;cursor:pointer;background:none">${ch.ok ? "Actualizar conexión" : "Conectar Telegram"}</button>
          ${ch.ok ? `<label class="text-dim text-[11.5px]" style="display:flex;align-items:center;gap:7px;cursor:pointer"><input type="checkbox" name="clear" value="1"> Quitar conexión</label>` : ""}
          ${hasOwner ? `<label class="text-dim text-[11.5px]" style="display:flex;align-items:center;gap:7px;cursor:pointer"><input type="checkbox" name="clear_owner" value="1"> Quitar aviso</label>` : ""}
        </div>
      </form>`;
  };

  const cards = channels
    .map((ch) => {
      const badge = ch.ok
        ? `<span style="font-size:10px;letter-spacing:.14em;color:var(--ok);border:1px solid var(--ok);background:var(--ok-soft);padding:3px 10px;font-weight:700">● CONECTADO</span>`
        : `<span style="font-size:10px;letter-spacing:.14em;color:var(--dim);border:1px solid var(--line);padding:3px 10px;font-weight:600">○ SIN CONECTAR</span>`;

      const missing = ch.ok
        ? ""
        : `<div class="text-[11.5px]" style="color:var(--bad)">Falta configurar: <span class="font-mono">${ch.missing
            .map(esc)
            .join(", ")}</span></div>
           <div class="text-dim text-[11.5px]">${esc(ch.howTo)}</div>`;

      const webhook =
        ch.webhookPath
          ? `<div class="text-dim text-[10.5px] font-mono" style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
               <span style="border:1px solid var(--line);padding:4px 8px;background:var(--bg)">${esc(base + ch.webhookPath)}</span>
               <button type="button" class="text-[10.5px]" style="border:1px solid var(--line);color:var(--cream);padding:4px 8px;cursor:pointer;background:none"
                       onclick="navigator.clipboard.writeText('${esc(base + ch.webhookPath)}');this.textContent='copiado ✓'">copiar</button>
             </div>`
          : "";

      const security = ch.securityNote
        ? `<div class="text-[11px]" style="color:var(--warn)">⚠ ${esc(ch.securityNote)}</div>`
        : "";

      const isPaused = pausedChannels.includes(ch.id);
      const pauseBtn = ch.ok
        ? `<form method="POST" action="/admin/config" style="margin-top:4px;display:flex;gap:8px;align-items:center">
             <input type="hidden" name="channel_pause" value="${esc(ch.id)}">
             <input type="hidden" name="channel_paused" value="${isPaused ? "0" : "1"}">
             <button type="submit" class="text-[11px]" style="border:1px solid ${isPaused ? "var(--bad)" : "var(--line)"};color:${isPaused ? "var(--bad)" : "var(--muted)"};padding:5px 11px;cursor:pointer;background:${isPaused ? "rgba(248,113,113,.07)" : "none"}">
               ${isPaused ? "▶ Reanudar canal" : "⏸ Pausar canal"}
             </button>
             ${isPaused ? `<span class="text-[10.5px]" style="color:var(--bad)">Este canal está pausado: los mensajes se ignoran.</span>` : ""}
           </form>`
        : "";

      // Cuentas conectadas de Zernio (Instagram, TikTok, etc.) — solo en la card Zernio.
      const zernioBlock =
        ch.id === "zernio" && zernioAccounts.length > 0
          ? `<div style="margin-top:4px;display:flex;flex-direction:column;gap:6px">
               <div class="text-[10.5px]" style="letter-spacing:.14em;color:var(--dim);font-weight:700">CUENTAS CONECTADAS EN ZERNIO</div>
               ${zernioAccounts
                 .map((a) => {
                   const icon = zernioPlatformIcon(a.platform);
                   const label = zernioPlatformLabel(a.platform);
                   const name = a.displayName || a.username || "—";
                   const status = a.needsReconnection
                     ? `<span class="text-[10px]" style="color:var(--bad)">· reconectar</span>`
                     : a.isActive === false
                       ? `<span class="text-[10px]" style="color:var(--dim)">· inactiva</span>`
                       : `<span class="text-[10px]" style="color:var(--ok)">· activa</span>`;
                   const followers =
                     typeof a.followersCount === "number" && a.followersCount > 0
                       ? `<span class="text-[10px] font-mono" style="color:var(--muted)">· ${a.followersCount.toLocaleString("es")} seguidores</span>`
                       : "";
                   // Barra de rate limit (DM de esta hora / 700).
                   const usage = rateUsage[a.id];
                   const rateBar = usage
                     ? (() => {
                         const max = 700;
                         const pct = Math.min(100, Math.round((usage.used / max) * 100));
                         const color = pct >= 90 ? "var(--bad)" : pct >= 60 ? "var(--warn)" : "var(--ok)";
                         return `<div style="margin-top:5px">
                           <div style="display:flex;justify-content:space-between" class="text-[10px] font-mono" style="color:var(--dim)">
                             <span>DM esta hora</span><span style="color:${color}">${usage.used}/${max}</span>
                           </div>
                           <div style="height:4px;background:var(--line);margin-top:2px"><div style="height:4px;width:${pct}%;background:${color}"></div></div>
                         </div>`;
                       })()
                     : "";
                   return `<div style="display:flex;align-items:center;gap:8px;border:1px solid var(--line);background:var(--panel2);padding:7px 10px">
                     <i data-lucide="${icon}" width="14" height="14" class="text-accent" style="flex:none"></i>
                     <span style="flex:1;min-width:0">
                       <span class="text-[12px] text-cream" style="display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(label)} — ${esc(name)}</span>
                       <span style="display:flex;gap:6px;flex-wrap:wrap">${status}${followers}</span>
                       ${rateBar}
                     </span>
                   </div>`;
                 })
                 .join("")}
             </div>`
          : ch.id === "zernio" && zernioAccounts.length === 0 && env.ZERNIO_API_KEY?.trim()
            ? `<div class="text-[11px]" style="color:var(--dim);margin-top:4px">No se pudieron listar tus cuentas de Zernio (o no hay cuentas conectadas aún). Conéctalas en zernio.com.</div>`
            : "";

      return `
        <div class="bg-panel border ${ch.ok ? "" : "border-line"}" style="padding:18px 20px;display:flex;flex-direction:column;gap:10px;${ch.ok ? "border-color:var(--ok)" : ""}">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:10px">
            <div class="font-display font-semibold text-[13.5px] text-cream" style="display:flex;align-items:center;gap:9px">
              <i data-lucide="${ch.icon}" width="16" height="16" class="${ch.ok ? "text-accent" : "text-dim"}"></i>
              ${esc(ch.name)}
            </div>
            ${badge}
          </div>
          <p class="text-dim text-[12px]" style="margin:0">${esc(ch.desc)}</p>
          ${missing}
          ${security}
          ${webhook}
          ${zernioForm(ch)}
          ${telegramForm(ch)}
          ${zernioBlock}
          ${pauseBtn}
        </div>`;
    })
    .join("");

  const savedBanner = opts.savedKind === "telegram"
    ? `<div style="border:1px solid var(--ok);background:var(--ok-soft);color:var(--ok);padding:10px 14px;font-size:12.5px;font-weight:600">✓ Telegram conectado: webhook registrado automáticamente. Envía un mensaje a tu bot para probarlo.</div>`
    : opts.savedKind === "zernio"
      ? `<div style="border:1px solid var(--ok);background:var(--ok-soft);color:var(--ok);padding:10px 14px;font-size:12.5px;font-weight:600">✓ Zernio conectado: webhook registrado automáticamente (message.received + comment.received). Los comentarios/DMs ya deberían fluir.</div>`
      : "";
  const errorBanner = opts.error
    ? `<div style="border:1px solid var(--bad);background:var(--bad-soft);color:var(--bad);padding:10px 14px;font-size:12.5px;font-weight:600">✕ ${esc(opts.error)}</div>`
    : "";

  const body = `
    <div style="display:flex;flex-direction:column;gap:18px">
      ${savedBanner}
      ${errorBanner}
      <div style="display:flex;flex-direction:column;gap:2px">
        <h2 class="font-display font-semibold text-[15px] text-cream">Canales conectados: ${connected} de ${channels.length}</h2>
        <p class="text-muted text-[12.5px]">Conecta los canales donde están tus clientes. Cuando un canal queda listo, su tarjeta se pone verde. Zernio se conecta pegando su API key aquí mismo; los demás canales se configuran con <span class="font-mono">wrangler secret put NOMBRE</span>.</p>
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(340px,1fr));gap:14px">
        ${cards}
      </div>
    </div>`;

  return layout({ title: "Conexiones", activeTab: "conexiones", body, env });
}

/** Resumen corto para el badge de salud del Resumen. */
export function connectionsSummary(env: Env, zernioCreds: ZernioCredentials, telegramToken?: string): { connected: number; total: number } {
  const channels = channelStatuses(env, zernioCreds, telegramToken);
  return { connected: channels.filter((ch) => ch.ok).length, total: channels.length };
}
