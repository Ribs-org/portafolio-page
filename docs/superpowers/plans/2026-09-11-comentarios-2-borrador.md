# Comentarios, entrega 2: el borrador — plan de implementación

> **Para quien ejecute esto:** SUB-SKILL OBLIGATORIA: usa superpowers:subagent-driven-development
> (recomendada) o superpowers:executing-plans para implementar tarea por tarea. Los pasos
> usan casillas (`- [ ]`) para marcar avance.

**Meta:** que cada comentario que entra a la cola llegue con una respuesta ya redactada por
el modelo, siguiendo instrucciones que el dueño escribe y puede cambiar.

**Arquitectura:** una tabla `ajustes` de clave y valor guarda las instrucciones. Una fase
nueva dentro de la misma corrida del cron, **después** del descubrimiento, toma los
comentarios pendientes que todavía no tienen borrador y le pide uno al modelo por la
pasarela de IA de Vercel, uno por comentario. Lo puro —armar el prompt, limpiar la salida—
vive aparte y se prueba; la llamada al modelo no se prueba, como el resto de la casa.

**Stack:** Next.js 16, Drizzle sobre Neon, el paquete `ai` (AI SDK) contra Vercel AI
Gateway, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-11-comentarios-design.md` (secciones 2 y 3, y la
fila «2 · El borrador» de la tabla de entregas).

## Restricciones globales

- Frases fijas en español en todo lo visible; el detalle del proveedor solo a
  `console.error` truncado a 300 (`String(error).slice(0, 300)`).
- El modelo **nunca publica**. Su salida es una columna `draft` en la base y nada más.
- Lo que el modelo ve es exactamente: las instrucciones del dueño, el texto de la
  publicación, el texto del comentario y el nombre de quien lo dejó. Nada de métricas, ni
  otros comentarios, ni datos de la persona.
- Frase fija cuando el modelo no responde: `No se pudo redactar la respuesta.`
- Sin `AI_GATEWAY_API_KEY` el sitio sigue funcionando: los comentarios entran a la cola sin
  borrador y se responden a mano. No es un error y no se marca como tal.
- Redactar corre **después** de descubrir y comparte el mismo tope de tiempo de la corrida:
  publicar a tiempo manda sobre responder a tiempo.
- `comentarios/` no importa `server-only` salvo los orquestadores que tocan la base.
- Comentarios de código solo para restricciones que el código no puede mostrar, en el tono
  de los vecinos. Commits en español, en presente, terminando con:
  `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>` y
  `Claude-Session: https://claude.ai/code/session_016vd6a3VaPhM2LUSJ3Jp1LE`
- Disciplina git: HEAD verificado antes de empezar, jamás checkout/reset/rebase/stash,
  `git add` por archivo.
- Verificación por tarea: `npx vitest run <archivo>`; al cerrar: `npm test && npm run
  typecheck && npm run lint && npx next build`. **Ningún `db:push` corre durante la
  ejecución**: la tabla `ajustes` es nueva y el push lo hace el controlador al desplegar.

---

## Estructura de archivos

| Archivo | Responsabilidad |
|---|---|
| `src/db/schema.ts` | gana la tabla `ajustes` (clave, valor, updated_at) |
| `src/lib/ajustes.ts` | leer y guardar un ajuste por clave; toca la base, `server-only` |
| `src/lib/social/comentarios/instrucciones.ts` | la clave, el texto inicial, el tope, y la normalización pura |
| `src/lib/social/comentarios/prompt.ts` | puro: armar el prompt y limpiar la salida del modelo |
| `src/lib/social/comentarios/modelo.ts` | la única llamada a la pasarela; sin base y sin lógica |
| `src/lib/social/comentarios/redaccion.ts` | la fase: elige a quién redactarle, llama y guarda |
| `src/lib/social/comentarios/run.ts` | llama a la fase después de descubrir |
| `src/app/api/cron/publish-social/route.ts` | el reporte nuevo viaja en la respuesta |

---

### Task 1: La tabla `ajustes` y las instrucciones

**Archivos:**
- Modificar: `src/db/schema.ts`
- Crear: `src/lib/ajustes.ts`
- Crear: `src/lib/social/comentarios/instrucciones.ts`
- Test: `src/lib/social/comentarios/instrucciones.test.ts`

