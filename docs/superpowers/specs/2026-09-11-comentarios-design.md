# Comentarios — responder con borrador aprobado

Fecha: 2026-09-11
Estado: aprobado, pendiente de plan de implementación

Se apoya en todo lo construido: los conectores de lectura, las cuentas como entidad
(multicuentas 1 y 2), el cron de publicación cada cinco minutos, el panel y la app
Android. Es la primera vez que el sistema **escribe hacia una red algo que no es una
publicación**, y la primera vez que llama a un modelo de lenguaje.

## Problema

Los comentarios son la parte del trabajo que no escala con nada de lo construido. El
dueño ve los números de cada post en el panel, pero para responder tiene que abrir cada
app, buscar el post, leer, escribir. Responder tarde o no responder cuesta alcance: las
redes premian la conversación, y una pregunta sin responder es una venta que no ocurre.

## Objetivo

Que cada comentario nuevo en sus publicaciones llegue con una respuesta ya redactada,
y que aprobarla cueste un toque. Nada sale publicado sin que el dueño lo vea.

## No objetivos (de esta versión)

- **Responder solo, sin aprobación.** El dueño lo descartó explícitamente: una respuesta
  mala sale a su nombre y no se puede deshacer del todo.
- **Mandar mensajes privados.** El camino queda escrito y apagado; ver «El privado».
- **Responder mensajes directos entrantes.** Otra bandeja, otro flujo, otros permisos.
- **Moderar**: borrar, ocultar o reportar comentarios. Solo se responde.
- **TikTok.** No expone API de comentarios a terceros, y la app sigue en revisión.
- **Threads y X.** Fuera de esta entrega por decisión del dueño; el diseño no les cierra
  la puerta (ver «Agregar una red»).

## Decisiones tomadas

| Decisión | Alternativa descartada | Razón |
|---|---|---|
| Sondeo en el cron de cinco minutos | Webhooks de Meta | Los webhooks piden endpoint público, verificación de firma y una suscripción en el portal; YouTube no los tiene, así que habría que sondear igual. Para el volumen de una persona no compensa, y reemplazan solo la mitad de descubrimiento el día que convenga |
| Ventana de siete días | Treinta días; los diez posts más recientes | Coincide con el plazo del mensaje privado de Meta, que es lo que el sistema podrá hacer después. Treinta multiplica las llamadas en cada pasada |
| El borrador se redacta al descubrir el comentario | Redactarlo cuando el dueño abre la cola | Abrir la app y esperar a que piense arruina el «cuesta un toque». Redactar antes cuesta una llamada por comentario aunque no se responda; a fracciones de centavo, es el intercambio correcto |
| Instrucciones editables en el panel | Prompt fijo en el código; aprender de respuestas pasadas | El dueño pidió poder cambiarlas. Un prompt en el código exige desplegar; aprender del historial necesita un historial que todavía no existe |
| Una tabla `post_comments` con estado | Guardar solo lo pendiente y olvidar lo enviado | El id del comentario es la llave que impide responder dos veces, y sobrevivir al envío es justamente lo que la hace útil |
| El estado vive en la fila, no en la red | Preguntarle a la red si ya respondimos | Una consulta por comentario en cada pasada, y la red no distingue nuestra respuesta de otra |
| Cola en el teléfono **y** en el panel | Solo el teléfono | El dueño lo pidió así. La lógica es la misma; son dos vistas de la misma cola |
| Una llamada al modelo por comentario | Un lote de comentarios por llamada | Un lote mezcla contextos y obliga a parsear una respuesta estructurada; el ahorro no paga la fragilidad |
| Vercel AI Gateway con `provider/model` | Un SDK de proveedor directo | Es lo que el entorno recomienda: una credencial, registro de gasto, y cambiar de modelo es cambiar un string |
| Los permisos nuevos se piden en el mismo login | Un login aparte para comentarios | Un consentimiento por red ya existe; agregarle un permiso es una línea, y el dueño reconecta una vez |
| Sin borrar el borrador al descartar | Borrar la fila | Descartar es una decisión; la fila guardada evita que la próxima pasada lo vuelva a redactar |

## 1. Descubrir

En cada corrida del cron de publicación (`/api/cron/publish-social`, cada cinco minutos
por el pinger externo), después de publicar y antes del barrido:

Para cada cuenta **con credencial** de `instagram`, `facebook` y `youtube`:
1. Se listan sus publicaciones con `published_at` dentro de los últimos **7 días** desde
   `social_posts` (la tabla que la sincronización diaria ya llena). Tope de **20** posts
   por cuenta y pasada, el más reciente primero.
2. Por cada publicación se piden sus comentarios a la red.
3. Los comentarios cuyo id externo no está en `post_comments` se insertan como
   `pendiente`, y se les pide un borrador (sección 2).

Nunca se procesa dos veces el mismo comentario: la unicidad es `(account_id,
external_id)`. Un comentario del propio dueño (su `from.id` es el id externo de la
cuenta) se inserta como `propio` y no recibe borrador: es su propia respuesta.

