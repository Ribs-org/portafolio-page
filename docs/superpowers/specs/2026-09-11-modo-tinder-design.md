# Modo Tinder — reescribir posts ajenos y aprobarlos de un toque

Fecha: 2026-09-11
Estado: aprobado, pendiente de plan de implementación

Se apoya en lo construido: el programador de publicaciones y sus publicadores de X y
Threads, la tabla `ajustes` que la entrega 2 de comentarios acaba de crear, la pasarela de
IA de Vercel ya configurada, el cron de cinco minutos, el panel y la app Android.

Es la primera vez que el sistema **lee contenido de terceros**, y la primera vez que un
modelo escribe algo que el dueño publica como suyo.

## Problema

Publicar seguido cuesta ideas, no manos. El dueño ya tiene con qué publicar y cuándo, pero
la página en blanco es el cuello de botella. Mientras tanto hay creadores en inglés
publicando a diario ideas que en español casi nadie ha dicho.

## Objetivo

Que abrir la app y deslizar dos minutos deje tres publicaciones programadas, escritas con
su voz, a partir de ideas que él eligió mirar.

## No objetivos (de esta versión)

- **Publicar solo, sin aprobación.** Cada ficha pasa por su ojo. Es contenido que sale a su
  nombre.
- **Republicar el original.** No se traduce y se pega: se reescribe. Ver «Fidelidad».
- **Llevarse la media ajena.** La foto o el video del tuit original no viajan. Ver «Sin media».
- **Instagram, Facebook y YouTube como destino.** Piden media y un texto reescrito no la
  trae. X y Threads son de texto y bastan.
- **Búsqueda por temas.** La lista de creadores es curada a mano. El diseño no le cierra la
  puerta a los temas, pero no están en esta versión.
- **Fuentes que no sean X.** YouTube y Reddit quedan para otro día; el `Fuente` de la
  sección «Agregar una fuente» es el punto de extensión.

## Decisiones tomadas

| Decisión | Alternativa descartada | Razón |
|---|---|---|
| Reescritura con la voz del dueño | Traducción fiel; traducción con cita al autor | Reescribir una idea es suyo; republicar el texto de otro con su nombre encima no lo es, y se nota. La cita además obliga a un enlace, y un enlace multiplica por trece el costo de publicar en X |
| Lista de creadores curada a mano | Búsqueda por temas; el timeline propio | El costo se vuelve predecible y la calidad depende de a quién elige, no de un algoritmo. El endpoint del timeline es además el más restringido |
| Dos ritmos: traer pocas veces al día, reescribir cada cinco minutos | Todo en el cron de cinco minutos | Un creador publica tres o cuatro veces al día; consultarlo cada cinco minutos es pagar por releer lo mismo. La reescritura sí aprovecha la corrida que ya existe |
| La ficha llega ya reescrita | Reescribir al abrirla; reescribir al aprobar | Deslizar tiene que ser instantáneo. Reescribir al abrir mete uno o dos segundos de espera por ficha; reescribir al aprobar obliga a juzgar el tuit en inglés, que no dice cómo va a sonar en español |
| `since_id` por creador | Traer las últimas N y descartar las conocidas | Es el control de costo entero: se paga por publicación leída, y un creador que no publicó nada tiene que costar cero |
| Autenticación de aplicación para leer | El token OAuth del dueño | Es lo estándar para contenido público y así una lectura no puede quemar la credencial con la que publica |
| Aprobar crea una publicación programada | Un publicador propio del modo Tinder | El programador ya reintenta, ya avisa y ya se ve en el calendario. Aprobar solo tiene que crear su fila |
| Hora sugerida y editable | Cola de ritmo fijo; elegir siempre; publicar al instante | El dueño lo pidió así: que la app proponga en base a lo ya programado y él ajuste. Un toque en el caso normal, sin publicar a ciegas |
| Una ficha rechazada conserva su fila | Borrarla | La fila es lo que impide que la próxima traída la reviva |
| El prompt vive en `ajustes` | Un prompt fijo en el código | Cambiar la voz sin desplegar. La tabla ya existe desde comentarios |

## 1. Las fuentes

Una tabla `source_authors`, una fila por creador de X:

| Columna | Qué es |
|---|---|
| `id` | uuid |
| `network` | `x` por ahora; la columna existe para que agregar YouTube sea una fila, no una tabla |
| `username` | el usuario tal como lo escribe el dueño, sin arroba |
| `external_id` | el id numérico de X, resuelto una sola vez y guardado |
| `active` | pausar un creador sin borrarlo ni perder su `since_id` |
| `since_id` | el id del tuit más nuevo ya traído; el control de costo |
| `last_error` | frase fija cuando la cuenta dejó de ser legible |
| `created_at`, `updated_at` | |

Único: `(network, username)`. El dueño la administra desde el panel: agregar, pausar,
quitar.

`external_id` se resuelve con `GET /2/users/by/username/:username` la primera vez que el
creador entra a la lista, y no se vuelve a pedir. Si el usuario cambia de nombre, el id
sigue siendo el mismo y la traída no se entera, que es lo correcto.

## 2. La traída

Un cron propio, **cuatro veces al día** (`0 9,13,17,21 * * *`, **UTC**), con su propio
endpoint protegido por `CRON_SECRET` como el que ya existe.

La corrida la dispara el mismo pinger externo que ya llama al cron de publicación, así que
poner en marcha la entrega 1 incluye **darlo de alta en cron-job.org** con su secreto. Sin
esa entrada el endpoint existe y nadie lo llama, y el síntoma sería una baraja vacía sin
ningún error a la vista.

Para cada creador activo, en serie:

1. `GET /2/users/:id/tweets` con `since_id` cuando lo hay, `max_results` 100,
   `tweet.fields=created_at,text,referenced_tweets`, excluyendo respuestas y retuits.
2. Cada tuit devuelto se inserta como ficha en estado `cruda`.
3. `since_id` del creador pasa a ser el id más alto devuelto.

Se leen solo tuits originales: una respuesta fuera de su hilo no se entiende, y un retuit
es el contenido de un tercero dentro del contenido de un tercero.

**Tope diario de lectura.** Un ajuste, `tinder_tope_lecturas`, por defecto **300**. Es una
red de seguridad contra un creador que enloquece, no un límite de curación: el uso esperado
ronda las sesenta lecturas diarias, así que el tope está cinco veces arriba. Al alcanzarlo
la traída para y lo registra; al día siguiente sigue desde el mismo `since_id` y no se
pierde nada. El contador del día vive en `ajustes`, con la fecha, para que un reinicio no lo
olvide.

**Fallos.** El fallo de un creador no detiene a los demás: se registra truncado a 300, se le
escribe una frase fija en `last_error` y se sigue. Tres creadores seguidos fallando cortan
la corrida, porque eso ya no es un creador sino X.

## 3. Las fichas

Una tabla `source_posts`, una fila por tuit traído:

| Columna | Qué es |
|---|---|
| `id` | uuid |
| `author_id` | FK a `source_authors` |
| `network` | derivado, para filtrar sin join |
| `external_id` | el id del tuit |
| `url` | el enlace al original, para poder comprobarlo |
| `author_handle` | el usuario, copiado, para que la ficha se lea sin join |
| `original_text` | el tuit tal cual |
| `published_at` | cuándo se publicó |
| `draft` | el texto reescrito, o null |
| `draft_error` | frase fija si el modelo falló |
| `state` | `cruda`, `lista`, `aprobada`, `rechazada`, `fallida` |
| `scheduled_post_id` | FK a `scheduled_posts` cuando se aprobó; null si no |
| `created_at`, `updated_at` | |

Único: `(author_id, external_id)`, **en ese orden**, porque `author_id` se declara antes
que `external_id` y en una tabla nueva el orden de declaración es el orden físico. Índices
por `state` y por `published_at`.

Los estados:

- `cruda`: traída, sin reescribir todavía.
- `lista`: tiene `draft` y está esperando en la baraja.
- `aprobada`: generó una publicación programada; `scheduled_post_id` dice cuál.
- `rechazada`: el dueño dijo que no. La fila se queda para que no vuelva.
- `fallida`: el modelo no pudo, `draft_error` dice la frase. La baraja la muestra igual, con
  el original y un botón de reintentar.

**Sin media.** La ficha no guarda ni republica la imagen o el video del original. Reescribir
una idea con la voz propia es defendible; republicar la foto de otro no lo es.

## 4. La reescritura

Una fase dentro de la corrida de cinco minutos que ya existe, **después** de publicar, del
sondeo de comentarios y de la redacción de borradores. Es la última de la fila porque es la
menos urgente: una ficha que espera cinco minutos más no le cuesta nada a nadie.