**Interfaces:**
- Produce: `ajustes` (tabla), `leerAjuste(clave): Promise<string | null>`,
  `CLAVE_INSTRUCCIONES`, `INSTRUCCIONES_POR_DEFECTO`, `TOPE_INSTRUCCIONES`,
  `normalizarInstrucciones(bruto: string | null): string`.

**No escribas `guardarAjuste` todavía.** En esta entrega nadie guarda instrucciones: el
campo del panel es la entrega 3, y una función sin llamador es una función sin probar.

- [x] **Paso 1: La tabla**

En `src/db/schema.ts`, junto a las demás, con su comentario de por qué es clave y valor:

```ts
/**
 * Preferencias del panel, una fila por clave. Tabla de clave y valor y no columnas en otra
 * tabla porque esta es la primera de varias: lo que se guarda acá no tiene dueño natural
 * en ninguna entidad del dominio.
 */
export const ajustes = pgTable('ajustes', {
  clave: text('clave').primaryKey(),
  valor: text('valor').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})
```

No lleva unique compuesta, así que no hay ningún orden de columnas que cuidar: la primaria
es una sola columna.

- [x] **Paso 2: El acceso**

`src/lib/ajustes.ts`:

```ts
import 'server-only'
import { eq } from 'drizzle-orm'
import { ajustes, getDb } from '@/db'

export async function leerAjuste(clave: string): Promise<string | null> {
  const [fila] = await getDb().select().from(ajustes).where(eq(ajustes.clave, clave)).limit(1)
  return fila?.valor ?? null
}
```

- [x] **Paso 3: El test que falla**

`src/lib/social/comentarios/instrucciones.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  INSTRUCCIONES_POR_DEFECTO,
  TOPE_INSTRUCCIONES,
  normalizarInstrucciones,
} from './instrucciones'

describe('normalizarInstrucciones', () => {
  it('devuelve las de por defecto cuando no hay nada guardado', () => {
    expect(normalizarInstrucciones(null)).toBe(INSTRUCCIONES_POR_DEFECTO)
  })

  it('devuelve las de por defecto cuando lo guardado es espacio en blanco', () => {
    expect(normalizarInstrucciones('   \n  ')).toBe(INSTRUCCIONES_POR_DEFECTO)
  })

  it('recorta los bordes de lo guardado', () => {
    expect(normalizarInstrucciones('  Responde corto.  ')).toBe('Responde corto.')
  })

  it('corta al tope por puntos de código, sin partir un emoji', () => {
    const largo = '🙂'.repeat(TOPE_INSTRUCCIONES + 50)
    const corto = normalizarInstrucciones(largo)
    expect([...corto]).toHaveLength(TOPE_INSTRUCCIONES)
    expect(corto.endsWith('🙂')).toBe(true)
  })
})
```

- [x] **Paso 4: Correrlo y verlo fallar**

Corre: `npx vitest run src/lib/social/comentarios/instrucciones.test.ts`
Esperado: falla porque el módulo todavía no existe.

- [x] **Paso 5: El módulo**

`src/lib/social/comentarios/instrucciones.ts`. Reusa `recortar` de `./ventana`, que ya corta
por puntos de código:

```ts
import { recortar } from './ventana'

export const CLAVE_INSTRUCCIONES = 'comentarios_instrucciones'

/** El tope que el panel le pone al campo; el prompt las lleva enteras en cada llamada. */
export const TOPE_INSTRUCCIONES = 2000

export const INSTRUCCIONES_POR_DEFECTO = `Responde en español, en primera persona, breve y cálido: una o dos frases. Agradece cuando el comentario es un elogio, responde la pregunta cuando la hay, y si preguntan por precios o por trabajar juntos, invita a escribir por mensaje directo sin dar cifras. No inventes datos que no estén en la publicación. No uses hashtags. Un emoji como máximo, y solo si el comentario tiene uno.`

/**
 * Lo guardado manda salvo que esté vacío: unas instrucciones en blanco dejarían al modelo
 * sin ninguna, que es peor que las de la casa.
 */
export function normalizarInstrucciones(bruto: string | null): string {
  const limpio = recortar(bruto ?? '', TOPE_INSTRUCCIONES)
  return limpio.length > 0 ? limpio : INSTRUCCIONES_POR_DEFECTO
}
```

