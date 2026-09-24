import { useState } from "react";

// Giros (packs de nicho) que trae Kooni. El que elijas se instala con
// `npx kooni-bot install <giro>` y re-etiqueta el panel del bot.
const GIROS: { id: string; emoji: string; nombre: string; desc: string }[] = [
  { id: "generico", emoji: "🤖", nombre: "Genérico / otro", desc: "Cualquier negocio: atiende, capta leads y escala cuando importa." },
  { id: "agencia-ia", emoji: "🚀", nombre: "Agencia de IA / servicios", desc: "Venta conversacional de servicios, con pipeline y propuestas." },
  { id: "restaurante", emoji: "🍽️", nombre: "Restaurante / comida", desc: "Menú, pedidos y reservas sin saturar el teléfono." },
  { id: "inmobiliaria", emoji: "🏠", nombre: "Inmobiliaria", desc: "Filtra prospectos y agenda visitas." },
  { id: "clinica", emoji: "🩺", nombre: "Clínica / consultorio", desc: "Citas y seguimiento (sin diagnosticar)." },
  { id: "barberia", emoji: "💈", nombre: "Barbería / estética", desc: "Llena la silla y baja los no-shows." },
  { id: "cartera", emoji: "💰", nombre: "Cartera de cobros", desc: "Recordatorios por mora y promesas de pago." },
  { id: "taxis", emoji: "🚕", nombre: "Taxis / central de despacho", desc: "Pide la ubicación y despacha al conductor." },
];

export default function Plantillas() {
  const [copied, setCopied] = useState<string | null>(null);

  async function copiar(id: string) {
    try {
      await navigator.clipboard.writeText(`npx kooni-bot install ${id}`);
      setCopied(id);
      setTimeout(() => setCopied(null), 1800);
    } catch {
      /* clipboard bloqueado */
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="font-display text-xl font-semibold">Plantillas</h1>
        <p className="text-sm text-muted">
          Cada giro es un producto entero: el bot sale con su panel a la medida, su playbook y su tono. Copiá el comando y
          pegáselo a tu agente en la carpeta del bot.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {GIROS.map((g) => {
          const cmd = `npx kooni-bot install ${g.id}`;
          return (
            <div key={g.id} className="card flex flex-col gap-3 p-4">
              <div className="flex items-start gap-3">
                <span className="text-2xl">{g.emoji}</span>
                <div>
                  <div className="font-semibold">{g.nombre}</div>
                  <p className="mt-0.5 text-sm text-muted">{g.desc}</p>
                </div>
              </div>
              <div className="flex items-center justify-between gap-2">
                <code className="truncate rounded bg-panel2 px-2 py-1 font-mono text-[11.5px] text-accent">{cmd}</code>
                <button className="btn-ghost shrink-0 py-1 text-xs" onClick={() => copiar(g.id)}>
                  {copied === g.id ? "✓ Copiado" : "Copiar"}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <p className="text-[12px] text-muted">
        ¿Ya tenés un bot y querés cambiarle el giro? Decile a tu agente: <span className="font-mono text-accent">/re-nichar</span>.
      </p>
    </div>
  );
}
