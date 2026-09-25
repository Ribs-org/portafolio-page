# Varias cuentas por red — Plan de implementación

> **Para quien ejecute esto:** SUB-SKILL REQUERIDA: usar `superpowers:subagent-driven-development` (recomendada) o `superpowers:executing-plans` para implementar tarea por tarea. Los pasos usan casillas (`- [ ]`) para ir marcando.

**Objetivo:** Que un dueño con varias cuentas de la misma red elija a cuáles sale cada publicación, en vez de que el sistema mande siempre a la más antigua sin avisar.

**Arquitectura:** Se invierte el sentido de la pieza central: de «elígeme una cuenta para esta red» a «verifícame estas cuentas». El compositor, el editor, la API de carga masiva y la app pasan a hablar en identificadores de cuenta; la base de datos no cambia, porque los destinos ya guardan la cuenta.

**Stack:** Next.js App Router, Drizzle sobre `postgres-js`, Vitest, Expo/React Native en `mobile/`.

**Spec:** `docs/superpowers/specs/2026-09-24-varias-cuentas-por-red-design.md`

## Restricciones globales

- **El sistema nunca elige entre dos. Una sola posibilidad no es una elección.** De aquí sale cada decisión; ante una duda no escrita, resolver por este principio.
- **Los comentarios y el texto de cara al usuario van en español.** El código y los nombres de símbolos siguen el estilo del archivo que se toca (`sync.ts` y `schema.ts` están comentados en inglés; respetarlo).
- **Esta entrega no trae migraciones.** `scheduled_post_targets` ya guarda `account_id` con unicidad `(post_id, account_id)`. Si algo parece necesitar una migración, es señal de que el diseño se entendió mal: parar y preguntar.
- **La verificación de pertenencia corre antes de escribir nada.** Los identificadores llegan del navegador o del teléfono.
- **`primariaDe` (`src/lib/social/cuenta.ts`) NO se borra.** Su llamador en `sync.ts` decide qué cuenta hereda la etiqueta de campaña, que es otro asunto.
- **TDD:** primero el test que falla, después el código mínimo.
- **Un commit por tarea**, con el pie de autoría que usa el repositorio.
- **Los tests corren sin `DATABASE_URL`.** Ninguno puede necesitar una base real.
- **El árbol compila y la suite pasa al final de cada tarea.** El orden está elegido para eso: lo viejo se borra en la Tarea 8, cuando ya no le queda ningún llamador.

## Estructura de archivos

| Archivo | Responsabilidad |
|---|---|
| `src/lib/social/cuentas.ts` | **el corazón.** Gana `verificarCuentas` y `cuentaUnicaPorRed`; pierde `cuentasPrimarias` y `exigirCuentas` en la Tarea 8. |
| `src/lib/social/cuentas.test.ts` | **nuevo.** Lo puro de los mensajes y de la forma; lo que toca base va por el arnés de aislamiento. |
| `src/lib/social/publish/opciones.ts` | Las opciones se llavean por cuenta, no por red. |
| `src/lib/social/publish/crear.ts` | Recibe cuentas verificadas en vez de nombres de red. |
| `src/lib/social/publish/edit.ts` | `diffTargets` compara por cuenta. |
| `src/app/admin/actions.ts` | Las dos acciones de programar, y `leerCreadorTikTok` por cuenta. |
| `src/app/admin/(dash)/schedule/composer.tsx` | Lista cuentas en vez de redes. |
| `src/app/admin/(dash)/schedule/[id]/editor.tsx` | Muestra y quita destinos por cuenta. |
| `src/app/admin/(dash)/schedule/{calendar,queue,etiqueta}.tsx/.ts` | Muestran el handle. |
| `src/app/api/schedule/batch/route.ts`, `src/lib/social/publish/batch.ts` | Aceptan `cuentas`; `redes` solo cuando es inequívoco. |
| `src/app/api/mobile/schedule/accounts/route.ts` | **nuevo.** Las cuentas publicables del usuario, para la app. |
| `mobile/src/app/(tabs)/publicar.tsx` | Elige cuentas. |

---

### Tarea 1: Verificar cuentas, y resolver una red solo cuando es inequívoca

**Files:**
- Modify: `src/lib/social/cuentas.ts`
- Create: `src/lib/social/cuentas.test.ts`
- Test: `src/lib/aislamiento.test.ts` (caso nuevo, no se borra ninguno)

**Interfaces:**
- Produces:
  - `type CuentaDestino = { id: string; network: string; handle: string | null }`
  - `class CuentaInvalida extends Error`
  - `CUENTA_AJENA: string`
  - `CUENTA_DESCONECTADA(handle: string | null, network: string): string`
  - `RED_AMBIGUA(network: string, handles: Array<string | null>): string`
  - `verificarCuentas(ownerId: string, accountIds: string[]): Promise<CuentaDestino[]>`
  - `cuentaUnicaPorRed(ownerId: string, networks: string[]): Promise<Map<string, CuentaDestino>>`
- Consumes: `SinCuenta` y `SIN_CUENTA`, que ya existen y se conservan.

**No se borra nada en esta tarea.** `cuentasPrimarias` y `exigirCuentas` siguen ahí, con sus llamadores intactos: el árbol tiene que seguir compilando.

- [ ] **Step 1: Escribir los tests que fallan, de lo puro**

En `src/lib/social/cuentas.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const { CUENTA_AJENA, CUENTA_DESCONECTADA, RED_AMBIGUA } = await import('./cuentas')

describe('los mensajes nombran lo que hay que arreglar', () => {
  it('una cuenta ajena no revela si existe', () => {
    // Mismo texto para «no es tuya» y «no existe»: distinguirlos dejaría averiguar
    // qué identificadores son reales probando de a uno.
    expect(CUENTA_AJENA).toMatch(/no es tuya/i)
  })

  it('una cuenta desconectada se nombra por su handle', () => {
    expect(CUENTA_DESCONECTADA('@vicente', 'instagram')).toContain('@vicente')
  })

  it('una cuenta desconectada sin handle cae en la red', () => {
    expect(CUENTA_DESCONECTADA(null, 'instagram')).toContain('instagram')
  })

  it('una red ambigua lista las candidatas', () => {
    const frase = RED_AMBIGUA('instagram', ['@vicente', '@vicenteclips'])
    expect(frase).toContain('@vicente')
    expect(frase).toContain('@vicenteclips')
    expect(frase).toMatch(/2/)
  })
})
```

- [ ] **Step 2: Correr y verlos fallar**

Run: `npx vitest run src/lib/social/cuentas.test.ts`
Expected: FAIL, «does not provide an export named 'CUENTA_AJENA'».

