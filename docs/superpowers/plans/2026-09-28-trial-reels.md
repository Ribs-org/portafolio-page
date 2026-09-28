# Trial reels en Instagram — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** que un reel de Instagram pueda salir como *trial reel*, elegible por destino desde el compositor, la API, el CSV y el teléfono, y documentado para un LLM.

**Architecture:** una opción por destino más —`{ trialReel: true }`— en el mismo molde que las de TikTok: la unión `OpcionesDestino` crece, el `jsonb` por destino la guarda sin migración, el publicador de Instagram la convierte en `trial_params` y una regla de media pura («un solo video, sin fotos») la protege en los cuatro caminos que crean posts. El teléfono aprende a mandar `opciones` por primera vez.

**Tech Stack:** Next.js (App Router, server actions), Drizzle sobre Postgres, Vitest, Expo / React Native para el teléfono.

**Spec:** `docs/superpowers/specs/2026-09-28-trial-reels-design.md`. El plan argumenta desde ahí; ante un conflicto, manda la spec.

## Restricciones globales

- **Un trial reel es exactamente un video, sin fotos.** Se rechaza al programar, antes de subir un byte, con la frase `Un trial reel es un solo video, sin fotos.`
- **Siempre `MANUAL`.** La graduación no viaja en ninguna superficie; el publicador la fija. Decisión del dueño del 2026-09-28.
- **Sin migración.** Es el mismo `jsonb` de `scheduled_post_targets.opciones`.
- **No se convierte un trial en reel normal por cuenta propia.** Si Instagram lo rechaza, el destino falla a la vista con `Instagram no permite trial reels en esta cuenta.`
- **Nada de analítica** sobre el trial reel: no hay API que lo mida.
- **Las opciones ya validadas viajan tal cual:** ningún camino reconstruye una `OpcionesDestino` a mano.
- **Comentarios y texto de cara al usuario en español.** El código sigue el estilo del archivo que se toca: `instagram.ts` y `publisher.ts` comentan en inglés, `opciones.ts` y `batch.ts` mezclan; respetar lo que haya alrededor.
- **La documentación se actualiza en la tarea que cambia el comportamiento** (`AGENTS.md`), no en una tarea final. Si de verdad no toca nada, se dice en el informe.
- **TDD:** primero el test que falla, después el código mínimo.
- **Un commit por tarea**, con el pie de autoría del repositorio.
- **Los tests corren sin `DATABASE_URL`.** Los del teléfono corren desde `mobile/` con su propio `npm test`.
- **El árbol compila y las dos suites pasan al final de cada tarea** (`npx vitest run`, `npm run typecheck`, `npm run lint`; y en `mobile/`: `npm test`, `npm run typecheck`, `npm run lint`).

---

### Tarea 1: El modelo — Instagram entra a `OpcionesDestino`

**Files:**
- Modify: `src/lib/social/publish/opciones.ts`
- Test: `src/lib/social/publish/opciones.test.ts`

**Interfaces:**
- Consumes: nada nuevo.
- Produces: `type OpcionesInstagram = { trialReel: true }`; `OpcionesDestino = OpcionesTikTok | OpcionesInstagram`; `TRIAL_REEL_MEDIA`; `errorDeMediaPorOpciones(opciones, conteos)`; `validarOpciones('instagram', raw)`; `resumenOpciones('instagram', …)`; `opcionesDesdeFormularioPorCuenta` leyendo `instagramTrial:<id>`.

**Una cosa que el test existente ya afirma y va a dejar de ser cierta:** `opciones.test.ts:81-87`
(«validarOpciones para otras redes») usa `instagram` como ejemplo de red que no acepta
opciones. Cámbialo a `threads`, que sigue sin aceptar nada. No borres el caso: sigue
protegiendo lo que protegía.

- [ ] **Step 1: Escribir los tests que fallan**

Al final de `src/lib/social/publish/opciones.test.ts` (y el cambio de `instagram` → `threads`
en el describe de «otras redes»):

```ts
describe('validarOpciones para instagram', () => {
  it('sin opciones, o con trialReel apagado, es null: reel normal y no se guarda nada', () => {
    expect(validarOpciones('instagram', undefined)).toEqual({ opciones: null })
    expect(validarOpciones('instagram', null)).toEqual({ opciones: null })
    expect(validarOpciones('instagram', { trialReel: false })).toEqual({ opciones: null })
  })

  it('trialReel: true se guarda tal cual', () => {
    expect(validarOpciones('instagram', { trialReel: true })).toEqual({ opciones: { trialReel: true } })
  })

  it('cualquier otra forma es la frase de forma: un modelo no puede mandar algo que se ignore', () => {
    // Un `trialreel` mal escrito, o una clave que todavía no existe (`graduacion`), no
    // pueden pasar en silencio como reel normal: el que la manda cree que se aplicó.
    expect(validarOpciones('instagram', { trialreel: true })).toEqual({ error: OPCIONES_ERROR })
    expect(validarOpciones('instagram', { trialReel: 'sí' })).toEqual({ error: OPCIONES_ERROR })
    expect(validarOpciones('instagram', { trialReel: true, graduacion: 'manual' })).toEqual({ error: OPCIONES_ERROR })
    expect(validarOpciones('instagram', 'trial')).toEqual({ error: OPCIONES_ERROR })
  })
})

describe('errorDeMediaPorOpciones', () => {
  const trial = { ig: { trialReel: true as const } }

  it('un trial reel exige exactamente un video, sin fotos', () => {
    expect(errorDeMediaPorOpciones(trial, { videos: 1, fotos: 0, sinTipo: 0 })).toBeNull()
    expect(errorDeMediaPorOpciones(trial, { videos: 0, fotos: 1, sinTipo: 0 })).toBe(TRIAL_REEL_MEDIA)
    expect(errorDeMediaPorOpciones(trial, { videos: 1, fotos: 1, sinTipo: 0 })).toBe(TRIAL_REEL_MEDIA)
    expect(errorDeMediaPorOpciones(trial, { videos: 2, fotos: 0, sinTipo: 0 })).toBe(TRIAL_REEL_MEDIA)
    expect(errorDeMediaPorOpciones(trial, { videos: 0, fotos: 0, sinTipo: 0 })).toBe(TRIAL_REEL_MEDIA)
  })

  it('antes de descargar, un archivo sin tipo conocido (un link de Drive) puede ser el video', () => {
    // La re-validación con los tipos reales da el veredicto final; acá no se rechaza
    // lo que todavía puede ser correcto.
    expect(errorDeMediaPorOpciones(trial, { videos: 0, fotos: 0, sinTipo: 1 })).toBeNull()
    expect(errorDeMediaPorOpciones(trial, { videos: 0, fotos: 0, sinTipo: 2 })).toBe(TRIAL_REEL_MEDIA)
    expect(errorDeMediaPorOpciones(trial, { videos: 1, fotos: 0, sinTipo: 1 })).toBe(TRIAL_REEL_MEDIA)
  })

  it('sin trial reel no opina, aunque haya opciones de TikTok', () => {
    expect(errorDeMediaPorOpciones({}, { videos: 0, fotos: 3, sinTipo: 0 })).toBeNull()
    expect(errorDeMediaPorOpciones({ tt: { modo: 'borrador' } }, { videos: 0, fotos: 3, sinTipo: 0 })).toBeNull()
  })
})

describe('opcionesDesdeFormularioPorCuenta para instagram', () => {
  const ig = { id: 'ig-1', network: 'instagram', handle: 'vicente' }

  it('el interruptor encendido produce trialReel: true; apagado o ausente, nada', () => {
    const encendido = new FormData()
    encendido.set('instagramTrial:ig-1', 'on')
    expect(opcionesDesdeFormularioPorCuenta(encendido, [ig])).toEqual({ 'ig-1': { trialReel: true } })

    const apagado = new FormData()
    apagado.set('instagramTrial:ig-1', '')
    expect(opcionesDesdeFormularioPorCuenta(apagado, [ig])).toEqual({})
    expect(opcionesDesdeFormularioPorCuenta(new FormData(), [ig])).toEqual({})
  })
})

describe('resumenOpciones para instagram', () => {
  it('un trial reel se resume en una línea que dice quién lo comparte', () => {
    expect(resumenOpciones('instagram', { trialReel: true })).toBe('Trial reel — lo compartes tú desde Instagram')
    expect(resumenOpciones('instagram', null)).toBeNull()
    expect(resumenOpciones('instagram', { trialReel: false })).toBeNull()
  })
})
```

