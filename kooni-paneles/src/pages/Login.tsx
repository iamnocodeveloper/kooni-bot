import { useState, type FormEvent } from "react";
import { insforge } from "../lib/insforge";
import { useAuth } from "../lib/auth";
import { useI18n } from "../lib/i18n";

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
  const { t } = useI18n();

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
          setInfo(t("login.sentCode"));
        } else {
          await refresh();
        }
      } else {
        const { error } = await insforge.auth.verifyEmail({ email, otp });
        if (error) throw error;
        await refresh();
      }
    } catch (e: any) {
      setErr(e?.message || t("common.error"));
    } finally {
      setBusy(false);
    }
  }

  const subtitle =
    mode === "signin"
      ? t("login.subtitleSignin")
      : mode === "signup"
        ? t("login.subtitleSignup")
        : t("login.subtitleVerify");

  return (
    <div className="flex min-h-full items-center justify-center p-6">
      <form onSubmit={submit} className="card w-full max-w-sm p-6">
        <div className="mb-1 flex items-center gap-2">
          <span className="text-accent">◆</span>
          <span className="font-display text-lg font-semibold">Kooni</span>
        </div>
        <p className="mb-5 text-sm text-muted">{subtitle}</p>

        {err && <div className="mb-3 rounded-lg border border-bad/40 bg-bad/10 px-3 py-2 text-xs text-bad">{err}</div>}
        {info && <div className="mb-3 rounded-lg border border-accent/40 bg-accentSoft px-3 py-2 text-xs text-accent">{info}</div>}

        <div className="flex flex-col gap-3">
          <div>
            <label className="label">{t("login.email")}</label>
            <input className="input mt-1" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required disabled={mode === "verify"} />
          </div>
          {mode !== "verify" && (
            <div>
              <label className="label">{t("login.password")}</label>
              <input className="input mt-1" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
            </div>
          )}
          {mode === "verify" && (
            <div>
              <label className="label">{t("login.otp")}</label>
              <input className="input mt-1 font-mono tracking-widest" value={otp} onChange={(e) => setOtp(e.target.value)} required />
            </div>
          )}
          <button className="btn-primary justify-center" disabled={busy}>
            {busy
              ? "…"
              : mode === "signin"
                ? t("login.submitSignin")
                : mode === "signup"
                  ? t("login.submitSignup")
                  : t("login.submitVerify")}
          </button>
        </div>

        <div className="mt-4 text-center text-xs text-muted">
          {mode === "signin" ? (
            <>
              {t("login.noAccount")}{" "}
              <button type="button" className="text-accent hover:underline" onClick={() => setMode("signup")}>
                {t("login.createOne")}
              </button>
            </>
          ) : (
            <button type="button" className="text-accent hover:underline" onClick={() => setMode("signin")}>
              {t("login.backToSignin")}
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
