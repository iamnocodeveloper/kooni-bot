import { useEffect, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { insforge } from "../lib/insforge";
import { useAuth } from "../lib/auth";
import { useI18n } from "../lib/i18n";

export default function Invitacion() {
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const { user, loading } = useAuth();
  const { t } = useI18n();
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
        setMsg(e?.message || t("inv.errDefault"));
      }
    })();
  }, [loading, user, token]);

  return (
    <div className="flex min-h-full items-center justify-center p-6">
      <div className="card w-full max-w-md p-6 text-center">
        {!token ? (
          <>
            <div className="text-lg font-semibold">{t("inv.invalidTitle")}</div>
            <p className="mt-2 text-sm text-muted">{t("inv.invalidDesc")}</p>
          </>
        ) : loading ? (
          <div className="text-muted">{t("app.loading")}</div>
        ) : !user ? (
          <>
            <div className="text-lg font-semibold">{t("inv.signInTitle")}</div>
            <p className="mt-2 text-sm text-muted">{t("inv.signInDesc")}</p>
            <Link className="btn-primary mt-4 inline-flex justify-center" to="/login">{t("inv.goSignIn")}</Link>
          </>
        ) : estado === "ok" ? (
          <>
            <div className="text-lg font-semibold text-ok">{t("inv.okTitle")}</div>
            <p className="mt-2 text-sm text-muted">{t("inv.okDesc")}</p>
            <Link className="btn-primary mt-4 inline-flex justify-center" to="/">{t("inv.goBots")}</Link>
          </>
        ) : estado === "error" ? (
          <>
            <div className="text-lg font-semibold text-bad">{t("inv.failTitle")}</div>
            <p className="mt-2 text-sm text-muted">{msg}</p>
          </>
        ) : (
          <div className="text-muted">{t("inv.accepting")}</div>
        )}
      </div>
    </div>
  );
}
