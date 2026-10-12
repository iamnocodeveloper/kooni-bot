// Delta del Laboratorio: compara dos corridas del mismo tipo — pass-rate global y
// por categoría, escenarios que se ROMPIERON (passed→failed) y los que se
// ARREGLARON (failed→passed). Función PURA (testeable sin red ni D1).

export interface DeltaInput {
  scenario_id: string;
  passed: boolean;
  category?: string | null;
}

export interface CategoryDelta {
  category: string;
  prev: number; // pass-rate 0..1
  curr: number;
  delta: number;
}

export interface LabDelta {
  prevPassRate: number;
  currPassRate: number;
  passRateDelta: number;
  broke: string[];
  fixed: string[];
  byCategory: CategoryDelta[];
}

function rate(rows: DeltaInput[]): number {
  if (rows.length === 0) return 0;
  return rows.filter((r) => r.passed).length / rows.length;
}

export function computeDelta(prev: DeltaInput[], curr: DeltaInput[]): LabDelta {
  const prevRate = rate(prev);
  const currRate = rate(curr);

  const prevById = new Map(prev.map((r) => [r.scenario_id, r.passed]));
  const broke: string[] = [];
  const fixed: string[] = [];
  for (const c of curr) {
    const before = prevById.get(c.scenario_id);
    if (before === undefined) continue; // escenario nuevo: no es ni rotura ni arreglo
    if (before && !c.passed) broke.push(c.scenario_id);
    if (!before && c.passed) fixed.push(c.scenario_id);
  }

  // Pass-rate por categoría (solo categorías presentes en alguna corrida).
  const cats = new Set<string>();
  for (const r of [...prev, ...curr]) if (r.category) cats.add(r.category);
  const byCategory: CategoryDelta[] = [...cats]
    .map((category) => {
      const p = rate(prev.filter((r) => r.category === category));
      const c = rate(curr.filter((r) => r.category === category));
      return { category, prev: p, curr: c, delta: c - p };
    })
    .sort((a, b) => a.category.localeCompare(b.category));

  return {
    prevPassRate: prevRate,
    currPassRate: currRate,
    passRateDelta: currRate - prevRate,
    broke,
    fixed,
    byCategory,
  };
}
