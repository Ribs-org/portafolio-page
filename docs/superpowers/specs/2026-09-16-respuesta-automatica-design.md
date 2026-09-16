# Respuesta automática por palabra clave — comentario público y privado con enlace

Fecha: 2026-09-16
Estado: aprobado, pendiente de plan de implementación

Fase de la cola de comentarios (spec base: `2026-09-11-comentarios-design.md`, cuyas tres
entregas están en producción) y del calendario de publicación
(`2026-08-31-calendario-publicacion-design.md`). Reutiliza el sondeo que ya corre cada
cinco minutos, el `Comentarista` de cada red y el módulo `privado.ts` que quedó escrito y
apagado.

## Problema

El dueño quiere lo que hacen otros creadores: «comenta GUÍA y te la mando por privado».
Hoy la cola descubre cada comentario, la IA redacta un borrador y el dueño aprueba uno a
uno. Para una palabra clave eso no sirve: la gracia es que la respuesta llegue sola, en
minutos, y que el privado traiga el enlace.

Tres cosas se interponen:

1. **No hay dónde decir «este post tiene palabra clave».** El único dato por post es
   `atributos`, la taxonomía libre del editor con IA.
2. **El privado exige aprobación de Meta.** `instagram_manage_messages` y
   `pages_messaging` con acceso avanzado; en modo desarrollo solo llega a cuentas con rol
   en la app. TikTok y YouTube no tienen API de mensajes privados.
3. **Un post recién publicado tarda hasta un día en entrar a la cola.** El sondeo solo
   mira `social_posts`, que llena el sync diario de las 9:00.

## Objetivo

Que un post programado lleve una palabra clave, un mensaje con enlace y una respuesta
pública corta; que cuando alguien comente esa palabra el sistema responda en público y
mande el mensaje por privado en la corrida siguiente del cron, sin que el dueño toque
nada; que la cola lo muestre como automático; y que el enlace se pueda medir en Analítica.

## No objetivos

- **Reglas sobre posts orgánicos o ya publicados sin pasar por el calendario.** La regla
  nace con el post programado. Sumar posts existentes queda para después.
- **Varias palabras por post.** Una palabra, una regla. La tabla lo permite a futuro.
- **Mensaje redactado por la IA para cada persona.** El texto es fijo por post.
- **Privados a quien no comentó** (seguidores nuevos, menciones). Solo respuesta a
  comentario, que es lo que Meta permite sin ventana de 24 horas.
- **La app móvil.** No configura reglas; el móvil no ofrece TikTok ni edita posts.

## Decisiones tomadas

| Decisión | Alternativa descartada | Razón |
|---|---|---|
| Tabla `reglas_clave` con una fila por post programado | Columnas en `scheduled_posts`; reutilizar `atributos` | La regla se edita después de publicar, a diferencia de las opciones de TikTok; una tabla la aísla del post y deja crecer a varias palabras. `atributos` no tiene forma fija |
| Aplicar las reglas dentro del sondeo existente | Un cron aparte | El sondeo ya trae los comentarios nuevos cada cinco minutos y ya tiene el token; un cron más pelearía por los dos cupos de Vercel Hobby |
| El comentario automático queda `enviado` con `automatico = true` | Un estado nuevo | Los cinco estados ya cubren el ciclo; la marca distingue quién respondió sin romper filtros ni conteos |
| Sin privado posible, se publica el mensaje con el enlace | Responder «te lo mandé por privado» igual | Nunca prometer un privado que no salió; en TikTok y YouTube es la única forma, y en Meta lo es hasta que aprueben |
| El sondeo mira también los destinos publicados del calendario | Sincronizar el post recién publicado | Un `select` más en el sondeo; el sync sigue siendo la fuente de métricas y no se toca |
| Enlace con `?s=dm-<palabra>` solo si apunta al sitio propio | Etiquetar todo enlace | Un enlace externo no lo lee nuestra analítica; el tag `dm-…` sale como fila propia en «Qué contenido te trae gente» |
| Un privado por persona y post | Uno por comentario | Meta permite uno por comentario, pero dos comentarios de la misma persona no merecen dos mensajes iguales |
| Tope de 20 respuestas automáticas por corrida | Sin tope | El sondeo tiene 120 s; cada automática son dos llamadas a la red |

