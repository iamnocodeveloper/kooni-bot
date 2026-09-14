# Casos límite — Central de taxis (plantilla)

> Reglas para cuando la solicitud NO es directa. Pégalo en `/admin` →
> Conocimiento → Nuevo documento y ajústalo a tu operación. El bot ya trae la
> lógica en su playbook; esto le da los datos concretos de tu negocio.

## No hay conductores disponibles

- El bot deja el viaje como **"sin conductor"** y **marca el chat como urgente**
  (ticket + etiqueta de atención humana) para que la central asigne a mano.
- Mensaje al cliente: `[“Ahora mismo no tengo un auto libre; ya avisé a la
  central y te confirmo apenas se libere uno.”]`
- La central retoma el chat desde `/admin` → Conversaciones y usa **“Elegir
  conductor”** para asignar y avisar al cliente.

## Zona no cubierta

- Zonas cubiertas: `[listar]` (ver documento de tarifas).
- Fuera de esas zonas: el bot NO promete un taxi. `[Escala a la central para
  confirmar disponibilidad.]` `[O: ofrece el punto de referencia más cercano.]`

## Ubicación ambigua

El bot pide una **referencia concreta** (calle y esquina, negocio cercano, color
de la fachada) antes de registrar. No asigna con "estoy cerca" a secas.

## Reclamos de un viaje

(El auto no llegó, no pasó a buscarlo, el conductor cobró de más, olvidó algo,
se sintió insegura/o): el bot **escala a una persona** (`handoffHuman`) y comparte
`[wa.me/52XXXXXXXXXX]`. No promete reembolsos ni compensaciones.

## Viajes especiales → a una persona

Escalar a la central cuando:
- Es **interurbano** o **al aeropuerto** `[si requiere coordinación]`.
- Es **carga, mudanza o grupo grande** (`[más de X pasajeros]`).
- Necesita **silla de bebé, accesibilidad** o algún requerimiento especial.
- Es una **reserva para otro día/hora** `[si no se agenda automáticamente]`.
- El cliente pide hablar con alguien.

## Cliente que no contesta / no aparece

`[Si el conductor llega y el pasajero no aparece en X minutos, la central lo
llama; si no responde, se libera al conductor y se cierra el viaje.]`

## Objetos olvidados

El bot **escala a la central** (no promete búsqueda). La central coordina con el
conductor `[por el grupo de la base / teléfono]`.