Suma `TRIAL_REEL_MEDIA` y `errorDeMediaPorOpciones` al `import` de arriba.

- [ ] **Step 2: Correr y verlos fallar**

Run: `npx vitest run src/lib/social/publish/opciones.test.ts`
Expected: FAIL — `errorDeMediaPorOpciones` y `TRIAL_REEL_MEDIA` no existen, y `validarOpciones('instagram', { trialReel: true })` devuelve `OPCIONES_ERROR`.

- [ ] **Step 3: El modelo**

En `src/lib/social/publish/opciones.ts`, junto a los tipos de TikTok:

```ts
/**
 * Instagram: un reel puede salir como trial reel —solo lo ven quienes no siguen la cuenta,
 * hasta que el dueño lo comparte con todos desde la app de Instagram—. La graduación no
 * viaja: el publicador manda siempre `MANUAL` (decisión del dueño, 2026-09-28). El día
 * que se quiera que decida Instagram, es un campo opcional acá con `manual` por defecto,
 * y lo ya guardado sigue valiendo.
 */
export type OpcionesInstagram = { trialReel: true }

export type OpcionesDestino = OpcionesTikTok | OpcionesInstagram
```

La frase, junto a las otras:

```ts
export const TRIAL_REEL_MEDIA = 'Un trial reel es un solo video, sin fotos.'
```

La validación, junto a `validarTikTok`:

```ts
/**
 * Ausente o apagado es un reel normal y no se guarda nada; encendido se guarda tal cual.
 * Cualquier otra forma se rechaza —incluida una clave desconocida—: quien manda
 * `trialreel` mal escrito, o una `graduacion` que todavía no existe, tiene que enterarse,
 * no recibir un reel normal creyendo que pidió otra cosa. (TikTok ignora claves de más;
 * acá no, porque esta opción la manda sobre todo un modelo a ciegas.)
 */
function validarInstagram(raw: unknown): { opciones: OpcionesInstagram | null } | { error: string } {
  if (raw === undefined || raw === null) return { opciones: null }
  if (!esObjeto(raw)) return { error: OPCIONES_ERROR }
  if (JSON.stringify(raw).length > MAX_SERIALIZED) return { error: OPCIONES_ERROR }
  for (const clave of Object.keys(raw)) if (clave !== 'trialReel') return { error: OPCIONES_ERROR }
  const trialReel = casilla(raw.trialReel)
  if (trialReel === null) return { error: OPCIONES_ERROR }
  return { opciones: trialReel ? { trialReel: true } : null }
}
```

y en `validarOpciones`, antes de la línea que devuelve `null` para las demás redes:

```ts
  if (network === 'instagram') return validarInstagram(raw)
```

La regla de media, pura, exportada:

```ts
/**
 * Un trial reel es exactamente un video, sin fotos. Depende de la opción y no de la red,
 * por eso no vive en `validateScheduleDraft`: la aplican los cuatro caminos que crean
 * posts (lote, compositor, chequeo y creación del teléfono) sobre las opciones ya
 * resueltas por cuenta. `sinTipo` son los archivos cuyo tipo todavía no se conoce (una
 * URL de Drive antes de descargarla): uno solo puede ser el video, así que no se rechaza;
 * la re-validación con los tipos reales da el veredicto final.
 */
export function errorDeMediaPorOpciones(
  opciones: Record<string, OpcionesDestino>,
  conteos: { videos: number; fotos: number; sinTipo: number },
): string | null {
  const hayTrial = Object.values(opciones).some((o) => 'trialReel' in o)
  if (!hayTrial) return null
  if (conteos.fotos > 0 || conteos.videos > 1) return TRIAL_REEL_MEDIA
  if (conteos.videos + conteos.sinTipo !== 1) return TRIAL_REEL_MEDIA
  return null
}
```

En `opcionesDesdeFormularioPorCuenta`, el bucle deja de saltarse todo lo que no es TikTok:

```ts
  for (const cuenta of cuentas) {
    if (cuenta.network === 'instagram') {
      // `Toggle` con `name` manda 'on' encendido y '' apagado; apagado no produce entrada.
      if (formData.get(`instagramTrial:${cuenta.id}`) === 'on') raw[cuenta.id] = { trialReel: true }
      continue
    }
    if (cuenta.network !== 'tiktok') continue
    …lo que ya hay…
```

Y actualiza el docstring de esa función: hoy dice «Los campos de TikTok llevan el
identificador…»; ahora son los de TikTok y el interruptor de Instagram.

En `resumenOpciones`, antes del `if (network !== 'tiktok') return null`:

```ts
  if (network === 'instagram') {
    const check = validarInstagram(opciones)
    return 'error' in check || !check.opciones ? null : 'Trial reel — lo compartes tú desde Instagram'
  }
```

Y el comentario de cabecera del archivo («Hoy solo TikTok pide algo…») ya no es cierto:
reescríbelo.

- [ ] **Step 4: Correr y verlos pasar**

Run: `npx vitest run src/lib/social/publish/opciones.test.ts`, después `npx vitest run`, `npm run typecheck`, `npm run lint`.

**Ojo con el typecheck:** al crecer la unión, cualquier sitio que hoy lea `opciones.modo` o
`opciones.privacidad` sin comprobar la red deja de compilar. `tiktok.ts` recibe
`OpcionesTikTok` tipado y no debería quejarse; si algo se queja, la salida correcta es
estrechar con `'modo' in opciones`, **no** un `as`.

