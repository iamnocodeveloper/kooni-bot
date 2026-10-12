#!/usr/bin/env tsx
/**
 * eval-scenarios.ts
 *
 * Typed accessor for the canonical conversation scenarios. La FUENTE ÚNICA vive
 * ahora en `src/lab/scenarios.ts` (+ `src/lab/scenarios.json` y las personas en
 * `src/lab/personas.ts`), para que el Laboratorio del panel y el CLI de
 * evaluación compartan exactamente el mismo set. Este archivo solo re-exporta.
 *
 * Consumido por:
 *   - `scripts/eval-bot-live.ts` (`pnpm eval`) para manejar el bot en vivo, y
 *   - tests que verifican que el set sigue bien formado.
 */
export * from "../src/lab/scenarios";
