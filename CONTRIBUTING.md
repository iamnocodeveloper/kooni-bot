# Cómo contribuir — Kooni Bot

¡Gracias por mejorar la plantilla Kooni! (Uso interno — MIT.) Si tú
encuentras o arreglas algo, el proyecto completo se beneficia.

## ¿Encontraste un bug o tienes una idea? → Abre un Issue
**No necesitas saber programar.** Ve a la pestaña **Issues → New issue**, elige
"🐛 Reportar un problema" o "💡 Proponer una idea", y llena las casillas. Con eso ya
ayudas un montón.

> 💡 Si usas Claude Code, antes de reportar puedes pedirle
> "diagnostica mi bot" — a veces te dice qué es al instante.

## ¿Quieres mandar un arreglo? → Pull Request (vía fork)
1. Dale **Fork** a este repo (botón arriba a la derecha).
2. En tu fork, crea una rama y haz tu cambio. Si usas Claude Code, pídele que lo haga y que
   corra `pnpm test` + `pnpm typecheck` antes.
3. Abre un **Pull Request** hacia `main` de este repo, explicando **qué cambia y por qué**.
4. En la descripción del PR, incluí la línea **`Acepto el CLA.md (v1.0).`** (ver abajo).
5. El CI corre los tests solo. Un maintainer lo revisa y lo mergea. (Tú no mergeas directo —
   así protegemos la plantilla de todos.)

### CLA — Acuerdo de Licencia de Contribuyente
Antes de mergear un PR necesitamos que aceptes el [`CLA.md`](./CLA.md). Es corto:
seguís siendo dueño de tu código, pero le das al proyecto una licencia amplia que
**incluye poder relicenciarlo más adelante** (por ejemplo, para separar lo
comercial). Sin esto, cambiar la licencia del proyecto exigiría el permiso de
cada persona que haya contribuido — por eso se pide desde el primer PR.

Para aceptar: poné `Acepto el CLA.md (v1.0).` en la descripción del PR.

### Reglas
- **No toques `member/`** (es la config de cada quien). Cambios solo en `src/`, `test/`,
  `skill/` o documentación.
- **Un PR = un solo tema.** Enfocado y chico = se revisa y mergea más rápido.
- Si tu **agente** abrió el PR, **revisa el diff tú mismo** antes — tú eres responsable.
- **Nada de secrets ni API keys** en el código (van como `wrangler secret`).
- **Marca:** el código es MIT; el nombre "Kooni", el logo y el dominio **no** — ver
  [`NOTICE.md`](./NOTICE.md).

## Dudas rápidas
Para uso interno: documenta decisiones en `docs/`. Los issues (si usas GitHub) son para bugs
e ideas sobre la plantilla.