Toma hasta **diez** fichas `cruda` por corrida, de la más nueva a la más vieja, y comparte
el mismo tope de tiempo de la corrida.

**Qué ve el modelo**: el prompt del dueño, el texto del tuit y el nombre del autor. Nada
más. El texto ajeno viaja entre marcadores y el mensaje de sistema dice que lo que está
entre ellos es contenido de un tercero y nunca instrucciones, igual que en comentarios.

**Qué devuelve**: texto plano en español, sin comillas envolventes, **dentro de 280
caracteres**. X corta en 280 y Threads en 500, así que apuntar al menor hace que el mismo
texto sirva para las dos sin versiones distintas.

**Si falla**: la ficha pasa a `fallida` con su frase fija en `draft_error`, pero no en el
momento. Los fallos se juntan y se marcan al final de la pasada, y solo si el bucle terminó
normal. Tres fallos seguidos cortan la fase sin marcar a nadie, porque tres seguidos dicen
que el problema es la pasarela y no esas fichas. Es la regla que la entrega 2 de comentarios
ya dejó escrita, y que ya evitó una cola envenenada.

Una ficha `fallida` no se reintenta sola: la consulta de la fase pide `cruda`. Volver a
intentarla es el botón de la baraja.

El prompt vive en `ajustes`, clave `tinder_instrucciones`, tope de 2000 caracteres. Valor
inicial, editable:

```
Escribe en español de Chile, en primera persona, como si la idea fuera tuya y la estuvieras
contando a un colega. Una o dos frases, máximo 280 caracteres. Toma la idea del texto que te
doy, no su redacción: cambia los ejemplos, el ángulo y las palabras. No traduzcas. No
menciones al autor ni que esto viene de otra parte. Sin hashtags, sin emojis, sin comillas.
Si la idea no se sostiene sin su contexto original, devuelve exactamente: NO SIRVE.
```

`NO SIRVE` es la salida honesta para un tuit que no se sostiene fuera de su contexto: un
hilo cortado, una respuesta a algo que no vemos, un chiste interno. La fase lo trata como
**descarte automático**, no como fallo: la ficha pasa a `rechazada` y nunca llega a la
baraja. Y no cuenta para la racha del cortacircuitos, porque ahí el modelo funcionó
perfectamente, solo que la respuesta correcta era «este no».

Esa distinción es la que impide que una tanda de tuits malos parezca una caída de la
pasarela y corte la fase.

## 5. La baraja

**En el panel**, `/admin/tinder`: las fichas `lista` y `fallida`, de la más nueva a la más
vieja, una a la vez, más el campo del prompt y la administración de la lista de creadores.

**En el teléfono**, pestaña nueva **Ideas**, entre Publicar y Cuentas: la misma baraja con
gestos.

La ficha muestra arriba el texto reescrito, que es el producto. Abajo, plegado, el original
con el autor, la fecha y el enlace. Se juzga lo terminado; el original está para comprobar,
no para leer primero.

Las tres acciones:

| Acción | Qué hace |
|---|---|
| **Aprobar** | Abre la hora sugerida ya calculada. Un toque más y la ficha pasa a `aprobada` |
| **Rechazar** | La ficha pasa a `rechazada` y no vuelve |
| **Editar** (lápiz) | Abre el texto. Al guardar, sigue en la baraja con el texto corregido y se puede aprobar |

Editar y aprobar son dos pasos, no uno: guardar la edición deja la ficha en su lugar, y
aprobar es la acción siguiente. Así una corrección a medias no publica nada.

El contador de fichas pendientes se ve en las dos pantallas.

**Si el texto editado pasa de 280**, la ficha lo dice y no deja aprobar. Es el límite de X
y no hay forma de que el publicador lo arregle después.

## 6. La hora sugerida

Una función pura, `sugerirHora(programados, ahora, separacion)`:

1. El piso es `ahora + 1 hora`. Nunca se propone algo que salga en diez minutos.
2. Se recorren las publicaciones programadas futuras en orden. Se busca el primer instante,
   desde el piso, que esté separado de todas ellas por al menos `separacion`.
3. Si no hay hueco antes de la última, se propone `última + separacion`.

`separacion` es un ajuste, `tinder_separacion_horas`, por defecto **3**. Pura y testeable:
sin huecos, con un hueco al medio, con todo apelotonado, con la cola vacía.

