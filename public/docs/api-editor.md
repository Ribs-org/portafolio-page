# API del calendario de Vicente Pareja — guía para el editor de contenido

Escrita para un LLM que programa y analiza contenido. Es autosuficiente: todo lo que
puedes hacer, con qué forma exacta, y qué significa cada respuesta. Si algo no está
aquí, el sistema no lo hace.

## Qué es este sistema

Un calendario de publicación propio, conectado a las cuentas reales de Vicente. Tú
programas posts por API; un proceso automático los publica a su hora en cada red y
guarda el resultado. Otro proceso sincroniza a diario las métricas de lo publicado.
Cierras el ciclo leyendo esas métricas junto a las etiquetas que tú mismo pusiste al
programar.

**Redes que publican hoy:** `instagram`, `facebook`, `youtube`, `threads`, `x`.
`tiktok` existe en el sistema para leer métricas, pero **no publica** — programar
hacia ella rechaza la fila.

**Zona horaria:** todo lo que escribes y lees en horas está en `America/Santiago`.

## Autenticación

Un solo secreto para ambos endpoints:

```
Authorization: Bearer <SCHEDULE_API_KEY>
```

Sin él, o con uno incorrecto: `401` con el cuerpo `No autorizado`.

Base: `https://www.vicente-pareja.cl`

---

# 1. Programar posts — `POST /api/schedule/batch`

```http
POST /api/schedule/batch
Authorization: Bearer <SCHEDULE_API_KEY>
Content-Type: application/json
```

```json
{
  "posts": [
    {
      "fecha": "2026-09-08 19:00",
      "texto": "El primer renglón es el título en YouTube.\n\nY el resto es la descripción.",
      "redes": ["instagram", "facebook", "youtube"],
      "media": ["https://drive.usercontent.google.com/download?id=ABC&export=download"],
      "portada": "https://ejemplo.com/portada.jpg",
      "atributos": { "hook": "pregunta-polemica", "tema": "negocios-chile", "formato": "listado" }
    }
  ]
}
```

**Máximo 50 posts por request.** Más de eso: `400` con `Máximo 50 posts por lote.`
Cuerpo que no sea `{ posts: [...] }`: `400` con
`El cuerpo debe ser JSON con { posts: [...] }.`

## Los campos

### `fecha` (obligatorio)

Exactamente `YYYY-MM-DD HH:MM` (también se acepta una `T` en vez del espacio). Hora
de Chile, futura, precisión de minutos.

No se aceptan segundos, ni `Z`, ni offsets: un ISO completo se **rechaza** a
propósito, para que nunca se reinterprete tu instante UTC como hora de pared.

### `texto` (obligatorio salvo que haya media)

El caption. Se usa completo en todas las redes, con una excepción: en YouTube el
**primer renglón no vacío** (recortado a 100 caracteres) se convierte en el **título**
del video, y el texto completo va como descripción. Escribe pensando en eso.

Límites, que solo aplican si esa red está en el post:
- con `x`: 280 caracteres
- con `threads`: 500 caracteres
- siempre: 2200 caracteres (límite de Instagram)

### `redes` (obligatorio)

Array con una o más de: `instagram`, `facebook`, `youtube`, `threads`, `x`. Sin
repetir. Un mismo post sale a todas las que pongas.

### `media` (opcional)

Array de **URLs públicas**. El sistema las descarga (30 s de tope por archivo),
verifica que el tipo real coincida, y **las re-sube a su propio almacenamiento** —
la URL de origen puede morir después sin afectar la publicación.

- Imágenes: `.jpg .jpeg .png .gif .webp`
- Videos: `.mp4 .mov .webm`
- **Sin extensión reconocible también sirve**: el tipo lo decide el `Content-Type`
  real de la descarga. Esto es lo que hace funcionar los links directos de Google
  Drive: usa la forma `https://drive.usercontent.google.com/download?id=<ID>&export=download`
  con el archivo compartido como «cualquiera con el enlace». El link normal de
  «compartir» devuelve una página HTML y la fila se rechaza.

### `portada` (opcional)

Una URL pública de imagen **JPG o PNG** para usar como portada del video. Solo tiene
sentido con video en `media`.

Dónde se aplica: **Instagram** (portada del reel) y **Facebook** (miniatura del
video), enviadas junto con el video; **YouTube** (thumbnail) se aplica después de
subir — si eso fallara, el video igual queda publicado, sin portada. **Threads y X**
la ignoran sin error.

### `atributos` (opcional) — tu memoria de decisiones creativas

Un objeto plano, de valores simples (texto, número o booleano), máximo 20 claves y
2000 caracteres serializado:

```json
"atributos": { "hook": "pregunta-polemica", "tema": "negocios", "serie": "mut", "duracion_seg": 42 }
```

**Las claves y los valores los inventas tú.** El sistema no interpreta ninguno: los
guarda tal cual y te los devuelve junto a las métricas. Ese es el mecanismo con el
que puedes descubrir qué funciona: etiqueta de forma consistente lo que decides
(hook, tema, formato, estructura, duración, serie…) y después correlaciona.

