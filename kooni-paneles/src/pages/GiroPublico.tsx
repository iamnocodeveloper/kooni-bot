import { useEffect } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { useI18n, type MessageKey } from "../lib/i18n";
import { DEMOS } from "../lib/demos";
import {
  GIROS,
  findGiro,
  giroBulletKey,
  giroNameKey,
  giroPainKey,
  installCommand,
} from "../lib/giros";
import { CONTACTO_EMAIL, mailtoDemo } from "../lib/landing";
import CopyCommand from "../components/CopyCommand";
import DemoChat from "../components/DemoChat";
import LandingTopBar from "../components/LandingTopBar";

const FOCUS =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent focus-visible:ring-offset-2 focus-visible:ring-offset-brand-bg";
const H2 = "font-display text-xl font-semibold tracking-tight text-brand-cream sm:text-2xl";
const BTN_PRIMARIO = `inline-flex items-center gap-2 rounded-xl bg-brand-accent px-5 py-3 text-sm font-semibold text-brand-onaccent transition hover:brightness-110 ${FOCUS.replace("ring-brand-accent", "ring-brand-accent2")}`;

/**
 * /giros/:id — página pública del giro: hero con el dolor + comando copiable,
 * qué hace, demo simulado, cómo se instala y cierre honesto.
 * Sin auth, sin backend, sin número de WhatsApp.
 */
