# Calendario semanal y edición de posts programados

Fecha: 2026-09-02
Estado: aprobado, pendiente de plan de implementación

Se apoya en el calendario de publicación (fases 1–5) y en la carga masiva. La cola
de `/admin/schedule` ya lista lo programado con chips de estado, Eliminar y
Reprogramar (solo fallidos); esto agrega la vista de calendario y la capacidad de
editar un post antes de que publique.

## Problema

La cola es una lista plana: con veinte posts programados no se ve la distribución
de la semana, y un post ya programado no se puede corregir — un typo en el texto,
una hora mal puesta o una red de más obligan a eliminar y volver a crear. Y cuando
un destino falla (por ejemplo X rechazó el texto por largo), arreglar la causa
exige recrear el post entero.

## Objetivo

Un alternador «Lista | Calendario» en `/admin/schedule`: la vista calendario es una
semana de 7 columnas con tarjetas por post, y cada tarjeta abre
`/admin/schedule/<id>` — una página de edición con texto, fecha/hora, redes y media
(quitar, reordenar, agregar por archivo local o por URL pública). Guardar re-valida
con las reglas del compositor y re-arma los destinos fallidos.

## No objetivos

- **Drag & drop** para reprogramar arrastrando tarjetas. El campo de fecha del
  editor resuelve lo mismo sin librerías nuevas.
- **Vista mensual.** La semana es la unidad de trabajo elegida; un mes cabe como
  fase futura si se echa de menos.
- **Editar destinos ya publicados.** Lo publicado publicado está: conserva su
  `externalId` y jamás se republica (opción c descartada por el dueño).
- **Borrar blobs de la media quitada.** Mismo trade ya aceptado al eliminar posts;
  la limpieza de storage es un fast-follow conocido.
- **Historial de versiones del post.** Guardar sobreescribe; no hay undo.

## Decisiones tomadas

| Decisión | Alternativa descartada | Razón |
|---|---|---|
| Vista semanal, 7 columnas | Mes tipo Google Calendar; mes + lista | Elegida por el dueño: más detalle por post (miniatura, texto) donde se programa denso |
| Alternador «Lista \| Calendario» por URL | Reemplazar la lista; secciones duplicadas | Elegido por el dueño: misma data, dos lentes; la URL (`?vista=`) sigue el molde de los filtros de Contenido |
| Editable con destinos intactos **y fallidos**; publicados bloqueados | Solo intactos; editar incluso con publicados | Corregir-lo-que-falló-y-reintentar es el caso de uso real; versiones distintas por red no |
| Guardar re-arma los fallidos (`scheduled`, intentos 0, sin error) | Botón de reintento aparte | Editar-y-guardar ES el reintento; un paso extra no compra nada |
| Editor en página propia (`/admin/schedule/<id>`) | Diálogo modal sobre la misma página | Server actions y forms de página son el molde del repo; cero estado global de cliente |
| Media por archivo local **y** por URL | Solo archivo | Pedido del dueño; la URL reusa el camino probado de la carga masiva (content-type manda) |
| Post con destino `publishing`: página solo-lectura | Bloquear solo ese destino | Editar a mitad de una publicación en curso es una carrera que no vale la pena arbitrar |
| Agrupado por día en `SITE_TIMEZONE` | Zona del servidor | El servidor es UTC en Vercel; el lunes del dueño empieza en Chile |

## La vista: alternador y calendario

`/admin/schedule` conserva compositor y carga masiva arriba. La sección de la cola
gana el alternador:

- Sin parámetros: la lista actual, intacta.
- `?vista=calendario`: el calendario semanal. `?semana=YYYY-MM-DD` (un lunes) fija
  la semana visible; sin él, la semana actual en `SITE_TIMEZONE`. Un `semana` que
  no es lunes se normaliza al lunes de esa fecha; ilegible, a la semana actual.
- Los links del alternador y las flechas preservan los demás parámetros de la URL
  (molde `contentHref` de Contenido).

El calendario es un server component:

- Cabecera: «← Semana anterior · 8–14 sep · Semana siguiente →» (rango formateado
  en español, sin año salvo que la semana cruce de año).
- 7 columnas lunes a domingo; el día de hoy resaltado.
- La consulta de la página gana el join de `scheduledPostMedia` (hoy solo trae
  post + targets) y el calendario muestra **todos** los posts cuya `scheduledAt`
  cae en la semana visible — también los ya publicados: el calendario es la
  historia de la semana, no solo lo pendiente. La lista no cambia su consulta.
- Tarjeta por post: hora (`HH:MM` en `SITE_TIMEZONE`), miniatura de la primera
  media si existe, texto truncado a dos líneas (o «(sin texto)»), y un puntito por
  red coloreado por estado: gris `scheduled`, ámbar `publishing`, verde
  `published`, rojo `failed`. La tarjeta entera es un `<Link>` a
  `/admin/schedule/<id>`.
