# Terceros — entrega D: lo que los revisores piden para poder entrar y leer

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** que el revisor de Meta pueda entrar al panel sin leer nuestro correo, y que la privacidad y la landing digan lo que Google exige leer antes de verificar el OAuth.

**Architecture:** una puerta en `pedir()` (`src/lib/usuarios.ts`): si el correo es el de revisión (`REVISION_CORREO`) y hay `REVISION_CODIGO`, se guarda el hash de ese código fijo en vez de uno aleatorio y no se manda nada; `canjear()` no cambia. Dos frases en `/privacidad` (Google API Services User Data Policy, Limited Use, qué se guarda de YouTube y cómo revocar) y una en la landing que nombre a YouTube.

**Tech Stack:** Next.js, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-30-terceros-codigo-design.md`, §4b (añadido con esta entrega). Los guiones que lo piden: `docs/meta-revision-guion.md` («Lo que Meta necesita para probar la app por su cuenta») y `docs/google-verificacion-guion.md` («La página principal…», «La política de privacidad…»).

## Restricciones globales

- **La puerta solo existe con las dos variables puestas**, y solo para ese correo normalizado; sin ellas, `pedir()` es idéntico a hoy. `REVISION_CODIGO` tiene que ser seis dígitos; si no, se ignora con un `console.warn` de una línea.
- **Las frases de error existentes no se tocan.** No hay frase nueva: el revisor recibe `CODIGO_ENVIADO` como cualquiera.
- **Las rutas no cambian.** Ninguna consulta nueva a la base.
- **Comentarios en español; código en inglés y en llano.**
- **TDD** en `pedir()`; un commit por tarea con el pie de autoría del repositorio; documentación con la tarea (`.env.example`, tabla de variables del README, sección de Meta del README).
- **La suite pasa, typecheck, lint y build limpios.**

---

### Tarea 1: El código fijo de revisión

**Files:**
- Modify: `src/lib/usuarios.ts` (`pedir`, líneas ~215–257), `src/lib/usuarios.test.ts`
- Modify: `.env.example`, `README.md`

**Interfaces:**
- Consumes: `env` (`@/lib/env`), `normalizarCorreo`, `hashCodigo`, `claveCodigos` (ya en el archivo).
- Produces: `codigoDeRevision(correo: string): string | null` (pura, exportada, en `src/lib/ingreso.ts`): el código fijo si `REVISION_CORREO` normalizado coincide con `correo` y `REVISION_CODIGO` son seis dígitos; `null` en cualquier otro caso.

- [ ] **Step 1: El test que falla**

En `src/lib/ingreso.test.ts` (existe; molde de los tests de `codigoCoincide`), con `vi.stubEnv`:

```ts
describe('codigoDeRevision', () => {
  afterEach(() => vi.unstubAllEnvs())
  it('sin variables no hay código de revisión', () => {
    expect(codigoDeRevision('revision@tu-parrilla.cl')).toBeNull()
  })
  it('con las dos variables, solo ese correo (normalizado) recibe el código fijo', () => {
    vi.stubEnv('REVISION_CORREO', 'Revision@Tu-Parrilla.cl')
    vi.stubEnv('REVISION_CODIGO', '123456')
    expect(codigoDeRevision('revision@tu-parrilla.cl')).toBe('123456')
    expect(codigoDeRevision('otra@tu-parrilla.cl')).toBeNull()
  })
  it('un código que no son seis dígitos se ignora', () => {
    vi.stubEnv('REVISION_CORREO', 'revision@tu-parrilla.cl')
    vi.stubEnv('REVISION_CODIGO', 'abc')
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(codigoDeRevision('revision@tu-parrilla.cl')).toBeNull()
    vi.restoreAllMocks()
  })
})
```

Y en `src/lib/usuarios.test.ts` (molde del test de `pedir`, que dobla la base y Resend): con las variables puestas y el correo de revisión, `pedir()` guarda el hash de `'123456'` (comprobar con `codigoCoincide('123456', hash, clave)`) y **no** llama al envío; con otro correo, sigue mandando.

- [ ] **Step 2: Correr y verlo fallar**

- [ ] **Step 3: La función y la puerta**

En `ingreso.ts`:

```ts
/**
 * El revisor de Meta tiene que poder entrar sin leer nuestro correo: para un solo correo,
 * mientras estén puestas las dos variables, el código que vale es fijo y no se manda nada.
 * Se quita el día que la app pase a Live. Sin variables, esto no existe.
 */