export default function GiroPublico() {
  const { id } = useParams();
  const { t, lang } = useI18n();
  const giro = findGiro(id);

  const nombre = giro ? t(giroNameKey(giro.id)) : "";
  const titulo = giro ? `Kooni · ${nombre}` : "Kooni";

  // Al cambiar de giro, arrancamos desde arriba.
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0 });
  }, [id]);

  useEffect(() => {
    document.title = titulo;
    return () => {
      document.title = "Kooni";
    };
  }, [titulo]);

  // Giros desconocidos vuelven a la grilla (nada de pantallas en blanco).
  if (!giro) return <Navigate to="/giros" replace />;

  const comandos = installCommand(giro.id);
  // Fallback defensivo: si algún día falta un guion, se usa el genérico.
  const guion = (DEMOS[giro.id] ?? DEMOS.generico)[lang];
  const asunto = t("lp.close.mailSubject", { giro: nombre });
  const enlaceContacto = mailtoDemo(asunto);
  const otros = GIROS.filter((g) => g.id !== giro.id);
  const pasos = [
    { n: 1, comando: "npx kooni-bot login" },
    { n: 2, comando: comandos },
    { n: 3, comando: "npx kooni-bot doctor" },
  ];

  return (
    <main className="min-h-screen bg-brand-bg font-display text-brand-cream">
      <LandingTopBar />

      {/* 1. Hero: el dolor en una frase + el comando de instalación */}
      <section className="border-b border-brand-line/70 bg-gradient-to-b from-brand-panel/60 to-brand-bg">
        <div className="mx-auto max-w-5xl px-4 py-10 sm:py-16">
          <Link to="/giros" className={`inline-block rounded-lg font-mono text-[11px] text-brand-accent2 hover:text-brand-accent ${FOCUS}`}>
            <span aria-hidden="true">←</span> {t("lp.close.backGrid")}
          </Link>

          <p className="mt-6 font-mono text-[11px] uppercase tracking-[0.18em] text-brand-accent2">
            {t("lp.hero.eyebrow", { giro: nombre })}
          </p>

          <h1 className="mt-3 flex items-center gap-3 font-display text-3xl font-bold tracking-tight sm:text-5xl">
            <span aria-hidden="true">{giro.emoji}</span>
            <span>{nombre}</span>
          </h1>

          <p className="mt-5 max-w-2xl text-lg leading-relaxed text-brand-cream/90 sm:text-xl">
            {t(giroPainKey(giro.id))}
          </p>

          <div className="mt-8 flex max-w-2xl flex-col gap-3">
            <p className="font-mono text-[10px] uppercase tracking-wider text-brand-muted">
              {t("lp.hero.installLabel")}
            </p>
            <CopyCommand comando={comandos} />
            <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
              <a href="#contacto" className={BTN_PRIMARIO}>
                {t("lp.hero.demo")}
              </a>
              <span className="text-[12px] leading-relaxed text-brand-muted">{t("lp.hero.trust")}</span>
            </div>
          </div>
        </div>
      </section>

      {/* 2. Qué hace, en concreto */}
      <section className="mx-auto max-w-5xl px-4 py-12">
        <h2 className={H2}>{t("lp.sec.queHace")}</h2>
        <ul className="mt-6 grid gap-3 sm:grid-cols-2">
          {[1, 2, 3, 4].map((n) => (
            <li key={n} className="flex gap-3 rounded-2xl border border-brand-line bg-brand-panel p-4">
              <span aria-hidden="true" className="mt-0.5 shrink-0 text-brand-accent">
                ◆
              </span>
              <span className="text-sm leading-relaxed text-brand-cream/90">{t(giroBulletKey(giro.id, n))}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* 3. Demo simulado */}
      <section className="border-y border-brand-line bg-brand-panel2/40">
        <div className="mx-auto max-w-5xl px-4 py-12">
          <h2 className={H2}>{t("lp.sec.demoTitle")}</h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-brand-muted">{t("lp.sec.demoSub")}</p>
          <div className="mt-8">
            <DemoChat guion={guion} titulo={t("lp.demo.contact", { giro: nombre })} />
          </div>
        </div>
      </section>

      {/* 4. Cómo se instala: los 3 pasos reales */}
      <section className="mx-auto max-w-5xl px-4 py-12">
        <h2 className={H2}>{t("lp.sec.installTitle")}</h2>
        <p className="mt-2 text-sm leading-relaxed text-brand-muted">{t("lp.sec.installSub")}</p>

        <ol className="mt-6 grid gap-4">
          {pasos.map((p) => (
            <li
              key={p.n}
              className="flex flex-col gap-3 rounded-2xl border border-brand-line bg-brand-panel p-5 sm:flex-row sm:gap-5"
            >
              <span
                aria-hidden="true"
                className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-brand-accent/60 font-mono text-sm text-brand-accent"
              >
                {p.n}
              </span>
              <div className="min-w-0 flex-1">
                <h3 className="font-display text-base font-semibold text-brand-cream">
                  {t(`lp.step.${p.n}.title` as MessageKey)}
                </h3>
                <p className="mt-1 text-sm leading-relaxed text-brand-muted">
                  {t(`lp.step.${p.n}.desc` as MessageKey, { giro: nombre })}
                </p>
                <div className="mt-3">
                  <CopyCommand comando={p.comando} />
                </div>
              </div>
            </li>
          ))}
        </ol>

        <p className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-[12px] text-brand-muted">
          {t("lp.step.note")}
          <Link to="/" className={`rounded-lg font-semibold text-brand-accent2 hover:text-brand-accent ${FOCUS}`}>
            {t("lp.step.openPanel")} <span aria-hidden="true">→</span>
          </Link>
        </p>
      </section>

      {/* 5. Cierre: el CTA otra vez + la nota honesta + contacto */}
      <section id="contacto" className="border-t border-brand-line bg-gradient-to-b from-brand-panel/70 to-brand-bg">
        <div className="mx-auto max-w-5xl px-4 py-12">
          <div className="grid gap-8 lg:grid-cols-2">
            <div>
              <h2 className={H2}>{t("lp.close.title")}</h2>
              <p className="mt-3 text-sm leading-relaxed text-brand-muted">{t("lp.close.body")}</p>
              <div className="mt-6">
                <CopyCommand comando={comandos} />
              </div>
            </div>

            <div className="rounded-2xl border border-brand-linelit bg-brand-panel p-6">
              <h3 className="font-display text-lg font-semibold text-brand-cream">{t("lp.close.contactTitle")}</h3>
              <p className="mt-2 text-sm leading-relaxed text-brand-muted">{t("lp.close.contactBody")}</p>
              <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-3">
                <a href={enlaceContacto} className={BTN_PRIMARIO}>
                  {t("lp.hero.demo")}
                </a>
                <a
                  href={enlaceContacto}
                  className={`break-all rounded-lg font-mono text-[12px] text-brand-accent2 hover:text-brand-accent ${FOCUS}`}
                >
                  {t("lp.close.mailLink", { email: CONTACTO_EMAIL })}
                </a>
              </div>
            </div>
          </div>

          <div className="mt-12 border-t border-brand-line pt-8">
            <h3 className="font-mono text-[10px] uppercase tracking-wider text-brand-muted">
              {t("lp.sec.otherTitle")}
            </h3>
            <div className="mt-4 flex flex-wrap gap-2">
              {otros.map((g) => (
                <Link
                  key={g.id}
                  to={`/giros/${g.id}`}
                  className={`inline-flex max-w-full items-center gap-2 rounded-full border border-brand-line bg-brand-panel px-3 py-1.5 text-xs text-brand-cream/90 transition hover:border-brand-accent/60 hover:text-brand-accent ${FOCUS}`}
                >
                  <span aria-hidden="true">{g.emoji}</span>
                  <span className="truncate">{t(giroNameKey(g.id))}</span>
                </Link>
              ))}
            </div>
          </div>

          <p className="mt-8 text-[12px] leading-relaxed text-brand-muted">{t("lp.footer.note")}</p>
        </div>
      </section>
    </main>
  );
}
