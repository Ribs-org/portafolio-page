# Carga masiva de posts — CSV en el panel y API con token, un solo motor

Fecha: 2026-09-02
Estado: aprobado, pendiente de plan de implementación

Se apoya en el calendario de publicación (specs de fases 1–5). Las cinco redes
publicables y su validación por-destino ya existen; esto agrega volumen: programar
decenas de posts de una vez, al estilo del bulk scheduler de Buffer.

## Problema

El compositor programa de a uno. Para una semana de contenido (10–20 posts entre
cinco redes) eso es una sesión de clics repetitivos, y no hay forma de que un script
o una herramienta externa encole posts.

## Objetivo

Dos puertas al mismo motor: subir un **CSV** en `/admin/schedule` o hacer **POST** a
un endpoint con token, y que el lote entero quede programado — con resultado por
fila: qué entró y qué se rechazó, con el motivo exacto.

## No objetivos

- **Auto-espaciado tipo cola de Buffer** («uno al día a las 10:00»). Cada fila trae
  su fecha explícita. Fase futura si se echa de menos.
- **Editar o borrar un lote como unidad.** Los posts cargados son posts normales de
  la cola; se gestionan uno a uno ahí.
- **Archivos adjuntos en el CSV/JSON.** La media viaja por URL pública; los archivos
  locales siguen entrando por el compositor.
- **Deduplicación entre lotes.** Cargar el mismo CSV dos veces programa dos veces.

## Decisiones tomadas

| Decisión | Alternativa descartada | Razón |
|---|---|---|
| CSV y API comparten `scheduleBatch` | Dos implementaciones | Una sola vía de validación e inserción; las puertas solo traducen formato |
| Resultado por-fila (parcial) | Todo-o-nada | Estilo Buffer, elegido por el dueño: las filas buenas entran, las malas se reportan con motivo — un typo en la fila 9 no bota las otras 49 |
| Media por URL pública, re-subida al Blob | Guardar la URL externa tal cual | Un hosting que se mueve o bloquea a Meta/Google mataría el post a la hora de publicar; en el Blob la media es nuestra |
| Parser CSV RFC 4180 propio, puro | Dependencia de csv-parse | Son ~40 líneas testeables; el repo no carga dependencias para lo que un helper puro resuelve |
| `SCHEDULE_API_KEY` con Bearer | Reusar CRON_SECRET; OAuth propio | Claves distintas para propósitos distintos (revocable por separado); OAuth sería artillería para un solo dueño |
| Tope de 50 posts por lote | Sin tope | Cordura de memoria y tiempo de función (50 posts con media = 50+ descargas y subidas) |
| Fechas `YYYY-MM-DD HH:MM` en `SITE_TIMEZONE` | ISO con offset | Es lo que el dueño escribe en una celda de Excel; `fromZonedInput` ya interpreta esa forma con la zona del sitio |

## El motor: `scheduleBatch`

`src/lib/social/publish/batch.ts`:

- `type BatchItem = { fecha: string; texto: string; redes: string[]; media: string[] }`
- `type BatchResult = { index: number; ok: true; postId: string } | { index: number; ok: false; error: string }`
- `scheduleBatch(items: BatchItem[]): Promise<BatchResult[]>`

Por cada item, en orden:

1. **Validación pura** — `validateBatchItem(item, now)`: fecha legible y futura
   (`fromZonedInput`), redes conocidas y publicables, y las reglas del compositor
   vía `validateScheduleDraft` — contando las URLs como archivos con el **tipo
   inferido por extensión** (`.mp4/.mov/.webm` → video; `.jpg/.jpeg/.png/.gif/.webp`
   → imagen; extensión desconocida → rechazo con frase fija, para no adivinar).
   El content-type real se verifica igual al descargar (paso 2) y un desacuerdo
   rechaza la fila. Un item inválido produce `{ ok: false, error }` y no toca la
   base.
