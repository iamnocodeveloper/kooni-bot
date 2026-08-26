# 🟢 Identidad de marca — KOONI

> Documento de identidad del proyecto **Kooni**. Define nombre, significado, paleta,
> tipografía, logo, voz y reglas de uso. Es la fuente de verdad para cualquier pieza
> de marca (dashboard, docs, correos, presentaciones).

---

## 1. Nombre

**Kooni** — una palabra inventada, corta y cálida.

- **Significado propuesto:** "el que cuida" — del japonés *kō (幸, bienestar)* y la
  terminación *-ni* que da cercanía. El asistente que cuida tu negocio y a tus clientes.
- **Se pronuncia:** /kú-ni/ (KOOH-nee).
- **Uso:** siempre en mayúscula inicial: **Kooni**. Nunca "KOONI", "kooni" ni
  "Kooní" en textos de marca.
- **Variantes aceptadas:** "Kooni Bot" (el bot desplegado), "Panel Kooni" (el
  dashboard `/admin`).

### Tagline

> **Tu negocio, atendido siempre.**
> EN: *Your business, always attended.*

### Descripción de una línea

> Kooni es un asistente de IA multicanal (WhatsApp, Instagram, Messenger y Telegram)
> que vive en tu propia nube de Cloudflare, con tu llave de IA. Atiende 24/7,
> responde desde tu base de conocimiento y te avisa cuando algo lo amerita.

---

## 2. Paleta de color

Estética **retro-terminal sobre tinta azulada**, con acento teal/menta. Oscura,
limpia y legible. Los tokens son los que usa el dashboard (ver `docs/design-system.md`).

| Token | Hex | Uso |
|---|---|---|
| `bg` | `#0d1218` | Fondo general |
| `panel` | `#141b24` | Tarjetas / sidebar |
| `panel2` | `#1a2330` | Hover / filas |
| `raise` | `#223043` | Elementos elevados |
| `line` | `#2b3b4f` | Bordes |
| `linelit` | `#3d546f` | Bordes iluminados / sombras |
| `accent` | `#2dd4bf` | **Color de marca — teal** (acciones, links, activo) |
| `accent2` | `#6ee7b7` | Secundario — menta (tags, highlights) |
| `cream` | `#e7eef5` | Texto principal |
| `muted` | `#93a4b5` | Texto secundario |
| `dim` | `#64748b` | Texto terciario / deshabilitado |
| `ok` | `#34d399` | Éxito / en línea |
| `info` | `#60a5fa` | Información |
| `bad` | `#f87171` | Errores / alertas |
| `violet` | `#a78bfa` | Resaltados secundarios |

**Reglas:**
- El teal `#2dd4bf` es el color de marca: úsalo para acciones principales y
  estados activos. Nunca como color de texto largo.
- Fondo siempre oscuro (`bg`). Contraste mínimo 4.5:1 en texto.
- Sobre acento teal, el texto va en tinta oscura (`#06251f` aprox.).

---

## 3. Tipografía

| Rol | Familia | Fallback |
|---|---|---|
| Display / títulos | **Space Grotesk** (Google Fonts) | `ui-sans-serif, system-ui, sans-serif` |
| Mono / datos / código | **JetBrains Mono** (Google Fonts) | `ui-monospace, monospace` |

- Títulos en Space Grotesk 700, con `letter-spacing: -0.02em`.
- Datos, tablas y etiquetas en JetBrains Mono.
- Ambas se cargan por Google Fonts (gratis, sin registro).

---

## 4. Logo

Archivos: `assets/kooni-logo.svg` (64px) y `assets/kooni-favicon.svg` (32px).

- **Forma:** cuadrado redondeado de tinta `#0d1218` con borde teal `#2dd4bf`.
- **Glifo:** la letra **K** formada por un nodo de conversación (trazos que se
  abren en dos direcciones) en teal.
- **Punto:** un nodo menta `#6ee7b7` en la esquina superior derecha — "el bot
  encendido / en línea".
- **Uso en dashboard:** dentro del cuadro de marca (34px) del sidebar y en la
  página de login, se renderiza el glifo K con el punto (ver `layout.ts`).

---

## 5. Voz y tono

Kooni habla **español sencillo (LATAM)**, directo y cálido.

- **Una pregunta a la vez.** Nunca listas interminables.
- **Claro antes que ingenioso.** El humor es opcional, la claridad no.
- **Nunca inventa.** Si no sabe, dice que no sabe y escala a un humano.
- **Reconoce que es un bot.** Si le preguntan, lo admite.
- **Nada de jerga técnica** hacia el cliente; el panel sí usa términos del negocio.

### Ejemplos

| ❌ | ✅ |
|---|---|
| "El endpoint del webhook quedó configurado exitosamente" | "Ya conectamos el canal. Prueba mandando un mensaje." |
| "Error 500 en el handoff" | "Algo salió mal al avisarte. Intenta de nuevo." |
| "Tu agente generará una factura proforma" | "Te mando el detalle de lo que costó este mes." |

---

## 6. Reglas de uso

- **Uso interno:** Kooni es un proyecto de uso interno (no comercial). No se
  revende, no se redistribuye el código con la marca Kooni sin permiso.
- **Origen:** el código deriva de **Forja** (© Horizontes IA, licencia MIT).
  La licencia MIT se conserva (`LICENSE`) y exige mantener el aviso de copyright
  original. Kooni agrega su propia marca encima, lo cual la MIT permite.
- **No usar** la marca "Forja" ni "Horizontes IA" en productos de Kooni; solo en
  el aviso de licencia y en referencias históricas de la documentación.

---

## 7. Stack técnico (resumen)

Cloudflare Workers (Hono) · Vercel AI SDK · D1 (SQLite) · Vectorize (bge-m3) ·
R2 · Durable Objects. Un solo `pnpm run deploy`. Detalle en `docs/ARQUITECTURA.md`.
