// Escenarios del Laboratorio — FUENTE ÚNICA. Antes vivían en
// `test/fixtures/eval-scenarios.json`; se movieron a `src/` para que el Worker
// pueda usarlos (el Laboratorio corre desde el panel). El CLI de evaluación
// (`pnpm eval`) y sus tests siguen consumiéndolos por acá, sin duplicar.
import scenariosJson from "./scenarios.json";
import { personaScenarios } from "./personas";

export type LabLang = "es" | "en" | "pt";
export type LabTier = "free" | "pro";
export type LabCategory =
  | "faq"
  | "lead-capture"
  | "booking"
  | "handoff"
  | "frustration"
  | "out-of-scope"
  | "image-input"
  | "voice-input"
  | "persona";

/** Escenario "rápido": un solo mensaje del cliente + criterio de éxito. */
export interface EvalScenario {
  /** Unique, kebab-case id (e.g. "es-faq-hours"). */
  id: string;
  lang: LabLang;
  tier: LabTier;
  category: LabCategory;
  /** The exact message a customer sends the bot. */
  userMessage: string;
  /** Tool esperada (o null si la respuesta correcta no usa tools). */
  expectedToolCall: string | null;
  /** Criterio de éxito en lenguaje llano que evalúa el juez (o un humano). */
  rubric: string;
}

/** Escenario del Laboratorio: rápido (1 turno) o persona (multi-turno). */
export interface LabScenario {
  id: string;
  lang: LabLang;
  tier: LabTier;
  category: LabCategory;
  kind: "single" | "persona";
  /** Etiqueta legible para el panel. */
  label: string;
  /** Criterio de éxito que evalúa el juez. */
  rubric: string;
  /** Tool esperada (o null). */
  expectedToolCall: string | null;
  /** Solo rápidos: el mensaje del cliente (1 turno). */
  userMessage?: string;
  /** Solo personas: guion del cliente simulado. */
  persona?: { goal: string; opening: string; style: string; maxTurns: number };
  /** Solo personas: tope de turnos (fallback si no está en `persona`). */
  maxTurns?: number;
}

export const evalScenarios: EvalScenario[] = scenariosJson as unknown as EvalScenario[];

/** Nombres de tools referenciados por los escenarios (sin null). */
export const expectedTools: string[] = [
  ...new Set(
    evalScenarios
      .map((s) => s.expectedToolCall)
      .filter((t): t is string => t !== null),
  ),
].sort();

export function scenariosByLang(lang: LabLang): EvalScenario[] {
  return evalScenarios.filter((s) => s.lang === lang);
}

export function scenariosByCategory(category: LabCategory): EvalScenario[] {
  return evalScenarios.filter((s) => s.category === category);
}

/** Los 20 escenarios "rápidos" (un solo mensaje). */
export function quickScenarios(): LabScenario[] {
  return evalScenarios.map((s) => ({ ...s, kind: "single", label: s.id }));
}

/** Todos los escenarios del Laboratorio: rápidos + personas. */
export function allScenarios(): LabScenario[] {
  return [...quickScenarios(), ...personaScenarios()];
}