2. **Media** — cada URL se descarga (`fetch`), se verifica `content-type`
   (`image/*` o `video/*`; otro tipo o un error de descarga rechazan el item con
   frase fija: «No se pudo leer la media de la fila» / «La URL no es imagen ni
   video»), y se re-sube al Blob con `put(..., { access: 'public' })`.
3. **Inserción** — post + media (con el guard de lote vacío de la fase 4–5) +
   destinos, misma forma que `createScheduledPost`.

Los items se procesan secuencialmente (50 descargas concurrentes contra hostings
ajenos es pedir bloqueos). Un fallo de media o inserción en el item N no detiene los
siguientes: queda `{ ok: false }` y el lote continúa.

Redes válidas para lotes: las cinco publicables (`instagram`, `facebook`,
`youtube`, `threads`, `x`). Una red desconocida o sin publisher (`tiktok`) rechaza
el item con «Red desconocida o sin publicación: …».

## El parser: CSV RFC 4180

`src/lib/social/publish/csv.ts` — `parseCsv(text: string): string[][]`, puro:

- Campos entre comillas pueden contener comas, saltos de línea y comillas escritas
  como `""`.
- Tolera `\r\n` y `\n`; ignora filas totalmente vacías.
- La primera fila es el encabezado: se exige exactamente
  `fecha,texto,redes,media` (en ese orden; `media` puede venir vacía por fila).
  Encabezado distinto → el lote entero se rechaza con mensaje fijo antes de mirar
  fila alguna.
- `redes` y `media` se separan por `|` dentro de la celda.

`csvToBatchItems(text: string): { items: BatchItem[] } | { error: string }` une
parser y mapeo.

## Las dos puertas

### API: `POST /api/schedule/batch`

- Header `Authorization: Bearer <SCHEDULE_API_KEY>`; sin variable configurada el
  endpoint queda cerrado (401), molde de `CRON_SECRET`.
- Body JSON: `{ posts: BatchItem[] }`. Más de 50 → 400 con frase fija. JSON
  malformado → 400 fijo.
- Respuesta 200: `{ resultados: BatchResult[] }` — 200 aunque haya filas
  rechazadas (el rechazo por-fila es dato, no error del endpoint; molde del cron).
- `maxDuration = 240` (descargas de media incluidas).

### CSV en el panel

- `/admin/schedule` gana la sección **«Carga masiva»** bajo el compositor: input de
  archivo `.csv`, botón «Cargar lote», y la tabla de resultados (fila, estado,
  motivo). Server action `uploadBatch(formData)` con `requireAuth`, que lee el
  archivo, llama a `csvToBatchItems` + `scheduleBatch` y devuelve los resultados.
- La sección muestra la plantilla de ejemplo copiable:

```
fecha,texto,redes,media
2026-09-03 10:00,"Mi primer post en lote",threads|x,
2026-09-03 18:30,"Con foto, y con coma",instagram|facebook,https://ejemplo.com/foto.jpg
```

## Manejo de errores

Frases fijas en español por fila; detalle upstream (descargas fallidas, content-type
ajeno) a `console.error` truncado. La API nunca filtra texto upstream. El límite de
tamaño por archivo lo impone el runtime (cuerpos y memoria de la función); un video
gigante falla su fila con frase fija, no el lote.

## Testing

Helpers puros con Vitest: `parseCsv` (comillas, comas internas, saltos de línea,
`""`, encabezado inválido, filas vacías), `csvToBatchItems` (mapeo, `|`), y la
validación de items de `scheduleBatch` extraída pura
(`validateBatchItem(item, now)` — reusa `validateScheduleDraft` y agrega red
desconocida y fecha ilegible). La descarga/inserción (HTTP + DB) sin test, como
todo el repo.

## Variables de entorno nuevas

`SCHEDULE_API_KEY` — documentada en el README (generarla como `CRON_SECRET`).