## 1. Datos

### Tabla `reglas_clave`

```
id uuid pk
post_id uuid not null unique, FK scheduled_posts(id) on delete cascade
palabra text not null            -- normalizada: minúsculas, sin tildes, una sola palabra
mensaje text not null            -- lo que llega por privado (o en público si no hay privado)
respuesta_publica text not null  -- lo que se responde en público cuando sí hubo privado
created_at, updated_at timestamptz
```

Una regla por post. Borrar el post borra la regla; vaciar la palabra en el editor la borra.

### `post_comments.automatico boolean not null default false`

Marca el comentario que respondió una regla. Sigue siendo `state = 'enviado'` y usa
`reply_external_id`, `dm_state` y `dm_error` como cualquier otro.

## 2. La regla: `src/lib/social/comentarios/reglas.ts`

Puro, sin base ni red:

- `normalizarPalabra(bruta: string): string | null` — recorta, minúsculas, sin tildes
  (NFD y quitar diacríticos), solo letras y dígitos; null si queda vacía, tiene espacios
  o pasa de 30 caracteres.
- `coincide(texto: string, palabra: string): boolean` — normaliza el texto igual y busca
  la palabra **completa** (bordes de palabra); «guiar» no dispara «guia»; «#guia» y
  «GUÍA!!» sí.
- `enlaceMedible(mensaje: string, palabra: string, sitio: string): string` — si el
  mensaje contiene una URL cuyo host es el del sitio, le agrega `?s=dm-<palabra>` (o
  `&s=` si ya trae query) al primer enlace propio; los demás enlaces y el texto quedan
  igual.
- `validarRegla(raw: unknown): { regla: ReglaLimpia | null } | { error: string }` con
  `ReglaLimpia = { palabra: string; mensaje: string; respuestaPublica: string }`.
  Reglas: `palabra` normalizable; `mensaje` de 1 a 1000 caracteres; `respuestaPublica`
  de 1 a 300, por defecto `RESPUESTA_PUBLICA_POR_DEFECTO = 'Te lo mandé por privado 📩'`.
  Sin palabra y sin mensaje → `{ regla: null }` (no hay regla). Frases fijas:
  `REGLA_PALABRA` («La palabra clave es una sola palabra, sin espacios, hasta 30
  letras.»), `REGLA_MENSAJE` («El mensaje del privado va de 1 a 1000 caracteres.»),
  `REGLA_RESPUESTA` («La respuesta pública va de 1 a 300 caracteres.»).
- `MAX_AUTOMATICAS_POR_CORRIDA = 20`.

## 3. El sondeo ve los posts recién publicados

En `sondearCuenta` (`comentarios/run.ts`), la lista de posts a mirar une dos fuentes:

1. `social_posts` de la cuenta, últimos siete días, como hoy.
2. `scheduled_post_targets` de la cuenta con `status = 'published'`, `external_id` no
   nulo y `updated_at` dentro de los siete días, cuyo `external_id` no esté ya en 1.

`postsAsondear` recibe la unión. La caption para el borrador de la IA (`captionDe`) cae
a `scheduled_posts.caption` cuando `social_posts` aún no tiene el post. La cola muestra
esos comentarios con la caption del programado y sin miniatura hasta que el sync traiga
el post; nada más cambia.

## 4. Aplicar reglas: `aplicarReglas` en `comentarios/automatico.ts`

Corre dentro de `sondearCuenta`, después de insertar los comentarios nuevos de la cuenta,
solo sobre esos nuevos, y respeta el reloj del sondeo (`seAcaboElTiempo`).

Como el resto de `comentarios/`, lo que decide es puro y lo que toca base y red es un
orquestador fino sin tests propios. La decisión vive en `reglas.ts`:

```ts
type Plan =
  | { accion: 'ignorar' }
  | { accion: 'responder'; publico: string; privado: string | null }

decidirAutomatica(entrada: {
  texto: string
  esPropio: boolean
  yaRecibioPrivado: boolean   // otro comentario del mismo autor en el post ya fue automático
  network: string
  publishedAt: Date
  now: Date
  privadoEncendido: boolean
  regla: ReglaLimpia
  sitio: string
}): Plan
```

