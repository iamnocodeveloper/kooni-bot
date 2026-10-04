import { describe, it, expect } from "vitest";
import { getNiche } from "../src/niches";
import { systemPromptFromEnv } from "../src/system-prompt";
import { layout } from "../src/admin/views/layout";
import type { Env } from "../src/env";

const envWith = (niche?: string) => ({ BOT_NICHE: niche, BOT_NAME: "Bot", BUSINESS_NAME: "Neg", BOT_LANGUAGE: "es-MX" }) as unknown as Env;

// Packs por giro registrados en src/niches/index.ts. Al agregar un giro nuevo,
// suma su fila aquí: cubre resolución, re-etiquetado del panel, columnas y el
// tag de su playbook.
const GIROS: {
  id: string;
  navLabel: string;
  recordPlural: string;
  statusNew: string;
  playbookTag: string;
  columns: string[];
}[] = [
  { id: "agencia-ia", navLabel: "Prospectos", recordPlural: "Prospectos", statusNew: "Nuevo", playbookTag: "playbook_de_venta", columns: ["servicio", "plan", "canal"] },
  { id: "restaurante", navLabel: "Consultas", recordPlural: "Consultas", statusNew: "Nueva", playbookTag: "playbook_restaurante", columns: ["tipo", "fecha", "personas"] },
  { id: "inmobiliaria", navLabel: "Prospectos", recordPlural: "Prospectos", statusNew: "Nuevo", playbookTag: "playbook_inmobiliaria", columns: ["operacion", "zona", "presupuesto", "recamaras"] },
  { id: "clinica", navLabel: "Citas", recordPlural: "Citas", statusNew: "Solicitada", playbookTag: "playbook_clinica", columns: ["especialidad", "fecha", "hora", "motivo"] },
  { id: "barberia", navLabel: "Citas", recordPlural: "Citas", statusNew: "Solicitada", playbookTag: "playbook_barberia", columns: ["servicio", "barbero", "fecha", "hora"] },
  { id: "eventos", navLabel: "Cotizaciones", recordPlural: "Cotizaciones", statusNew: "Solicitada", playbookTag: "playbook_eventos", columns: ["evento", "fecha", "equipo", "personas"] },
  { id: "concesionario", navLabel: "Prospectos", recordPlural: "Prospectos", statusNew: "Nuevo", playbookTag: "playbook_concesionario", columns: ["vehiculo", "interes", "presupuesto", "fecha"] },
  { id: "taxis", navLabel: "Solicitudes", recordPlural: "Solicitudes", statusNew: "Solicitada", playbookTag: "playbook_taxis", columns: ["base", "zona", "conductor", "destino"] },
];

describe("getNiche", () => {
  it("nicho ausente o desconocido → genérico (comportamiento del Starter)", () => {
    for (const v of [undefined, "", "xyz", "giro-inexistente"]) {
      const n = getNiche(envWith(v));
      expect(n.id).toBe("generico");
      expect(n.navLabel).toBe("Leads");
      expect(n.playbook).toBe("");
      expect(n.defaultTone).toBe("");
    }
  });

  it("normaliza mayúsculas/espacios al resolver el pack", () => {
    expect(getNiche(envWith("  GENERICO ")).id).toBe("generico");
    expect(getNiche(envWith(" Restaurante ")).id).toBe("restaurante");
  });

  it.each(GIROS)("$id: resuelve el pack, re-etiqueta el panel y trae playbook + columnas", (g) => {
    const n = getNiche(envWith(g.id));
    expect(n.id).toBe(g.id);
    expect(n.navLabel).toBe(g.navLabel);
    expect(n.recordPlural).toBe(g.recordPlural);
    expect(n.statusLabels.new).toBe(g.statusNew);
    expect(n.playbook).toContain(g.playbookTag);
    expect(n.defaultTone).not.toBe("");
    expect(n.columns.map((c) => c.key)).toEqual(g.columns);
    // Cada columna tiene label y las 4 etiquetas de estado están definidas.
    for (const c of n.columns) expect(c.label.length).toBeGreaterThan(0);
    for (const s of ["new", "contacted", "sold", "lost"] as const) expect(n.statusLabels[s]).toBeTruthy();
  });
});

describe("dashboard (nav genérico)", () => {
  const page = async (niche?: string) => await layout({ title: "T", activeTab: "leads", body: "x", env: envWith(niche) });

  it("genérico: el nav dice 'Leads'", async () => {
    const html = await page(undefined);
    expect(html).toContain("Leads");
    expect(html).toContain('href="/admin/leads"');
  });

  it.each(GIROS)("$id: el nav re-etiqueta 'Leads' → '$navLabel'", async (g) => {
    const html = await page(g.id);
    expect(html).toContain(g.navLabel);
    expect(html).toContain('href="/admin/leads"');
  });
});

describe("cableado del playbook al prompt", () => {
  it("genérico no inyecta playbook", () => {
    const env = envWith(undefined);
    const prompt = systemPromptFromEnv(env, ["searchKb"], "ctx", getNiche(env).playbook || undefined);
    expect(prompt).not.toContain("<diagnostic_playbooks>");
  });

  it("agencia-ia inyecta su playbook de venta en el prompt", () => {
    const env = envWith("agencia-ia");
    const prompt = systemPromptFromEnv(env, ["searchKb", "captureLead"], "ctx", getNiche(env).playbook || undefined);
    expect(prompt).toContain("<playbook_de_venta>");
    expect(prompt).toContain("captureLead");
    expect(prompt).toContain("WhatsApp");
  });

  it.each(GIROS.filter((g) => g.id !== "agencia-ia"))("$id inyecta su playbook en el prompt generado", (g) => {
    const env = envWith(g.id);
    const prompt = systemPromptFromEnv(env, ["searchKb", "captureLead", "handoffHuman"], "ctx", getNiche(env).playbook || undefined);
    expect(prompt).toContain(`<${g.playbookTag}>`);
    expect(prompt).toContain("captureLead");
    expect(prompt).toContain("searchKb");
  });
});