- [ ] **Step 3: Escribir los mensajes y los tipos**

En `src/lib/social/cuentas.ts`, junto a `SinCuenta`:

```ts
/** Una cuenta elegida como destino, ya verificada. */
export type CuentaDestino = { id: string; network: string; handle: string | null }

/** Lo que no se puede usar como destino: ajena, inexistente o sin credencial. */
export class CuentaInvalida extends Error {}

// Un identificador que no es del dueño y uno que no existe dan la misma frase: si se
// distinguieran, probando identificadores se podría averiguar cuáles son reales.
export const CUENTA_AJENA = 'Una de las cuentas elegidas no es tuya.'

export function CUENTA_DESCONECTADA(handle: string | null, network: string): string {
  return `La cuenta ${handle ?? network} no está conectada. Vuelve a conectarla en Cuentas.`
}

export function RED_AMBIGUA(network: string, handles: Array<string | null>): string {
  const lista = handles.map((h) => h ?? 'sin nombre').join(', ')
  return `Tienes ${handles.length} cuentas de ${network} (${lista}). Elige cuál con «cuentas».`
}
```

- [ ] **Step 4: Correr y verlos pasar**

Run: `npx vitest run src/lib/social/cuentas.test.ts`
Expected: PASS (4 casos).

- [ ] **Step 5: Escribir el test de aislamiento que falla**

En `src/lib/aislamiento.test.ts`, dentro del `describe` de lecturas, **sin tocar ningún caso existente**:

```ts
it('social/cuentas: verificarCuentas ata la consulta al dueño', async () => {
  const { verificarCuentas } = await import('./social/cuentas')
  const consultas = await todasLasConsultas(() => verificarCuentas(DUENO, ['cuenta-1']))
  expect(consultas).toHaveLength(1)
  esperarFiltradoPorDueno(consultas[0]!)
})
```

- [ ] **Step 6: Correr y verlo fallar**

Run: `npx vitest run src/lib/aislamiento.test.ts`
Expected: FAIL, `verificarCuentas` no existe.

- [ ] **Step 7: Escribir `verificarCuentas`**

En `src/lib/social/cuentas.ts`:

```ts
/**
 * Las cuentas elegidas, verificadas: todas del dueño y todas conectadas. Devuelve en el
 * orden pedido, sin repetir.
 *
 * Es la inversa de la vieja `cuentasPrimarias`: no elige por nadie, comprueba lo que le
 * dieron. Los identificadores llegan del navegador o del teléfono, así que la pertenencia
 * es una comprobación de seguridad, no una cortesía — sin ella se podría programar una
 * publicación en la cuenta de otro mandando su identificador.
 */
export async function verificarCuentas(ownerId: string, accountIds: string[]): Promise<CuentaDestino[]> {
  const unicos = [...new Set(accountIds)]
  if (unicos.length === 0) return []
  const filas = await getDb()
    .select({
      id: socialAccounts.id,
      network: socialAccounts.network,
      handle: socialAccounts.handle,
      accessToken: socialAccounts.accessToken,
    })
    .from(socialAccounts)
    .where(and(inArray(socialAccounts.id, unicos), eq(socialAccounts.ownerId, ownerId)))
  const porId = new Map(filas.map((f) => [f.id, f]))
  return unicos.map((id) => {
    const fila = porId.get(id)
    if (!fila) throw new CuentaInvalida(CUENTA_AJENA)
    if (!fila.accessToken) throw new CuentaInvalida(CUENTA_DESCONECTADA(fila.handle, fila.network))
    return { id: fila.id, network: fila.network, handle: fila.handle }
  })
}
```

- [ ] **Step 8: Correr el aislamiento y verlo pasar**

Run: `npx vitest run src/lib/aislamiento.test.ts`
Expected: PASS, y los casos que ya estaban siguen verdes.

- [ ] **Step 9: Escribir `cuentaUnicaPorRed`**

En `src/lib/social/cuentas.ts`. Es la regla del principio global aplicada a quien todavía habla en redes: la API de carga masiva y la app.

```ts
/**
 * Red → su cuenta, **solo cuando la respuesta es inequívoca**. Con dos cuentas en una red
 * no adivina: lanza nombrando las candidatas.
 *
 * Mismo criterio que `planBackfill` en `./cuenta`, por la misma razón: elegir por alguien
 * entre dos cuentas suyas manda su publicación a un sitio que no pidió.
 */
export async function cuentaUnicaPorRed(
  ownerId: string,
  networks: string[],
): Promise<Map<string, CuentaDestino>> {
  const pedidas = [...new Set(networks)]
  if (pedidas.length === 0) return new Map()
  const filas = await getDb()
    .select({ id: socialAccounts.id, network: socialAccounts.network, handle: socialAccounts.handle })
    .from(socialAccounts)
    .where(
      and(
        inArray(socialAccounts.network, pedidas),
        isNotNull(socialAccounts.accessToken),
        eq(socialAccounts.ownerId, ownerId),
      ),
    )
    .orderBy(asc(socialAccounts.createdAt))
  const porRed = agruparPorRed(filas)
  const resultado = new Map<string, CuentaDestino>()
  for (const network of pedidas) {
    const cuentas = porRed.get(network) ?? []
    if (cuentas.length === 0) throw new SinCuenta(network)
    if (cuentas.length > 1) throw new CuentaInvalida(RED_AMBIGUA(network, cuentas.map((c) => c.handle)))
    const c = cuentas[0]!
    resultado.set(network, { id: c.id, network: c.network, handle: c.handle })
  }
  return resultado
}
```

- [ ] **Step 10: Agregar su test de aislamiento**

En `src/lib/aislamiento.test.ts`:

```ts
it('social/cuentas: cuentaUnicaPorRed ata la consulta al dueño', async () => {
  const { cuentaUnicaPorRed } = await import('./social/cuentas')
  const consultas = await todasLasConsultas(() => cuentaUnicaPorRed(DUENO, ['instagram']))
  expect(consultas).toHaveLength(1)
  esperarFiltradoPorDueno(consultas[0]!)
})
```

- [ ] **Step 11: Correr todo**

Run: `npx vitest run` y `npm run typecheck`
Expected: todo verde; nada de lo viejo se tocó.

- [ ] **Step 12: Commit**

```bash
git add src/lib/social/cuentas.ts src/lib/social/cuentas.test.ts src/lib/aislamiento.test.ts
git commit
```

Mensaje: que la pieza central pasa de elegir a verificar, y por qué la pertenencia es seguridad y no cortesía.

---