- [ ] **Step 5: Documentación**

Revisa `README.md` y `docs/` con `grep -n "Hoy solo TikTok\|solo TikTok pide"`. Lo que diga que
solo TikTok pide opciones se corrige en la tarea que hace cierta la API (Tarea 2), no acá:
hoy, con este commit solo, la API todavía rechaza la opción de Instagram por la regla de
media que aún no está cableada. Dilo así en el informe.

- [ ] **Step 6: Commit**

```bash
git add src/lib/social/publish/opciones.ts src/lib/social/publish/opciones.test.ts
git commit -m "Instagram entra a OpcionesDestino con trialReel"
```

---

### Tarea 2: La API del lote lo acepta, con su regla de media, y queda documentado

**Files:**
- Modify: `src/lib/social/publish/batch.ts` (`validateBatchItem`, `scheduleBatch`)
- Modify: `public/docs/api-editor.md`, `public/docs/api-llm.md`, `public/docs/api.json`, `README.md`
- Test: `src/lib/social/publish/batch.test.ts`, `src/lib/docs-api.test.ts`

**Interfaces:**
- Consumes: `errorDeMediaPorOpciones`, `TRIAL_REEL_MEDIA` (Tarea 1); `mediaTypeFromUrl` (devuelve `null` cuando no reconoce la extensión: un link de Drive); `contarMedia` (cuenta ese `null` como imagen — por eso hay que contar `sinTipo` aparte).

**Dónde entra la regla, y por qué en tres sitios.** `validateBatchItem` es puro y ya resuelve
las opciones cuando la fila nombra **redes** (arma destinos de mentira por red); con
**cuentas** nombradas solo comprueba la forma, y `scheduleBatch` hace la comprobación
completa ya con los destinos verificados, antes de subir nada (líneas ~391-399). Y después
de subir, `scheduleBatch` vuelve a correr las reglas de forma con los tipos reales
(`shapeError`, ~463). La regla de media va en los tres: la primera y la segunda con los
tipos declarados (donde un Drive es `sinTipo`), la tercera con los reales (`sinTipo: 0`).

- [ ] **Step 1: Escribir los tests que fallan**

En `src/lib/social/publish/batch.test.ts`, dentro de `describe('opciones por red en el lote')`:

```ts
  it('instagram acepta trialReel con un solo video', () => {
    const fila: BatchItem = { ...base, redes: ['instagram'], media: ['https://ej.com/a.mp4'] }
    expect(validateBatchItem({ ...fila, opciones: { instagram: { trialReel: true } } }, now)).toBeNull()
    expect(validateBatchItem({ ...fila, opciones: { instagram: { trialReel: false } } }, now)).toBeNull()
  })

  it('un trial reel con fotos, con dos videos o sin video se rechaza por su frase', () => {
    const trial = { ...base, redes: ['instagram'], opciones: { instagram: { trialReel: true } } }
    expect(validateBatchItem({ ...trial, media: ['https://ej.com/a.jpg'] }, now)).toBe(TRIAL_REEL_MEDIA)
    expect(validateBatchItem({ ...trial, media: ['https://ej.com/a.mp4', 'https://ej.com/b.jpg'] }, now)).toBe(
      TRIAL_REEL_MEDIA,
    )
    expect(validateBatchItem({ ...trial, media: ['https://ej.com/a.mp4', 'https://ej.com/b.mp4'] }, now)).toBe(
      TRIAL_REEL_MEDIA,
    )
    expect(validateBatchItem({ ...trial, media: [] }, now)).toBe(TRIAL_REEL_MEDIA)
  })

  it('un link de Drive puede ser el video del trial reel: no se rechaza antes de descargar', () => {
    const trial = { ...base, redes: ['instagram'], opciones: { instagram: { trialReel: true } } }
    expect(validateBatchItem({ ...trial, media: ['https://drive.google.com/uc?id=x'] }, now)).toBeNull()
  })

  it('la forma de instagram se comprueba igual que la de tiktok', () => {
    const fila: BatchItem = { ...base, redes: ['instagram'], media: ['https://ej.com/a.mp4'] }
    expect(validateBatchItem({ ...fila, opciones: { instagram: { trialreel: true } } }, now)).toBe(OPCIONES_ERROR)
  })
```

Suma `TRIAL_REEL_MEDIA` al import desde `./opciones`.

Y en `src/lib/docs-api.test.ts`, la lista de frases del primer test gana la nueva. Importa
`TRIAL_REEL_MEDIA` desde `./social/publish/opciones` y agrégala al array del `for`. (El
test de la guía lee `api-llm.md`, así que fallará hasta que la guía la tenga.)

- [ ] **Step 2: Correr y verlos fallar**

Run: `npx vitest run src/lib/social/publish/batch.test.ts src/lib/docs-api.test.ts`
Expected: FAIL — el segundo `it` devuelve `null` en vez de la frase; el de la guía no encuentra la frase.

- [ ] **Step 3: La regla en `validateBatchItem`**

Después de `const opcionesCheck = opcionesDeFila(item, destinosParaOpciones)` y su `if`:

```ts
  // La regla de media que depende de la opción y no de la red (un trial reel es un solo
  // video). Con cuentas nombradas `opciones` viene vacío acá y la corre `scheduleBatch`.
  const sinTipo = item.media.filter((url) => mediaTypeFromUrl(url) === null).length
  const mediaPorOpciones = errorDeMediaPorOpciones(opcionesCheck.opciones, {
    videos: videoCount,
    fotos: imageCount - sinTipo,
    sinTipo,
  })
  if (mediaPorOpciones) return mediaPorOpciones
```

**Cuidado:** `contarMedia` cuenta el `null` de `mediaTypeFromUrl` como imagen (así lo
documenta su comentario). Por eso `fotos` es `imageCount - sinTipo`: si pasas `imageCount`
a secas, un Drive se rechaza como foto y el tercer test cae.

- [ ] **Step 4: La regla en `scheduleBatch`, dos veces**

Primera, antes de subir, justo después de `const opciones = opcionesCheck.opciones` y del
`contarMedia` que ya está más abajo (mueve la llamada a `contarMedia` arriba si hace falta
para tenerla a mano; que quede una sola):

```ts
      const sinTipoDeclarado = item.media.filter((url) => mediaTypeFromUrl(url) === null).length
      const mediaPorOpciones = errorDeMediaPorOpciones(opciones, {
        videos: videoCountDeclarado,
        fotos: imageCountDeclarado - sinTipoDeclarado,
        sinTipo: sinTipoDeclarado,
      })
      if (mediaPorOpciones) {
        results.push({ index, ok: false, error: mediaPorOpciones })
        continue
      }
```

Segunda, después de subir, junto a `shapeError` (~463), con los tipos reales de `uploaded`:

```ts
      const mediaReal = errorDeMediaPorOpciones(opciones, {
        videos: uploaded.filter((m) => m.mediaType === 'video').length,
        fotos: uploaded.filter((m) => m.mediaType === 'image').length,
        sinTipo: 0,
      })
      if (mediaReal) {
        results.push({ index, ok: false, error: mediaReal })
        continue
      }
```

La segunda no tiene test unitario barato (requiere el doble de base de `scheduleBatch`, que
ya existe en `batch.test.ts` para el documento): **añade uno** con la misma forma — una fila
con `trialReel` y un Drive que al descargar resulta imagen se rechaza con `TRIAL_REEL_MEDIA`
y no inserta nada. Mira cómo lo hacen los tests de `scheduleBatch` que ya están (mockean
`./documento` y `@/db`; acá hay que mockear `mediaToBlob`, que está en el mismo archivo —
usa `vi.spyOn` sobre el módulo importado o el patrón que esos tests ya usen para `fetch`).
Si el arnés existente no lo permite sin construir algo nuevo, dímelo en el informe en vez
de inventarlo.

- [ ] **Step 5: Correr y verlos pasar**

Run: `npx vitest run`, `npm run typecheck`, `npm run lint`.

- [ ] **Step 6: Documentar el contrato**

`public/docs/api-editor.md`, sección `opciones` (~línea 167):

- El encabezado pasa a `### \`opciones\` (obligatorio si algún destino es una cuenta de TikTok; opcional para Instagram)`.
- El primer párrafo dice «Hoy solo TikTok pide algo»: ya no. Reescríbelo.
- Al final de la sección, un bloque **Instagram** con esto, en prosa:
  - La forma: `"opciones": { "instagram": { "trialReel": true } }` (o por id de cuenta con dos cuentas de Instagram en la fila, con la misma regla de claves que TikTok).
  - Qué es un trial reel: solo lo ven quienes no siguen la cuenta; **el dueño lo comparte con todos desde la app de Instagram** cuando quiera. No hay graduación automática.
  - **Solo aplica a un video**: con fotos, carrusel o sin video, la fila falla con `Un trial reel es un solo video, sin fotos.`
  - **La elegibilidad se descubre al publicar, no al programar:** Instagram tiene que tener la función habilitada en esa cuenta (profesional, pública y con seguidores suficientes, según Meta); una fila aceptada puede fallar después en ese destino, con su frase (la trae la Tarea 3).
  - **Después no hay forma de saber por API si se graduó.** Eso se mira en Instagram.
- En la tabla «Errores por fila», la fila de `Un trial reel es un solo video, sin fotos.`

`public/docs/api-llm.md`: en la tabla de frases (sección 3), la fila nueva; y en la sección 4
(«Lo que esta API no hace») una viñeta: **no devuelve las opciones** de un post ya
programado — `GET /api/schedule/posts` no las trae, así que un trial reel no se puede
verificar después por API (`grep opciones src/lib/schedule-api.ts` no encuentra nada; si
eso cambia, esta viñeta cambia). Y una subsección corta, «Trial reels», con la petición
copiable y las tres cosas de arriba (un video; elegibilidad al publicar; no se sabe si se
graduó).

`public/docs/api.json`: la `description` de `opciones` dice «hoy la única red que pide algo»
y describe solo TikTok; suma la forma de Instagram: `{ trialReel?: boolean }`.

`README.md`: `grep -n "opciones" README.md` — la línea ~299 («TikTok pide sus propias
opciones por destino…») y la ~692 («`opciones`, obligatorio cuando algún destino…»)
tienen que decir que Instagram también puede pedir una. Busca, no recuerdes.

- [ ] **Step 7: Correr todo y commitear**

Run: `npx vitest run`, `npm run typecheck`, `npm run lint`, `npm run build`.

```bash
git add src/lib/social/publish/batch.ts src/lib/social/publish/batch.test.ts src/lib/docs-api.test.ts public/docs README.md
git commit -m "El lote acepta un trial reel y lo rechaza si no es un solo video"
```

---

### Tarea 3: El publicador manda `trial_params` y explica el rechazo

**Files:**
- Modify: `src/lib/social/publish/publisher.ts` (la frase nueva; el comentario de `PublishInput.opciones`)
- Modify: `src/lib/social/publish/instagram.ts`
- Modify: `docs/deuda-tecnica.md`, `public/docs/api-editor.md`, `public/docs/api-llm.md`
- Test: `src/lib/social/publish/instagram.test.ts`, `src/lib/docs-api.test.ts`

**Interfaces:**
- Consumes: `OpcionesDestino` (Tarea 1); `PublishInput.opciones` (ya llega al publicador, hoy lo ignora).
- Produces: `TRIAL_REEL_NO_DISPONIBLE`; `reelContainerParams(caption, media, coverUrl, opciones)`; `motivoDeRechazo(cuerpo, opciones)`.

- [ ] **Step 1: Escribir los tests que fallan**

En `src/lib/social/publish/instagram.test.ts`:

```ts
describe('reelContainerParams con trial reel', () => {
  const media = { url: 'https://blob/v.mp4', mediaType: 'video' as const, position: 0 }

  it('con trialReel agrega trial_params en MANUAL, como JSON en el form', () => {
    expect(reelContainerParams('Hola', media, null, { trialReel: true })).toEqual({
      media_type: 'REELS',
      video_url: 'https://blob/v.mp4',
      caption: 'Hola',
      trial_params: '{"graduation_strategy":"MANUAL"}',
    })
  })

  it('con portada y trial, van las dos', () => {
    expect(reelContainerParams('Hola', media, 'https://blob/p.jpg', { trialReel: true })).toMatchObject({
      cover_url: 'https://blob/p.jpg',
      trial_params: '{"graduation_strategy":"MANUAL"}',
    })
  })

  it('sin opciones, o con las de otra red, no hay trial_params', () => {
    expect(reelContainerParams('Hola', media, null, null)).not.toHaveProperty('trial_params')
    expect(reelContainerParams('Hola', media, null, { modo: 'borrador' })).not.toHaveProperty('trial_params')
  })
})

describe('motivoDeRechazo', () => {
  const cuerpo = '{"error":{"message":"Trial reels are not available for this account","code":100}}'

  it('un rechazo que habla de trial, en un trial reel, es la frase fija', () => {
    expect(motivoDeRechazo(cuerpo, { trialReel: true })).toBe(TRIAL_REEL_NO_DISPONIBLE)
  })

  it('el mismo cuerpo sin trial reel pedido no es esa frase: se trata como hasta ahora', () => {
    expect(motivoDeRechazo(cuerpo, null)).toBeNull()
  })

  it('otro rechazo en un trial reel tampoco: solo se explica lo que se sabe explicar', () => {
    expect(motivoDeRechazo('{"error":{"message":"Invalid parameter","code":100}}', { trialReel: true })).toBeNull()
  })
})
```