Recomendación práctica: mantén un vocabulario estable entre posts. `"hook": "pregunta"`
en unos y `"gancho": "pregunta-directa"` en otros hace imposible comparar.

## Reglas por red (las que rechazan una fila)

| Regla | Cuándo se rompe | Frase exacta |
|---|---|---|
| Instagram y YouTube exigen archivo | los pones sin `media` | `Instagram y YouTube necesitan al menos un archivo.` |
| Un post necesita algo | sin texto y sin media | `Escribe un texto o adjunta un archivo.` |
| X no recibe video | `x` + un video | `X aún no recibe video desde el calendario.` |
| X hasta 4 imágenes | `x` + 5 o más | `X recibe hasta cuatro imágenes.` |
| Threads: un archivo | `threads` + 2 o más | `Threads recibe un solo archivo por post.` |
| Tope general | 11 o más archivos | `Máximo diez archivos por publicación.` |
| Al menos una red | `redes: []` | `Elige al menos una plataforma.` |
| Fecha futura | hora ya pasada | `La hora debe estar en el futuro.` |

Facebook además no admite **mezclar** video y fotos en un mismo post; eso se detecta
al publicar y el destino falla con `Facebook no admite mezclar video y fotos en un post.`

Instagram acepta: 1 foto, 1 video, o 2–10 fotos (carrusel).

## Errores por fila (formato y contenido)

| Frase exacta | Qué la causa |
|---|---|
| `La fecha no se entendió (usa YYYY-MM-DD HH:MM).` | formato de fecha inválido |
| `Red desconocida o sin publicación: tiktok.` | red inexistente, o `tiktok` |
| `Hay redes repetidas en la fila.` | la misma red dos veces |
| `No se pudo leer una media de la fila.` | descarga fallida, timeout, o tipo ajeno (HTML, PDF) |
| `La portada requiere un video en media.` | portada sin video |
| `La portada debe ser una imagen.` | la portada resultó ser video u otra cosa |
| `La portada debe ser JPG o PNG.` | portada gif/webp u otro formato |
| `Los atributos deben ser un objeto plano de valores simples.` | array, anidado, o excede 20 claves / 2000 chars |
| `El texto excede los 280 caracteres de X.` | caption largo con `x` en las redes |
| `El texto excede los 500 caracteres de Threads.` | caption largo con `threads` |
| `El texto es demasiado largo para Instagram.` | caption sobre 2200 |
| `No se pudo guardar la fila. Inténtalo de nuevo.` | fallo transitorio de base de datos |

## Respuesta

`200` siempre que el lote se procesó — **incluso con filas rechazadas**: el rechazo
por fila es dato, no error del endpoint.

```json
{
  "resultados": [
    { "index": 0, "ok": true,  "postId": "3f2a…" },
    { "index": 1, "ok": false, "error": "El texto excede los 280 caracteres de X." }
  ]
}
```

`index` es la posición en tu array `posts` (base 0).

**Éxito parcial:** las filas buenas quedan programadas aunque otras fallen. Corrige
las malas y **reenvía solo esas** — no hay deduplicación: reenviar una fila ya
programada la programa **otra vez**.

**Si no recibes respuesta** (timeout con muchas descargas): las filas ya procesadas
quedaron programadas. Verifica antes de reintentar, o duplicarás posts.

---

# 2. Leer métricas — `GET /api/metrics/posts`

```http
GET /api/metrics/posts?desde=2026-09-01&hasta=2026-09-30&red=instagram
Authorization: Bearer <SCHEDULE_API_KEY>
```

Parámetros, todos opcionales:
- `desde`, `hasta`: `YYYY-MM-DD` en hora de Chile, **ambos inclusive**. Por defecto,
  los últimos 30 días. Formato inválido o rango invertido: `400` con
  `El rango de fechas no se entendió (usa YYYY-MM-DD).`
- `red`: una de las conocidas. Otra cosa: `400` con `Red desconocida: <valor>.`

## Respuesta

```json
{
  "truncado": false,
  "posts": [
    {
      "red": "instagram",
      "externalId": "18114074218999893",
      "permalink": "https://www.instagram.com/p/…",
      "texto": "¿Cómo sacar plata con software…",
      "publicadoEl": "2026-09-03T11:15:00-03:00",
      "etiqueta": "reel-42",
      "atributos": { "hook": "pregunta-polemica", "tema": "negocios" },
      "archivado": false,
      "metricas": {
        "views": 5210,
        "viewsGanadas": 1200,
        "likes": 310,
        "comentarios": 12,
        "compartidos": 8,
        "alcance": 4100,
        "visitasAlSitio": 85,
        "clicks": 40,
        "ctr": 3.3,
        "arrastre": 7.1
      }
    }
  ]
}
```

## Cómo leer cada número

