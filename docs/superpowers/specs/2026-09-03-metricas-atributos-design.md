# Métricas por API y atributos de contenido — el loop de aprendizaje de Cloth

Fecha: 2026-09-03
Estado: aprobado, pendiente de plan de implementación

Se apoya en el calendario de publicación, la carga masiva (API con
`SCHEDULE_API_KEY`) y los conectores de lectura que sincronizan métricas a
`social_posts`. El editor de contenido del dueño es un LLM («Cloth») que programa
posts por la API; esto le da el camino de vuelta: leer cómo rindió lo que publicó.

## Problema

Cloth programa videos pero no puede saber cuáles rindieron: las métricas viven solo
en el panel humano. Y aunque pudiera leerlas, no hay forma de conectar el resultado
con sus decisiones creativas («qué hook usé en este video») — sin eso no hay
aprendizaje, solo números sueltos.

## Objetivo

Dos piezas que cierran el loop:

1. **Atributos de contenido**: al programar por la API, cada post puede llevar
   `atributos` — un JSON plano que Cloth inventa libremente
   (`{"hook": "pregunta-polemica", "tema": "negocios", "serie": "mut"}`).
2. **`GET /api/metrics/posts`**: devuelve cada publicación sincronizada del rango
   con sus métricas reales Y sus atributos, para que Cloth correlacione y decida
   la próxima parrilla.

## No objetivos

- **Agregados del lado del servidor** (`?por=hook` con promedios). Las filas crudas
  son la materia prima de un LLM; agregar es su trabajo (opción b descartada).
- **Atributos en el CSV.** JSON en una celda de planilla es sufrimiento; quien
  etiqueta es Cloth por la API JSON. El CSV queda en sus 5 columnas.
- **Taxonomía fija de atributos.** El catálogo es de Cloth y evoluciona solo;
  nosotros no opinamos sobre qué es un «hook» (opción c descartada).
- **Llave nueva.** El mismo consumidor usa la misma `SCHEDULE_API_KEY`; si algún
  día otro actor necesita solo-lectura, ahí se separa.

## Decisiones tomadas

| Decisión | Alternativa descartada | Razón |
|---|---|---|
| `atributos` JSONB libre (plano) en `scheduled_posts` | Tags planos; campos fijos | Elegido por el dueño: la taxonomía es del LLM y evoluciona; el sistema solo la transporta |
| Filas crudas en el endpoint | Crudas + agregados; solo agregados | Elegido por el dueño: correlacionar es lo que el LLM hace mejor; cero preguntas congeladas |
| Reusar `getPostRows` con el rango como período | Query nueva | Mismas semánticas que el panel (acumulado + ganado en ventana, visitas por `?s=`, nulls honestos); dos motores divergirían |
| Los posts orgánicos también se listan (`atributos: null`) | Solo lo programado | Un post subido a mano también enseña; el null dice honestamente «sin decisiones registradas» |
| Join por (`network`, `externalId`) destino→post sincronizado | Guardar el postId sincronizado en el target | El external id ya existe en ambos lados; nada nuevo que mantener |
| Atributos visibles y editables como texto JSON en el editor del panel | Solo por API | Corregir una etiqueta a mano no debe exigir un curl |

## Los atributos

- Columna `atributos: jsonb` (nullable) en `scheduled_posts`.
- Contrato de la API de programación (`POST /api/schedule/batch`): campo opcional
  `atributos` por item. Validación pura (frase fija «Los atributos deben ser un
  objeto plano de valores simples.»):
  - objeto plano (no array, no null explícito): valores solo string, number o
    boolean — nada anidado;
  - máximo 20 claves; máximo 2000 caracteres serializado.
- El CSV no lo lleva; `csvToBatchItems` produce items sin atributos.
- Editor del panel (`/admin/schedule/[id]`): textarea chico con el JSON actual
  (o vacío); al guardar, `updateScheduledPost` lo parsea y valida con la misma
  regla — JSON ilegible o inválido devuelve la frase fija sin guardar. Textarea
  vacío = `null`.

## El endpoint: `GET /api/metrics/posts`

- Header `Authorization: Bearer <SCHEDULE_API_KEY>`; sin variable configurada,
  401 (molde del batch).
- Query params:
  - `desde`, `hasta`: `YYYY-MM-DD` en `SITE_TIMEZONE`; el rango es inclusivo
    (hasta cubre el día completo). Default: últimos 30 días. Ilegibles → 400 con
    frase fija «El rango de fechas no se entendió (usa YYYY-MM-DD).»
  - `red`: opcional; una de las redes conocidas, filtra las filas. Desconocida →
    400 «Red desconocida: …».
- Respuesta 200:

```json
{ "posts": [ {
  "red": "instagram",
  "externalId": "18114074218999893",
  "permalink": "https://www.instagram.com/p/…",
  "texto": "¿Cómo sacar plata con software…",
  "publicadoEl": "2026-09-03T11:15:00.000-03:00",
  "etiqueta": "reel-42",
  "atributos": { "hook": "pregunta-polemica", "tema": "negocios" },
  "archivado": false,
  "metricas": {
    "views": 5210, "viewsGanadas": 1200,
    "likes": 310, "comentarios": 12, "compartidos": 8,
    "alcance": 4100,
    "visitasAlSitio": 85, "clicks": 40, "ctr": 3.3, "arrastre": 7.1
  }
} ] }
```

- Semánticas idénticas al panel: `views` es el acumulado al cierre del rango,
  `viewsGanadas` lo ganado dentro de él, visitas/clicks/ctr vienen de la
  atribución por etiqueta `?s=`, `arrastre` = visitas sobre views ganadas, y un
  `null` significa «la red no lo reportó», nunca cero. `publicadoEl` va en ISO
  con offset de `SITE_TIMEZONE`.
- Implementación: se arma el objeto `Filters` directo (`{ from, to, profileId:
  null, includeBots: false }` — `parseFilters` es de presets del panel) y se llama
  `getPostRows` con él; los atributos
  se resuelven con una consulta a `scheduled_post_targets` + `scheduled_posts`
  por los pares (network, externalId) del resultado, mapeados en memoria.
- El armado de la respuesta (fila `PostRow` + atributos → shape JSON) es un
  helper puro testeable.

## Manejo de errores

Frases fijas en español (arriba); detalle upstream a `console.error` truncado.
El endpoint jamás filtra el token ni SQL en mensajes.

## Testing

Puro con Vitest:

- `validateAtributos`: objeto plano válido; rechazos por array, anidado, valor
  objeto, >20 claves, >2000 chars, tipos raros.
- El armador de la respuesta: `PostRow` completo → shape con nombres en español,
  nulls preservados, atributos adjuntos o null.
- Parseo del rango: defaults, `desde`/`hasta` válidos e ilegibles, inclusividad
  del día final.

HTTP y DB sin test, como todo el repo.

## Variables de entorno nuevas

Ninguna (reusa `SCHEDULE_API_KEY`).
