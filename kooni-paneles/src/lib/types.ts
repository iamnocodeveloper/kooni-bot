export interface Profile {
  id: string;
  email: string | null;
  display_name: string | null;
  role: "cliente" | "revendedor" | "admin";
  created_at: string;
}

export interface Licencia {
  id: string;
  user_id: string;
  code: string | null;
  plan: "free" | "pro";
  kind: "lifetime" | "monthly";
  expiry: string | null;
  estado: "activa" | "revocada" | "vencida";
  modules: string[];
  limits: Record<string, number | null>;
  brand: Record<string, string>;
  bot_slug: string | null;
  inst_uid: string | null;
  notas: string | null;
  created_at: string;
  updated_at: string;
}

export interface Instalacion {
  id: string;
  user_id: string;
  licencia_id: string | null;
  uid: string | null;
  slug: string | null;
  worker_url: string | null;
  bot_name: string | null;
  tier: string | null;
  provider: string | null;
  platform: string | null;
  bot_version: string | null;
  first_seen: string;
  last_seen: string;
  created_at: string;
}

export interface Uso {
  id: string;
  instalacion_id: string;
  fecha: string;
  conteos: {
    conversaciones30?: number;
    mensajes30?: number;
    mensajesBot30?: number;
    leads30?: number;
    contactos?: number;
  };
  costos: { ia30?: number; iaHoy?: number };
}

export interface Modulo {
  id: string;
  nombre: string;
  descripcion: string | null;
  tipo: "pago_unico" | "membresia";
  tab: string | null;
  orden: number;
  activo: boolean;
}

export interface CliToken {
  id: string;
  label: string | null;
  last_used_at: string | null;
  created_at: string;
}

export interface Novedad {
  id: string;
  fecha: string;
  origen: "kooni" | "kooni+";
  tipo: "nuevo" | "mejora" | "arreglo";
  version: string | null;
  titulo: string;
  cuerpo: string | null;
  cta_label: string | null;
  cta_url: string | null;
  update_hint: string | null;
  visible: boolean;
  created_at: string;
}