- **`views`** — el contador acumulado de por vida, al cierre del rango.
- **`viewsGanadas`** — cuánto creció ese contador **dentro** del rango. Para comparar
  posts entre sí, esta es casi siempre la métrica correcta: `views` favorece a lo
  viejo solo por llevar más tiempo publicado.
- **`likes`, `comentarios`, `compartidos`, `alcance`** — lo que reporta la red.
- **`visitasAlSitio`, `clicks`, `ctr`** — tráfico real que ese post llevó a
  vicente-pareja.cl, atribuido por la etiqueta `?s=` (ver abajo). Ninguna red te da
  esto: es la métrica de negocio.
- **`arrastre`** — `visitasAlSitio / viewsGanadas` en porcentaje: de la gente que vio
  el post en el período, qué fracción llegó efectivamente al sitio. Mide capacidad de
  convertir atención en visita, sin castigar a los posts chicos.
- **`null` significa que la red no reportó ese dato — nunca es cero.** No lo trates
  como 0 en promedios: distorsiona. Instagram, por ejemplo, no entrega métricas de lo
  publicado antes de que la cuenta fuera profesional.

**`etiqueta`** es el identificador `?s=` del post: el link que se pega en la red
lleva `https://www.vicente-pareja.cl/?s=<etiqueta>`, y así se atribuyen visitas y
clicks. Si un post nunca tuvo su link pegado, `visitasAlSitio` viene `null`.

**`atributos`** trae exactamente lo que enviaste al programar; es `null` para posts
subidos a mano fuera del calendario (también aparecen: también enseñan).

**`truncado: true`** avisa que el tope de filas mordió y la respuesta es parcial —
parte el rango en trozos más chicos.

## Dos semánticas que debes tener claras

1. **El rango filtra por fecha de publicación, no por actividad.** Un video publicado
   el 30 de agosto que explota el 5 de septiembre aparece en una consulta de *agosto*
   (con sus views ganadas dentro del rango que pidas), no en una de septiembre.
2. **Las métricas llegan con la sincronización diaria.** Lo publicado hoy tendrá
   números recién mañana. No concluyas nada de un post de hace dos horas.

---

# 3. El ciclo completo

1. **Programa** con `atributos` describiendo tus decisiones creativas.
2. El sistema **publica** a la hora indicada, en cada red. Si un destino falla, se
   reintenta hasta 3 veces; al tercer fallo Vicente recibe un correo y el post queda
   marcado en rojo en su calendario.
3. La sincronización diaria trae **métricas reales**.
4. **Lee** `/api/metrics/posts` sobre un rango con suficiente historia.
5. **Correlaciona** `atributos` contra `viewsGanadas` y `arrastre`, y decide la
   próxima parrilla. Ejemplos de preguntas que el dato responde:
   - ¿qué `hook` gana en views, y cuál gana en visitas al sitio? (rara vez es el mismo)
   - ¿un `tema` rinde distinto según la red?
   - ¿la `serie` sostiene el arrastre o se agota?

Cuantos más posts etiquetados con vocabulario consistente, antes aparecen los
patrones. Con menos de ~10 posts por valor de atributo, desconfía de la diferencia.

---

# 4. Lo que el sistema NO hace

- **No publica en TikTok** (la app sigue en revisión de la plataforma).
- **No deduplica**: reenviar el mismo lote programa todo de nuevo.
- **No programa en el pasado** ni acepta media que no esté en una URL pública.
- **No edita ni borra por API**: para corregir un post ya programado, Vicente lo hace
  en su panel (`/admin/schedule`), donde puede cambiar texto, hora, redes, media,
  portada y atributos, y ver la semana en calendario.
- **No republica lo ya publicado**: corregir un post afecta solo a los destinos que
  aún no salieron.
- **No entrega agregados**: este endpoint devuelve filas crudas y el análisis es tuyo,
  a propósito.

# 5. Ejemplos ejecutables

Programar dos posts:

```bash
curl -X POST https://www.vicente-pareja.cl/api/schedule/batch \
  -H "Authorization: Bearer $SCHEDULE_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "posts": [
      {
        "fecha": "2026-09-10 09:00",
        "texto": "¿El negocio con más margen del retail?\n\nTe sorprendería.",
        "redes": ["instagram", "youtube", "facebook"],
        "media": ["https://drive.usercontent.google.com/download?id=ABC&export=download"],
        "portada": "https://ejemplo.com/portada-01.jpg",
        "atributos": { "hook": "pregunta-polemica", "tema": "retail", "formato": "explicacion" }
      },
      {
        "fecha": "2026-09-10 19:00",
        "texto": "Tres cosas que aprendí vendiendo software en Chile.",
        "redes": ["threads", "x"],
        "media": [],
        "atributos": { "hook": "listado", "tema": "software", "formato": "texto" }
      }
    ]
  }'
```

Leer el mes:

```bash
curl -s "https://www.vicente-pareja.cl/api/metrics/posts?desde=2026-09-01&hasta=2026-09-30" \
  -H "Authorization: Bearer $SCHEDULE_API_KEY"
```