- Día sin posts: columna vacía, sin mensaje.

## La página de edición: `/admin/schedule/[id]`

Server component que carga post + targets + media (404 → `notFound()`). Reglas de
presentación:

- Algún target `publishing`: página **solo-lectura** con el aviso fijo «Hay una
  publicación en curso. Vuelve en un minuto.» — el formulario se pinta
  deshabilitado.
- Targets `published`: chip verde bloqueado por red, con el aviso «Ya publicado en
  {red}. Los cambios no tocan lo publicado.» Su checkbox no se puede desmarcar.
- El resto es un formulario (client component) precargado:
  - **Texto**: textarea con el caption actual.
  - **Fecha y hora**: `datetime-local` con el valor actual en `SITE_TIMEZONE`.
  - **Redes**: checkboxes de las cinco publicables; marcadas las actuales.
  - **Media**: las existentes como miniaturas con «Quitar» y reordenar (↑ ↓);
    «Agregar archivos» (input file múltiple, como el compositor) y «Agregar por
    URL» (un textarea, una URL pública por línea).
  - **Guardar** (server action `updateScheduledPost`) y **Eliminar** (reusa
    `deleteScheduledPost`; al confirmar, vuelve a `/admin/schedule`).
- Guardar con éxito redirige a la vista de la que se vino (el editor recibe
  `?volver=` con la query de la vista de origen y la respeta; sin él, a
  `/admin/schedule`).

## El server action: `updateScheduledPost`

En `src/app/admin/actions.ts`, con `requireAuth`. Recibe `postId` y el `FormData`
del editor. En orden:

1. **Releer** post + targets + media. Post inexistente → error fijo «El post ya no
   existe.»
2. **Bloqueo**: algún target `publishing` → error fijo «Hay una publicación en
   curso. Vuelve en un minuto.»
3. **Redes**: las elegidas deben incluir todas las `published` (un checkbox
   bloqueado no viaja desmarcado salvo forms manipulados) — si falta una, error
   fijo «No se puede quitar una red ya publicada.»
4. **Media nueva**: archivos subidos van al Blob como en `createScheduledPost`;
   URLs se descargan y verifican reusando el camino de la carga masiva
   (`mediaToBlob` con tipo diferido al content-type). Una URL ilegible → error
   fijo «No se pudo leer una media por URL.» y no se guarda nada.
5. **Validación completa**: `validateScheduleDraft` con el caption nuevo, la
   fecha nueva y el conteo final de media (las existentes que quedan + las
   nuevas), y las redes elegidas. Error → frase fija del validador, sin guardar.
6. **Persistir**, en este orden:
   - `scheduledPosts`: caption y `scheduledAt`.
   - Media: borrar las filas quitadas, insertar las nuevas, reescribir
     `position` según el orden final.
   - Targets: insertar los nuevos como `scheduled`; borrar los desmarcados
     `WHERE status IN ('scheduled','failed')` (jamás published/publishing);
     re-armar los fallidos que quedan: `status='scheduled'`, `attemptCount=0`,
     `lastError=null`, también con guard `WHERE status='failed'`.
7. Cada UPDATE/DELETE de target lleva su guard de status en el WHERE: si el cron
   tomó un target entre la relectura y el write, la edición simplemente no toca
   esa fila — el que llegó tarde pierde, sin corromper estado.

Sin transacciones interactivas (driver neon-http): el orden de los writes deja, en
el peor corte, media actualizada con targets viejos — el mismo perfil de fallo
parcial ya aceptado en `createScheduledPost` y la carga masiva.

## Manejo de errores

Frases fijas en español para todo lo visible; detalle upstream (descargas, DB) a
`console.error` truncado. El editor muestra el error sobre el botón Guardar sin
perder lo escrito (useActionState, molde del compositor).

## Testing

Puro con Vitest:

- **Semana**: `mondayOf(fecha, zona)`, rango visible, agrupado de posts por día en
  `SITE_TIMEZONE` (bordes: domingo 23:59, lunes 00:00, cambio DST de Chile),
  etiqueta de cabecera.
- **Diffs**: `diffMedia(existentes, quedan, nuevas)` → borrar/insertar/posiciones;
  `diffTargets(actuales, elegidas)` → crear/borrar/re-armar respetando los
  bloqueos por estado (published nunca se borra, publishing nunca se toca).
- **Reglas del editor**: la validación de redes publicadas obligatorias y los
  errores fijos.

DB, upload y páginas server-rendered sin test, como todo el repo.

## Variables de entorno nuevas

Ninguna.