- [x] **Paso 6: Correrlo y verlo pasar**

Corre: `npx vitest run src/lib/social/comentarios/instrucciones.test.ts`
Esperado: pasa. Después `npm run typecheck` y `npm run lint`.

- [x] **Paso 7: Commit**

```bash
git add src/db/schema.ts src/lib/ajustes.ts src/lib/social/comentarios/instrucciones.ts src/lib/social/comentarios/instrucciones.test.ts
git commit
```

Mensaje: `Guarda las instrucciones de los comentarios en una tabla de ajustes`

---

### Task 2: El prompt y la limpieza del borrador

**Archivos:**
- Crear: `src/lib/social/comentarios/prompt.ts`
- Test: `src/lib/social/comentarios/prompt.test.ts`

**Interfaces:**
- Consume: `recortar` de `./ventana`.
- Produce: el tipo `EntradaPrompt = { instrucciones: string; caption: string | null;
  comentario: string; autor: string | null }`,
  `armarPrompt(entrada: EntradaPrompt): { system: string; prompt: string }` y
  `limpiarBorrador(bruto: string, limite: number): string`.

Este archivo es puro: no importa nada del paquete `ai`, ni la base, ni `server-only`.

- [x] **Paso 1: El test que falla**

`src/lib/social/comentarios/prompt.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { armarPrompt, limpiarBorrador } from './prompt'

const base = {
  instrucciones: 'Responde corto.',
  caption: 'Tres cosas que aprendí este año.',
  comentario: '¿Cuánto cobras por esto?',
  autor: '@vecina',
}

describe('armarPrompt', () => {
  it('lleva las instrucciones del dueño en el mensaje de sistema', () => {
    expect(armarPrompt(base).system).toContain('Responde corto.')
  })

  it('lleva la publicación, el comentario y quién lo dejó', () => {
    const { prompt } = armarPrompt(base)
    expect(prompt).toContain('Tres cosas que aprendí este año.')
    expect(prompt).toContain('¿Cuánto cobras por esto?')
    expect(prompt).toContain('@vecina')
  })

  it('dice que la publicación no tiene texto en vez de mandar un hueco', () => {
    const { prompt } = armarPrompt({ ...base, caption: null })
    expect(prompt).toContain('sin texto')
    expect(prompt).not.toContain('null')
  })

  it('no nombra al autor cuando la red no lo dio', () => {
    const { prompt } = armarPrompt({ ...base, autor: null })
    expect(prompt).not.toContain('null')
    expect(prompt).toContain('¿Cuánto cobras por esto?')
  })
})

describe('limpiarBorrador', () => {
  it('quita las comillas que envuelven toda la respuesta', () => {
    expect(limpiarBorrador('"¡Gracias!"', 100)).toBe('¡Gracias!')
    expect(limpiarBorrador('«¡Gracias!»', 100)).toBe('¡Gracias!')
  })

  it('no toca las comillas de adentro', () => {
    expect(limpiarBorrador('Le dije "ya voy" y fui.', 100)).toBe('Le dije "ya voy" y fui.')
  })

  it('quita el prefijo con el que el modelo a veces se presenta', () => {
    expect(limpiarBorrador('Respuesta: ¡Gracias!', 100)).toBe('¡Gracias!')
    expect(limpiarBorrador('respuesta:¡Gracias!', 100)).toBe('¡Gracias!')
  })

  it('recorta al límite de la red por puntos de código', () => {
    expect(limpiarBorrador('🙂🙂🙂', 2)).toBe('🙂🙂')
  })

  it('devuelve cadena vacía cuando no queda nada', () => {
    expect(limpiarBorrador('  ""  ', 100)).toBe('')
  })
})
```

- [x] **Paso 2: Correrlo y verlo fallar**

Corre: `npx vitest run src/lib/social/comentarios/prompt.test.ts`
Esperado: falla porque el módulo no existe.

- [x] **Paso 3: El módulo**

`src/lib/social/comentarios/prompt.ts`. El mensaje de sistema fija el papel y le pega las
instrucciones del dueño; el prompt lleva el contexto y nada más. Las comillas se quitan solo
cuando envuelven **toda** la respuesta: empezar con una apertura y terminar con su cierre no
basta, porque `"hola" y "chao"` también lo cumple y son dos frases, no un envoltorio; por eso
además se exige que el interior no repita el cierre:

```ts
import { recortar } from './ventana'

export type EntradaPrompt = {
  instrucciones: string
  caption: string | null
  comentario: string
  autor: string | null
}

const PAPEL =
  'Eres quien responde los comentarios de las publicaciones de una sola persona, en su nombre. Devuelve únicamente el texto de la respuesta: sin comillas, sin prefijos y sin explicar lo que hiciste.'

export function armarPrompt(entrada: EntradaPrompt): { system: string; prompt: string } {
  const { instrucciones, caption, comentario, autor } = entrada
  const publicacion = caption?.trim() ? caption.trim() : '(publicación sin texto)'
  const quien = autor?.trim() ? `Lo dejó ${autor.trim()}.` : ''
  const prompt = [
    `Publicación:\n${publicacion}`,
    `Comentario:\n${comentario.trim()}`,
    quien,
    'Escribe la respuesta.',
  ]
    .filter((parte) => parte.length > 0)
    .join('\n\n')
  return { system: `${PAPEL}\n\nInstrucciones de la persona:\n${instrucciones}`, prompt }
}

const ENVOLTORIOS: Array<[string, string]> = [
  ['"', '"'],
  ['“', '”'],
  ['«', '»'],
  ["'", "'"],
]

/** El modelo a veces se presenta antes de responder; esto es lo que se le ha visto hacer. */
const PREFIJO = /^(respuesta|reply)\s*:\s*/i

/**
 * Las comillas se quitan solo cuando envuelven toda la respuesta. Que empiece con una
 * apertura y termine con su cierre no basta: `"hola" y "chao"` también cumple eso y es
 * dos frases, no un envoltorio — despojarlo dejaría una comilla colgando. Por eso además
 * se exige que el interior no repita el cierre; si lo repite, se corta el bucle igual,
 * sin tocar el texto, para no probar el par siguiente sobre una cadena que ya no
 * empieza como el bucle cree.
 */
export function limpiarBorrador(bruto: string, limite: number): string {
  let texto = bruto.trim().replace(PREFIJO, '').trim()
  for (const [abre, cierra] of ENVOLTORIOS) {
    if (texto.length >= 2 && texto.startsWith(abre) && texto.endsWith(cierra)) {
      const interior = texto.slice(abre.length, texto.length - cierra.length)
      if (!interior.includes(cierra)) texto = interior.trim()
      break
    }
  }
  return recortar(texto, limite)
}
```

- [x] **Paso 4: Correrlo y verlo pasar**

Corre: `npx vitest run src/lib/social/comentarios/prompt.test.ts`
Esperado: pasa. Después `npm run typecheck` y `npm run lint`.

- [x] **Paso 5: Commit**

```bash
git add src/lib/social/comentarios/prompt.ts src/lib/social/comentarios/prompt.test.ts
git commit
```

Mensaje: `Arma el prompt del borrador y limpia lo que el modelo devuelve`

---

### Task 3: La llamada a la pasarela

**Archivos:**
- Modificar: `package.json` y `package-lock.json` (dependencia `ai`)
- Crear: `src/lib/social/comentarios/modelo.ts`
- Modificar: `.env.example`

**Interfaces:**
- Consume: `armarPrompt` y `EntradaPrompt` de `./prompt`.
- Produce: `SIN_BORRADOR`, `MODELO_POR_DEFECTO`, `hayPasarela(): boolean`,
  `pedirBorrador(entrada: EntradaPrompt): Promise<string>` — devuelve el texto crudo del
  modelo, sin limpiar; limpiar es de quien llama.

- [x] **Paso 1: La dependencia**

Corre: `npm install ai`

No instales ningún paquete de proveedor (`@ai-sdk/openai` y compañía): a la pasarela de
Vercel se le pasa el modelo como string `proveedor/modelo`, que es justamente la razón por la
que se eligió.

- [x] **Paso 2: El módulo**

`src/lib/social/comentarios/modelo.ts`:

```ts
import { generateText } from 'ai'
import { armarPrompt, type EntradaPrompt } from './prompt'

/** Lo único que el dueño llega a leer cuando el modelo no responde. */
export const SIN_BORRADOR = 'No se pudo redactar la respuesta.'

/**
 * Rápido y barato, que es lo que pide un borrador de dos frases. Se cambia sin desplegar
 * con `COMENTARIOS_MODELO`: la pasarela recibe el string tal cual, así que si el nombre no
 * existe la redacción falla con la frase fija y arreglarlo es una variable de entorno.
 */
export const MODELO_POR_DEFECTO = 'anthropic/claude-haiku-4.5'

/** Dos frases no necesitan más, y el tope acota lo que una respuesta desbocada puede costar. */
const MAX_TOKENS = 300

/** Un borrador que tarda más que esto ya no sirve: la corrida tiene que seguir. */
const TIMEOUT_MS = 20_000

/**
 * Sin credencial no se redacta, y no es un error: el sitio funciona sin la pasarela y los
 * comentarios entran a la cola para responderse a mano. En Vercel el OIDC puede reemplazar
 * a la clave, y por eso también vale `VERCEL_OIDC_TOKEN`.
 */
export function hayPasarela(): boolean {
  return Boolean(process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN)
}

export async function pedirBorrador(entrada: EntradaPrompt): Promise<string> {
  const { system, prompt } = armarPrompt(entrada)
  const { text } = await generateText({
    model: process.env.COMENTARIOS_MODELO || MODELO_POR_DEFECTO,
    instructions: system,
    prompt,
    maxOutputTokens: MAX_TOKENS,
    abortSignal: AbortSignal.timeout(TIMEOUT_MS),
  })
  return text
}
```

En la versión instalada (`ai@7.0.97`), `system` está `@deprecated` a favor de `instructions`;
de ahí el nombre del campo arriba, aunque la variable siga llamándose `system` por venir de
`armarPrompt`.

Si la versión instalada del paquete `ai` nombra distinto alguna otra de esas opciones, lee su
documentación en `node_modules/ai` y usa el nombre que corresponda, sin cambiar el sentido:
un tope de salida, un aborto por tiempo, un mensaje de sistema y un prompt. Repórtalo en tus
dudas si tuviste que cambiar algo.

- [x] **Paso 3: Las variables de entorno**

En `.env.example`, al final, con el mismo formato que las demás:

```
# Redactar los borradores de respuesta a comentarios. En Vercel puede omitirse si el
# proyecto usa OIDC. Sin ella los comentarios entran a la cola sin borrador.
AI_GATEWAY_API_KEY=
# Opcional: el modelo de la pasarela, con la forma "proveedor/modelo".
COMENTARIOS_MODELO=
```

- [x] **Paso 4: Verificar**

Corre `npm run typecheck` y `npm run lint`. No hay test: es una llamada de red, y la casa no
prueba esas.

- [x] **Paso 5: Commit**

```bash
git add package.json package-lock.json src/lib/social/comentarios/modelo.ts .env.example
git commit
```

Mensaje: `Pide el borrador por la pasarela de IA de Vercel`

---

### Task 4: La fase de redacción dentro de la corrida

**Archivos:**
- Crear: `src/lib/social/comentarios/redaccion.ts`
- Modificar: `src/lib/social/comentarios/ventana.ts` (una constante)
- Modificar: `src/lib/social/comentarios/run.ts`
- Modificar: `src/app/api/cron/publish-social/route.ts`

**Interfaces:**
- Consume: `leerAjuste` de `@/lib/ajustes`, `CLAVE_INSTRUCCIONES` y
  `normalizarInstrucciones` de `./instrucciones`, `hayPasarela`, `pedirBorrador` y
  `SIN_BORRADOR` de `./modelo`, `limpiarBorrador` de `./prompt`, `seAcaboElTiempo` de
  `./ventana`, `comentaristaFor` de `./index`.
- Produce: `RedaccionReport = { redactados: number; fallidos: number; sinPasarela: boolean }`
  y `redactarPendientes(inicio: number): Promise<RedaccionReport>`.

**Por qué es una fase y no una línea dentro del descubrimiento:** el diseño pide que el
borrador se redacte al descubrir el comentario, y esta fase corre en la misma corrida, un
paso después. Hacerla aparte compra dos cosas que la versión metida en el bucle no da: la
primera corrida después de desplegar encuentra siete días de comentarios de golpe y **no**
puede gastar una llamada al modelo por cada uno, y un comentario que quedó sin borrador por
la razón que sea se recupera solo en la pasada siguiente, sin código de rescate.

