# Tarifas y zonas — Central de taxis (plantilla)

> Reemplaza los valores por los reales y pégalo en `/admin` → Conocimiento →
> Nuevo documento. Las tarifas también se cargan por base en `/admin` → Bases
> (tarifa base + tarifa por zona), que es lo que usa el bot para el estimado.

## Tarifa base

- Bandera / tarifa base: `[$XX]`.
- Recargo nocturno (`[después de 22:00]`): `[+$XX]` `[o "no aplica"]`.

## Tarifa por zona (desde la base)

| Zona | Tarifa estimada |
|---|---|
| `[Centro]` | `[$XX]` |
| `[Zona Norte]` | `[$XX]` |
| `[Zona Sur]` | `[$XX]` |
| `[Aeropuerto]` | `[$XX]` |

## Zonas cubiertas por base

- **`[Base Centro]`** cubre: `[Centro, Zona A, Zona B]`.
- **`[Base Norte]`** cubre: `[Zona C, Zona D, Aeropuerto]`.

> Si tu zona no aparece, preguntá: la central confirma disponibilidad y precio.

## Formas de pago

- `[Efectivo — el conductor lleva cambio hasta $XXX]`.
- `[Transferencia — datos: banco, titular, alias].`
- `[Tarjeta — terminal en el auto]` `[o "no disponible"]`.

## Aclaraciones

- El estimado que da el bot es **aproximado**; el monto final lo confirma el
  conductor según el recorrido real.
- `[Peajes y parqueos: los paga el pasajero.]` `[o "incluidos"]`.
- `[No se cobra recargo por equipaje normal; maletas grandes o silla de bebé
  avisar al pedir.]`
