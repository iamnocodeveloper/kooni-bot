# /prompt — el cerebro de tu bot, gestionado por comandos

Estos comandos los corre **tu agente** (Claude Code / Codex) dentro de la carpeta
del bot. No hace falta programar: copiás el comando y tu agente lo ejecuta paso a
paso. Ninguno toca tus frenos de seguridad (reglas de escalación, herramientas
desactivadas ni la base de conocimiento).

> El prompt de Kooni se arma por secciones: lo **tuyo** (editable, ámbar) y lo
> **automático** 🔒 (contexto del negocio, playbook del giro, KB). Tus
> instrucciones viven en el panel → **Configuración** (`system_prompt_override`,
> `custom_instructions`) y en **Flujo** (`/admin/agente`).

## Comandos

| Comando | Para qué |
| --- | --- |
| `/prompt` | **Empezá acá.** Muestra tu prompt por secciones (lo tuyo vs lo automático 🔒), te deja editar tus instrucciones y te lleva al comando correcto. |
| `/afinar-prompt` | Ajusta el comportamiento/conocimiento del bot a partir de los últimos chats reales. |
| `/lab-prompt` | **A/B testing**: genera variantes (cada una cambia UNA cosa), simula conversaciones y te muestra cuál funciona mejor. Elegís la ganadora. |
| `/limpiar-prompt` | Desinfla un prompt largo: mueve a la base de conocimiento los datos que cambian y quita duplicados, sin cambiar el comportamiento. |
| `/versionar-prompt` | Historial y deshacer: guarda versiones de tu prompt y volvé a cualquiera. |
| `/prompt-por-canal` | Una personalidad por canal (formal en WhatsApp, casual en Instagram) sin tocar los demás. |
| `/auditar-prompt` | Diagnóstico con boleta 🟢🟡🔴 contra las buenas prácticas. Solo diagnostica, no cambia nada. |
| `/ejemplos-prompt` | Toma tus mejores conversaciones y las convierte en ejemplos (few-shot) dentro del prompt. |

## Reglas

- **Una pregunta por mensaje**; esperá la respuesta antes de la siguiente.
- Nunca toques las reglas de escalación, las herramientas desactivadas ni la KB
  sin pedirlo explícitamente.
- Si un cambio es riesgoso, **mostrá el antes/después** y pedí confirmación.
- Después de cambiar el prompt, probá el bot en el panel → **Probar el bot**.