- [x] **Paso 1: El tope**

En `ventana.ts`, junto a sus hermanas:

```ts
/**
 * Cuántos borradores como mucho por corrida. La primera pasada después de desplegar
 * encuentra siete días de comentarios de una vez; sin tope serían cientos de llamadas al
 * modelo dentro de la corrida que además publica. Lo que sobra espera cinco minutos.
 */
export const MAX_BORRADORES_POR_CORRIDA = 10
```

Es una constante y no lleva test propio. `seAcaboElTiempo`, que la fase nueva reusa, ya está
probado.

- [x] **Paso 2: La fase**

`src/lib/social/comentarios/redaccion.ts`:

```ts
import 'server-only'
import { and, desc, eq, isNull } from 'drizzle-orm'
import { getDb, postComments, socialPosts } from '@/db'
import { leerAjuste } from '@/lib/ajustes'
import { CLAVE_INSTRUCCIONES, normalizarInstrucciones } from './instrucciones'
import { comentaristaFor } from './index'
import { hayPasarela, pedirBorrador, SIN_BORRADOR } from './modelo'
import { limpiarBorrador } from './prompt'
import { MAX_BORRADORES_POR_CORRIDA, seAcaboElTiempo } from './ventana'

export type RedaccionReport = {
  redactados: number
  fallidos: number
  /** Sin credencial de la pasarela no se redacta nada, y no es un fallo. */
  sinPasarela: boolean
}

/**
 * Le pide un borrador a cada comentario pendiente que todavía no tiene ninguno, del más
 * nuevo al más viejo. Una fila que ya falló conserva su `draft_error` y no se reintenta
 * sola: reintentar es un botón de la cola, no un bucle del cron.
 */
export async function redactarPendientes(inicio: number): Promise<RedaccionReport> {
  const reporte: RedaccionReport = { redactados: 0, fallidos: 0, sinPasarela: false }
  if (!hayPasarela()) {
    reporte.sinPasarela = true
    return reporte
  }
  const db = getDb()

  const pendientes = await db
    .select({
      id: postComments.id,
      network: postComments.network,
      text: postComments.text,
      author: postComments.author,
      postExternalId: postComments.postExternalId,
      accountId: postComments.accountId,
    })
    .from(postComments)
    .where(
      and(
        eq(postComments.state, 'pendiente'),
        isNull(postComments.draft),
        isNull(postComments.draftError),
      ),
    )
    .orderBy(desc(postComments.publishedAt))
    .limit(MAX_BORRADORES_POR_CORRIDA)

  if (pendientes.length === 0) return reporte

  const instrucciones = normalizarInstrucciones(await leerAjuste(CLAVE_INSTRUCCIONES))

  for (const fila of pendientes) {
    // El mismo tope de la corrida que acota el descubrimiento: lo que no alcanzó espera la
    // pasada siguiente, que lo va a volver a encontrar igual de pendiente.
    if (seAcaboElTiempo(inicio, Date.now())) break

    const comentarista = comentaristaFor(fila.network)
    if (!comentarista) continue

    const [post] = await db
      .select({ caption: socialPosts.caption })
      .from(socialPosts)
      .where(
        and(
          eq(socialPosts.accountId, fila.accountId),
          eq(socialPosts.externalId, fila.postExternalId),
        ),
      )
      .limit(1)

    try {
      const crudo = await pedirBorrador({
        instrucciones,
        caption: post?.caption ?? null,
        comentario: fila.text,
        autor: fila.author,
      })
      const borrador = limpiarBorrador(crudo, comentarista.limiteTexto)
      // Un borrador vacío no sirve de nada en la cola: cuenta como fallo, y el dueño
      // reintenta o escribe a mano.
      if (borrador.length === 0) throw new Error('el modelo devolvió una respuesta vacía')
      await db
        .update(postComments)
        .set({ draft: borrador, draftError: null, updatedAt: new Date() })
        .where(eq(postComments.id, fila.id))
      reporte.redactados += 1
    } catch (error) {
      console.error(`[comentarios] borrador ${fila.network}:`, String(error).slice(0, 300))
      await db
        .update(postComments)
        .set({ draftError: SIN_BORRADOR, updatedAt: new Date() })
        .where(eq(postComments.id, fila.id))
      reporte.fallidos += 1
    }
  }

  return reporte
}
```

