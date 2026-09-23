import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { insforge } from "../lib/insforge";

export default function Cli() {
  const [params] = useSearchParams();
  const [code, setCode] = useState(params.get("code") ?? "");
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");
  const [busy, setBusy] = useState(false);

  async function approve() {
    setErr("");
    setOk("");
    setBusy(true);
    try {
      const { data, error } = await insforge.functions.invoke("cli-device-approve", {
        body: { code: code.trim().toUpperCase(), label: navigator.userAgent.slice(0, 60) },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      setOk("Listo. Vuelve a tu terminal: el CLI ya quedó conectado.");
    } catch (e: any) {
      setErr(e?.message || "No se pudo aprobar el código");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="font-display text-xl font-semibold">Conectar el CLI</h1>
        <p className="text-sm text-muted">Pega el código que te mostró la terminal para autorizar esta máquina.</p>
      </div>

      <div className="card max-w-md p-5">
        {err && <div className="mb-3 rounded-lg border border-bad/40 bg-bad/10 px-3 py-2 text-xs text-bad">{err}</div>}
        {ok && <div className="mb-3 rounded-lg border border-ok/40 bg-ok/10 px-3 py-2 text-xs text-ok">{ok}</div>}

        <label className="label">Código del dispositivo</label>
        <input
          className="input mt-1 text-center font-mono text-lg tracking-[0.3em]"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="ABC-123"
        />
        <button className="btn-primary mt-4 w-full justify-center" disabled={busy || !code.trim()} onClick={approve}>
          {busy ? "Autorizando…" : "Autorizar esta máquina"}
        </button>
      </div>
    </div>
  );
}