### Tarea 2: Las opciones y el creador de TikTok, por cuenta

**Files:**
- Modify: `src/lib/social/publish/opciones.ts`
- Modify: `src/app/admin/actions.ts` (`leerCreadorTikTok`)
- Test: `src/lib/social/publish/opciones.test.ts` (existente; si no existe, crearlo)

**Interfaces:**
- Consumes: `CuentaDestino` de la Tarea 1.
- Produces:
  - `validarOpcionesPorCuenta(cuentas: CuentaDestino[], raw: Record<string, unknown>): { opciones: Record<string, OpcionesDestino> } | { error: string }` — las claves de `raw` y del resultado son **identificadores de cuenta**.
  - `opcionesDesdeFormulario(formData: FormData, cuentas: CuentaDestino[]): Record<string, unknown>` — lee campos con sufijo por cuenta.
  - `leerCreadorTikTok(accountId: string): Promise<{ creador: CreadorTikTok } | { error: string }>`

- [ ] **Step 1: Escribir los tests que fallan**

```ts
it('valida las opciones de cada cuenta por separado', () => {
  const cuentas = [
    { id: 'tt-1', network: 'tiktok', handle: '@vicente' },
    { id: 'tt-2', network: 'tiktok', handle: '@vicenteclips' },
  ]
  const raw = {
    'tt-1': { modo: 'directo', privacidad: 'PUBLIC_TO_EVERYONE', comentarios: true, duo: false, pegar: false, comercial: 'no' },
    'tt-2': { modo: 'borrador' },
  }
  const check = validarOpcionesPorCuenta(cuentas, raw)
  expect('error' in check).toBe(false)
  if ('error' in check) return
  expect(Object.keys(check.opciones).sort()).toEqual(['tt-1', 'tt-2'])
})

it('una cuenta de TikTok sin privacidad falla nombrando su frase', () => {
  const cuentas = [{ id: 'tt-1', network: 'tiktok', handle: '@vicente' }]
  const check = validarOpcionesPorCuenta(cuentas, { 'tt-1': { modo: 'directo', privacidad: '' } })
  expect(check).toEqual({ error: TIKTOK_SIN_PRIVACIDAD })
})

it('el formulario lee los campos con el sufijo de cada cuenta', () => {
  const fd = new FormData()
  fd.set('tiktokModo:tt-1', 'borrador')
  fd.set('tiktokModo:tt-2', 'directo')
  fd.set('tiktokPrivacidad:tt-2', 'SELF_ONLY')
  const cuentas = [
    { id: 'tt-1', network: 'tiktok', handle: '@a' },
    { id: 'tt-2', network: 'tiktok', handle: '@b' },
  ]
  const raw = opcionesDesdeFormulario(fd, cuentas)
  expect(raw['tt-1']).toEqual({ modo: 'borrador' })
  expect((raw['tt-2'] as Record<string, unknown>).privacidad).toBe('SELF_ONLY')
})
```

- [ ] **Step 2: Correr y verlos fallar**

Run: `npx vitest run src/lib/social/publish/opciones.test.ts`
Expected: FAIL, `validarOpcionesPorCuenta` no existe.

- [ ] **Step 3: Implementar las dos funciones**

En `src/lib/social/publish/opciones.ts`, **junto a** `validarOpcionesPorRed`, que se conserva hasta la Tarea 8 porque `batch.ts` todavía la usa:

```ts
/**
 * Para una fila entera: un objeto por cuenta elegida, solo con las que tienen opciones.
 *
 * Por cuenta y no por red: la API de TikTok consulta `creator_info` por creador, y las
 * privacidades permitidas pueden diferir entre dos cuentas del mismo dueño. Compartirlas
 * dejaría mandar a una cuenta una privacidad que no admite, y eso se descubre publicando.
 */
export function validarOpcionesPorCuenta(
  cuentas: Array<{ id: string; network: string }>,
  raw: Record<string, unknown>,
): { opciones: Record<string, OpcionesDestino> } | { error: string } {
  const opciones: Record<string, OpcionesDestino> = {}
  for (const cuenta of cuentas) {
    const check = validarOpciones(cuenta.network, raw[cuenta.id])
    if ('error' in check) return check
    if (check.opciones) opciones[cuenta.id] = check.opciones
  }
  return { opciones }
}

/**
 * Lo que el compositor manda, tal cual, listo para `validarOpcionesPorCuenta`. Los campos
 * de TikTok llevan el identificador de la cuenta como sufijo (`tiktokModo:<id>`) porque
 * puede haber dos bloques en el mismo formulario.
 */
export function opcionesDesdeFormulario(
  formData: FormData,
  cuentas: Array<{ id: string; network: string }>,
): Record<string, unknown> {
  const raw: Record<string, unknown> = {}
  for (const cuenta of cuentas) {
    if (cuenta.network !== 'tiktok') continue
    const modo = String(formData.get(`tiktokModo:${cuenta.id}`) ?? 'directo')
    raw[cuenta.id] =
      modo === 'borrador'
        ? { modo: 'borrador' }
        : {
            modo: 'directo',
            privacidad: String(formData.get(`tiktokPrivacidad:${cuenta.id}`) ?? ''),
            comentarios: formData.get(`tiktokComentarios:${cuenta.id}`) === 'on',
            duo: formData.get(`tiktokDuo:${cuenta.id}`) === 'on',
            pegar: formData.get(`tiktokPegar:${cuenta.id}`) === 'on',
            comercial: String(formData.get(`tiktokComercial:${cuenta.id}`) ?? 'no'),
          }
  }
  return raw
}
```

La firma de `opcionesDesdeFormulario` cambia. Su único llamador es `createScheduledPost`, que se adapta en la Tarea 3; para que el árbol compile ahora, **ajustar ahí la llamada** pasando `[]` temporalmente no sirve —cambiaría el comportamiento—. En su lugar, en esta tarea se adapta también la llamada de `createScheduledPost` para que derive las cuentas de los nombres de red con `cuentaUnicaPorRed`, que es exactamente el comportamiento de hoy mientras haya una sola cuenta por red. La Tarea 3 lo reemplaza por las cuentas elegidas.

- [ ] **Step 4: Adaptar `createScheduledPost` al puente temporal**

En `src/app/admin/actions.ts`, reemplazar:

```ts
const opcionesCheck = validarOpcionesPorRed(networks, opcionesDesdeFormulario(formData, networks))
if ('error' in opcionesCheck) return { error: opcionesCheck.error }
```

por:

```ts
// Puente: el compositor todavía manda redes. La Tarea 3 le hace mandar cuentas y esto
// pasa a recibirlas directas. `cuentaUnicaPorRed` reproduce el comportamiento de hoy
// mientras haya una sola cuenta por red, y falla nombrando las candidatas cuando no.
let cuentasElegidas: CuentaDestino[]
try {
  cuentasElegidas = [...(await cuentaUnicaPorRed(ownerId, networks)).values()]
} catch (error) {
  if (error instanceof SinCuenta || error instanceof CuentaInvalida) return { error: error.message }
  throw error
}
const opcionesCheck = validarOpcionesPorCuenta(
  cuentasElegidas,
  opcionesDesdeFormulario(formData, cuentasElegidas),
)
if ('error' in opcionesCheck) return { error: opcionesCheck.error }
```

Y los campos del formulario de TikTok en el compositor pasan a llevar el sufijo. Como en esta tarea el compositor todavía no conoce las cuentas, **el bloque de TikTok se mueve a la Tarea 3 junto con el resto**: aquí basta con que `opcionesDesdeFormulario` no encuentre los campos y la validación responda con `TIKTOK_SIN_PRIVACIDAD`, que es un fallo ruidoso y no silencioso. La Tarea 3 lo cierra.

> **Nota para quien revise:** este puente deja el compositor con TikTok roto entre la Tarea 2 y la Tarea 3. Es deliberado y dura un commit. Si te incomoda, la alternativa es fusionar las Tareas 2 y 3, y es defendible.

- [ ] **Step 5: `leerCreadorTikTok` recibe la cuenta**

```ts
/**
 * Lo que el bloque de TikTok del compositor necesita al abrirse: nombre, avatar y qué
 * privacidades puede elegir el dueño hoy. Por la cuenta que se le pide, no por «la»
 * cuenta de TikTok: con dos conectadas, las privacidades permitidas pueden diferir.
 */
export async function leerCreadorTikTok(accountId: string): Promise<{ creador: CreadorTikTok } | { error: string }> {
  const { id: ownerId } = await requireUser()
  const [account] = await getDb()
    .select()
    .from(socialAccounts)
    .where(and(eq(socialAccounts.id, accountId), eq(socialAccounts.ownerId, ownerId)))
  const token = account ? await tiktokConnector.ensureCredential(account) : null
  if (!token) return { error: TIKTOK_SIN_CUENTA }
  return consultarCreador(token)
}
```

Su llamador en `src/app/admin/(dash)/schedule/tiktok-opciones.tsx` se adapta en la Tarea 3.

- [ ] **Step 6: Correr todo**

Run: `npx vitest run`, `npm run typecheck`, `npm run lint`
Expected: verde.

- [ ] **Step 7: Commit**

```bash
git add src/lib/social/publish/opciones.ts src/lib/social/publish/opciones.test.ts src/app/admin/actions.ts
git commit
```

---

### Tarea 3: Crear un post eligiendo cuentas

**Files:**
- Modify: `src/lib/social/publish/crear.ts`
- Modify: `src/app/admin/actions.ts` (`createScheduledPost`)
- Modify: `src/app/admin/(dash)/schedule/composer.tsx`
- Modify: `src/app/admin/(dash)/schedule/tiktok-opciones.tsx`
- Modify: `src/app/admin/(dash)/schedule/page.tsx` (pasa las cuentas al compositor)
- Test: `src/lib/social/publish/crear.test.ts` (crear si no existe)

**Interfaces:**
- Consumes: `verificarCuentas`, `CuentaDestino`, `CuentaInvalida` (Tarea 1); `validarOpcionesPorCuenta`, `opcionesDesdeFormulario`, `leerCreadorTikTok(accountId)` (Tarea 2); `getCuentas(ownerId)` de `src/lib/posts.ts`, que ya devuelve `{ id, network, handle, connected }`.
- Produces: `crearPostProgramado(ownerId, { caption, scheduledAt, media, cuentas, opciones, regla })`, donde `cuentas: CuentaDestino[]`.

- [ ] **Step 1: Escribir el test que falla**

```ts
it('crea un destino por cuenta, incluso dos de la misma red', async () => {
  const cuentas = [
    { id: 'ig-1', network: 'instagram', handle: '@vicente' },
    { id: 'ig-2', network: 'instagram', handle: '@vicenteclips' },
  ]
  const { destinos } = await crearConDobleFalso(cuentas)
  expect(destinos).toEqual([
    { network: 'instagram', accountId: 'ig-1' },
    { network: 'instagram', accountId: 'ig-2' },
  ])
})
```

`crearConDobleFalso` es un ayudante local del archivo de test que simula `@/db` como ya lo hace `src/lib/usuarios.test.ts` —copiar ese patrón, que reproduce las cadenas reales de drizzle— y devuelve lo que se insertó en `scheduled_post_targets`.

- [ ] **Step 2: Correr y verlo fallar**

Run: `npx vitest run src/lib/social/publish/crear.test.ts`
Expected: FAIL, `crearPostProgramado` sigue pidiendo `networks`.

- [ ] **Step 3: `crear.ts` recibe cuentas**

```ts
  input: {
    caption: string
    scheduledAt: Date
    media: MediaSubida[]
    cuentas: CuentaDestino[]
    opciones?: Record<string, OpcionesDestino>
    regla?: ReglaLimpia | null
  },
```

y el cuerpo, en lugar de llamar a `exigirCuentas`:

```ts
  // Las cuentas ya vienen verificadas por quien llama: esta función no habla con el
  // navegador y no tiene con qué comprobar pertenencia. Ver `verificarCuentas`.
  const db = getDb()
```

y la escritura de destinos:

```ts
  await db.insert(scheduledPostTargets).values(
    input.cuentas.map((cuenta) => ({
      postId: post!.id,
      network: cuenta.network,
      accountId: cuenta.id,
      opciones: input.opciones?.[cuenta.id] ?? null,
    })),
  )
```

- [ ] **Step 4: Correr y verlo pasar**

Run: `npx vitest run src/lib/social/publish/crear.test.ts`
Expected: PASS.

- [ ] **Step 5: `createScheduledPost` lee cuentas del formulario**

Reemplazar la lectura de redes y el puente de la Tarea 2:

```ts
  const elegidas = formData.getAll('cuentas').map(String)
  if (elegidas.length === 0) return { error: 'Elige al menos una cuenta.' }

  let cuentas: CuentaDestino[]
  try {
    cuentas = await verificarCuentas(ownerId, elegidas)
  } catch (error) {
    if (error instanceof CuentaInvalida) return { error: error.message }
    throw error
  }

  // `validateScheduleDraft` razona en redes (el vídeo obligatorio de TikTok, los 280 de
  // X): las redes son las de las cuentas elegidas, sin repetir.
  const networks = [...new Set(cuentas.map((c) => c.network))]
```

