# API de programación — guía para un LLM

Para un modelo que llama a esta API sin tener este repositorio delante. Es la contraparte
compacta de `api-editor.md` (esa es para personas; describe la misma API y no la contradice).
El esquema formal está en `api.json` — léelo una vez y sabrás la forma exacta de cada campo,
sus tipos y sus límites numéricos; esta guía es la tarea: qué mandar, qué falla y cómo, y qué
no existe.

Un solo endpoint de escritura: `POST /api/schedule/batch`. Autenticación en todos los
endpoints:

```
Authorization: Bearer <SCHEDULE_API_KEY>
```

Sin ella, o con una incorrecta: `401` con el cuerpo `No autorizado`.

## 1. El cuerpo mínimo que funciona

```json
{
  "posts": [
    { "fecha": "2026-10-01 09:00", "texto": "Hola.", "redes": ["instagram"] }
  ]
}
```

`fecha` es siempre obligatoria (`YYYY-MM-DD HH:MM`, hora de `America/Santiago`, futura). Cada
fila necesita además: `texto` o al menos un elemento en `media`, y `redes` o `cuentas` con al
menos un elemento. `redes` solo resuelve la cuenta a nombrar la red si hay exactamente una
conectada de esa red; con dos, hay que usar `cuentas` con el identificador exacto (se leen en
`/admin/accounts` o en `GET /api/schedule/posts`, campo `cuentaId`).

## 2. Una sola petición: video, regla y documento

```bash
curl -X POST https://www.vicente-pareja.cl/api/schedule/batch \
  -H "Authorization: Bearer $SCHEDULE_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "posts": [
      {
        "fecha": "2026-10-01 19:00",
        "texto": "Comenta GUIA y te la mando.",
        "redes": ["instagram", "facebook"],
        "media": ["https://drive.usercontent.google.com/download?id=ABC&export=download"],
        "regla": {
          "palabra": "GUIA",
          "mensaje": "Acá va la guía 👇",
          "documentoUrl": "https://drive.usercontent.google.com/download?id=XYZ&export=download"
        }
      }
    ]
  }'
```

Esto programa un post de video con una regla de palabra clave: cuando alguien comente «GUIA»
en Instagram o Facebook (completa, sin importar mayúsculas ni tildes), el sistema copia el PDF
de `documentoUrl` a su propio almacenamiento **al programar, no al comentar** — si la
descarga falla o el archivo no es un PDF de hasta 25 MB, la fila entera se rechaza ahí mismo,
no tres días después dentro de un cron. `mensaje` es obligatorio junto con `palabra`;
`documentoUrl` es opcional.

**Qué pasa hoy cuando alguien comenta la palabra:** el mensaje con el enlace del PDF sale
como **respuesta pública** al comentario, no por mensaje privado. Ver la sección 6, «Lo que
Meta no permite», para el porqué y para lo que cambia cuando el privado se encienda.

## 3. Frases de error literales

Toda fila rechazada trae la frase exacta, en `resultados[i].error` — comparar por igualdad,
no por subcadena parcial ni regex:

| Frase exacta | Campo que la provoca |
|---|---|
| `La fecha no se entendió (usa YYYY-MM-DD HH:MM).` | `fecha` con formato inválido |
| `Elige al menos una cuenta o una red.` | `redes` y `cuentas` ambas vacías o ausentes |
| `Escribe un texto o adjunta un archivo.` | `texto` vacío y `media` vacía |
| `Red desconocida o sin publicación: <red>.` | `redes` con un nombre que no existe |
| `Hay redes repetidas en la fila.` | `redes` con la misma red dos veces |
| `No se pudo leer una media de la fila.` | `media` o `portada`: descarga fallida, timeout, o tipo ajeno |
| `La portada requiere un video en media.` | `portada` sin video en `media` |
| `La portada debe ser una imagen.` | `portada` resultó ser video u otra cosa |
| `La portada debe ser JPG o PNG.` | `portada` en gif/webp u otro formato |
| `Los atributos deben ser un objeto plano de valores simples.` | `atributos` con array, anidado, o más de 20 claves / 2000 caracteres |
| `El texto excede los 280 caracteres de X.` | `texto` largo con `x` en `redes` |
| `El texto excede los 500 caracteres de Threads.` | `texto` largo con `threads` en `redes` |
| `El texto es demasiado largo para Instagram.` | `texto` sobre 2200 caracteres |
| `TikTok necesita que elijas la privacidad.` | un destino TikTok sin `opciones`, o `directo` sin `privacidad` válida |
| `Un contenido patrocinado no puede ser privado.` | `opciones` con `comercial: patrocinado` y `privacidad: SELF_ONLY` |
| `Las opciones de la red no se entendieron.` | `opciones` mal formado, o para un destino que no las pide |
| `TikTok recibe un video, o hasta 35 fotos JPG o WebP.` | `media` con dos videos, mezcla, más de 35 fotos, u otro formato |
| `Un trial reel es un solo video, sin fotos.` | `opciones.<destino>.trialReel: true` con fotos, carrusel, dos videos o sin ningún video en `media` |
| `Instagram no permite trial reels en esta cuenta.` | no es un error de fila — la fila con `trialReel: true` se acepta al programar; esta frase aparece después, como el `error` de ese destino en `GET /api/schedule/posts`, porque Instagram solo revela la elegibilidad al publicar |
| `Una de las cuentas elegidas no es tuya.` | `cuentas` con un identificador que no es del dueño |
| `La cuenta <handle> no está conectada. Vuelve a conectarla en Cuentas.` | `cuentas` con un identificador válido pero desconectado |
| `No hay una cuenta de <red> conectada.` | `redes` con un nombre sin ninguna cuenta conectada de esa red |
| `Tienes N cuentas de <red> (<handles>). Elige cuál con «cuentas».` | `redes` con un nombre ambiguo (dos o más cuentas conectadas) |
| `La palabra clave es una sola palabra, sin espacios, hasta 30 letras.` | `regla.palabra` vacía con mensaje, con espacios/símbolos, o `regla` que no es un objeto |
| `El mensaje del privado va de 1 a 1000 caracteres.` | `regla.mensaje` ausente, vacío o largo |
| `La respuesta pública va de 1 a 300 caracteres.` | `regla.respuestaPublica` larga |
| `El documento tiene que ser una URL absoluta a un PDF de hasta 25 MB.` | `regla.documentoUrl` no es una URL http/https absoluta, o al descargarla no resultó un PDF que quepa |
| `Máximo 50 posts por lote.` | `posts` con más de 50 elementos |
| `El cuerpo debe ser JSON con { posts: [...] }.` | el cuerpo entero no tiene la forma `{ posts: [...] }` |
| `No se pudo guardar la fila. Inténtalo de nuevo.` | fallo transitorio de base de datos; reintentar esa fila sola |