### Por red

| Red | Listar comentarios | Responder |
|---|---|---|
| Instagram | `GET /{ig-media-id}/comments?fields=id,text,timestamp,username,from` | `POST /{ig-comment-id}/replies` con `message` |
| Facebook | `GET /{post-id}/comments?fields=id,message,created_time,from` | `POST /{comment-id}/comments` con `message` |
| YouTube | `commentThreads.list?part=snippet&videoId=…` | `comments.insert` con `snippet.parentId` y `snippet.textOriginal` |

YouTube cobra **50 unidades de cuota por respuesta** y 1 por listar; con la cuota diaria
por defecto de 10.000 eso es holgado, pero el sondeo lista una vez por video y pasada,
así que el tope de 20 posts también acota la cuota.

### Fallos

El fallo de una cuenta no detiene a las demás ni a la corrida de publicación: se
registra en `console.error` truncado a 300 y se sigue. El cron sigue respondiendo 200,
como hoy.

El sondeo corre **después** de publicar, no antes, y por eso no puede retrasar una
publicación: la ruta declara `maxDuration = 240` para no solaparse con la pasada
siguiente, así que el sondeo se acota a los 20 posts por cuenta y se rinde si la corrida
ya lleva demasiado. Publicar a tiempo manda sobre responder a tiempo.

## 2. Redactar

Al insertar un comentario `pendiente` se pide un borrador:

- **Modelo**: por la pasarela de IA de Vercel, `generateText` del paquete `ai` con un
  string `provider/model` en `COMENTARIOS_MODELO` (por defecto un modelo rápido y
  barato). Credencial: `AI_GATEWAY_API_KEY`, o el OIDC que Vercel inyecta solo.
- **Qué ve el modelo**: las instrucciones del dueño (sección 3), el texto de la
  publicación, el texto del comentario y el nombre de quien lo dejó. Nada más: ni
  métricas, ni otros comentarios, ni datos de la persona.
- **Qué devuelve**: texto plano, recortado al límite de la red (Instagram 2200,
  Facebook 8000, YouTube 10000). Sin comillas envolventes ni prefijos.
- **Si falla**: la fila queda `pendiente` con `draft` nulo y `draft_error` con una frase
  fija. La cola la muestra igual, para escribir a mano, y hay un botón para reintentar
  el borrador.

El modelo **nunca publica**. Su salida es un borrador en la base, y el único camino
hacia la red pasa por un botón que el dueño toca.

## 3. Las instrucciones

Una fila única en una tabla `ajustes` (`clave`, `valor`, `updated_at`), con la clave
`comentarios_instrucciones`. Se edita en el panel, en la página de Comentarios, con un
campo de texto y un botón Guardar. Tope de 2000 caracteres.

Valor inicial, editable:

```
Responde en español, en primera persona, breve y cálido: una o dos frases. Agradece
cuando el comentario es un elogio, responde la pregunta cuando la hay, y si preguntan
por precios o por trabajar juntos, invita a escribir por mensaje directo sin dar cifras.
No inventes datos que no estén en la publicación. No uses hashtags. Un emoji como
máximo, y solo si el comentario tiene uno.
```

Una tabla de clave y valor, y no una columna en otra tabla, porque esta es la primera de
varias preferencias que el panel va a querer guardar.

## 4. La cola

Tabla `post_comments`:

| Columna | Qué es |
|---|---|
| `id` | uuid |
| `account_id` | FK a `social_accounts`; la cuenta en cuyo post está el comentario |
| `network` | derivado, para filtrar sin join |
| `post_external_id` | el id del post en la red |
| `external_id` | el id del comentario en la red |
| `author` | nombre o usuario de quien comentó, tal como lo dio la red |
| `text` | el comentario |
| `published_at` | cuándo se dejó |
| `draft` | el borrador, o null |
| `draft_error` | frase fija si el modelo falló |
| `state` | `pendiente`, `enviado`, `descartado`, `propio`, `fallido` |
| `reply_external_id` | el id de nuestra respuesta, cuando salió |
| `error` | frase fija si el envío falló |
| `created_at`, `updated_at` | |

Único: `(account_id, external_id)`. Índices por `state` y por `published_at`. La entrega 3
le agrega `dm_state` y `dm_error` (ver «El privado»).

## 5. Aprobar

**En el teléfono**, pestaña nueva **Comentarios**, entre Publicar y Cuentas: los
pendientes, del más nuevo al más viejo, agrupados por publicación. Cada tarjeta muestra
la miniatura y el texto del post, quién comentó, el comentario, y el borrador en un campo
editable. Tres acciones: **Enviar**, **Descartar** y, si el borrador falló, **Reintentar
borrador**. Editar el texto y tocar Enviar manda lo editado.

**En el panel**, `/admin/comments`, la misma cola con la misma forma, más el campo de
instrucciones y un filtro por red y por estado, para revisar lo ya enviado.

Contadores a la vista en ambos: cuántos pendientes hay.

## 6. Enviar