El resto de la función sigue igual, salvo la llamada final:

```ts
    await crearPostProgramado(ownerId, {
      caption,
      scheduledAt: scheduledAt!,
      media: uploaded,
      cuentas,
      opciones: opcionesCheck.opciones,
      regla: reglaCheck.regla,
    })
```

El `catch` de `SinCuenta` alrededor de esa llamada ya no puede dispararse: se quita.

- [ ] **Step 6: El compositor lista cuentas**

`src/app/admin/(dash)/schedule/page.tsx` ya carga datos para el compositor: agregarle `getCuentas(ownerId)` y pasarlas como prop `cuentas`.

En `composer.tsx`, el bloque de redes pasa a:

```tsx
<div>
  <GroupLabel>Cuentas</GroupLabel>
  {publicables.length === 0 ? (
    <p className="text-sm text-fg-muted">
      Todavía no tienes cuentas conectadas.{' '}
      <a className="underline" href="/admin/accounts">Conecta una</a> para poder programar.
    </p>
  ) : (
    <div className="flex flex-wrap gap-3">
      {publicables.map((cuenta) => (
        <label key={cuenta.id} className={cn('flex items-center gap-2 text-sm', !cuenta.connected && 'opacity-40')}>
          <input
            type="checkbox"
            name="cuentas"
            value={cuenta.id}
            disabled={!cuenta.connected}
            defaultChecked={publicables.length === 1 && cuenta.connected}
            onChange={(e) => alternar(cuenta, e.target.checked)}
          />
          {networkLabel(cuenta.network)} · {cuenta.handle ?? 'sin nombre'}
          {!cuenta.connected && <span className="text-xs text-fg-faint">reconéctala</span>}
        </label>
      ))}
    </div>
  )}
</div>
```

donde `publicables` son las cuentas cuya red está en `ENABLED`, y `alternar` mantiene en estado la lista de cuentas de TikTok marcadas, que reemplaza al booleano `tiktok` de hoy.

`defaultChecked` implementa la regla global: **marcada solo si es la única cuenta publicable conectada.**

- [ ] **Step 7: El bloque de TikTok, uno por cuenta**

`<TikTokOpciones>` pasa a recibir `cuenta: CuentaDestino` y a renderizarse una vez por cada cuenta de TikTok marcada, con su encabezado (`TikTok · @vicenteclips`). Dentro, cada campo lleva el sufijo `:{cuenta.id}` que la Tarea 2 fijó, y llama a `leerCreadorTikTok(cuenta.id)`.

`<RevisionMedia activo={...}>` pasa a recibir `activo={cuentasTikTok.length > 0}`.

- [ ] **Step 8: Fijar la regla del marcado por omisión con un test**

La regla vive en un `defaultChecked` dentro de un componente de cliente, así que se extrae a
una función pura y se prueba ahí. En `composer.tsx`:

```ts
/**
 * Si tienes una sola cuenta publicable y conectada, viene marcada: no hay entre qué elegir.
 * Con dos o más no viene ninguna, porque marcar una por ti es exactamente el problema que
 * esta entrega vino a resolver, en pequeño.
 */
export function vieneMarcada(cuenta: { id: string; connected: boolean }, publicables: Array<{ connected: boolean }>): boolean {
  return cuenta.connected && publicables.filter((c) => c.connected).length === 1
}
```

En `src/app/admin/(dash)/schedule/composer.test.ts` (nuevo):

```ts
it('con una sola cuenta conectada, viene marcada', () => {
  const sola = { id: 'ig-1', connected: true }
  expect(vieneMarcada(sola, [sola])).toBe(true)
})

it('con dos cuentas conectadas, no viene ninguna', () => {
  const a = { id: 'ig-1', connected: true }
  const b = { id: 'ig-2', connected: true }
  expect(vieneMarcada(a, [a, b])).toBe(false)
  expect(vieneMarcada(b, [a, b])).toBe(false)
})

it('una desconectada no cuenta para decidir ni viene marcada', () => {
  const viva = { id: 'ig-1', connected: true }
  const muerta = { id: 'ig-2', connected: false }
  expect(vieneMarcada(viva, [viva, muerta])).toBe(true)
  expect(vieneMarcada(muerta, [viva, muerta])).toBe(false)
})
```

Escribir el test primero y verlo fallar antes de extraer la función.

- [ ] **Step 9: Correr todo y probar a mano**

Run: `npx vitest run`, `npm run typecheck`, `npm run lint`, `npm run build`
Expected: verde. Además, abrir `/admin/schedule` en local y comprobar que la lista muestra cuentas con su handle.

- [ ] **Step 10: Commit**

---

### Tarea 4: Editar un post con destinos por cuenta

**Files:**
- Modify: `src/lib/social/publish/edit.ts` (`diffTargets`, `TargetLite`)
- Modify: `src/app/admin/actions.ts` (`updateScheduledPost`)
- Modify: `src/app/admin/(dash)/schedule/[id]/editor.tsx`
- Test: `src/lib/social/publish/edit.test.ts` (existente)

**Interfaces:**
- Consumes: `verificarCuentas`, `CuentaInvalida`.
- Produces: `TargetLite = { id: string; network: string; accountId: string; status: string }`; `diffTargets(current: TargetLite[], chosen: string[])` donde `chosen` son **identificadores de cuenta**.

- [ ] **Step 1: Escribir los tests que fallan**

```ts
it('quita el destino de una cuenta y conserva el de la otra, misma red', () => {
  const current: TargetLite[] = [
    { id: 't1', network: 'instagram', accountId: 'ig-1', status: 'scheduled' },
    { id: 't2', network: 'instagram', accountId: 'ig-2', status: 'scheduled' },
  ]
  const plan = diffTargets(current, ['ig-1'])
  expect(plan).toEqual({ create: [], deleteIds: ['t2'], rearmIds: [] })
})

it('no deja quitar una cuenta ya publicada', () => {
  const current: TargetLite[] = [
    { id: 't1', network: 'instagram', accountId: 'ig-1', status: 'published' },
  ]
  expect(diffTargets(current, [])).toEqual({ error: PUBLISHED_LOCKED })
})

it('rearma el destino fallido de una cuenta que sigue elegida', () => {
  const current: TargetLite[] = [
    { id: 't1', network: 'x', accountId: 'x-1', status: 'failed' },
  ]
  expect(diffTargets(current, ['x-1'])).toEqual({ create: [], deleteIds: [], rearmIds: ['t1'] })
})
```

