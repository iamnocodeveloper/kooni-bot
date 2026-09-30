# Estado y operación — cierre de etapa (v1.52.1, 2026-09-30)

Documento de referencia de **qué se cambió, cómo se opera y qué queda pendiente**.
Complementa a [`DESPLIEGUE.md`](./DESPLIEGUE.md) (puesta en marcha), [`USO.md`](./USO.md)
(día a día del panel) y al `CHANGELOG.md` (detalle por versión).

---

## 1. Dónde vive cada cosa (publicación)

| Pieza | Dónde se publica | Estado |
|---|---|---|
| **Bot** (`src/`, `migrations/`, `skill/`) | **GitHub**: `iamnocodeveloper/kooni-bot`, branch `main` | ✅ al día — último commit `ad28a92`, versión del bot **1.52.1** |
| **CLI** (`cli-kooni/`, paquete npm `kooni-bot`) | **npm** | ⚠️ **atrás**: publicado `0.4.0`, el repo tiene `0.5.0` |
| **Paneles** (`kooni-paneles/`) | **InsForge** → https://t6bferet.insforge.site | ✅ desplegado |
| **Backend del hub** (`functions/`, `migrations/`) | Proyecto InsForge `kooni` (`t6bferet`) | ✅ migración `profiles.language` aplicada |

- **El bot NO se publica en npm.** Las instalaciones lo bajan del **tarball de GitHub `main`**;
  `npx kooni-bot update` compara la versión del `package.json` de `main` para detectar updates.
  Por eso, subir a `main` **ya alcanza** para que las instalaciones limpias/nuevas lo reciban.
- **La CLI sí va por npm**: si cambia algo en `cli-kooni/`, hay que publicar
  (`cd cli-kooni && npm publish`). Hoy `npx kooni-bot` trae la `0.4.0` (pendiente subir la `0.5.0`).

---

## 2. Qué cambió en esta etapa (v1.49 → v1.52.1)

| Versión | Tema | Archivos clave |
|---|---|---|
| **1.49.0** | **Ojos/oídos**: audio e imagen se descargan **con las credenciales del canal** (WAHA `X-Api-Key`, token de Telegram). **Seguimientos** (cazador/reenganche) en el **idioma de la conversación**. | `src/media/fetchRef.ts`, `src/media/{transcribe,vision}.ts`, `src/followup/language.ts` |
| **1.50.0** | **Inbox de Comentarios** (Zernio): publicación de origen, automatización que entró, hilo completo, responder en público / DM / borrador con IA, y **fallback global con IA**. | `src/channels/zernioComments.ts`, `src/admin/views/comentarios.ts`, `src/db/commentPosts.ts` |
| **1.51.0** | **Scraping sin depender de la cuota de Decodo** (sitemaps por fetch directo + reintentos + modo barato + errores clasificados), **validación de cambios**, **25 autos + paginar**, y la infra i18n del panel. | `src/integrations/directFetch.ts`, `src/integrations/decodo.ts`, `src/db/changeReviews.ts` |
| **1.52.0** | **Panel del bot 100% bilingüe ES/EN** (~1900 claves, diccionarios por área). | `src/admin/i18n.ts`, `src/admin/locales/{es,en}/*` |
| **1.52.1** | **WAHA anunciaba los archivos con `localhost`** → reescritura del origen al host configurado (bot + proxy del panel). Además se destrabó la lista de módulos de cardaniel. | `src/channels/wahaCredentials.ts`, `src/admin/media.ts` |

---

## 3. Operación

### 3.1 Desplegar a cardaniel (cuenta correcta)

La instalación **cardaniel** vive en la cuenta Cloudflare **`Info@dmezzadri.com`**
(`b579b15488cb0efc53c2434d381cbe17`), worker `kooni-bot-cardealer-daniel2-948b8b`,
D1 `kooni_cardealer_dani_948b8b_db`. El token que suele estar en el entorno apunta a
**otra** cuenta (`joeldavidar@gmail.com`), así que hay que **fijar el account ID**:

```powershell
Remove-Item Env:CLOUDFLARE_API_TOKEN,Env:CLOUDFLARE_API_KEY,Env:CLOUDFLARE_EMAIL -ErrorAction SilentlyContinue
$env:CLOUDFLARE_ACCOUNT_ID="b579b15488cb0efc53c2434d381cbe17"
cd C:\Users\manuel\Desktop\PROYECTOS\cardealerdaniel

npx wrangler whoami                          # debe listar la cuenta de dmezzadri
npx wrangler d1 execute kooni_cardealer_dani_948b8b_db --file=src/db/schema.sql --remote --yes
pnpm run deploy
```

> ⚠️ `pnpm db:apply:remote` del `package.json` usa el nombre **`kooni_db`** (es el del
> template). Para cardaniel hay que usar el nombre real, como arriba.

### 3.2 Idioma del panel

- Setting **`panel_language`** (`"es"` | `"en"`), se cambia con el **selector 🇲🇽/🇺🇸 del header**
  (o `POST /admin/config/language`). Es **de la instalación**, no por usuario.
- **No** afecta el idioma con el que el bot le habla a los clientes: eso es
  `BOT_LANGUAGE` + el toggle **Multi-idioma**.
- El **español es el default**: sin la clave, el panel se ve idéntico a siempre.

### 3.3 "Oído y vista" (audio e imagen)

Para que el bot **escuche y vea** hacen falta **tres** cosas:

1. **Toggle** `feature_oido_vista_enabled = "1"` (Extras → Oído y vista) **y** el módulo
   `oido_vista` desbloqueado (ver §3.4).
2. **Voz**: el binding **`AI`** en `wrangler.toml` (Workers AI / Whisper). La imagen no lo usa.
3. **Descarga del archivo**: el Worker baja el archivo con las credenciales del canal.
   - **WAHA**: `X-Api-Key` + **reescritura del host**. WAHA suele anunciar el archivo como
     `http://localhost:80/api/files/…`; el bot y el proxy del panel lo reescriben al
     `waha_api_url` configurado. *(Recomendado: setear `WAHA_PUBLIC_URL=https://<tu-host>` en el
     servidor de WAHA y reiniciar la sesión.)*
   - **Telegram**: se repone el token enmascarado (`resolveTelegramToken`, panel primero).

Cómo diagnosticar: en el hilo se guardan marcadores
`[AUDIO_URL: …]` / `[IMAGE_URL: …]`; si la transcripción falla el mensaje queda como
**"(no pude entender el audio)"**. En los logs del Worker se ve `[ingest] transcription failed`
o `media fetch failed: <status>`.

### 3.4 Módulos y Extras (`module_unlocks`) — léelo antes de tocar nada

La regla exacta (`src/modules.ts`):

- **ausente o vacío** → **TODOS** los módulos desbloqueados (default retro-compatible);
- **presente** (¡incluido `[]`!) → **exactamente esos ids**.

Y un Extra solo se activa si su **toggle está en `1`** **Y** su **módulo está desbloqueado**.
Caso real de cardaniel: `module_unlocks` estaba en `["web_sync"]`, así que oído/vista,
multi-idioma, blindaje, cazador, reenganche, vigilante y voz de marca estaban **apagados
aunque sus toggles dijeran ON**. Se **borró la clave** para volver al default.

```sql
-- ver el estado
SELECT value FROM settings WHERE key = 'module_unlocks';
-- volver al default (todos los módulos)
DELETE FROM settings WHERE key = 'module_unlocks';
```

### 3.5 Scraping / Decodo

- **El sitemap de inventario se baja directo** (es XML público) → **no gasta requests de Decodo**.
  Si el sitio bloquea al Worker, cae a Decodo.
- Decodo: **reintentos con backoff** en 429/5xx/timeout, **modo barato** por default
  (`proxy_pool: standard`, sin `headless`) y **errores clasificados**:
  `quota` (plan/cuota agotada), `auth` (credencial inválida), `rate_limit`, `server`, `empty`, `timeout`.
  Si el error es `quota`, la corrida **se corta** en vez de seguir pegándole a la API.
- Dónde ver el error concreto: **Scraping → detalle de la corrida** (recuadro rojo `Error: …`).
  El flash de "Scrapear ahora" solo muestra el conteo.
- Las páginas HTML del sitio (listado y fichas) **no se pueden bajar directo** (dan 504):
  para enriquecer precio/foto se usa Decodo, en lotes por corrida.

### 3.6 Validar los cambios del scraping

Tabla **`web_sync_change_reviews`**: cada cambio de una corrida se marca
**✓ confirmado** / **✗ descartado** / **↺ pendiente**, con filtros
*Pendientes / Confirmados / Descartados*. Se purga junto con `web_sync_changes` (90 días).

### 3.7 Inventario del bot

- El bot lista **25** autos por consulta (setting **`inventory_page_size`**, clamp 1..50) y,
  si hay más, ofrece **"¿querés ver más?"** (la tool acepta `pagina`).

### 3.8 Comentarios (Zernio)

- Cada comentario guarda: autor, plataforma, **la publicación a la que pertenece**
  (`comment_posts`: caption + permalink + imagen), **en qué automatización entró** (regla o
  fallback) y el **hilo** (raíz + respuestas + nuestras respuestas).
- Se puede **responder en público**, **mandar DM** (private reply) y **generar un borrador con IA**;
  todo auditado y con el tope diario de respuestas públicas compartido con el bot.
- **Fallback IA global**: `comment_ai_fallback_enabled` + `comment_ai_fallback_prompt`
  (Extras → Automatizaciones) — el bot responde con IA los comentarios que no matchean ninguna regla.

---

## 4. Checklist de verificación (post-deploy)

- [ ] `curl .../health` → **200**
- [ ] Selector de idioma del header cambia ES↔EN y persiste (recargando)
- [ ] `Scrapear ahora` → **449 autos, 0 errores de Decodo**
- [ ] Mandar **nota de voz** → aparece la transcripción (no "no pude entender el audio")
- [ ] Mandar **foto** → el bot la describe
- [ ] Comentario nuevo → aparece en Comentarios con publicación + automatización; se puede validar
- [ ] Nueva corrida de scraping → filtros de validación funcionando

---

## 5. Pendientes

1. **Probar en vivo audio/foto en cardaniel** (es lo único no verificado; el resto se validó con tests).
2. **`npm publish` de la CLI `0.5.0`** (`cd cli-kooni && npm publish`) — hoy npm sirve `0.4.0`.
3. **Sección "Inventario sincronizado"** con búsqueda + paginación en la pestaña Scraping
   (hoy se ve el diff de la corrida, no el inventario completo).
4. **Botón "Probar Decodo"** (status + cuerpo + cuota) y **aviso al dueño** cuando el scraping falla.
5. **`docs/design-system.md` está desactualizado** (describe el tema teal viejo; la identidad
   vigente es la magenta de `IDENTIDAD-KOONI.md` y `layout.ts`).