`responderComentario(commentId, texto)`:
1. Relee la fila. Si ya no está `pendiente`, no hace nada (dos toques, dos pestañas).
2. Publica la respuesta con la credencial de la cuenta de esa fila.
3. Éxito: `state = 'enviado'`, `reply_external_id` guardado.
4. Fallo: `state = 'fallido'` con una frase fija en `error`; la cola lo muestra con
   Reintentar. El texto de la red va solo al log, truncado.

Frases fijas nuevas:

| Cuándo | Frase |
|---|---|
| el modelo no respondió | `No se pudo redactar la respuesta.` |
| la red rechazó la respuesta | `La red no aceptó la respuesta. Inténtalo de nuevo.` |
| la cuenta perdió su credencial | `Esa cuenta ya no está conectada.` |
| el comentario ya no existe | `El comentario ya no está en la red.` |
| texto vacío al enviar | `Escribe una respuesta.` |

## 7. El privado, escrito y apagado

Meta permite mandar **un** mensaje privado a quien comentó, dentro de **siete días**,
con `POST /{page-id}/messages` y `recipient: { comment_id }`. Exige `pages_messaging` y
**acceso avanzado**, o sea App Review y probablemente verificación de negocio: con acceso
estándar solo alcanza a personas con un rol en la app.

Por eso queda así:
- La fila gana `dm_state` (`no`, `pendiente`, `enviado`, `fallido`) y `dm_error`.
- Tras responder, si `COMENTARIOS_DM` está encendida, la red es Instagram o Facebook, y
  el comentario tiene menos de siete días, se manda el privado y se marca la fila.
- La bandera nace **apagada** y el README dice qué hay que aprobar para encenderla.
- La cola muestra el estado del privado solo cuando la bandera está encendida.

## 8. Permisos nuevos

| Red | Qué se agrega | Trámite |
|---|---|---|
| Instagram | `instagram_manage_comments` | Ninguno: acceso estándar basta para cuentas propias con la app en modo desarrollo |
| Facebook | `pages_manage_engagement` | Ninguno, misma razón |
| YouTube | `https://www.googleapis.com/auth/youtube.force-ssl` en vez de `youtube.readonly` | Ninguno mientras el proyecto de Google siga en pruebas con el dueño como usuario |

Los tres se agregan al login que ya existe. **El dueño debe reconectar una vez cada red**
para que el consentimiento incluya el permiso nuevo; hasta que lo haga, esa red no
descubre comentarios y su tarjeta en Cuentas lo dice.

`youtube.force-ssl` reemplaza a `youtube.readonly` porque incluye todo lo que esta hace.

## 9. Agregar una red

Un `Comentarista` por red, con la misma forma que los conectores y los publishers:

```ts
type Comentarista = {
  network: string
  listar(cuenta, token, postExternalId): Promise<ComentarioLeido[]>
  responder(cuenta, token, comentarioExternalId, texto): Promise<string>
  limiteTexto: number
}
```

Agregar Threads o X el día que se quiera es un archivo y una línea en el índice.

## Manejo de errores

Frases fijas en español en todo lo visible; el detalle upstream solo a `console.error`
truncado a 300, como en el resto del repositorio. Ninguna respuesta de la API móvil
filtra texto de la red.

## Testing

- **Puro, con Vitest**: la normalización de cada red (`normalizeInstagramComment` y sus
  hermanas), el recorte al límite de texto, la limpieza del borrador (comillas, prefijos),
  la decisión de qué posts entran en la ventana de siete días, el reductor de la cola en
  la app, y el armado del prompt (que las instrucciones y el post viajen, y que nada más
  lo haga).
- **Sin tests de HTTP ni de render**, como el resto. El sondeo y el envío se prueban a
  mano contra las cuentas reales tras el despliegue.

## Variables de entorno nuevas

| Variable | Para qué |
|---|---|
| `AI_GATEWAY_API_KEY` | Redactar los borradores. En Vercel puede omitirse si se usa OIDC |
| `COMENTARIOS_MODELO` | Opcional; el string `provider/model`. Por defecto, un modelo rápido y barato |
| `COMENTARIOS_DM` | Opcional; encender el mensaje privado el día que Meta lo apruebe. Apagada por defecto |

Sin ninguna de las tres el sitio sigue funcionando: sin la primera, los comentarios
entran a la cola sin borrador y se responden a mano.

## Las entregas

| # | Entrega | Qué toca | Visible |
|---|---|---|---|
| 1 | La cola y el sondeo | esquema, comentaristas de IG/FB/YT, sondeo en el cron, permisos nuevos | nada todavía |
| 2 | El borrador | pasarela de IA, instrucciones en `ajustes`, redacción al descubrir | nada todavía |
| 3 | Aprobar | página del panel, acción de responder, el privado apagado | la cola en el panel |
| 4 | El teléfono | pestaña Comentarios en la app | por aire |

Cada entrega es un plan y un PR, en ese orden. La 3 depende de la 1 y la 2; la 4 de la 3.
