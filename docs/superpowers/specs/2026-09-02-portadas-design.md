# Portadas para videos programados

Fecha: 2026-09-02
Estado: aprobado, pendiente de plan de implementación

Se apoya en el calendario de publicación (fases 1–5), la carga masiva y el editor
de posts programados. El pipeline del editor de contenido sube cortos por la API y
necesita mandar la portada diseñada junto con el video.

## Problema

El contrato del lote solo lleva `media` (URLs de video/imagen). No hay dónde
mandar una portada, así que los reels salen con el fotograma que la red elija —
inaceptable para portadas diseñadas.

## Objetivo

Campo `portada` opcional en el contrato (API y CSV) y en el editor de posts del
panel: una URL pública de imagen, validada y re-subida al Blob como la media, que
cada red aplica como puede — o ignora sin error.

```json
{
  "fecha": "2026-09-08 19:00",
  "texto": "…",
  "redes": ["instagram", "youtube"],
  "media": ["https://…/c01.mp4"],
  "portada": "https://…/c01.jpg"
}
```

## No objetivos

- **Portada en el compositor.** El flujo de portadas entra por lote; el compositor
  queda igual (opción c descartada por el dueño).
- **Portada por red** (una imagen distinta para IG que para YT). Una portada por
  post.
- **thumb_offset / fotograma elegido.** La portada es una imagen diseñada, no un
  frame del video.
- **Reintentar solo la portada de YouTube.** Si `thumbnails.set` falla, la portada
  se pierde con log; el video ya está público y no hay estado por-portada que
  justifique su propia máquina.

## Decisiones tomadas

| Decisión | Alternativa descartada | Razón |
|---|---|---|
| `coverUrl` nullable en `scheduledPosts` | Fila especial en `scheduledPostMedia` | La portada no es un ítem del carrusel: es un atributo del post; mezclarla en media obligaría a excluirla de todos los conteos |
| CSV acepta ambos encabezados (4 y 5 columnas) | Solo el nuevo | Los CSV ya armados del editor siguen funcionando |
| Facebook: portada como `thumb` en bytes (multipart) | `cover_url` | El publisher usa `/{page}/videos`, que no acepta URL de portada — `thumb` es un archivo; la portada ya vive en nuestro Blob, se descarga y adjunta |
| YouTube: `thumbnails.set` tras el insert, best-effort | Fallar el destino si la portada falla | El video ya subió; marcar failed reintentaría y duplicaría el video público. Portada perdida → `console.error` y el destino queda `published` |
| Portada exige `videoCount ≥ 1` | Exigir video único | Frase del dueño («requiere un video en media»); en carrusel se acepta y solo la usan los caminos de video único |
| X y Threads la ignoran sin error | Rechazar la fila | Cross-postear un reel con portada a X no debe obligar a duplicar filas |

## Contrato y validación

- `BatchItem` gana `portada?: string` (ausente o string vacío = sin portada). La
  API la lee del JSON tal cual; el CSV, de la quinta columna si el encabezado es
  `fecha,texto,redes,media,portada` (celda vacía = sin portada). El encabezado de
  4 columnas sigue siendo válido; cualquier otro rechaza el lote como hoy.
- Validación pura (en `validateBatchItem` y en `updateScheduledPost`):
  - Portada con `videoCount == 0` (contando los tipos diferidos como imagen, como
    la media) → «La portada requiere un video en media.»
  - La URL de portada entra a la misma tubería que la media: extensión de imagen
    reconocida o tipo diferido; si la extensión o el content-type real dicen video,
    la fila se rechaza con «La portada debe ser una imagen.» Una descarga fallida o
    un content-type ajeno (HTML, PDF) usan la frase genérica de lectura existente.
  - La portada se restringe a **JPG/PNG** (por extensión y por content-type real):
    gif/webp → «La portada debe ser JPG o PNG.» Graph puede rechazar thumbs
    exóticos, y en FB/IG la portada viaja en el mismo POST del video — un formato
    indigesto tumbaría el video entero tras los reintentos.
  - La descarga usa el mismo timeout (30 s) y re-sube al Blob; la URL guardada en
    `coverUrl` es la del Blob, nunca la de origen.
- Nota de borde: si `media` trae solo URLs de tipo diferido que resultan ser
  imágenes, la re-validación post-descarga (ya existente) produce el error de
  portada-sin-video en ese momento, con la misma frase.

## Publishers

`PublishInput` gana `coverUrl: string | null`. `publishDue` lo alimenta desde el
post. Por red:

- **Instagram** (`instagram.ts`): la rama de video único agrega `cover_url` al
  contenedor `REELS` cuando `coverUrl` existe. Carrusel e imagen única la ignoran.
- **Facebook** (`facebook.ts`): la rama de video único descarga `coverUrl` del
  Blob (`fetch`, timeout 30 s) y adjunta los bytes como `thumb` en un POST
  `multipart/form-data` a `/{page}/videos` junto con `file_url` y `description`.
  Si la descarga de la portada falla, el POST va sin `thumb` y se loguea — el
  video no se sacrifica por la portada. Texto e imágenes no cambian.
- **YouTube** (`youtube.ts`): tras un `videos.insert` exitoso (id obtenido), si
  hay `coverUrl` se descargan los bytes y se hace
  `POST https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId=<id>`
  con content-type de la imagen. Cualquier fallo: `console.error` truncado y el
  flujo sigue (best-effort). El camino de reanudación (video `processing` de una
  corrida anterior) NO llama a thumbnails.set — se llamó una vez, junto al insert.
  Requiere canal con teléfono verificado; si no lo está, Google responde 403 y la
  portada se pierde con log, mismo trato best-effort.
- **Threads y X**: sin cambios; el campo llega y no se usa.

## Panel

La página de edición (`/admin/schedule/[id]`) muestra la portada actual como
miniatura con «Quitar», y un input de URL para ponerla o cambiarla (una sola URL,
no textarea). `updateScheduledPost` la procesa con las mismas reglas y frases; el
formulario manda `portadaUrl` (URL nueva) y `keepPortada` (hidden con la actual, se
omite al quitarla); si vienen ambas, la URL nueva gana. El compositor no cambia. La tarjeta del calendario y la cola no
muestran la portada (la miniatura de la primera media basta).

## Manejo de errores

Frases fijas nuevas: «La portada requiere un video en media.» y «La portada debe
ser una imagen.» Todo lo demás reusa las existentes. Detalle upstream a
`console.error` truncado. La portada best-effort de YouTube jamás cambia el estado
del destino.

## Testing

Puro con Vitest:

- CSV: encabezado de 5 columnas mapea `portada`; el de 4 sigue válido; celda
  vacía = sin portada.
- Validación: las dos frases nuevas (portada sin video; portada que no es imagen
  en el chequeo de content-type), portada con tipo diferido aceptada.
- Instagram: el cuerpo del contenedor REELS con y sin `cover_url`; el carrusel
  nunca la incluye.
- El resto (descargas, multipart de Facebook, thumbnails.set) es HTTP sin test,
  como todo el repo.

## Variables de entorno nuevas

Ninguna.