- [ ] **Step 2: Correr y verlos fallar**

Run: `npx vitest run src/lib/social/publish/edit.test.ts`
Expected: FAIL, `TargetLite` no tiene `accountId`.

- [ ] **Step 3: Cambiar `diffTargets`**

```ts
export type TargetLite = { id: string; network: string; accountId: string; status: string }

/** El mensaje habla de cuentas porque ahora dos destinos pueden compartir red. */
export const PUBLISHED_LOCKED = 'No se puede quitar una cuenta en la que ya se publicó.'

export function diffTargets(
  current: TargetLite[],
  chosen: string[],
): { error: string } | TargetsPlan {
  const chosenSet = new Set(chosen)
  for (const target of current) {
    if (target.status === 'published' && !chosenSet.has(target.accountId)) {
      return { error: PUBLISHED_LOCKED }
    }
  }
  const existing = new Set(current.map((t) => t.accountId))
  return {
    create: chosen.filter((accountId) => !existing.has(accountId)),
    deleteIds: current
      .filter((t) => !chosenSet.has(t.accountId) && (t.status === 'scheduled' || t.status === 'failed'))
      .map((t) => t.id),
    rearmIds: current
      .filter((t) => chosenSet.has(t.accountId) && t.status === 'failed')
      .map((t) => t.id),
  }
}
```

- [ ] **Step 4: Correr y verlos pasar**

Run: `npx vitest run src/lib/social/publish/edit.test.ts`
Expected: PASS.

- [ ] **Step 5: Adaptar `updateScheduledPost`**

La consulta de `targets` debe traer `accountId`. La lista elegida pasa a leerse de `formData.getAll('cuentas')`. El cálculo de redes pendientes:

```ts
  // Una cuenta ya publicada no debe imponer sus límites a lo que aún queda por salir.
  const publicadas = new Set(targets.filter((t) => t.status === 'published').map((t) => t.accountId))
  const cuentasPendientes = cuentas.filter((c) => !publicadas.has(c.id))
  const pendingNetworks = [...new Set(cuentasPendientes.map((c) => c.network))]
```

donde `cuentas` viene de `verificarCuentas(ownerId, formData.getAll('cuentas').map(String))`, con su `catch` de `CuentaInvalida` devolviendo `{ error }`.

La comprobación de que una red con opciones no se puede agregar desde el editor pasa a recorrer las cuentas creadas:

```ts
  const porId = new Map(cuentas.map((c) => [c.id, c]))
  for (const accountId of targetsPlan.create) {
    const check = validarOpciones(porId.get(accountId)!.network, null)
    if ('error' in check) return { error: check.error }
  }
```

Y la inserción de destinos nuevos ya no necesita `exigirCuentas`:

```ts
  if (targetsPlan.create.length > 0) {
    await db.insert(scheduledPostTargets).values(
      targetsPlan.create.map((accountId) => ({
        postId,
        network: porId.get(accountId)!.network,
        accountId,
      })),
    )
  }
```

- [ ] **Step 6: El editor muestra destinos por cuenta**

En `editor.tsx`, la lista `NETWORKS` se reemplaza por las cuentas del dueño (prop nueva desde su componente de servidor, con `getCuentas`). Cada casilla lleva `name="cuentas"` y `value={cuenta.id}`, y muestra `red · handle`. Las cuentas de TikTok **no se ofrecen para agregar**, igual que hoy no se ofrece esa red; un destino de TikTok que ya existe sí se muestra y se puede quitar.

- [ ] **Step 7: Correr todo**

Run: `npx vitest run`, `npm run typecheck`, `npm run lint`, `npm run build`

- [ ] **Step 8: Commit**

---

### Tarea 5: Mostrar el handle donde hoy se muestra la red

**Files:**
- Modify: `src/app/admin/(dash)/schedule/etiqueta.ts`
- Modify: `src/app/admin/(dash)/schedule/calendar.tsx`
- Modify: `src/app/admin/(dash)/schedule/queue.tsx`
- Test: `src/app/admin/(dash)/schedule/etiqueta.test.ts` (existente)

**Interfaces:**
- Consumes: nada de las tareas anteriores; es presentación.

Con dos cuentas de la misma red en un post, el calendario y la cola muestran hoy «instagram» dos veces, sin forma de saber cuál es cuál.

- [ ] **Step 1: Escribir el test que falla**

```ts
it('distingue dos destinos de la misma red por su handle', () => {
  const texto = etiquetaDestino({ network: 'instagram', handle: '@vicenteclips' })
  expect(texto).toContain('@vicenteclips')
})

it('sin handle cae en el nombre de la red', () => {
  expect(etiquetaDestino({ network: 'instagram', handle: null })).toBe(networkLabel('instagram'))
})
```

- [ ] **Step 2: Correr y verlo fallar**

Run: `npx vitest run "src/app/admin/(dash)/schedule/etiqueta.test.ts"`

- [ ] **Step 3: Implementar `etiquetaDestino` y usarla**

```ts
/**
 * Cómo se nombra un destino en el calendario y en la cola. Con una sola cuenta por red el
 * handle sobra, pero mostrarlo siempre evita la única lectura ambigua que importa: dos
 * destinos de la misma red en el mismo corte.
 */
export function etiquetaDestino(destino: { network: string; handle: string | null }): string {
  return destino.handle ?? networkLabel(destino.network)
}
```

Las consultas que alimentan el calendario y la cola traen hoy `network` de cada destino.
Pasan a traer también el handle, con un `leftJoin` —no `innerJoin`: un destino cuya cuenta
se borró no debe desaparecer del calendario, debe mostrarse por su red—:

```ts
    .select({
      id: scheduledPostTargets.id,
      network: scheduledPostTargets.network,
      status: scheduledPostTargets.status,
      handle: socialAccounts.handle,
    })
    .from(scheduledPostTargets)
    .leftJoin(socialAccounts, eq(socialAccounts.id, scheduledPostTargets.accountId))
```

**Cuidado con el aislamiento:** `aislamiento.test.ts` exige que el predicado del dueño caiga
en el `WHERE` y no en el `ON` de un `leftJoin`, y su arnés ya lo comprueba. El `on` de este
join es solo la relación destino↔cuenta; el filtro por dueño se queda donde estaba.

Los componentes reemplazan el nombre de la red por `etiquetaDestino({ network, handle })`.

- [ ] **Step 4: Correr y verlo pasar**

Run: `npx vitest run` — en particular `aislamiento.test.ts`, que es quien se quejaría si el
join hubiera movido el filtro del dueño.

- [ ] **Step 5: Commit**