Y un test del camino real de `publish`, con `fetch` doblado (patrón: `vi.stubGlobal('fetch', …)`
+ `vi.unstubAllGlobals()` en `afterEach`, como en `facebook.test.ts`):

```ts
describe('publish: el rechazo de un trial reel', () => {
  afterEach(() => vi.unstubAllGlobals())

  const input = {
    caption: 'Hola',
    media: [{ url: 'https://blob/v.mp4', mediaType: 'video' as const, position: 0 }],
    containerId: null,
    token: 't',
    accountExternalId: '123',
    coverUrl: null,
  }
  const cuatrocientos = () =>
    new Response('{"error":{"message":"Trial reels are not available for this account"}}', { status: 400 })

  it('en un trial reel, falla con la frase fija y no se reintenta como fallo de red', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => cuatrocientos()))
    const salida = await instagramPublisher.publish({ ...input, opciones: { trialReel: true } })
    expect(salida).toEqual({ kind: 'failed', reason: TRIAL_REEL_NO_DISPONIBLE })
  })

  it('en un reel normal, el mismo 400 sigue siendo el fallo de red de siempre', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => cuatrocientos()))
    const salida = await instagramPublisher.publish({ ...input, opciones: null })
    expect(salida).toEqual({ kind: 'failed', reason: PUBLISH_NETWORK_ERROR })
  })
})
```

Importa `afterEach`, `vi`, `instagramPublisher`, `motivoDeRechazo`, `TRIAL_REEL_NO_DISPONIBLE`
y `PUBLISH_NETWORK_ERROR` según corresponda.

En `src/lib/docs-api.test.ts`, la lista de frases gana `TRIAL_REEL_NO_DISPONIBLE` (importada
desde `./social/publish/publisher`).

- [ ] **Step 2: Correr y verlos fallar**

Run: `npx vitest run src/lib/social/publish/instagram.test.ts src/lib/docs-api.test.ts`

- [ ] **Step 3: La frase y el comentario en `publisher.ts`**

Junto a `PUBLISH_REJECTED`:

```ts
export const TRIAL_REEL_NO_DISPONIBLE = 'Instagram no permite trial reels en esta cuenta.'
```

Y el comentario de `PublishInput.opciones` dice «(TikTok)»: ahora es TikTok e Instagram.

- [ ] **Step 4: `reelContainerParams` y el rechazo**

En `src/lib/social/publish/instagram.ts`:

```ts
import type { OpcionesDestino } from './opciones'
import { PUBLISH_NETWORK_ERROR, PUBLISH_REJECTED, TRIAL_REEL_NO_DISPONIBLE } from './publisher'

// Always MANUAL: the owner graduates the reel from the Instagram app (their call,
// 2026-09-28). `trial_params` is a JSON object on Meta's side, but /media is form
// encoded, so it travels as a JSON string.
const TRIAL_PARAMS = JSON.stringify({ graduation_strategy: 'MANUAL' })

export function reelContainerParams(
  caption: string,
  media: PublishMedia,
  coverUrl: string | null,
  opciones: OpcionesDestino | null = null,
): Record<string, string> {
  const params: Record<string, string> = { media_type: 'REELS', video_url: media.url, caption }
  if (coverUrl) params.cover_url = coverUrl
  if (opciones && 'trialReel' in opciones) params.trial_params = TRIAL_PARAMS
  return params
}

/**
 * Meta does not document which code a trial-reel rejection carries, so this matches on
 * the message text — and only when a trial reel was asked for, so an unrelated error
 * that happens to say "trial" on a normal reel keeps its usual treatment. If Meta
 * changes the wording, the failure falls back to the generic sentence: nothing is
 * lost, it is just explained worse. See the spec, section 4.
 */
export function motivoDeRechazo(cuerpo: string, opciones: OpcionesDestino | null): string | null {
  if (!opciones || !('trialReel' in opciones)) return null
  return /trial/i.test(cuerpo) ? TRIAL_REEL_NO_DISPONIBLE : null
}
```

`postForm` deja de tragarse el cuerpo: devuelve `{ data }` o `{ rechazo: string }` (el texto
del cuerpo, ya registrado en el log como hoy). `createContainer` pasa a devolver
`{ id: string } | { failed: string }`, donde `failed` es `motivoDeRechazo(cuerpo, input.opciones) ?? PUBLISH_NETWORK_ERROR`
para un no-ok, y `PUBLISH_NETWORK_ERROR` si el `id` no vino. Los tres sitios que llaman a
`createContainer` cambian su `if (!containerId)` por `if ('failed' in r) return { kind: 'failed', reason: r.failed }`.
La llamada del reel pasa `input.opciones`. `publishContainer` sigue como está (su fallo ya
es `PUBLISH_REJECTED`).

**No amplíes el alcance:** el mapeo por texto se aplica solo al contenedor de un trial reel.
Para todo lo demás, un no-ok sigue siendo `PUBLISH_NETWORK_ERROR`, exactamente como hoy.

- [ ] **Step 5: Correr y verlos pasar**

Run: `npx vitest run`, `npm run typecheck`, `npm run lint`.

- [ ] **Step 6: Documentación**

- `public/docs/api-editor.md` y `public/docs/api-llm.md`: en las tablas de errores, la frase
  `Instagram no permite trial reels en esta cuenta.` con la nota de que **no es un error de
  la fila**: aparece después, en el error del destino (el panel y `GET /api/schedule/posts`
  lo muestran en `error` del destino), porque la elegibilidad solo se conoce al publicar.
- `docs/deuda-tecnica.md`: una entrada «Tres cosas de los trial reels que no se pudieron
  verificar», con fecha, para los tres puntos abiertos de la spec (sección 10): si
  `trial_params` convive con `cover_url`; si el sync de métricas ve un trial reel no
  graduado; y la forma exacta del error de rechazo (hoy se detecta por texto). Con lo que
  costaría cerrarlas: una cuenta con la función habilitada y una tarde.

- [ ] **Step 7: Commit**

```bash
git add src/lib/social/publish/publisher.ts src/lib/social/publish/instagram.ts src/lib/social/publish/instagram.test.ts src/lib/docs-api.test.ts docs/deuda-tecnica.md public/docs
git commit -m "El publicador de Instagram manda trial_params y explica el rechazo"
```

---

### Tarea 4: El compositor web

**Files:**
- Create: `src/app/admin/(dash)/schedule/instagram-opciones.tsx`
- Modify: `src/app/admin/(dash)/schedule/composer.tsx`
- Modify: `src/app/admin/actions.ts` (`createScheduledPost`)
- Test: `src/app/admin/(dash)/schedule/composer.test.ts`

**Interfaces:**
- Consumes: `opcionesDesdeFormularioPorCuenta` leyendo `instagramTrial:<id>` y `errorDeMediaPorOpciones` (Tarea 1); `Toggle` de `@/components/ui` (con `name`, manda `'on'` o `''` en un `<input hidden>`).

