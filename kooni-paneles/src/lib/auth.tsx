import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { insforge } from "./insforge";
import type { Profile } from "./types";

interface AuthState {
  user: { id: string; email?: string } | null;
  profile: Profile | null;
  loading: boolean;
  isAdmin: boolean;
  refresh: () => Promise<void>;
}

const Ctx = createContext<AuthState>({
  user: null,
  profile: null,
  loading: true,
  isAdmin: false,
  refresh: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<{ id: string; email?: string } | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const { data } = await insforge.auth.getCurrentUser();
      const u = (data as any)?.user ?? null;
      setUser(u);
      if (u) {
        await insforge.database.rpc("ensure_profile", { p_email: u.email ?? null, p_name: null }).catch(() => {});
        const { data: p } = await insforge.database.from("profiles").select("*").eq("id", u.id).maybeSingle();
        setProfile((p as Profile) ?? null);
      } else {
        setProfile(null);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  return (
    <Ctx.Provider value={{ user, profile, loading, isAdmin: profile?.role === "admin", refresh: load }}>
      {children}
    </Ctx.Provider>
  );
}

export const useAuth = () => useContext(Ctx);
