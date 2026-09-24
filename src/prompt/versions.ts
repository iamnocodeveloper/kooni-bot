// Historial del prompt: guarda snapshots de las instrucciones del dueño para
// poder volver a una versión anterior. Vive en `settings.prompt_versions`
// (JSON), sin tabla nueva — son las últimas 10 versiones.
import type { SettingsRepo } from "../db/settings";
import { SETTING_KEYS } from "../db/settings";

export interface PromptVersion {
  at: number;
  system: string;
  instructions: string;
}

const MAX = 10;

export async function listPromptVersions(repo: SettingsRepo): Promise<PromptVersion[]> {
  try {
    const raw = await repo.get(SETTING_KEYS.promptVersions);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as PromptVersion[]) : [];
  } catch {
    return [];
  }
}

/**
 * Guarda un snapshot del estado ANTERIOR del prompt si cambió respecto del más
 * reciente. Se llama después de guardar, pasando los valores previos.
 */
export async function snapshotPrompt(
  repo: SettingsRepo,
  system: string | null,
  instructions: string | null,
): Promise<void> {
  const s = (system ?? "").trim();
  const i = (instructions ?? "").trim();
  try {
    const list = await listPromptVersions(repo);
    const last = list[0];
    if (last && (last.system ?? "") === s && (last.instructions ?? "") === i) return; // sin cambios
    list.unshift({ at: Date.now(), system: s, instructions: i });
    await repo.set(SETTING_KEYS.promptVersions, JSON.stringify(list.slice(0, MAX)));
  } catch {
    // nunca romper el guardado por el historial
  }
}