---

### Tarea 6: La API de carga masiva acepta cuentas

**Files:**
- Modify: `src/app/api/schedule/batch/route.ts`
- Modify: `src/lib/social/publish/batch.ts`
- Test: `src/lib/social/publish/batch.test.ts` (existente)

**Interfaces:**
- Consumes: `verificarCuentas`, `cuentaUnicaPorRed`, `CuentaInvalida`, `SinCuenta`.

**Nota sobre dónde probar:** `batch.test.ts` prueba **solo funciones puras** —`validateBatchItem`, `mediaTypeFromUrl`— y no monta ningún doble de base. Respetar eso: la
precedencia entre `cuentas` y `redes` se extrae a una función pura y se prueba ahí; lo que
toca base ya quedó cubierto en la Tarea 1.

- [ ] **Step 1: Escribir los tests que fallan**

En `src/lib/social/publish/batch.test.ts`, junto a los que ya están:

```ts
describe('destinoPedido', () => {
  it('nombrar cuentas manda sobre nombrar redes', () => {
    expect(destinoPedido({ ...base, cuentas: ['ig-2'], redes: ['tiktok'] })).toEqual({
      cuentas: ['ig-2'],
    })
  })

  it('sin cuentas, se piden las redes', () => {
    expect(destinoPedido({ ...base, cuentas: [], redes: ['instagram'] })).toEqual({
      redes: ['instagram'],
    })
  })
})

describe('validateBatchItem, destinos', () => {
  it('una fila sin cuentas ni redes se rechaza con una frase útil', () => {
    const item = { ...base, redes: [], cuentas: [] }
    expect(validateBatchItem(item, now)).toMatch(/cuenta/i)
  })

  it('una fila con cuentas y sin redes es válida', () => {
    expect(validateBatchItem({ ...base, redes: [], cuentas: ['ig-1'] }, now)).toBeNull()
  })
})
```

Añadir `cuentas: []` a la constante `base` del archivo, y `cuentas: string[]` al tipo
`BatchItem`.

- [ ] **Step 2: Correr y verlos fallar**

- [ ] **Step 3: Normalizar `cuentas` en la puerta**

En `route.ts`, junto a `redes`:

```ts
        cuentas: Array.isArray(p.cuentas) ? p.cuentas.map(String) : [],
```

- [ ] **Step 4: Resolver en `batch.ts`**

La función pura, junto a las otras del archivo:

```ts
/**
 * Qué destinos pide una fila. Nombrar la cuenta manda sobre nombrar la red: lo primero es
 * siempre inequívoco, y lo segundo solo se puede resolver cuando no hay dos candidatas.
 */
export function destinoPedido(item: BatchItem): { cuentas: string[] } | { redes: string[] } {
  return item.cuentas.length > 0 ? { cuentas: item.cuentas } : { redes: item.redes }
}
```

Y en el bucle, reemplazar `const cuentas = await exigirCuentas(ownerId, item.redes)` por:

```ts
      const pedido = destinoPedido(item)
      const destinos =
        'cuentas' in pedido
          ? await verificarCuentas(ownerId, pedido.cuentas)
          : [...(await cuentaUnicaPorRed(ownerId, pedido.redes)).values()]
```

y el `catch` de la fila pasa a atrapar también `CuentaInvalida`, devolviendo su mensaje como error de esa fila —no del lote entero—.

La llamada a `crearPostProgramado` pasa `cuentas: destinos`.

- [ ] **Step 5: Correr y verlos pasar**

- [ ] **Step 6: Documentar el campo nuevo**

En `README.md`, donde se describe el cuerpo de `POST /api/schedule/batch`, agregar `cuentas` y la regla de `redes`. Es obligatorio: `AGENTS.md` lo exige para cualquier cambio de una API.

- [ ] **Step 7: Commit**

---

### Tarea 7: La app del teléfono elige cuentas

**Files:**
- Create: `src/app/api/mobile/schedule/accounts/route.ts`
- Modify: `src/app/api/mobile/schedule/check/route.ts`
- Modify: `mobile/src/app/(tabs)/publicar.tsx`
- Modify: `mobile/src/app/(tabs)/calendario.tsx`, `mobile/src/app/(tabs)/index.tsx`
- Test: en `mobile/` según su suite; y el endpoint nuevo con el arnés de la web

**Interfaces:**
- Consumes: `verificarCuentas`, `cuentaUnicaPorRed`.
- Produces: `GET /api/mobile/schedule/accounts` → `{ cuentas: Array<{ id: string; red: string; handle: string | null; conectada: boolean }> }`.

- [ ] **Step 1: El endpoint**

`src/app/api/mobile/schedule/accounts/route.ts`, siguiendo el patrón de sus vecinos
(`requireMobileUser`, `dynamic = 'force-dynamic'`, cuerpo en español):

```ts
import { NextResponse } from 'next/server'
import { asc, eq } from 'drizzle-orm'
import { getDb, socialAccounts } from '@/db'
import { requireMobileUser } from '@/lib/mobile-guardia'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const usuario = await requireMobileUser(request)
  if (!usuario) return new NextResponse('No autorizado', { status: 401 })

  const filas = await getDb()
    .select({
      id: socialAccounts.id,
      network: socialAccounts.network,
      handle: socialAccounts.handle,
      accessToken: socialAccounts.accessToken,
    })
    .from(socialAccounts)
    .where(eq(socialAccounts.ownerId, usuario.id))
    .orderBy(asc(socialAccounts.network), asc(socialAccounts.createdAt))

  return NextResponse.json({
    // `conectada` en vez del token: la app necesita saber si sirve, no la credencial.
    cuentas: filas.map((f) => ({
      id: f.id,
      red: f.network,
      handle: f.handle,
      conectada: Boolean(f.accessToken),
    })),
  })
}
```

Y su caso en `src/lib/aislamiento.test.ts`, con el arnés que ya existe:

```ts
it('api/mobile/schedule/accounts: lista solo las cuentas del dueño', async () => {
  const { GET } = await import('../app/api/mobile/schedule/accounts/route')
  const consultas = await todasLasConsultas(() => GET(peticionMovil()))
  expect(consultas).toHaveLength(1)
  esperarFiltradoPorDueno(consultas[0]!)
})
```

`aislamiento.test.ts` **no tiene todavía** ningún caso de ruta móvil, así que hay que
sumarle el simulacro del guardia, al lado de los que ya tiene para `@/lib/auth`:

```ts
vi.mock('@/lib/mobile-guardia', () => ({ requireMobileUser: async () => USUARIO }))
```