`200` es la respuesta normal aunque haya filas rechazadas — el rechazo por fila es dato, no
fallo del endpoint. Corrige y reenvía solo las filas malas: no hay deduplicación, reenviar una
fila ya programada la programa otra vez.

## 4. Lo que esta API no hace

- **No edita ni borra un post programado.** Una vez programado, no hay endpoint para
  cambiarlo ni cancelarlo. La corrección, si hace falta, la hace el dueño a mano en
  `/admin/schedule`.
- **No lista cuentas.** Para eso está `GET /api/schedule/posts`: cada destino de un post ya
  programado trae `cuentaId` y `handle`. No hay un endpoint que liste cuentas sueltas sin
  pasar por un post.
- **No manda nada de inmediato.** Todo lo que entra por `POST /api/schedule/batch` espera a su
  `fecha`; no existe una forma de publicar ahora mismo por esta vía.
- **No publica en TikTok todavía** (revisión de la plataforma pendiente).
- **Solo tres redes leen comentarios: Instagram, Facebook y YouTube.** Una `regla` en un post que
  va únicamente a TikTok, Threads o X **no hace nada** —no falla, no avisa: nunca se dispara,
  porque nadie lee esos comentarios—. La regla vale la pena solo si el post sale a alguna de esas
  tres.
- **No devuelve las opciones de un post ya programado.** `GET /api/schedule/posts` no trae
  `opciones` por destino, así que un trial reel programado por esta vía no se puede verificar
  después por API — ni que se aceptó como trial, ni si ya se graduó.

## 5. Trial reels de Instagram

```bash
curl -X POST https://www.vicente-pareja.cl/api/schedule/batch \
  -H "Authorization: Bearer $SCHEDULE_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "posts": [
      {
        "fecha": "2026-10-01 19:00",
        "texto": "Reel de prueba.",
        "redes": ["instagram"],
        "media": ["https://ej.com/reel.mp4"],
        "opciones": { "instagram": { "trialReel": true } }
      }
    ]
  }'
```

Tres cosas, en orden:

1. **Un video, nada más.** `media` tiene que resolver a exactamente un video y ninguna foto;
   si no, la fila se rechaza al programar con `Un trial reel es un solo video, sin fotos.`,
   antes de subir un byte.
2. **La elegibilidad se descubre al publicar, no al programar.** Instagram exige la función
   habilitada en esa cuenta (profesional, pública, con seguidores suficientes, según los
   términos de Meta); una fila aceptada acá puede fallar después en ese destino.
3. **No se sabe si se graduó, por API.** El dueño lo comparte con todos desde la app de
   Instagram cuando quiera; no hay endpoint que lo dispare ni que lo consulte.

## 6. Lo que Meta no permite (léelo antes de proponer mandar el PDF adjunto)

El documento de `regla.documentoUrl` **nunca viaja como adjunto**. Se concatena como enlace al
final de `mensaje`, separado por una línea en blanco. La razón es una restricción de Meta, no
una limitación técnica de este sistema — cítala si alguien propone lo contrario:

> «Only one message can be sent to the Instagram user who commented.»
>
> «Only when the Instagram user responds to the private message can you continue the
> conversation within the 24-hour messaging window.»
>
> — Documentación de Meta, respuestas privadas en Instagram.

Una sola respuesta privada por comentario, y ningún segundo mensaje hasta que la persona
responda. Con eso descartado, la única forma de entregar el PDF es un enlace dentro del único
mensaje que sí se puede enviar — nunca dos envíos (texto y luego archivo).

**Estado de hoy, y lo que cambia:** el envío por mensaje privado está construido pero apagado
en este despliegue (falta el App Review de Meta para `instagram_manage_messages` y
`pages_messaging`). Mientras esté apagado, todo — el `mensaje` completo, con el enlace del
documento si lo hay — sale como **respuesta pública** al comentario, nunca por DM. Cuando el
privado se encienda, en Instagram y Facebook `mensaje` (con el documento) pasará a ir por DM y
`respuestaPublica` quedará como la respuesta pública corta; en las demás redes, o si ya
pasaron más de 7 días desde que se publicó el post, seguirá siendo público igual que hoy. El
documento en sí no cambia de forma con este interruptor: siempre es un enlace, nunca un
adjunto — eso lo impone Meta, no la bandera.

**El documento es público por URL.** El PDF copiado al almacenamiento propio no tiene control
de acceso ni caducidad: quien consiga el enlace —lo intercepte, lo reenvíe, lo adivine— puede
abrirlo, sin sesión ni credencial. Es una decisión de producto para este caso de uso (una
guía que se regala a cambio de un comentario), no un descuido ni algo pendiente de arreglar.