El orquestador solo carga la entrada, ejecuta el plan y guarda el resultado. Para cada
comentario nuevo con `state = 'pendiente'`:

1. **Buscar la regla**: `post_external_id` → `scheduled_post_targets` de esa cuenta con
   ese `external_id` → `reglas_clave` por `post_id`. Sin regla, sigue el flujo normal.
2. **Coincidencia**: `coincide(text, palabra)`. Si no, flujo normal.
3. **Un privado por persona**: si ya existe en `post_comments` otro comentario del mismo
   `author_external_id` en el mismo post con `automatico = true`, este se responde en
   público con `respuesta_publica` pero **no** manda privado (`dm_state = 'no'`).
4. **¿Hay privado?** `puedePrivado(network, now, publishedAt)`: red en
   `REDES_CON_PRIVADO`, `COMENTARIOS_DM` encendida y menos de siete días. Si sí, la
   respuesta pública es `respuesta_publica` y luego se manda `enlaceMedible(mensaje)`
   por privado con `mandarPrivado`. Si no, la respuesta pública es
   `enlaceMedible(mensaje)` y no hay privado.
5. **Responder** con `comentarista.responder` y la credencial propia del comentarista
   (la misma regla que `responderComentario`). Éxito → `state = 'enviado'`,
   `reply_external_id`, `draft` = texto enviado, `automatico = true`. Fallo →
   `state = 'fallido'`, `error = RED_RECHAZO`, `automatico = true`, y el dueño lo ve en
   la cola con «Reintentar», que reenvía la misma respuesta.
6. **Privado** (si tocaba): éxito → `dm_state = 'enviado'`; fallo → `dm_state =
   'fallido'`, `dm_error = PRIVADO_RECHAZADO`. Un privado fallido nunca deshace la
   respuesta pública. Comentario ya borrado (`COMENTARIO_AUSENTE`) → `descartado`.
7. Tope `MAX_AUTOMATICAS_POR_CORRIDA` por corrida (todas las cuentas); lo que sobre queda
   `pendiente`; en la corrida siguiente `aplicarReglas` lo retoma desde la base
   (pendientes sin `automatico` en posts con regla), antes que la IA, que sigue saltando
   lo que coincide con una regla.

Los comentarios del dueño (`state = 'propio'`) y los de otras cuentas del mismo dueño
nunca disparan reglas.

## 5. Interfaz

### Compositor

Bloque plegado «Respuesta automática por palabra clave», cerrado por defecto. Campos:
`reglaPalabra`, `reglaMensaje` (textarea, hint: «Pon el enlace aquí; si es de tu sitio se
mide solo en Analítica»), `reglaRespuesta` prellenado con la respuesta por defecto. Nota:
«En TikTok y YouTube, o mientras el privado esté apagado, el mensaje se publica como
respuesta al comentario.» Palabra vacía = sin regla. La acción valida con `validarRegla`
antes de subir archivos y crea la fila con el post.

### Editor

Los mismos tres campos, siempre editables, aunque el post esté publicado; guardar
actualiza o borra la regla (`upsert` por `post_id`, `delete` si la palabra queda vacía).
Los cambios rigen para los comentarios que lleguen desde entonces.

### Lote y CSV

Campo opcional `regla: { palabra, mensaje, respuestaPublica? }` por fila; en el CSV,
séptima columna `regla` con ese JSON, después de `opciones`. Misma validación.

### Cola de comentarios

- Etiqueta «Automática» en la tarjeta de un comentario con `automatico = true`, junto a
  «Respondido:». La línea del privado se muestra como hoy.
- Filtro de estado nuevo «Automáticas» (`automatico = true`, cualquier estado) al lado de
  los existentes.
- En un comentario automático con `dm_state = 'fallido'` y menos de siete días, botón
  «Reintentar privado» que llama a `mandarPrivado` de nuevo.
- La cabecera del post en la cola muestra la palabra clave («Palabra clave: GUÍA») cuando
  el post tiene regla.

## 6. Permisos y el privado

