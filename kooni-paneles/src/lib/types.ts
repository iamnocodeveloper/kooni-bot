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
  incluida: boolean;
  requiere: string | null;
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

export interface Colaborador {
  id: string;
  owner_id: string;
  user_id: string | null;
  email: string;
  nombre: string | null;
  puede_editar: boolean;
  estado: "invitado" | "activo" | "revocado";
  token: string;
  created_at: string;
  accepted_at: string | null;
}

export interface Plan {
  id: string;
  nombre: string;
  precio: number | null;
  moneda: string;
  precio_nota: string | null;
  etapa: string | null;
  badge: string | null;
  descripcion: string | null;
  incluye: string[];
  modulos: string[];
  orden: number;
  activo: boolean;
}

export interface Pago {
  id: string;
  user_id: string | null;
  licencia_id: string | null;
  provider: string;
  amount: number | null;
  currency: string;
  status: "pendiente" | "pagado" | "fallido" | "reembolsado";
  external_id: string | null;
  plan_id: string | null;
  checkout_ref: string | null;
  created_at: string;
}

export interface ProveedorPago {
  id: string;
  nombre: string;
  modo?: string;
  activo?: boolean;
  listo: boolean;
  faltan: string[];
  widget?: { token: string; storeId: string };
  manual?: { pay_id: string; instructions: string };
}

export interface ProveedorConfig {
  id: string;
  nombre: string;
  activo: boolean;
  modo: "test" | "live";
  config: Record<string, string>;
  orden: number;
}

export interface Dominio {
  id: string;
  instalacion_id: string | null;
  user_id: string;
  hostname: string;
  estado: "pendiente" | "activo" | "error";
  created_at: string;
}

export interface IaProveedor {
  id: string;
  nombre: string;
  incluido: boolean;
  activo: boolean;
  modelos: string[];
  orden: number;
}

export interface Comando {
  id: string;
  tipo: "terminal" | "agente";
  comando: string;
  descripcion: string | null;
  requiere_pro: boolean;
  version: string | null;
  activo: boolean;
  orden: number;
}

export interface Integracion {
  id: string;
  tipo: "canal" | "app";
  nombre: string;
  proveedor: string | null;
  requiere: string | null;
  activo: boolean;
  orden: number;
}

export interface Pack {
  id: string;
  nombre: string;
  emoji: string | null;
  descripcion: string | null;
  playbook: string | null;
  version: string | null;
  activo: boolean;
  orden: number;
}

export interface Faq {
  id: string;
  pregunta: string;
  respuesta: string;
  orden: number;
  activo: boolean;
}

export interface SoporteMensaje {
  id: string;
  user_id: string | null;
  email: string | null;
  asunto: string;
  mensaje: string;
  estado: "nuevo" | "leido" | "respondido";
  created_at: string;
}

export interface ConfigItem {
  clave: string;
  valor: string | null;
  descripcion: string | null;
}
