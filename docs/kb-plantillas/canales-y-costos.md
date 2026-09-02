# Canales y costos de infraestructura de Kooni

## Canales que conecta Kooni

Cada canal se conecta con las cuentas del propio cliente. Los tokens y llaves
son siempre del cliente; Kooni nunca los toca ni los guarda.

- WhatsApp: vía Twilio (para escalar) o ManyChat (más rápido de montar).
- Instagram: Meta oficial (login profesional) o ManyChat. Contesta DMs y
  comentarios.
- Messenger: la página de Facebook del cliente, con login oficial de Meta o
  ManyChat.
- Telegram: se crea un bot con BotFather, se pega un token y queda en vivo en
  minutos.

Un solo bot atiende los 4 canales y todo cae en la misma bandeja.

## Costo de infraestructura (Cloudflare)

- Plan gratis de Cloudflare para empezar.
- Alrededor de $5 USD al mes cuando hay tráfico diario.
- Sin contratos.

## De quién es todo

El bot, la base de datos y el panel viven en la cuenta de Cloudflare del
cliente, con sus llaves. Nadie se lo puede apagar.

## Instalación

La hace un agente de IA (Claude Code o Codex, ambos gratis) con el comando
`npx kooni-bot init`. El cliente solo contesta preguntas sobre su negocio. No se
toca código en ningún momento. El bot queda publicado en la nube del cliente con
su panel listo.

## Actualizaciones

El bot se actualiza a la última versión sin perder la configuración ni los datos
del cliente.