`connect/route.ts` suma `instagram_manage_messages` a Instagram y `pages_messaging` a
Facebook **solo cuando el dueño confirme que activó Mensajes en los casos de uso de la app
de Meta**: el diálogo de Meta rechaza toda la solicitud si un scope no está activado, y
eso rompería Conectar para las dos redes. Hasta la activación, el cambio de scopes queda
fuera del PR.

`COMENTARIOS_DM` sigue siendo el interruptor global. Nace apagada; se enciende cuando Meta
apruebe el acceso avanzado. En modo desarrollo, con la bandera encendida a mano en un
preview, el privado llega a las cuentas con rol en la app, que es lo que se graba para la
revisión.

## Manejo de errores

Frases fijas hacia la base y la UI; el detalle de Meta al `console.error`. Las nuevas
viven en `reglas.ts`. Un fallo en `aplicarReglas` de una cuenta no tumba el sondeo de las
demás ni la publicación: se registra y se sigue, como hoy con el sondeo.

## Testing

- `reglas.test.ts`: normalización (tildes, mayúsculas, símbolos, espacios, largo),
  coincidencia por palabra completa («guiar» no, «#GUÍA!» sí), `enlaceMedible` con
  enlace propio sin query, con query, externo y sin enlace, `validarRegla` con cada
  frase y el caso «sin regla».
- `reglas.test.ts`, `decidirAutomatica`: coincide → responder con `respuesta_publica` y
  privado con enlace medible; dueño → ignorar; segundo comentario del mismo autor →
  responder sin privado; sin bandera, en TikTok/YouTube o pasados siete días → publicar
  el mensaje con enlace y sin privado; no coincide → ignorar.
- `ventana.test.ts`: la unión de posts (sync más destinos publicados) deduplica por id
  externo y respeta el tope de 20 por pasada; `postsAsondear` no cambia de contrato.
- El orquestador `aplicarReglas` y el cambio en `sondearCuenta` no llevan test unitario,
  como `run.ts` y `responder.ts` hoy; se cubren con la prueba de punta a punta.
- Compositor/editor/lote/CSV: validación de la regla y `upsert`/`delete` en el editor.
- Punta a punta con la cuenta del dueño: programar un post con palabra clave, comentarla
  desde otra cuenta, respuesta pública en la corrida siguiente y privado en la bandeja
  (con `COMENTARIOS_DM=1` en un preview y la cuenta comentarista con rol en la app).

## Variables de entorno

Ninguna nueva. `COMENTARIOS_DM` cambia de significado: además del privado tras aprobar a
mano, habilita el privado de las reglas.

## Trámite del dueño (paralelo al código)

1. En developers.facebook.com → tu app → casos de uso: activar **Mensajes** en el de
   Instagram (habilita `instagram_manage_messages`) y en el de Páginas
   (`pages_messaging`). Avisar: recién ahí se agregan los scopes al Conectar.
2. Reconectar Instagram y Facebook en Cuentas.
3. Con `COMENTARIOS_DM=1` en un despliegue de preview, probar con una cuenta propia que
   tenga rol en la app: comentar la palabra, recibir la respuesta y el privado. Grabar.
4. Pedir **Advanced Access** a `instagram_manage_messages` y `pages_messaging` con ese
   video; completar la verificación del negocio si Meta la pide.
5. Al aprobar, `COMENTARIOS_DM=1` en producción.

## Las entregas

1. **Regla y sondeo**: tabla, `reglas.ts`, el sondeo con los destinos publicados,
   `aplicarReglas` en modo degradado (sin privado), compositor, editor, lote y CSV, cola
   con etiqueta y filtro. Funciona de inmediato en Instagram, Facebook y YouTube
   respondiendo en público; TikTok no tiene cola de comentarios todavía.
2. **Privado**: scopes nuevos (tras la activación del dueño), privado dentro de
   `aplicarReglas`, un privado por persona, «Reintentar privado», README. Se prueba en
   preview con la bandera encendida y se graba el video de Meta.

Cada entrega es su propio PR a `main`.

Actualización 2026-09-16: la entrega 1 agrega el índice `(account_id, external_id)` en
`scheduled_post_targets`, mueve `DIAS_PRIVADO` a `reglas.ts`, y en el compositor/editor una
palabra vacía borra la regla aunque el mensaje siga escrito.