describe("hooks del pack (inmobiliaria)", () => {
  it("declara las tools de propiedades y la sección del panel", () => {
    const n = getNiche(envWith("inmobiliaria"));
    expect(n.hooks?.extraTools).toContain("buscarPropiedad");
    expect(n.hooks?.extraTools).toContain("fichaPropiedad");
    const nav = n.hooks?.navExtra ?? [];
    expect(nav.map((x) => x.id)).toContain("propiedades");
    expect(nav.find((x) => x.id === "propiedades")?.href).toBe("/admin/propiedades");
  });

  it("el playbook consulta el inventario real y prohíbe inventar", () => {
    const n = getNiche(envWith("inmobiliaria"));
    expect(n.playbook).toContain("buscarPropiedad");
    expect(n.playbook).toContain("fichaPropiedad");
    expect(n.playbook).toContain("Nunca inventes propiedades");
    // Ya no manda a resolver el listado con searchKb a secas.
    expect(n.playbook).toContain("del INVENTARIO");
  });
});

describe("pack concesionario", () => {
  const n = getNiche(envWith("concesionario"));

  it("usa el inventario de autos ya registrado y suma el acceso en el menú", () => {
    // inventarioQuery / fichaAuto se registran para todos los giros: no son extraTools.
    expect(n.hooks?.extraTools).toBeUndefined();
    const nav = n.hooks?.navExtra ?? [];
    expect(nav.map((x) => x.id)).toEqual(["inventario"]);
    expect(nav[0]?.href).toBe("/admin/scraping/inventario");
  });

  it("el playbook consulta el inventario real y prohíbe prometer crédito o inventar", () => {
    expect(n.playbook).toContain("inventarioQuery");
    expect(n.playbook).toContain("fichaAuto");
    expect(n.playbook).toContain("Nunca inventes autos");
    expect(n.playbook).toMatch(/NUNCA prometas ni insinúes aprobación de crédito/);
    expect(n.playbook).toMatch(/NUNCA pidas por el chat número de seguro social/);
    expect(n.playbook).toContain("AGENDA REAL");
  });

  it("trae preguntas de entrevista y plantillas de KB", () => {
    expect(n.interviewQuestions && n.interviewQuestions.length).toBeGreaterThan(3);
    expect(n.kbDocs).toEqual(["concesionario-financiamiento-ejemplo", "concesionario-faq"]);
  });

  it("el menú lateral muestra Inventario y marca la pestaña activa", async () => {
    const html = await layout({ title: "T", activeTab: "inventario", body: "x", env: envWith("concesionario") });
    expect(html).toContain('href="/admin/scraping/inventario"');
    expect(html).toContain("Inventario");
  });
});

describe("giros con cita: guía de agenda real", () => {
  it.each(["clinica", "barberia", "eventos", "inmobiliaria", "concesionario"])(
    "%s explica cómo usar scheduleAppointment y qué hacer sin agenda",
    (id) => {
      const p = getNiche(envWith(id)).playbook;
      expect(p).toContain("AGENDA REAL (scheduleAppointment)");
      expect(p).toContain("booking_unavailable");
      expect(p).toContain("captureLead");
    },
  );

  it("eventos aclara que es PRE-reserva; los demás, no", () => {
    expect(getNiche(envWith("eventos")).playbook).toContain("PRE-reserva hasta que el equipo la confirme");
    expect(getNiche(envWith("clinica")).playbook).toContain("queda registrada en el calendario del negocio");
  });

  it("inmobiliaria no promete avisar después y habla de tú", () => {
    const p = getNiche(envWith("inmobiliaria")).playbook;
    expect(p).not.toContain("ofrecé avisarle");
    expect(p).not.toMatch(/(llamá|mostrá|mandá)/);
  });
});

describe("hooks del pack (restaurante)", () => {
  it("declara el motor de pedidos, la tool tomarPedido y las secciones extra", () => {
    const n = getNiche(envWith("restaurante"));
    expect(n.hooks?.orderEngine).toBe(true);
    expect(n.hooks?.extraTools).toContain("tomarPedido");
    expect(n.hooks?.navExtra?.map((x) => x.id)).toEqual(["pedidos", "menu", "reportes"]);
    expect(n.interviewQuestions && n.interviewQuestions.length).toBeGreaterThan(3);
  });

  it("los packs livianos no traen hooks", () => {
    for (const id of ["generico", "clinica", "barberia"]) {
      expect(getNiche(envWith(id)).hooks).toBeUndefined();
    }
  });

  it("taxis declara el motor de despacho, la tool solicitarTaxi y sus secciones", () => {
    const n = getNiche(envWith("taxis"));
    expect(n.hooks?.taxiEngine).toBe(true);
    expect(n.hooks?.extraTools).toContain("solicitarTaxi");
    expect(n.hooks?.navExtra?.map((x) => x.id)).toEqual(["viajes", "cola", "bases", "conductores", "reportes"]);
    expect(n.interviewQuestions && n.interviewQuestions.length).toBeGreaterThan(3);
  });
});
