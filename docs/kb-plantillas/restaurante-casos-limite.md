# Casos límite del pedido — Restaurante (plantilla)

> Reglas para cuando el pedido NO es directo. Pégalo en `/admin` → Conocimiento
> → Nuevo documento y ajústalo a tu operación. El bot ya trae la lógica en su
> playbook; esto le da los datos concretos de tu negocio.

## Fuera de horario

- Horario para pedidos: `[L–D 1:00 pm – 11:00 pm]`. La cocina toma pedidos hasta
  `[10:30 pm]`.
- Si alguien escribe fuera de horario: `[el bot dice el horario y pide que
  escriba dentro de él]`. `[Opción: dejar el pedido agendado para la apertura —
  activar solo si tu operación lo permite.]`

## Zona no cubierta

- Zonas con delivery: `[Zona A, Zona B, Zona C]` (costos en `restaurante-faq`).
- Fuera de esas zonas: NO se fuerza el envío. Se ofrece retiro en el local
  (`[dirección]`). Si no pueden pasar, el pedido no se toma.

## Producto agotado

- Cuando marques un producto como agotado en `/admin` → Menú, el bot deja de
  ofrecerlo y, si el cliente lo pide, avisa y propone un cambio.
- Sustituciones típicas: `[hamburguesa clásica → hamburguesa doble +$XX]`,
  `[refresco de cola → refresco de naranja]`.

## Pedido incompleto

El bot no registra el pedido si falta: dirección completa, método de pago, o al
menos un producto. Pide lo que falte antes de confirmar.

## El cliente cambia el pedido a mitad

Si el cliente agrega, quita o modifica algo antes de confirmar, el bot actualiza
el carrito y vuelve a mostrar el resumen (ítems, subtotal, envío, total) para
que confirme de nuevo. No se registra nada sin el "sí" final.

## Pago por transferencia

- Datos: `[banco, titular, CLABE/alias]`.
- El bot pide la captura del comprobante `[antes de confirmar / y confirma
  igual, el local valida al recibir]` — elegí una y ponela clara.

## Reclamos y pedidos grandes → a una persona

El bot escala al local (comparte `[wa.me/52XXXXXXXXXX]`) cuando:
- El pedido llegó mal, frío, tarde o incompleto.
- Hay un cobro incorrecto.
- Es catering, un evento, o un pedido grande (`[más de X personas o $X]`).
- Piden cancelar algo que ya está en preparación o en camino.
- El cliente pide hablar con alguien.
