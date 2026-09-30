// Helpers pequeños compartidos por las vistas del panel. Son las mismas recetas
// que usa `conversations.ts` (que mantiene copias locales propias): se replican
// acá para que la pestaña de Comentarios no dependa de internals de esa vista.
// No cambiar el comportamiento: los strings visibles son load-bearing.

/** Escapa texto para inyectarlo en HTML. */
export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

/** Tiempo relativo corto en español (ej. "hace 5 min", "hace 2 h", "hace 3 d"). */
export function ago(ms: number | null | undefined): string {
  if (!ms) return "";
  const diff = Date.now() - ms;
  const min = Math.floor(diff / 60_000);
  if (min < 1) return "ahora";
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.floor(h / 24);
  return `hace ${d} d`;
}

/** Fecha corta dd/mm hh:mm para listados. */
export function shortDate(ms: number | null | undefined): string {
  if (!ms) return "—";
  return new Date(ms).toLocaleString("es", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

/** Iniciales (1-2 letras) para el avatar. */
export function initialsOf(label: string): string {
  const parts = label.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return parts.slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("") || "?";
}

/** Color del avatar por plataforma (IG/FB/Zernio en accent-2, resto en accent). */
export function platformColor(platform: string): string {
  const p = (platform || "").toLowerCase();
  if (p === "instagram" || p === "facebook") return "var(--accent-2)";
  return "var(--accent)";
}

/** Recorta a `n` caracteres con elipsis. */
export function snippet(s: string | null | undefined, n = 90): string {
  const t = (s ?? "").replace(/\s+/g, " ").trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
}