Aprobar crea **una** fila en `scheduled_posts` con el texto y esa hora, y **dos** en
`scheduled_post_targets`, una para la cuenta primaria de `x` y otra para la de `threads`.
De ahí en adelante publica el programador de siempre. La ficha guarda el
`scheduled_post_id`, así que desde la baraja se puede saltar al calendario.

Si al aprobar no hay cuenta conectada de alguna de las dos redes, se crea el destino que sí
existe y se avisa con una frase fija. Si no hay ninguna de las dos, no se aprueba.

## 7. Aprobar dos veces

La baraja vive en dos pantallas, así que la misma ficha puede recibir dos toques. El estado
de la fila es el guardia: aprobar relee la ficha y, si ya no está en `lista` ni en
`fallida`, no hace nada y la pantalla se refresca. Es exactamente lo que hace la cola de
comentarios.

## 8. Agregar una fuente

Un `Fuente` por plataforma, con la misma forma que los conectores, los publicadores y los
comentaristas:

```ts
type Fuente = {
  network: string
  resolverAutor(username: string): Promise<{ externalId: string }>
  traer(autor, sinceId: string | null): Promise<PostAjeno[]>
}
```

Agregar YouTube o Reddit el día que se quiera es un archivo y una línea en el índice. El
resto del sistema no distingue de dónde vino la ficha.

## Manejo de errores

Frases fijas en español en todo lo visible; el detalle de X o del proveedor solo a
`console.error` truncado a 300, como en el resto del repositorio. Ninguna respuesta de la
API móvil filtra texto ajeno.

Frases fijas nuevas:

| Cuándo | Frase |
|---|---|
| el modelo no pudo reescribir | `No se pudo reescribir esta idea.` |
| X no dejó leer a un creador | `No se pudo leer esta cuenta.` |
| el techo diario se alcanzó | `Se alcanzó el tope de lecturas de hoy.` |
| el texto editado pasa de 280 | `El texto no puede pasar de 280 caracteres.` |
| falta la cuenta de una red al aprobar | `Esa red no está conectada.` |
| no hay ninguna red donde publicar | `Conecta X o Threads antes de aprobar.` |

## El dinero

X abandonó los planes mensuales: hoy cobra por uso, sin mínimo, a **$0.005 por publicación
leída** y **$0.015 por publicación creada**, que sube a **$0.20 si el post lleva un enlace**.
Por eso la reescritura no incluye enlaces y por eso la cita al autor quedó descartada.

Con veinte creadores publicando tres veces al día: unas sesenta lecturas diarias, nueve
dólares al mes. El modelo, a una llamada por ficha, no llega a dos. Publicar tres veces al
día en X, un dólar y medio. Threads no cobra. **Alrededor de doce dólares al mes**, con el
techo de 300 lecturas diarias limitando el peor caso a unos cuarenta y cinco.

El dueño debe **activar facturación por uso en su app de X**. La app ya existe y ya tiene
`tweet.read`; es solo el interruptor.

## Testing

- **Puro, con Vitest**: la normalización del tuit de X, el recorte a 280, la limpieza del
  borrador, `sugerirHora` con sus cuatro casos, la decisión de qué fichas entran a una
  pasada, el contador del tope diario, y el armado del prompt (que el texto ajeno y el
  prompt viajen, y que nada más lo haga).
- **Sin tests de HTTP ni de render**, como el resto del repositorio. La traída y la
  aprobación se prueban a mano contra la cuenta real tras el despliegue.

## Variables de entorno nuevas

| Variable | Para qué |
|---|---|
| `X_BEARER_TOKEN` | Leer tuits públicos con autenticación de aplicación |

Sin ella la traída no corre y lo dice; todo lo demás del sitio sigue igual. La reescritura
reusa `AI_GATEWAY_API_KEY` y `COMENTARIOS_MODELO`, ya configuradas.

## Las entregas

| # | Entrega | Qué toca | Visible |
|---|---|---|---|
| 1 | La lista y la traída | esquema, `Fuente` de X, cron propio, `since_id`, tope diario | nada todavía |
| 2 | La reescritura | prompt en `ajustes`, fase en la corrida de cinco minutos | nada todavía |
| 3 | La baraja en el panel | `/admin/tinder`, las tres acciones, `sugerirHora`, aprobar creando la programada | la baraja en el panel |
| 4 | La baraja en el teléfono | pestaña Ideas con gestos, API móvil | la baraja en el teléfono |