**Lo que el compositor sabe hoy y lo que necesita saber.** Mantiene `cuentasTikTok` (las
marcadas, para dibujar un bloque por cuenta) y `soloFotos` (para esconder dúo y pegar).
Para Instagram necesita lo mismo más una cosa: si hay **exactamente un video** elegido. El
bloque de Instagram solo se dibuja cuando se cumple; con fotos, carrusel o sin archivo no
aparece, y como `Toggle` no está montado, no manda nada.

- [ ] **Step 1: Escribir el test que falla**

`cuentasTikTokIniciales` está probada en `composer.test.ts:31`. Generalízala a
`cuentasInicialesDe(publicables, network)` —misma lógica, la red como parámetro— y
reescribe ese `describe` para las dos redes:

```ts
describe('cuentasInicialesDe', () => {
  it('devuelve las cuentas de esa red que empiezan marcadas, y ninguna de otra red', () => {
    const ig = { id: 'ig', network: 'instagram', connected: true }
    const tt = { id: 'tt', network: 'tiktok', connected: true }
    expect(cuentasInicialesDe([ig], 'instagram')).toEqual([ig])
    expect(cuentasInicialesDe([ig], 'tiktok')).toEqual([])
    expect(cuentasInicialesDe([ig, tt], 'instagram')).toEqual([]) // dos candidatas: ninguna marcada
    expect(cuentasInicialesDe([tt], 'tiktok')).toEqual([tt])
  })
})
```

Conserva lo que el `describe` viejo afirmaba (su caso del dueño con una sola cuenta de
TikTok) dentro del nuevo.

- [ ] **Step 2: Correr y verlo fallar**

Run: `npx vitest run "src/app/admin/(dash)/schedule/composer.test.ts"`

- [ ] **Step 3: El bloque**

`src/app/admin/(dash)/schedule/instagram-opciones.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { GroupLabel, Toggle } from '@/components/ui'
import type { CuentaDestino } from '@/lib/social/cuentas'

/**
 * Lo único que Instagram deja elegir por destino: si el reel sale como trial reel. Solo se
 * monta con exactamente un video elegido (lo decide el compositor), así que con fotos o
 * carrusel el interruptor ni existe y no manda nada. El campo lleva el id de la cuenta
 * como sufijo, igual que los de TikTok: puede haber dos bloques en el mismo formulario.
 */
export function InstagramOpciones({ cuenta }: { cuenta: CuentaDestino }) {
  const [trial, setTrial] = useState(false)
  return (
    <div className="space-y-3 rounded-xl bg-white/[0.04] p-4">
      <GroupLabel>Instagram · {cuenta.handle ?? 'sin nombre'}</GroupLabel>
      <Toggle
        name={`instagramTrial:${cuenta.id}`}
        label="Publicar como trial reel"
        hint="Solo lo ven quienes no te siguen. Tú decides desde Instagram cuándo compartirlo con todos."
        checked={trial}
        onChange={setTrial}
      />
    </div>
  )
}
```

- [ ] **Step 4: El compositor**

En `composer.tsx`:

- `cuentasTikTokIniciales` → `cuentasInicialesDe(publicables, network)`; `cuentasTikTok` se
  siembra con `cuentasInicialesDe(publicables, 'tiktok')` y nace `cuentasInstagram` con
  `cuentasInicialesDe(publicables, 'instagram')`.
- `alternar` deja de salir en `if (cuenta.network !== 'tiktok') return`: atiende las dos
  redes, cada una a su lista.
- Junto a `soloFotos`, `const [unVideo, setUnVideo] = useState(false)`, y en el `onChange`
  del `<Input type="file">`: `setUnVideo(files.length === 1 && files[0]!.type.startsWith('video/'))`.
- Debajo de los bloques de TikTok:

```tsx
        {unVideo ? cuentasInstagram.map((cuenta) => <InstagramOpciones key={cuenta.id} cuenta={cuenta} />) : null}
```

El comentario de cabecera sobre `ENABLED`/`NETWORKS` dice que el editor no puede recoger
las opciones de TikTok; sigue siendo cierto y no cambia: un destino de Instagram sí se
puede agregar desde el editor, como reel normal.

- [ ] **Step 5: La acción**

En `createScheduledPost` (`actions.ts:641`), después del `opcionesCheck` y antes de
`validarRegla`:

```ts
  // Un trial reel es un solo video: la opción ya está resuelta por cuenta y los tipos
  // son reales (el navegador subió antes de enviar), así que no hay `sinTipo`.
  const mediaPorOpciones = errorDeMediaPorOpciones(opcionesCheck.opciones, {
    videos: videoCount,
    fotos: uploaded.length - videoCount,
    sinTipo: 0,
  })
  if (mediaPorOpciones) return { error: mediaPorOpciones }
```

Importa `errorDeMediaPorOpciones` junto a las otras de `opciones`.

- [ ] **Step 6: Correr y verlos pasar**

Run: `npx vitest run`, `npm run typecheck`, `npm run lint`, `npm run build`.

- [ ] **Step 7: Documentación**

`README.md`: donde describe el compositor y sus bloques por red (`grep -n "bloque\|TikTok pide" README.md`), que Instagram muestra su interruptor con un solo video. Si el README no describe el compositor a ese nivel, dilo en el informe.

- [ ] **Step 8: Commit**

```bash
git add "src/app/admin/(dash)/schedule/instagram-opciones.tsx" "src/app/admin/(dash)/schedule/composer.tsx" "src/app/admin/(dash)/schedule/composer.test.ts" src/app/admin/actions.ts README.md
git commit -m "El compositor ofrece el trial reel con un solo video"
```

---

### Tarea 5: El teléfono, del lado del servidor

**Files:**
- Modify: `src/lib/mobile-api.ts` (`BorradorMovil`, `parseBorradorMovil`)
- Modify: `src/app/api/mobile/schedule/check/route.ts`, `src/app/api/mobile/schedule/route.ts`
- Test: `src/lib/mobile-api.test.ts`, `src/app/api/mobile/schedule/check/route.test.ts`, `src/app/api/mobile/schedule/route.test.ts`

**Interfaces:**
- Consumes: `validarOpcionesPorCuenta` (ya existe; ignora las claves que no son de una cuenta pedida), `errorDeMediaPorOpciones` (Tarea 1), `resolverDestinos` (devuelve `cuentas` y `networks`; el chequeo hoy solo toma `networks`).
- Produces: el cuerpo de `check` y `schedule` acepta `opciones: { [cuentaId]: { trialReel: true } }`.

**El orden importa y es el mismo en las dos rutas:** `resolverDestinos` primero —la red
que cuenta es la de la cuenta real—, luego `validarOpcionesPorCuenta(cuentas, borrador.opciones)`,
luego la regla de media con los conteos, luego `validateScheduleDraft` como hasta ahora.

- [ ] **Step 1: Escribir los tests que fallan**

`src/lib/mobile-api.test.ts`, en `describe('parseBorradorMovil')`:

```ts
  it('acepta opciones como objeto de objetos, y ausente vale vacío', () => {
    expect(parseBorradorMovil({ ...bueno, opciones: { 'ig-1': { trialReel: true } } })).toMatchObject({
      opciones: { 'ig-1': { trialReel: true } },
    })
    expect(parseBorradorMovil(bueno)).toMatchObject({ opciones: {} })
  })

  it('opciones que no son un objeto de objetos no tienen la forma', () => {
    expect(parseBorradorMovil({ ...bueno, opciones: 'trial' })).toEqual({ error: CUERPO_ILEGIBLE })
    expect(parseBorradorMovil({ ...bueno, opciones: ['ig-1'] })).toEqual({ error: CUERPO_ILEGIBLE })
    expect(parseBorradorMovil({ ...bueno, opciones: { 'ig-1': true } })).toEqual({ error: CUERPO_ILEGIBLE })
  })
```

**Los dos tests existentes que hacen `toEqual` sobre el borrador entero** («recorta el texto…»
y «texto ausente…») tienen que ganar `opciones: {}`; si no, caen por una clave de más.

En los dos `route.test.ts` (mira cómo doblan `resolverDestinos` y `crearPostProgramado` en
sus `vi.mock`; sigue exactamente esa forma):

- `schedule/route.test.ts`: (a) un cuerpo con `opciones: { '<id resuelto>': { trialReel: true } }`
  y un solo video → `crearPostProgramado` recibe `opciones` con esa cuenta; (b) el mismo
  cuerpo con una foto → 400 con `TRIAL_REEL_MEDIA` y `crearPostProgramado` **no** se llama;
  (c) `opciones` de forma mala para esa cuenta → 400 con `OPCIONES_ERROR`.
- `check/route.test.ts`: (b) y (c), con los conteos `fotos`/`videos` que ese cuerpo ya manda.

- [ ] **Step 2: Correr y verlos fallar**

Run: `npx vitest run src/lib/mobile-api.test.ts src/app/api/mobile/schedule`

- [ ] **Step 3: El borrador**

En `src/lib/mobile-api.ts`:

```ts
export type BorradorMovil = {
  texto: string
  redes: string[]
  cuentas: string[]
  cuando: string | null
  ahora: boolean
  /** Lo que cada cuenta pidió, crudo: lo valida el servidor después de resolver los destinos. */
  opciones: Record<string, unknown>
}
```

En `parseBorradorMovil`, `opciones = {}` en la desestructuración, y después de la
comprobación de `ahora`:

```ts
  // Un objeto de objetos, nada más: lo que hay dentro lo decide `validarOpcionesPorCuenta`
  // cuando ya se sabe la red de cada cuenta. Acá solo se rechaza lo que no tiene forma.
  if (!esObjeto(opciones) || !Object.values(opciones).every(esObjeto)) return { error: CUERPO_ILEGIBLE }
```

y `opciones` en el objeto que devuelve. El docstring de `resolverDestinos` recibe
`Pick<BorradorMovil, 'cuentas' | 'redes'>`: no cambia.

- [ ] **Step 4: Las dos rutas**

En `check/route.ts`, `resolverDestinos` pasa a entregar también `cuentas`, y después del
`try`:

```ts
  const opcionesCheck = validarOpcionesPorCuenta(cuentas, borrador.opciones)
  if ('error' in opcionesCheck) return NextResponse.json({ error: opcionesCheck.error }, { status: 400 })
  const mediaPorOpciones = errorDeMediaPorOpciones(opcionesCheck.opciones, {
    videos: conteos.videos,
    fotos: conteos.fotos,
    sinTipo: 0,
  })
  if (mediaPorOpciones) return NextResponse.json({ error: mediaPorOpciones }, { status: 400 })
```

En `schedule/route.ts`, lo mismo después de `resolverDestinos` (con los conteos de `media`),
y `crearPostProgramado` recibe `opciones: opcionesCheck.opciones`.

Actualiza el comentario largo de `check/route.ts` (promete «las mismas reglas que la
creación»): ahora incluye las opciones y su regla de media, en ese orden.

- [ ] **Step 5: Correr y verlos pasar**

Run: `npx vitest run`, `npm run typecheck`, `npm run lint`.

- [ ] **Step 6: Documentación**

La API del teléfono no está en `public/docs/` (es interna). Revisa `README.md` y `docs/` con
`grep -n "mobile/schedule\|api/mobile"`: si algo describe el cuerpo de esas rutas, gana
`opciones`; si no, dilo en el informe. `mobile/README.md` cambia en la Tarea 6, cuando la
app lo use de verdad: escribirlo ahora sería describir el estado final en una rama a medio
hacer.

- [ ] **Step 7: Commit**

```bash
git add src/lib/mobile-api.ts src/lib/mobile-api.test.ts src/app/api/mobile/schedule
git commit -m "Las rutas del teléfono aceptan opciones por cuenta"
```

---

### Tarea 6: El teléfono, la app

**Files:**
- Modify: `mobile/src/lib/subir.ts` (`BorradorApp`)
- Modify: `mobile/src/lib/publicar.ts`
- Modify: `mobile/src/app/(tabs)/publicar.tsx`
- Modify: `mobile/README.md`
- Test: `mobile/src/lib/publicar.test.ts`

**Interfaces:**
- Consumes: el cuerpo que aceptan `check` y `schedule` (Tarea 5): `opciones: { [cuentaId]: { trialReel: true } }`. `ejecutarEnvio` ya manda `...borrador` a las dos rutas, así que con el campo en `BorradorApp` viaja solo.
- Produces: `opcionesDelBorrador`, `cuentasConTrial` en `mobile/src/lib/publicar.ts`.

**Cómo se mantiene coherente sin estado frágil.** La app guarda solo `trial: string[]` (ids
de cuentas de Instagram con el interruptor encendido). Todo lo demás se deriva al momento:
qué chips de trial se dibujan (`cuentasConTrial`: cuentas de Instagram marcadas, y solo si
hay exactamente un video) y qué viaja (`opcionesDelBorrador`: las de esa lista que están en
`trial`). Si el dueño quita el video o desmarca la cuenta, el chip desaparece y la opción
no viaja, sin tener que limpiar nada.

**Todos los comandos de esta tarea se corren dentro de `mobile/`.**

- [ ] **Step 1: Escribir los tests que fallan**

En `mobile/src/lib/publicar.test.ts`:

```ts
describe('cuentasConTrial y opcionesDelBorrador', () => {
  const ig1: CuentaApp = { id: 'ig-1', red: 'instagram', handle: 'vicente', conectada: true }
  const ig2: CuentaApp = { id: 'ig-2', red: 'instagram', handle: 'clips', conectada: true }
  const yt: CuentaApp = { id: 'yt-1', red: 'youtube', handle: 'vicente', conectada: true }
  const video = { mediaType: 'video' as const }
  const foto = { mediaType: 'image' as const }

  it('ofrece el trial solo en las cuentas de Instagram marcadas, y solo con un video', () => {
    expect(cuentasConTrial([ig1, ig2, yt], ['ig-1', 'yt-1'], [video])).toEqual([ig1])
    expect(cuentasConTrial([ig1, ig2, yt], ['ig-1', 'ig-2'], [video])).toEqual([ig1, ig2])
    expect(cuentasConTrial([ig1, yt], ['ig-1'], [foto])).toEqual([])
    expect(cuentasConTrial([ig1, yt], ['ig-1'], [video, foto])).toEqual([])
    expect(cuentasConTrial([ig1, yt], ['ig-1'], [])).toEqual([])
    expect(cuentasConTrial([ig1, yt], ['yt-1'], [video])).toEqual([])
  })

  it('viaja solo lo que se ofrece Y está encendido', () => {
    expect(opcionesDelBorrador([ig1, ig2, yt], ['ig-1', 'ig-2'], ['ig-1'], [video])).toEqual({
      'ig-1': { trialReel: true },
    })
    // Encendido pero ya sin video: no viaja, sin que nadie tenga que apagarlo.
    expect(opcionesDelBorrador([ig1, yt], ['ig-1'], ['ig-1'], [video, foto])).toEqual({})
    // Encendido pero desmarcada la cuenta: tampoco.
    expect(opcionesDelBorrador([ig1, yt], ['yt-1'], ['ig-1'], [video])).toEqual({})
    expect(opcionesDelBorrador([ig1, yt], ['ig-1'], [], [video])).toEqual({})
  })
})
```

- [ ] **Step 2: Correr y verlos fallar**

Run: `npm test -- publicar`
Expected: FAIL — las dos funciones no existen.

- [ ] **Step 3: La lógica pura**

En `mobile/src/lib/publicar.ts`:

```ts
export type OpcionesApp = Record<string, { trialReel: true }>

/**
 * Las cuentas a las que se les ofrece el trial reel: las de Instagram marcadas, y solo
 * cuando hay exactamente un video elegido — un trial reel es un solo video, sin fotos,
 * y ofrecer el interruptor con fotos sería ofrecer algo que el servidor va a rechazar.
 * Derivado, no guardado: si el dueño quita el video o desmarca la cuenta, desaparece solo.
 */
export function cuentasConTrial(
  disponibles: CuentaApp[],
  marcadas: string[],
  archivos: Array<Pick<Elegido, 'mediaType'>>,
): CuentaApp[] {
  const unVideo = archivos.length === 1 && archivos[0]!.mediaType === 'video'
  if (!unVideo) return []
  return disponibles.filter((c) => c.red === 'instagram' && marcadas.includes(c.id))
}

/** Lo que viaja en `opciones`: de las que se ofrecen, las que están encendidas. */
export function opcionesDelBorrador(
  disponibles: CuentaApp[],
  marcadas: string[],
  trial: string[],
  archivos: Array<Pick<Elegido, 'mediaType'>>,
): OpcionesApp {
  const salida: OpcionesApp = {}
  for (const c of cuentasConTrial(disponibles, marcadas, archivos)) {
    if (trial.includes(c.id)) salida[c.id] = { trialReel: true }
  }
  return salida
}
```

En `mobile/src/lib/subir.ts`, `BorradorApp` gana `opciones: OpcionesApp` (importa el tipo
desde `./publicar`).

- [ ] **Step 4: La pantalla**

En `mobile/src/app/(tabs)/publicar.tsx`:

- `const [trial, setTrial] = useState<string[]>([])` junto a `cuentas`, y
  `function alternarTrial(id: string)` con la misma forma que `alternarCuenta`.
- `ultimoBorrador` pasa a tiparse con `BorradorApp` (impórtalo de `../../lib/subir`) en vez
  del literal repetido.
- En `enviar`, el borrador gana
  `opciones: opcionesDelBorrador(disponibles, cuentas, trial, archivos)`.
- Debajo del bloque de chips de cuentas (después del «Elige al menos una cuenta.»), los
  chips de trial:

```tsx
        {cuentasConTrial(disponibles, cuentas, archivos).length > 0 ? (
          <>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {cuentasConTrial(disponibles, cuentas, archivos).map((c) => (
                <Chip
                  key={`trial:${c.id}`}
                  texto={`Trial reel · ${c.handle ?? 'sin nombre'}`}
                  activo={trial.includes(c.id)}
                  onPress={() => alternarTrial(c.id)}
                  deshabilitado={ocupado}
                />
              ))}
            </View>
            <Text style={{ color: COLORES.tenue, fontSize: 11 }}>
              Un trial reel solo lo ven quienes no te siguen. Tú decides desde Instagram cuándo
              compartirlo con todos.
            </Text>
          </>
        ) : null}
```

Importa `cuentasConTrial` y `opcionesDelBorrador` desde `../../lib/publicar`.

- [ ] **Step 5: Correr y verlos pasar**

Run (en `mobile/`): `npm test`, `npm run typecheck`, `npm run lint`.

- [ ] **Step 6: Documentación**

`mobile/README.md`, «Cómo publicar desde el teléfono»:

- El paso 3 dice que TikTok no se ofrece porque «no hay dónde pedir sus opciones por
  publicación». **Ya no es cierto**: ahora hay dónde. La razón cierta es que el bloque de
  TikTok necesita consultar la cuenta del creador (`creator_info`) y sus interacciones, y
  eso el teléfono todavía no lo tiene. Escríbelo así.
- Un paso nuevo entre el 3 y el 4: con una cuenta de Instagram marcada y **un solo video**
  elegido aparece «Trial reel · @handle»; encendido, el reel sale solo para quienes no te
  siguen y **tú lo compartes con todos desde la app de Instagram** cuando quieras. Con
  fotos o más de un archivo el chip no aparece. Si Instagram no tiene la función habilitada
  en esa cuenta, el destino falla al publicar con su frase, y se reprograma como reel
  normal desde el panel.
- Es un cambio de JavaScript: va por aire, **a los dos canales**, y el orden es el de siempre
  (web primero). Eso ya está escrito en «Cómo mandar un cambio sin reinstalar»; no lo
  repitas, enlázalo.

- [ ] **Step 7: Commit**

```bash
git add mobile/src/lib/subir.ts mobile/src/lib/publicar.ts mobile/src/lib/publicar.test.ts "mobile/src/app/(tabs)/publicar.tsx" mobile/README.md
git commit -m "El teléfono ofrece el trial reel con un solo video"
```

---

## Qué queda para el dueño (no es tarea)

- Fusionar en orden: PR 117 → PR 118 → el de esta rama (sale de `documento-por-privado`).
- Después del despliegue web, `eas update` a `preview` y `production`, en ese momento y no
  cuando convenga (`mobile/README.md`).
- Lo de la sección 11 de la spec: un trial reel real en una cuenta con la función
  habilitada, una sin ella para ver la frase, y mirar si el post tiene números en el panel.