export function codigoDeRevision(correo: string): string | null {
  const revision = env('REVISION_CORREO')
  const codigo = env('REVISION_CODIGO')
  if (!revision || !codigo) return null
  if (normalizarCorreo(revision) !== correo) return null
  if (!/^\d{6}$/.test(codigo)) {
    console.warn('REVISION_CODIGO tiene que ser de seis dígitos; se ignora.')
    return null
  }
  return codigo
}
```

(`env` viene de `@/lib/env`; comprueba que `ingreso.ts` pueda importarlo sin `server-only` — es un módulo puro.) En `usuarios.ts`, donde hoy `const codigo = generarCodigo()`: `const fijo = codigoDeRevision(correo); const codigo = fijo ?? generarCodigo()`, y el envío del correo solo si `fijo === null`. El cupo de `puedePedir` y la vigencia siguen aplicando igual (el revisor puede pedir el código las veces que el cupo permita; siempre es el mismo).

- [ ] **Step 4: Verificar, documentar y commitear**

Run: `npx vitest run`, `npm run typecheck`, `npm run lint`, `npm run build`. A mano (`next dev -p 3001`, `.env.local` con las dos variables y un usuario invitado con ese correo): entrar con el código fijo; quitar las variables al terminar. Documentación: `.env.example` (las dos variables con un comentario de tres líneas: para qué, que se quitan al pasar a Live); README tabla de variables (dos filas, «No — solo durante el App Review de Meta»); README sección de Meta, junto a «modo desarrollo»: cómo darle acceso al revisor (Los Maestros + estas variables) y el enlace a `docs/meta-revision-guion.md`.

```bash
git add src/lib/ingreso.ts src/lib/ingreso.test.ts src/lib/usuarios.ts src/lib/usuarios.test.ts .env.example README.md
git commit -m "Un código fijo de ingreso para el revisor de Meta, mientras dure el App Review"
```

---

### Tarea 2: Lo que Google lee antes de verificar

**Files:**
- Modify: `src/app/(legal)/privacidad/page.tsx`, `src/components/landing.tsx`

- [ ] **Step 1: La privacidad nombra a Google**

En `/privacidad`, en la sección que habla de las redes conectadas (busca «YouTube» en el archivo), un párrafo nuevo con el tono de los vecinos: el uso que hace Tu Parrilla de la información recibida de las APIs de Google se ajusta a la **Google API Services User Data Policy**, incluidos los requisitos de **Limited Use** (enlace a `https://developers.google.com/terms/api-services-user-data-policy`); de YouTube se guardan el id, el título, la miniatura y los contadores de **tus** videos y los comentarios de esos videos; se refrescan a diario y se borran al desconectar (credenciales) o a petición; y se puede revocar desde Los Fierros o desde `https://myaccount.google.com/permissions`.

- [ ] **Step 2: La landing nombra a YouTube**

En `src/components/landing.tsx`, donde describe qué hace el producto (línea ~124, «Un programador de posts…»), una frase que nombre las redes con YouTube incluido: «Conecta Instagram, Facebook, TikTok y tu canal de YouTube: programas, lees y respondes comentarios, y solo se toca lo tuyo». Sin cambiar el diseño.

- [ ] **Step 3: Verificar y commitear**

Run: `npx vitest run`, `npm run typecheck`, `npm run lint`, `npm run build`. A mano: `/privacidad` y la landing en `next dev -p 3001`. Documentación: nada más (son las páginas mismas); `docs/google-verificacion-guion.md` ya las da por hechas: comprueba que sus frases coincidan.

```bash
git add "src/app/(legal)/privacidad/page.tsx" src/components/landing.tsx
git commit -m "La privacidad nombra la política de datos de Google y la landing nombra a YouTube"
```

---

## Lo que ningún test comprueba

Que Meta y Google acepten los textos: se sabe al mandar cada trámite.