Fíjate en `limiteTexto`: hasta ahora lo declaraban los tres comentaristas y no lo leía nadie.
Esta es su primera lectura, y por eso el borrador se recorta al límite de la red **antes** de
guardarse y no al enviarse.

- [x] **Paso 3: Engancharla**

En `run.ts`, `sondearComentarios` ya mide `inicio`. Agrega el import:

```ts
import { redactarPendientes, type RedaccionReport } from './redaccion'
```

El tipo `SondeoReport` gana un campo, después de `sinSondear`:

```ts
  /** Lo que la fase de redacción alcanzó a hacer en esta misma corrida. */
  redaccion: RedaccionReport
```

Donde hoy se crea el reporte, inicialízalo con sus ceros, para que la forma de la respuesta
no dependa de hasta dónde llegó la corrida:

```ts
  const reporte: SondeoReport = {
    cuentas: [],
    sinSondear: 0,
    redaccion: { redactados: 0, fallidos: 0, sinPasarela: false },
  }
```

Y reemplaza el `return reporte` del final por:

```ts
  try {
    reporte.redaccion = await redactarPendientes(inicio)
  } catch (error) {
    // Publicar y descubrir mandan sobre redactar: si la fase entera revienta, la corrida
    // conserva lo que ya descubrió y los borradores esperan la pasada siguiente.
    console.error('[comentarios] redacción:', String(error).slice(0, 300))
  }
  return reporte
```

- [x] **Paso 4: El route**

`src/app/api/cron/publish-social/route.ts` ya devuelve `comentarios`. Como `SondeoReport`
solo gana un campo, lo único que puede faltar es el valor por defecto que el catch siembra
cuando el sondeo entero falla: verifícalo y agrégale `redaccion` con sus ceros si hace falta.

- [x] **Paso 5: Verificar**

Corre `npm test`, `npm run typecheck`, `npm run lint` y `npx next build`.

- [x] **Paso 6: Commit**

```bash
git add src/lib/social/comentarios/redaccion.ts src/lib/social/comentarios/ventana.ts src/lib/social/comentarios/run.ts src/app/api/cron/publish-social/route.ts
git commit
```

Mensaje: `Redacta el borrador de los comentarios pendientes en la misma corrida`

---

### Task 5: El instructivo

**Archivos:**
- Modificar: `README.md`
- Modificar: este plan (marcar las casillas)

- [x] **Paso 1: El README**

En la sección «Responder comentarios» que ya existe, después de lo que hay y antes de la
sección siguiente, agrega:

```markdown
El borrador lo escribe un modelo por la pasarela de IA de Vercel. Necesita
`AI_GATEWAY_API_KEY` en el entorno; en Vercel puedes omitirla si el proyecto usa OIDC. Sin
ella no se rompe nada: los comentarios entran a la cola sin borrador y los respondes a mano.
Con `COMENTARIOS_MODELO` cambias el modelo sin desplegar, con la forma `proveedor/modelo`.

Las instrucciones que sigue el modelo se guardan en la base y las vas a editar desde el
panel en la entrega siguiente. Hasta entonces rigen las de la casa: responder en español, en
primera persona, breve y cálido, sin inventar datos ni dar precios.

Después de fusionar hay que correr `npm run db:push` otra vez, porque la tabla de ajustes es
nueva.
```

Mantén el tono del resto: segunda persona, español, frases cortas.

- [x] **Paso 2: Las casillas**

Marca `[x]` los pasos de este plan que quedaron hechos.

- [x] **Paso 3: Verificar y commit**

Corre `npm run lint`.

```bash
git add README.md docs/superpowers/plans/2026-09-11-comentarios-2-borrador.md
git commit
```

Mensaje: `Explica qué necesita el borrador y qué pasa sin la pasarela`

---

## Lo que esta entrega no hace

- **No muestra nada.** La cola y el campo de instrucciones son la entrega 3; hasta entonces
  el borrador solo se ve en la base.
- **No reintenta solo.** Una fila con `draft_error` espera el botón de la cola.
- **No manda nada a ninguna red.** El único camino hacia la red sigue sin existir.
