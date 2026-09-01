/**
 * Pantalla de login propia del panel (§O del PLAN): página `GET /admin/login`,
 * sesión por cookie firmada y el guard `adminAuth` que acepta cookie **o**
 * Basic Auth.
 *
 * La decisión de diseño clave es "sumar, no reemplazar": Basic Auth sigue
 * intacto (lo cubren auth.test.ts y routes.test.ts sin cambios). Acá se prueba
 * solo lo nuevo.
 */
import { describe, it, expect } from "vitest";
import { adminApp } from "../../src/admin/routes";
import {
  buildSessionCookieValue,
  verifySessionCookie,
  verifyDashboardPassword,
  SESSION_COOKIE,
} from "../../src/admin/auth";
import { loginPage } from "../../src/admin/views/layout";
import type { Env } from "../../src/env";

const PASSWORD = "secret123";
const env = { DASHBOARD_PASSWORD: PASSWORD } as unknown as Env;

function req(path: string, init?: RequestInit): Request {
  return new Request(`https://bot.test${path}`, init);
}

// ── Sesión por cookie ───────────────────────────────────────────────────────

describe("cookie de sesión del panel", () => {
  it("una cookie recién emitida es válida", () => {
    expect(verifySessionCookie(env, buildSessionCookieValue(env))).toBe(true);
  });

  it("rechaza una cookie vacía / ausente", () => {
    expect(verifySessionCookie(env, "")).toBe(false);
    expect(verifySessionCookie(env, undefined)).toBe(false);
    expect(verifySessionCookie(env, null)).toBe(false);
  });

  it("rechaza una cookie con la firma manipulada", () => {
    const good = buildSessionCookieValue(env);
    const tampered = good.slice(0, good.lastIndexOf(".") + 1) + "deadbeef";
    expect(verifySessionCookie(env, tampered)).toBe(false);
  });

  it("rechaza una cookie con la expiración manipulada (extenderla rompe la firma)", () => {
    const good = buildSessionCookieValue(env);
    const sig = good.slice(good.lastIndexOf(".") + 1);
    const farFuture = Date.now() + 1000 * 60 * 60 * 24 * 3650;
    expect(verifySessionCookie(env, `${farFuture}.${sig}`)).toBe(false);
  });

  it("rechaza una cookie vencida", () => {
    const past = Date.now() - 1000;
    // Firma válida para ese expiry, pero ya pasó → igual se rechaza.
    const { createHmac } = require("node:crypto");
    const sig = createHmac("sha256", PASSWORD).update(String(past)).digest("hex");
    expect(verifySessionCookie(env, `${past}.${sig}`)).toBe(false);
  });

  it("rotar DASHBOARD_PASSWORD invalida las sesiones viejas solas", () => {
    const cookie = buildSessionCookieValue(env);
    const rotated = { DASHBOARD_PASSWORD: "nueva-clave" } as unknown as Env;
    expect(verifySessionCookie(rotated, cookie)).toBe(false);
  });

  it("rechaza basura sin separador", () => {
    expect(verifySessionCookie(env, "no-tiene-punto")).toBe(false);
    expect(verifySessionCookie(env, ".abc")).toBe(false);
  });
});

describe("verifyDashboardPassword", () => {
  it("acepta la contraseña correcta y rechaza el resto", () => {
    expect(verifyDashboardPassword(env, PASSWORD)).toBe(true);
    expect(verifyDashboardPassword(env, "otra")).toBe(false);
    expect(verifyDashboardPassword(env, "")).toBe(false);
  });
});

// ── Render de la página ─────────────────────────────────────────────────────

