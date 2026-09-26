# El documento por privado, y la documentación para LLM — diseño

**Fecha:** 2026-09-26.

**En una frase:** que la regla de palabra clave pueda llevar un documento —subido por API, con
una URL estable y medible— y que toda la API quede documentada de forma que un LLM la use sin
adivinar.

---

## 1. Qué ya existe (leer antes de diseñar nada encima)

Casi todo lo que esta entrega parece pedir ya está construido. Escrito aquí para que nadie lo
rehaga:

- **Subir un video y programarlo por API:** `POST /api/schedule/batch`, campo `media`. La URL
  que se manda se descarga y se guarda en R2 con `mediaToBlob`
  (`src/lib/social/publish/batch.ts`).
- **La regla de palabra clave, en el mismo cuerpo:** campo `regla`, con `palabra`, `mensaje` y
  `respuestaPublica`. Se valida con `validarRegla`
  (`src/lib/social/comentarios/reglas.ts`) y se guarda en `reglas_clave`, una por post.
- **El sondeo que la aplica:** `aplicarReglas` (`.../comentarios/automatico.ts`) encuentra los
  comentarios nuevos y los rezagados, decide con la función pura `decidirAutomatica`, responde
  en público, y anota la fila en `post_comments`.
- **El privado, escrito y apagado:** `mandarPrivado` (`.../comentarios/privado.ts`) manda el DM
  con `recipient.comment_id`. Vive detrás de `privadoActivo()`, que lee
  `COMENTARIOS_DM === '1'`, y `aplicarReglas` le pasa hoy `privadoEncendido: false`.
- **El enlace del privado ya se mide:** `enlaceMedible` lo etiqueta con `?s=dm-<palabra>`.
- **Documentado para personas:** `public/docs/api-editor.md` describe `regla` con sus límites y
  su tabla de errores.

**Lo que bloquea el privado no es código:** falta que el dueño active «Mensajes» en su app de
Meta y pase App Review de `instagram_manage_messages` y `pages_messaging`.

## 2. La corrección que da forma a todo lo demás

El pedido original era «se le manda al DM un mensaje o documento». La primera versión de este
diseño proponía dos envíos: el texto y después el PDF adjunto. **Eso no se puede hacer**, y
conviene que quede escrito por qué, para que nadie lo vuelva a intentar:

> «Only one message can be sent to the Instagram user who commented.»
>
> «Only when the Instagram user responds to the private message can you continue the
> conversation within the 24-hour messaging window.»
>
> — Documentación de Meta, respuestas privadas en Instagram.

Una respuesta privada por comentario, y ningún segundo mensaje a menos que la persona
conteste. Así que **el documento viaja como enlace dentro del único mensaje**, no como
adjunto.

Dos consecuencias que simplifican y una que resta:

- **El límite de 25 MB y la obligación de que sea PDF dejan de venir de Meta.** Eran
  restricciones suyas para adjuntos, y sin adjunto no rigen. Los dos números se conservan —ver
  la sección 3— pero por motivos nuestros, y eso importa: un límite que se cree de Meta no se
  discute, y uno que se sabe propio se puede cambiar cuando haya razón.
- **No hace falta ningún sondeo** contra la API real: la documentación responde lo que
  importaba.
- **Y el enlace se puede medir, cosa que un adjunto no.** Es la parte buena de la limitación:
  el dueño va a saber cuánta gente abrió la guía.

Lo que se pierde: la persona hace un clic en vez de recibir el archivo. Se evaluó mandar el
PDF si la persona contesta al privado —lo que sí abriría la ventana— y se descartó por ahora:
ver la sección 10.

## 3. El contrato de la API

`regla` gana un campo opcional y nada más cambia:

```json
"regla": {
  "palabra": "GUIA",
  "mensaje": "Acá va la guía 👇",
  "respuestaPublica": "Te lo mandé por privado 📩",
  "documentoUrl": "https://drive.google.com/uc?id=..."
}
```

`documentoUrl` acepta cualquier URL que el servidor pueda leer.

**Sigue siendo solo PDF, y ahora por decisión de producto, no por Meta.** Un PDF se abre en
cualquier teléfono sin pedir nada; un `.docx` o una hoja de cálculo se ven mal o piden una
app. El motivo cambió, así que queda escrito: es una elección, y aflojarla es una decisión de
producto, no un arreglo técnico.

