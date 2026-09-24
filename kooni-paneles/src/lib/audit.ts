import { insforge } from "./insforge";

/**
 * Registra una acción del super admin en la auditoría. Nunca lanza: si falla,
 * no rompe la acción real.
 */
export async function logAdmin(accion: string, detalle?: string): Promise<void> {
  try {
    const { data } = await insforge.auth.getCurrentUser();
    const email = (data as any)?.user?.email ?? null;
    await insforge.database.from("auditoria_admin").insert([{ actor: email, accion, detalle: detalle ?? null }]);
  } catch {
    /* nunca romper */
  }
}
