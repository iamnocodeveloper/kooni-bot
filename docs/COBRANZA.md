# Cobranza (nicho `cartera`)

Gestión de **cartera de cobros** dentro de Kooni: deudores, deuda, gestiones
automáticas por WhatsApp, llamadas con voz IA (Vapi/Retell), promesas de pago y
reportes. Es un **nicho** (`BOT_NICHE=cartera`): re-etiqueta el panel, suma la
sección **Cartera** y agrega tools al agente.

> La cartera vive en tablas propias (`debtors`, `debt_accounts`,
> `collection_*`, `payment_promises`, `collection_dnc`) — **no** en
> `lead.metadata`. Las tablas se crean en toda instalación; solo se usan con el
> nicho activo.

---

## 1. Instalar con el nicho

```bash
npx kooni-bot init      # en la pregunta del giro: "Cartera de cobros"
npx kooni-bot deploy
```

o, en una instalación existente, editá `wrangler.toml`:

```toml
BOT_NICHE = "cartera"
```

y `npx kooni-bot deploy`. Aparece **Cartera** en el nav (Inbox).

---

## 2. Cargar la cartera

Panel → **Cartera** → *Importar cartera*. Una línea por deudor:

```
nombre, telefono, monto, vence(YYYY-MM-DD), referencia
Juan Pérez, +50688887777, 250000, 2026-08-15, CLI-001
```

- La **referencia** es la clave anti-duplicados: reimportar actualiza en vez de
  duplicar.
- El monto crea la **deuda** (cuenta). Podés agregar más deudas por deudor desde
  su ficha.
- Exportá todo con **⬇ Exportar CSV**.

---

## 3. Reglas de cobranza (motor)

Panel → **Cartera** → *Reglas de cobranza*. Una regla = un tramo de mora:

| Campo | Qué es |
|---|---|
| **Mora desde / hasta** | días de atraso que entran en la regla (hasta vacío = sin tope) |
| **Canal** | `WhatsApp (mensaje)` o `Voz (llamada IA)` |
| **Intentos** | máximo de contactos por cuenta |
| **Plantilla** | mensaje con variables |

**Variables:** `{nombre} {negocio} {saldo} {monto} {vence} {dias}`

**Límites del motor (anti-spam):**
- cooldown de **20 h** por deudor,
- **intentos máximos** por regla,
- **tope de 25 mensajes** por corrida,
- **ventana horaria** (ver abajo).

Corre en el cron; también hay **▶ Correr cobranza ahora** (ignora la ventana, para
probar).

### Ventana horaria
Panel → **Cartera** → *Ventana de envío*: hora local desde/hasta + **offset UTC**
en minutos (ej. `-360` = UTC-6). Fuera de esa franja el motor no escribe.

---

## 4. Opt-out (no contactar)

En la ficha del deudor: **🚫 Marcar: no contactar**. Un deudor en DNC **nunca**
recibe mensajes ni llamadas del motor (se revisa antes de cada envío). Se puede
reactivar. Es lo primero que hay que respetar.

---

## 5. Cobranza por voz (Vapi / Retell)

1. Configurá el proveedor en **Conexiones → Cobros por voz** (API key, assistant/
   agent, número, webhook secret).
2. Desde la ficha: **📞 Llamar con IA**; o creá una regla con canal **Voz** para
   que el motor llame según la mora.
3. Cuando la llamada termina, el proveedor pega el webhook
   (`/webhooks/vapi` o `/webhooks/retell`) y Kooni traduce el análisis a un
   **resultado**: `contactado`, `promesa`, `pago`, `disputa`, `sin_respuesta`,
   `numero_invalido`. Actualiza la etapa del caso y, si hubo pago, marca la deuda.

Pegá en cada dashboard:
- Vapi → **Server URL**: `{tu-worker}/webhooks/vapi`
- Retell → **Webhook URL**: `{tu-worker}/webhooks/retell`

---

## 6. Promesas de pago

- El bot (o el panel) registra la promesa: **monto + fecha**.
- La etapa pasa a **Promesa de pago**.
- El motor recuerda las promesas que vencen en las próximas **24 h**.
- Si no se cumple en 24 h, se marca **incumplida** automáticamente.
- Al registrar el pago total de la deuda, la promesa se marca **cumplida** y el
  caso pasa a **Pagado**.

---

## 7. Tools del agente

Con el nicho activo, el bot tiene:

| Tool | Para qué |
|---|---|
| `consultarDeuda` | saldo **real** del deudor (nunca inventa montos) |
| `registrarPromesa` | deja la promesa (monto + fecha) y mueve la etapa |
| `llamarDeudor` | dispara una llamada de voz IA al deudor |

El **playbook** del nicho obliga a: verificar identidad antes de dar montos, tono
firme pero respetuoso, **nunca amenazar**, y escalar con `handoffHuman` si hay
disputa, queja o el cliente pide una persona.

---

## 8. Reportes

Panel → **Cartera**:
- **KPIs**: deuda total, en mora, en promesa, recuperado.
- **Reportes**: tasa de recuperación, efectividad **por canal** (intentos,
  contactados, promesas, pagos) y **embudo** por etapa.

---

## 9. Estados y etapas

**Etapas del caso** (`collection_cases.stage`): `nuevo` → `recordatorio` →
`negociacion` → `promesa` → `escalado` → `pagado` / `incobrable`.

**Estado de la deuda** (`debt_accounts.status`): `open`, `promise`, `paid`,
`disputed`, `written_off`.

En el pipeline de gestiones (kanban/tabla) los estados del lead se re-etiquetan:
*Sin clasificar · Nuevo · Contactado · Pagado/promesa · Incobrable/disputa*.

---

## 10. Notas legales / de uso

- **Respetá el opt-out** (DNC) y los horarios: el motor los aplica, pero no los
  desactives a la ligera.
- **No amenaces** ni expongas la deuda a terceros: el playbook lo prohíbe.
- **WhatsApp business-initiated**: fuera de la ventana de 24 h, Meta/Twilio
  exigen una **plantilla aprobada**; con **WAHA** (self-hosted) el envío directo
  funciona. El motor usa la conversación del deudor si existe, y si no, WAHA.

---

## 11. Tablas

| Tabla | Qué guarda |
|---|---|
| `debtor_lists` | listas importadas |
| `debtors` | deudores (nombre, teléfono, doc, referencia) |
| `debt_accounts` | deudas (monto, pagado, vencimiento, estado) |
| `collection_cases` | la gestión (etapa, intentos, próximo contacto) |
| `collection_interactions` | historial (mensaje/llamada/nota/pago + resultado) |
| `collection_contact_attempts` | intentos por canal (para reportes) |
| `collection_rules` | tramos de mora × canal × plantilla |
| `payment_promises` | promesas (monto, fecha, estado) |
| `collection_dnc` | opt-out / no contactar |