describe("loginPage()", () => {
  it("postea a /admin/login con un campo password y sin usuario", () => {
    const html = loginPage();
    expect(html).toContain('action="/admin/login"');
    expect(html).toContain('method="POST"');
    expect(html).toContain('name="password"');
    expect(html).not.toContain('name="email"');
    expect(html).not.toContain("/admin/auth/request");
  });

  it("muestra la marca por defecto (Kooni) y la versión del bot", () => {
    const html = loginPage();
    expect(html).toContain("Kooni");
    // La versión sale del package.json vía src/version.ts.
    expect(html).toMatch(/v\d+\.\d+\.\d+/);
  });

  it("respeta la marca blanca (BRAND_NAME) — nunca hardcodea Kooni en el título", () => {
    const html = loginPage({ env: { BRAND_NAME: "Acme Bots" } as unknown as Env });
    expect(html).toContain("Acme Bots");
    expect(html).toContain("<title>Ingresar · Acme Bots</title>");
  });

  it("muestra el nombre del negocio si está configurado, escapado", () => {
    const html = loginPage({ env: { BUSINESS_NAME: "Tienda <b>X</b>" } as unknown as Env });
    expect(html).toContain("Tienda &lt;b&gt;X&lt;/b&gt;");
  });

  it("pinta el error cuando se le pasa, escapado", () => {
    const html = loginPage({ error: 'malo <script>"' });
    expect(html).toContain("malo &lt;script&gt;&quot;");
  });

  it("todos los scripts en línea parsean como JS válido", () => {
    const html = loginPage({ env });
    const scripts = [...html.matchAll(/<script(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/g)]
      .map((m) => m[1])
      .filter((s) => s.trim());
    for (const s of scripts) expect(() => new Function(s)).not.toThrow();
  });
});

// ── Guard: cookie o Basic Auth, redirect vs 401 ─────────────────────────────

describe("adminApp — guard con sesión por cookie", () => {
  it("GET /admin/login responde 200 con la página (ruta pública)", async () => {
    const res = await adminApp.fetch(req("/login"), env);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('action="/admin/login"');
  });

  it("navegación de navegador sin credenciales → 302 a /admin/login", async () => {
    const res = await adminApp.fetch(
      req("/overview", { headers: { Accept: "text/html" } }),
      env,
    );
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe("/admin/login");
  });

  it("petición sin Accept: text/html (htmx/scripts) sin credenciales → 401", async () => {
    const res = await adminApp.fetch(req("/overview"), env);
    expect(res.status).toBe(401);
  });

  it("htmx (HX-Request) sin credenciales → 401, no redirect", async () => {
    const res = await adminApp.fetch(
      req("/overview", { headers: { Accept: "text/html", "HX-Request": "true" } }),
      env,
    );
    expect(res.status).toBe(401);
  });

  it("POST /admin/login con contraseña mala → 302 de vuelta al login con ?error=", async () => {
    const res = await adminApp.fetch(
      req("/login", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: "password=incorrecta",
      }),
      env,
    );
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toMatch(/^\/admin\/login\?error=/);
    expect(res.headers.get("Set-Cookie")).toBeNull();
  });

  it("POST /admin/login con la contraseña correcta → 302 a /overview + cookie de sesión", async () => {
    const res = await adminApp.fetch(
      req("/login", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: `password=${PASSWORD}`,
      }),
      env,
    );
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe("/admin/overview");
    const cookie = res.headers.get("Set-Cookie") ?? "";
    expect(cookie).toContain(`${SESSION_COOKIE}=`);
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Secure");
  });

  it("una cookie de sesión válida entra sin Basic Auth", async () => {
    const value = buildSessionCookieValue(env);
    const res = await adminApp.fetch(
      req("/projects", { headers: { Cookie: `${SESSION_COOKIE}=${value}` } }),
      env,
    );
    expect(res.status).toBe(200);
  });

  it("una cookie de sesión manipulada NO entra", async () => {
    const res = await adminApp.fetch(
      req("/projects", { headers: { Cookie: `${SESSION_COOKIE}=123.deadbeef` } }),
      env,
    );
    expect(res.status).toBe(401);
  });

  it("GET /admin/login con sesión viva redirige al panel", async () => {
    const value = buildSessionCookieValue(env);
    const res = await adminApp.fetch(
      req("/login", { headers: { Cookie: `${SESSION_COOKIE}=${value}` } }),
      env,
    );
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe("/admin/overview");
  });

  it("GET /admin/logout limpia la cookie y manda al login", async () => {
    const res = await adminApp.fetch(req("/logout"), env);
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe("/admin/login");
    expect(res.headers.get("Set-Cookie") ?? "").toContain(`${SESSION_COOKIE}=`);
  });
});
