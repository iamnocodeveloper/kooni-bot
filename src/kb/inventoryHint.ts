// Aviso de sistema sobre el INVENTARIO de autos, que el agente agrega al prompt
// en cada turno. Vive aparte de agent.ts para poder probarlo sin un Durable Object.
import type { StoredVehicle } from "./inventory";

/**
 * - Hay autos cargados (sitio o CSV) → obliga a contestar SOLO con las tools
 *   inventarioQuery / fichaAuto.
 * - No hay autos pero la instalación espera inventario (URLs de Web Sync, o giro
 *   concesionario) → prohíbe inventar marcas o modelos.
 * - Ninguno de los dos → null (el giro no usa inventario de autos).
 */
export function inventoryHintBlock(opts: { vehicles: StoredVehicle[]; expectsInventory: boolean }): string | null {
  const { vehicles, expectsInventory } = opts;
  if (vehicles.length > 0) {
    const marcas = [...new Set(vehicles.map((v) => v.make).filter(Boolean))] as string[];
    return (
      `<inventario>\nTenés inventario sincronizado: ${vehicles.length} autos. Marcas: ${marcas.join(", ") || "—"}.\n` +
      `REGLA: para CUALQUIER pregunta sobre autos, disponibilidad, marcas, modelos, precios, condición (nuevo/usado) o VIN usá SIEMPRE la tool inventarioQuery. Nunca contestes con conocimiento general ni cites la KB para inventario.\n` +
      `Cuando el cliente pida ver, consultar o mandar UN auto concreto (por nombre, modelo, año o VIN) usá SIEMPRE fichaAuto — no inventarioQuery (ej. "muestrame la RAV4", "cuánto cuesta la Sorento", "mandame la foto"). fichaAuto trae el link real de la ficha, la foto, precio, millas y VIN.\n` +
      `En cualquier respuesta con autos incluí el link (url) de la ficha, si la ficha lo trae. Si un dato viene null, decí que se consulta — no lo inventes.\n` +
      `Si inventarioQuery devuelve 0 resultados, decí claramente que ese auto/marca no está y ofrecé las marcas disponibles.\n</inventario>`
    );
  }
  if (expectsInventory) {
    return (
      `<inventario_vacio>\nLa instalación trabaja con inventario de autos pero el listado está vacío ahora mismo. ` +
      `Si preguntan por autos, NO recites marcas ni modelos ni afirmes que tenés algo: decí que el listado todavía no está disponible y ofrecé tomar sus datos.\n</inventario_vacio>`
    );
  }
  return null;
}
