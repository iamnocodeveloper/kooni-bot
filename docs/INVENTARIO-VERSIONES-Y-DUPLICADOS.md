# Inventario: versiones, descripción y duplicados

El inventario de autos vive en una sola fila JSON (`settings.web_sync_vehicles`)
y se alimenta del scraping del sitio del concesionario. Desde **v1.63.0** guarda
más datos y usa IA para distinguir **dos versiones con el mismo título** de **la
misma unidad publicada dos veces**.

---

## 1. Qué se guarda por auto

`Vehicle` / `StoredVehicle` (`src/kb/inventory.ts`):

| Campo | Nota |
|---|---|
| `key` | `vin:<VIN>` → `url:<hash de la ficha>` → `url:<hash de un discriminador>` |
| `title`, `year`, `make`, `model` | Igual que antes |
| **`trim`** | Versión, ej. `SX Prestige`. Se extrae del slug o del JSON-LD |
| **`description`** | Texto de la ficha, recortado a **800 caracteres** |
| `condition`, `price`, `miles` | Igual que antes |
| `listingUrl`, `feedUrl` | Igual que antes |
| `imageUrl`, `imgStatus`, `imgAt` | Igual que antes |
| `pricing` | Desglose de precio |
| `source: "csv"` | Cargado a mano; el scraping no lo borra |
| **`duplicateOf`** | Si la IA cree que es la misma unidad que otra `key` |

### Clave estable (por qué ya no se pisan autos)

```ts
vehicleKey(vin, listingUrl, discriminator?)
```

1. Si hay VIN (≥11 chars) → `vin:<VIN>`.
2. Si hay ficha → `url:<hash(listingUrl)>`.
3. Si no hay ninguno → `url:<hash("sin-link"|discriminador)>`, con
   `título|precio|millas|condición`.

Antes todos los autos sin VIN ni link compartían una sola clave y se colapsaban.
Ahora dos unidades distintas con el mismo título generan claves distintas.

---

## 2. De dónde sale `trim` y `description`

`fetchVehicleDetails` pide la ficha con el proveedor activo
(`scrape_provider`) y extrae:

- **HTML / JSON-LD:**
  - `description` → `description`, `vehicleDescription`, `disambiguatingDescription`.
  - `trim` → `vehicleConfiguration`, `vehicleTrim`, `trim`.
  - Fallback: `<meta name="description">` / `og:description`.
- **Markdown:** primer párrafo útil (≥60 chars), descartando cookies, privacidad,
  newsletter, horarios, etc.
- Si el HTML no trae descripción y se pidió `wantDescription`, hace una segunda
  pasada en markdown.

El enriquecimiento corre:

- en la corrida nocturna (`runWebSync({ images: true })`, 20 fichas por corrida);
- al abrir una ficha bajo demanda (`fichaAuto`, con cooldown de 1 h);
- manualmente desde **Scraping → “Enriquecer fichas (60)”**.

> El store es una fila de D1. La descripción se recorta a 800 chars para no
> inflar el JSON; si crece demasiado, bajá `MAX_DESCRIPTION` o mové las
> descripciones a `kb_docs`.

---

## 3. Análisis IA (`src/kb/analysis.ts`)

Se activa con `feature_web_sync_analysis_enabled=1` y usa el modelo “smart”
(`analysis_llm_*` o el proveedor del bot).

### Entrada

Por auto: `key, title, make, model, trim, year, price, miles, condition, vin,
url, description` (descripción recortada a ~280 chars para el prompt).

Además, un pre-paso determinista `findNearDuplicates` agrupa autos por
**año + marca + primera palabra del modelo**. Esos grupos se mandan como
`posiblesDuplicados`.

### Salida

Un JSON array de correcciones. Por auto puede devolver:

- `title`, `make`, `model`, `trim`, `description`, `year`, `price`, `miles`,
  `condition`;
- `duplicadoDe: "<key>"` si es **la misma unidad** que otro auto.

### Reglas de seguridad

- Solo puede tocar autos que ya existen: **nunca agrega ni borra**.
- Si un auto tiene VIN, **nunca** se marca como duplicado de otro con VIN
  distinto. `applyCorrections` exige `!target.vin && !other.vin`.
- Los duplicados **no se borran**: se marca `duplicateOf` y se excluyen de
  `listStoredVehicles`, `queryInventory`, la KB y las respuestas del bot.
- Todo queda revisable: **Scraping → Inventario → “Duplicados marcados por la
  IA”**, con botón **Desmarcar** si el modelo se equivocó.

### Versiones distintas

Si dos autos comparten título pero la URL/descripción muestran versiones
distintas (`SX` vs `SX Prestige`), el modelo **no** los marca como duplicados:
propone `trim` y una `description` que deje clara la diferencia. Esa info viaja
al bot en `inventarioQuery` y `fichaAuto`.

---

## 4. Cómo responde el bot

- `inventarioQuery` devuelve por auto:
  `vin, titulo, version, condicion, precio, millas, url, descripcion` (recorte
  de 240 chars).
- `fichaAuto` devuelve la ficha completa con `version`, `descripcion`, URL real,
  foto y desglose de precio.
- Si hay ambigüedad de título, `vehicleLine` incluye versión y descripción corta
  para que el modelo pueda preguntar por la diferencia correcta.
- `matchesFilter` busca también en `trim` y `description` cuando el cliente usa
  términos libres (`consulta`).

---

## 5. Proveedor de scraping

`scrape_provider` (`src/integrations/scraper.ts`):

| Valor | Orden |
|---|---|
| `auto` (default) | **Decodo** → sitemap directo (gratis, solo XML) → **AIsa** |
| `decodo` | solo Decodo |
| `aisa` | solo AIsa |

- **Decodo es el principal**: HTML/JSON-LD es la fuente autoritativa para precio,
  millas, versión y descripción.
- Si Decodo devuelve `quota` en `auto`, se cae a AIsa; la corrida solo se corta
  si **ambos** se agotan.
- Los sitemaps se piden a Decodo **sin markdown** (son XML).
- Configuración: **Configuración → Scraping** (`scrape_provider`,
  `decodo_auth`, `aisa_api_key`).

---

## 6. Operación

### Ver cobertura del store

```sql
SELECT key, value FROM settings WHERE key IN (
  'scrape_provider',
  'feature_web_sync_enabled',
  'feature_web_sync_analysis_enabled'
);
```

El JSON completo del inventario:

```sql
SELECT length(value) AS bytes FROM settings WHERE key = 'web_sync_vehicles';
```

### Backfill de descripciones

1. `/admin/scraping` → **“Enriquecer fichas (60)”**.
2. Repetir ~8 veces para 449 autos (cada corrida enriquece hasta 60).
3. **“Scrapear ahora”** para el feed y el análisis IA.
4. Revisar `web_sync_runs` (columna `note`) y **Inventario → Duplicados**.

La corrida nocturna (cron `0 3 * * *`) hace 20 fichas por noche y corre el
análisis si hay inventario.

### Cambios y validación

`diffVehicleStore` ahora compara también **Versión** y **Descripción**. Esos
cambios aparecen en el registro de scraping (`web_sync_changes`) y se pueden
marcar ✓/✗ como precio o millas.

---

## 7. Costos y límites

- Cada ficha cuesta una llamada al proveedor. Con Decodo, el pool es `standard`
  y sin `headless` (modo barato).
- El análisis IA manda hasta **40 autos por corrida**, priorizando sospechosos y
  grupos de posibles duplicados.
- `MAX_DESCRIPTION = 800` en store; `280` en el prompt.
- Si el modelo falla o no hay key, el pipeline sigue con los datos deterministas.