**El tamaño lo limita nuestro almacenamiento, no Meta.** No hay un tope genérico que heredar
—los límites que existen en `publish/limites.ts` son por red, como los 20 MB por foto de
TikTok— así que hay que fijar uno: **25 MB**, y la razón no es arbitraria. Es exactamente el
límite que Meta pone a un adjunto de tipo archivo, así que si algún día se construye el camino
de la sección 10 —mandar el PDF de verdad cuando la persona contesta— los documentos ya
guardados caben sin tener que rechazar ninguno a posteriori.

**La validación ocurre al programar, no al enviar.** Que sea un PDF, que se pueda leer y que
quepa se comprueba cuando se llama a la API, y una fila mala falla ahí con su frase.
Comprobarlo al enviar significaría descubrir el problema tres días después, dentro de un cron,
cuando alguien ya comentó y está esperando.

La regla sigue siendo **una por post** —`reglas_clave.post_id` es único— así que hay un
documento por publicación.

## 4. Dónde vive el documento

**Se copia a R2 al programar; no se enlaza la URL del que llama.** Mismo tratamiento que
`media` ya recibe, con la misma función.

Dos razones, y las dos son fallos reales si se hace al revés:

- **Un enlace de Drive no sirve un PDF**, sirve una página HTML intermedia. La persona que
  hace clic vería esa página, no la guía.
- **Entre programar y comentar pasan días.** La URL del que llama puede morir, cambiar de
  permisos o mover el archivo. La de R2 no.

El documento es **público por URL**: quien la tenga, lo tiene. Para el caso de uso —una guía
que se regala a cambio de un comentario— es lo correcto, y es lo que hace que el enlace
funcione sin sesión ni credencial.

**Esquema:** `reglas_clave` gana `documento_url`, texto nulable. Es la primera migración de
esta entrega.

## 5. El barrido de R2 tiene que conocer el documento

`src/lib/storage-gc.ts` borra de R2 todo objeto que ninguna tabla referencie, con una hora de
gracia. Hoy construye ese conjunto con cuatro consultas: `profiles.avatar_url` y
`og_image_url`, `links.image_url`, `scheduled_posts.cover_url` y
`scheduled_post_media.blob_url`.

**No conoce `reglas_clave.documento_url`.** Sin sumarlo, el barrido borraría el PDF dentro de
la hora siguiente a subirlo, y el enlace del privado llevaría a un 404 días después, en
silencio, exactamente cuando alguien comenta.

Se suma la quinta consulta. Y se suma **una prueba que se caiga cuando aparezca una sexta
columna de archivos y nadie la registre**: comparar las columnas que el esquema declara como
URL de archivo contra las que el barrido consulta. Esa prueba es lo único que impide que el
próximo la olvide igual.

## 6. El mensaje, y la medición

`decidirAutomatica` es una función pura y sigue siéndolo. Su `Plan` no gana estados nuevos:
como el documento va dentro del texto, **no hay un segundo envío que rastrear**, y
`post_comments` no necesita ninguna columna nueva.

Lo único que cambia es cómo se compone el mensaje: cuando la regla trae un documento, su
enlace se añade al texto del privado, etiquetado por `enlaceMedible` con `?s=dm-<palabra>`
igual que cualquier otro enlace de esa ruta.

**Y cuando no hay privado** —fuera de la ventana de siete días, en una red sin privado, o con
la bandera apagada— el mensaje completo ya va hoy en la respuesta pública. El enlace al
documento va con él, por el mismo camino, sin código aparte. O sea que **la función sirve
desde antes de que Meta apruebe el privado**: hoy mismo respondería en público con el enlace a
la guía.

Eso es más de lo que el pedido original esperaba: no depende del App Review para tener valor.

## 7. Errores y casos borde

| Caso | Respuesta |
|---|---|
| `documentoUrl` que no es un PDF | La fila falla al programar, con su frase |
| Un PDF que no cabe | Igual: falla al programar |
| La URL no se puede leer | Igual, y la frase dice cuál era |
| `documentoUrl` ausente | La regla sigue siendo válida; se comporta como hoy |
| La persona ya recibió el privado | No se manda de nuevo, como hoy |
| La publicación tiene más de siete días | No hay privado: el mensaje con su enlace va en público |
| Una red sin privado, o TikTok | Igual: todo va en la respuesta pública |
| El documento se borró de R2 | El enlace daría 404. Lo impide la sección 5, y su prueba |

## 8. La documentación para LLM

