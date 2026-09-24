import { useEffect, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { insforge } from "../lib/insforge";
import { useAuth } from "../lib/auth";

export default function Invitacion() {
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const { user, loading } = useAuth();
  const [estado, setEstado] = useState<"esperando" | "ok" | "error">("esperando");
  const [msg, setMsg] = useState("");

  useEffect(() => {
    if (loading || !user || !token) return;
    (async () => {
      try {
        const { data, error } = await insforge.functions.invoke("colaborador-aceptar", { body: { token } });
        if (error) throw error;
        if ((data as any)?.error) throw new Error((data as any).error);
        setEstado("ok");
      } catch (e: any) {
        setEstado("error");
        setMsg(e?.message || "No se pudo aceptar la invitación");
      }
    })();
  }, [loading, user, token]);

  return (
    <div className="flex min-h-full items-center justify-center p-6">
      <div className="card w-full max-w-md p-6 text-center">
        {!token ? (
          <>
            <div className="text-lg font-semibold">Link inválido</div>
            <p className="mt-2 text-sm text-muted">Falta el token de la invitación.</p>
          </>
        ) : loading ? (
          <div className="text-muted">Cargando…</div>
        ) : !user ? (
          <>
            <div className="text-lg font-semibold">Entrá primero</div>
            <p className="mt-2 text-sm text-muted">
              Iniciá sesión con el correo al que te invitaron y volvé a abrir este link.
            </p>
            <Link className="btn-primary mt-4 inline-flex justify-center" to="/login">Ir a entrar</Link>
          </>
        ) : estado === "ok" ? (
          <>
            <div className="text-lg font-semibold text-ok">✓ Listo</div>
            <p className="mt-2 text-sm text-muted">
              Ya sos parte del equipo. Vas a ver los bots de esta cuenta en tu panel.
            </p>
            <Link className="btn-primary mt-4 inline-flex justify-center" to="/">Ir a Mis bots</Link>
          </>
        ) : estado === "error" ? (
          <>
            <div className="text-lg font-semibold text-bad">No se pudo aceptar</div>
            <p className="mt-2 text-sm text-muted">{msg}</p>
          </>
        ) : (
          <div className="text-muted">Aceptando invitación…</div>
        )}
      </div>
    </div>
  );
}
