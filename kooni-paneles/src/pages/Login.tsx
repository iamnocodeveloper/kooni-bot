import { useState, type FormEvent } from "react";
import { insforge } from "../lib/insforge";
import { useAuth } from "../lib/auth";

type Mode = "signin" | "signup" | "verify";

export default function Login() {
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [err, setErr] = useState("");
  const [info, setInfo] = useState("");
  const [busy, setBusy] = useState(false);
  const { refresh } = useAuth();

  async function submit(e: FormEvent) {
    e.preventDefault();
    setErr("");
    setInfo("");
    setBusy(true);
    try {
      if (mode === "signin") {
        const { error } = await insforge.auth.signInWithPassword({ email, password });
        if (error) throw error;
        await refresh();
      } else if (mode === "signup") {
        const { data, error } = await insforge.auth.signUp({ email, password });
        if (error) throw error;
        if ((data as any)?.requireEmailVerification) {
          setMode("verify");
          setInfo("Te mandamos un código de 6 dígitos a tu correo.");
        } else {
          await refresh();
        }
      } else {
        const { error } = await insforge.auth.verifyEmail({ email, otp });
        if (error) throw error;
        await refresh();
      }
    } catch (e: any) {
      setErr(e?.message || "Algo salió mal");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-full items-center justify-center p-6">
      <form onSubmit={submit} className="card w-full max-w-sm p-6">
        <div className="mb-1 flex items-center gap-2">
          <span className="text-accent">◆</span>
          <span className="font-display text-lg font-semibold">Kooni</span>
        </div>
        <p className="mb-5 text-sm text-muted">
          {mode === "signin" ? "Entra a tu cuenta." : mode === "signup" ? "Crea tu cuenta." : "Verifica tu correo."}
        </p>

        {err && <div className="mb-3 rounded-lg border border-bad/40 bg-bad/10 px-3 py-2 text-xs text-bad">{err}</div>}
        {info && <div className="mb-3 rounded-lg border border-accent/40 bg-accentSoft px-3 py-2 text-xs text-accent">{info}</div>}

        <div className="flex flex-col gap-3">
          <div>
            <label className="label">Correo</label>
            <input className="input mt-1" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required disabled={mode === "verify"} />
          </div>
          {mode !== "verify" && (
            <div>
              <label className="label">Contraseña</label>
              <input className="input mt-1" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
            </div>
          )}
          {mode === "verify" && (
            <div>
              <label className="label">Código de 6 dígitos</label>
              <input className="input mt-1 font-mono tracking-widest" value={otp} onChange={(e) => setOtp(e.target.value)} required />
            </div>
          )}
          <button className="btn-primary justify-center" disabled={busy}>
            {busy ? "…" : mode === "signin" ? "Entrar" : mode === "signup" ? "Crear cuenta" : "Verificar"}
          </button>
        </div>

        <div className="mt-4 text-center text-xs text-muted">
          {mode === "signin" ? (
            <>
              ¿No tienes cuenta?{" "}
              <button type="button" className="text-accent hover:underline" onClick={() => setMode("signup")}>
                Crear una
              </button>
            </>
          ) : (
            <button type="button" className="text-accent hover:underline" onClick={() => setMode("signin")}>
              Volver a entrar
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