y `peticionMovil()` es entonces una `Request` cualquiera, porque el guardia simulado no la
mira: `new Request('https://ejemplo.cl/api/mobile/schedule/accounts')`.

- [ ] **Step 2: La ruta de comprobación verifica cuentas**

En `src/app/api/mobile/schedule/check/route.ts`, reemplazar el bloque de `exigirCuentas`:

```ts
  // La app nueva manda `cuentas`; una versión vieja instalada sigue mandando `redes`, y
  // entonces vale la regla de siempre: se resuelve sola mientras no haya dos candidatas.
  try {
    if (Array.isArray(borrador.cuentas) && borrador.cuentas.length > 0) {
      await verificarCuentas(usuario.id, borrador.cuentas.map(String))
    } else {
      await cuentaUnicaPorRed(usuario.id, borrador.redes)
    }
  } catch (fallo) {
    if (fallo instanceof SinCuenta || fallo instanceof CuentaInvalida) {
      return NextResponse.json({ error: fallo.message }, { status: 400 })
    }
    throw fallo
  }
```

- [ ] **Step 3: La pantalla de publicar lista cuentas**

En `mobile/src/app/(tabs)/publicar.tsx`:

```ts
type CuentaApp = { id: string; red: string; handle: string | null; conectada: boolean }

const [cuentas, setCuentas] = useState<string[]>([])
const [disponibles, setDisponibles] = useState<CuentaApp[]>([])

// La misma regla que la web: con una sola cuenta conectada viene marcada, porque no hay
// entre qué elegir; con dos o más no viene ninguna.
useEffect(() => {
  void (async () => {
    const r = await fetch('/api/mobile/schedule/accounts', { headers: cabeceras(token) })
    const { cuentas: lista } = (await r.json()) as { cuentas: CuentaApp[] }
    setDisponibles(lista)
    const conectadas = lista.filter((c) => c.conectada)
    setCuentas(conectadas.length === 1 ? [conectadas[0]!.id] : [])
  })()
}, [token])

function alternarCuenta(id: string) {
  setCuentas(cuentas.includes(id) ? cuentas.filter((c) => c !== id) : [...cuentas, id])
}
```

Los `Chip` se construyen desde `disponibles`, con texto `${NOMBRE_RED[c.red] ?? c.red} · ${c.handle ?? 'sin nombre'}`, `activo={cuentas.includes(c.id)}` y `deshabilitado={ocupado || !c.conectada}`.

`ultimoBorrador` pasa de `{ texto, redes, cuando, ahora }` a `{ texto, cuentas, cuando, ahora }`, y el cuerpo del envío manda `cuentas` en vez de `redes`. Ajustar también `textoConfirmacion`, que hoy arma la frase del `Alert` a partir de las redes: pasa a nombrar los handles.

- [ ] **Step 4: El calendario de la app muestra el handle**

La API que alimenta `calendario.tsx` e `index.tsx` (`src/app/api/mobile/posts/route.ts`)
devuelve hoy `redes: [{ red, estado }]`. Pasa a incluir el handle, con el mismo `leftJoin`
de la Tarea 5:

```ts
  redes: destinos.map((d) => ({ red: d.network, handle: d.handle, estado: d.status })),
```

y en la app, donde hoy se pinta `r.red`, se pinta `r.handle ?? NOMBRE_RED[r.red] ?? r.red`.

- [ ] **Step 5: Correr las dos suites**

Run: `npx vitest run` en la raíz, y la suite de `mobile/` como la corre su trabajo de CI (`app`).

- [ ] **Step 6: Commit**

---

### Tarea 8: Borrar la cuenta primaria

**Files:**
- Modify: `src/lib/social/cuentas.ts`
- Modify: `src/lib/social/publish/opciones.ts`
- Modify: `src/lib/aislamiento.test.ts`
- Modify: `README.md`, `docs/deuda-tecnica.md`

Esta tarea no cambia comportamiento: quita lo que ya no tiene llamadores. Va al final justamente para que borrarlo sea trivial y verificable.

- [ ] **Step 1: Comprobar que no quedan llamadores**

```bash
grep -rn "cuentasPrimarias\|exigirCuentas\|validarOpcionesPorRed" src/ mobile/
```

Expected: solo las definiciones. Si aparece un llamador, **parar**: significa que una tarea anterior quedó a medias.

- [ ] **Step 2: Borrar**

Quitar `cuentasPrimarias` y `exigirCuentas` de `src/lib/social/cuentas.ts`, y `validarOpcionesPorRed` de `opciones.ts`. **No tocar `primariaDe`**, que `sync.ts` sigue usando para la etiqueta de campaña.

- [ ] **Step 3: Reemplazar el test que se quedó sin sujeto**

`aislamiento.test.ts` tiene el caso «social/cuentas: `cuentasPrimarias` filtra por dueño». Esa función deja de existir, pero la propiedad sigue haciendo falta: **borrar el caso viejo** —los dos casos nuevos de la Tarea 1 lo cubren— y comprobar que el archivo no perdió cobertura, contando los casos antes y después.

- [ ] **Step 4: Actualizar la documentación**

`AGENTS.md` lo exige. En `README.md`:
- La frase «hasta la entrega 3, dos usuarios todavía no pueden conectar la misma cuenta de la misma red» sigue siendo cierta y se queda; lo que cambia es que **un mismo dueño sí puede usar varias suyas**, y eso hay que decirlo.
- El cuerpo de `POST /api/schedule/batch`, si la Tarea 6 no lo dejó completo.

En `docs/deuda-tecnica.md`: anotar que `api/mobile/accounts` agrupa las métricas por red, así que dos cuentas de la misma red se suman en una sola tarjeta. Queda fuera de esta entrega.

- [ ] **Step 5: Correr todo**

Run: `npx vitest run`, `npm run typecheck`, `npm run lint`, `npm run build`

- [ ] **Step 6: Commit**

---

## Cabos que este plan no cierra

- **Las métricas siguen agrupadas por red.** `api/mobile/accounts` y `lib/account-stats.ts` suman las cuentas de una misma red en una tarjeta. Con dos Instagram verás una sola línea. La spec no lo cubre y no se toca aquí; queda anotado en deuda técnica.
- **Las familias de cuentas** son una entrega aparte, como se acordó.
- **`validateScheduleDraft` sigue razonando en redes.** Es correcto —sus reglas son de la red, no de la cuenta— y se le pasan las redes derivadas de las cuentas elegidas.
- **La prueba a mano de la sección 15 de la spec** no la puede hacer ningún agente: publicar con dos cuentas reales de la misma red y comprobar que cada cosa salió donde debía.