Dos piezas, las dos servidas públicamente y las dos sobre la API que ya existe.

**`public/docs/api.json` — el esquema.** El cuerpo de `POST /api/schedule/batch` completo: cada
campo, su tipo, si es obligatorio, sus límites exactos, `regla` con `documentoUrl` incluido. Un
LLM lo lee una vez y sabe la forma sin interpretar prosa.

**Una guía compacta al lado**, orientada a la tarea y no al recorrido humano:

- El cuerpo mínimo que funciona.
- El recorrido completo de «subir un video con su regla y su documento» como **una sola
  petición copiable**.
- **Las frases de error literales**, que es lo que un modelo necesita para reaccionar en vez
  de reintentar a ciegas.
- Una sección explícita de **lo que esta API no hace**. Sin ella, un modelo asume que puede
  editar o borrar un post programado y escribe código para endpoints que no existen.
- Y **lo que Meta no permite**, con la cita de la sección 2. Un modelo que no lo sepa va a
  proponerle al dueño mandar el PDF adjunto, que es exactamente el error que este documento
  acaba de corregir.

`public/docs/api-editor.md` se queda: es la guía para personas y sigue sirviendo. La nueva no
la reemplaza, la acompaña, y las dos no pueden contradecirse — ver la sección siguiente.

## 9. El test que impide que la documentación mienta

Esta es la pieza que sostiene la sección 8, y existe por una razón concreta y reciente: en
este repositorio la documentación se ha desviado del código una y otra vez. El `README` decía
«Neon» tres días después de migrar a Supabase. La página legal afirmaba que «por ahora no se
publica nada» mientras el sistema publicaba, programado, en seis redes. Una spec justificaba
una decisión con un icono que no existe. Y la primera versión de **este** documento proponía
un envío que Meta no permite.

Una documentación para LLM que se desvía es peor que una para personas, porque el modelo se la
cree entera y sin dudar.

Así que la entrega incluye una prueba que importa los validadores reales y falla si la
documentación se aparta de ellos:

- **Cada frase de error** listada existe como constante exportada del código —`REGLA_PALABRA`,
  `REGLA_MENSAJE`, `REGLA_RESPUESTA` y las que se sumen— y coincide carácter por carácter.
- **Cada límite documentado** es el límite que el validador aplica: `MAX_PALABRA`,
  `MAX_MENSAJE`, `MAX_RESPUESTA`, y el del documento.
- **Cada campo del esquema** es un campo que el validador lee, y al revés: un campo que el
  validador lee y el esquema no declara también falla.

Si alguien sube `MAX_MENSAJE` de 1000 a 1500 y no toca la documentación, la reja se pone roja.
Eso es lo que separa «documentación para LLM» de «un archivo que dice cosas».

## 10. Fuera de alcance

- **Ningún endpoint nuevo.** Todo viaja en el cuerpo que ya existe.
- **El PDF como adjunto.** Meta no lo permite en una respuesta privada; ver la sección 2.
- **Mandar el PDF si la persona contesta al privado.** Eso sí abriría la ventana de 24 horas y
  es la única forma de entregar el archivo de verdad. Se descarta por ahora: es un camino
  entero —detectar la respuesta, guardar el `recipient_id`, un envío más con su estado— que se
  activaría pocas veces, y el enlace ya resuelve el problema del dueño. Queda anotado como la
  continuación natural si algún día el clic resulta ser un problema.
- **TikTok**, que no tiene cola de comentarios.
- **Desbloquear el privado.** Depende del App Review de Meta, no de código.
- **URLs que caducan o una por persona.** El documento es público por decisión; ver la
  sección 4.

## 11. Lo que depende del dueño, no del código

1. **Poner `SITE_URL` en Vercel.** Sin ella el enlace no se etiqueta con `?s=dm-<palabra>` y se
   pierde la medición de la sección 6. Esto vale **desde el primer día**, porque el enlace
   funciona en la respuesta pública sin esperar a Meta.
2. Activar «Mensajes» en la app de Meta y pasar App Review de `instagram_manage_messages` y
   `pages_messaging`, para que el mensaje vaya por privado en vez de público.
3. Encender `COMENTARIOS_DM=1` cuando lo anterior esté listo.

**Nada de esto bloquea la entrega.** A diferencia de lo que suponía la primera versión de este
diseño, la función tiene valor completo sin App Review: responde en público con el enlace a la
guía, que es lo que hace hoy con el mensaje.
