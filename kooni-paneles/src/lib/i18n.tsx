import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { insforge } from "./insforge";
import { useAuth } from "./auth";
import { es } from "./locales/es";
import { en } from "./locales/en";

export type Lang = "es" | "en";
export type MessageKey = keyof typeof es;

const DICTS: Record<Lang, Record<MessageKey, string>> = { es, en };

/** Bandera + nombre para el desplegable. */
export const LANG_META: Record<Lang, { flag: string; label: string }> = {
  es: { flag: "🇲🇽", label: "Español (LATAM)" },
  en: { flag: "🇺🇸", label: "English" },
};

interface I18nState {
  lang: Lang;
  setLang: (lang: Lang) => Promise<void>;
  t: (key: MessageKey, vars?: Record<string, string | number>) => string;
  formatDate: (value: string | number | Date, opts?: Intl.DateTimeFormatOptions) => string;
  formatNumber: (n: number) => string;
}

const Ctx = createContext<I18nState>({
  lang: "es",
  setLang: async () => {},
  t: (key) => es[key] ?? key,
  formatDate: (value) => new Date(value).toLocaleDateString("es-MX"),
  formatNumber: (n) => n.toLocaleString("es-MX"),
});

const STORAGE_KEY = "kooni.lang";

function initialLang(): Lang {
  try {
    return localStorage.getItem(STORAGE_KEY) === "en" ? "en" : "es";
  } catch {
    return "es";
  }
}

function interpolate(msg: string, vars?: Record<string, string | number>): string {
  if (!vars) return msg;
  let out = msg;
  for (const [k, v] of Object.entries(vars)) {
    out = out.replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
  }
  return out;
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const { user, profile } = useAuth();
  const [lang, setLangState] = useState<Lang>(initialLang);

  // La preferencia guardada en el perfil (profiles.language) manda sobre el
  // localStorage: así el idioma te sigue entre dispositivos.
  const profileLang = profile?.language;
  useEffect(() => {
    if (profileLang === "es" || profileLang === "en") {
      setLangState(profileLang);
      try {
        localStorage.setItem(STORAGE_KEY, profileLang);
      } catch {
        /* almacenamiento bloqueado */
      }
    }
  }, [profileLang]);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  async function setLang(next: Lang) {
    setLangState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* almacenamiento bloqueado */
    }
    document.documentElement.lang = next;
    // Persistencia por usuario. Best-effort: si falla la red, la UI ya cambió.
    if (user?.id) {
      await insforge.database
        .from("profiles")
        .update({ language: next })
        .eq("id", user.id)
        .then(
          () => {},
          () => {},
        );
    }
  }

  const locale = lang === "en" ? "en-US" : "es-MX";

  const value: I18nState = {
    lang,
    setLang,
    t: (key, vars) => interpolate(DICTS[lang][key] ?? es[key] ?? key, vars),
    formatDate: (v, opts) => new Date(v).toLocaleDateString(locale, opts),
    formatNumber: (n) => n.toLocaleString(locale),
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useI18n = () => useContext(Ctx);
