# Deuda técnica

Lo que se dejó a medias a propósito, con el porqué y lo que costaría terminarlo. No es una
lista de deseos: cada entrada nació de un problema real que se parcheó para seguir.

---
## El editor y los avatares todavía suben a través de la función

**Abierto desde 2026-09-22.** El compositor ya no: se arregló el 2026-09-23.

Vercel corta los cuerpos de petición en **~4,5 MB**. Está medido contra producción, con
cuerpos de tamaño conocido, no supuesto:

```
 1 MB → 204      4 MB → 204      5 MB → 413
```

Ese número manda sobre cualquier configuración: `serverActions.bodySizeLimit` en
`next.config.ts` no sirve de nada, porque la plataforma rechaza antes de que Next mire. El
síntoma es un `413` en el `POST`, y en pantalla la frase genérica del boundary.

**Resuelto en el compositor:** el navegador pide una URL firmada a
`api/admin/upload-url`, hace el PUT él mismo, y a la acción solo le llegan las URLs, que
se verifican con `keyDesdeUrl` (que sean del bucket, bajo `scheduled/`) y con `existe`
(que el archivo esté de verdad). Ver `lib/subida-directa.ts`.

Y una pieza que no es código: **el bucket necesita una política CORS**. La spec de
2026-09-09 decía «nada que tocar en Cloudflare», y era cierto mientras el único que subía
directo era el teléfono — `fetch` nativo no aplica la política de mismo origen. Con el
navegador subiendo, sin CORS el PUT muere en la verificación previa y se ve como «Failed
to fetch», sin rastro en los logs del servidor porque nunca llega. Aplicada en producción
el 2026-09-23; la receta quedó en `.env.example`.

**Falta en dos lugares**, los dos con el mismo patrón y la misma solución:

| Dónde | Qué sube |
|---|---|
| `admin/(dash)/schedule/[id]/editor.tsx` | media al editar un post |
| `components/image-field.tsx` → `uploadImage` | avatares y portadas |

El editor es más enredado porque teje los archivos con `keptMedia` y con `mediaUrls`, así
que merece su propio rato. `uploadImage` además **miente**: declara un máximo de 8 MB que
la plataforma nunca deja llegar.

## El boundary del panel esconde el error real

**Abierto desde 2026-09-22.**

`src/app/admin/(dash)/error.tsx` dice «una consulta no respondió» pase lo que pase. Cuando
el fallo fue un `413` por tamaño de archivo, esa frase mandó la depuración en la dirección
equivocada durante una hora: se buscó un problema de base de datos que no existía.

Conviene que el boundary distinga al menos entre un fallo de red o tamaño y uno de
consulta, o que el compositor atrape el `413` y diga que el archivo es muy grande.

## El panel muestra tiempos relativos sin protección de hidratación

**Abierto desde 2026-09-22.**

Textos como «Sincronizado hace 5 horas» o «la conexión vence mañana» se calculan en el
servidor y otra vez en el cliente. Si el cálculo cruza un cambio de unidad entre ambos,
React aborta la hidratación con el error #418 y cae al boundary — que además muestra la
frase equivocada, ver arriba. Es intermitente y difícil de reproducir a pedido.

## Un guardia de choque de unicidad estuvo muerto sin que nadie lo notara

**Abierto el 2026-09-24, cerrado el mismo día.** Queda escrito porque la forma de fallar se
va a repetir.

`isCampaignUniqueViolation` comparaba el error contra una propiedad `constraint`. Ese es el
nombre que usa `node-postgres`; el driver de este proyecto es `postgres-js`, que mapea ese
campo a **`constraint_name`** (`node_modules/postgres/src/connection.js:46`). La función no
podía devolver `true` nunca, así que un choque de `social_posts_campaign_unique` reventaba
la sincronización en vez de reintentar con la etiqueta desambiguada, que es justo lo que su
comentario prometía.

Sobrevivió porque nadie lo probó: `sync.ts` no tenía tests. Y estuvo a punto de propagarse,
porque se mandó copiar ese archivo como precedente para el guardia equivalente de
`profiles.slug`.

**Las dos mitades que hay que recordar**, porque arreglar solo una deja el guardia igual de
muerto:

1. El nombre del campo es `constraint_name`, no `constraint`.
2. **Drizzle envuelve toda consulta fallida** en `DrizzleQueryError` y deja el error del
   driver en `cause` (`drizzle-orm/errors.cjs:35-45`, `pg-core/session.js:41`), así que hay
   que mirar en los dos niveles.

Los dos sitios quedaron arreglados y con tests que usan la forma real del driver envuelta.
Si aparece un tercer guardia de este tipo, sale de ahí.

## La página de un usuario se crea al invitarlo, pero nadie rellena hacia atrás

**Abierto desde 2026-09-24.**

Desde que existe la página por usuario, `invitar()` y `asegurarAdmin()` la crean junto con
el usuario, y de ahí sale el invariante que el resto del código puede suponer: **todo
usuario tiene exactamente una página**. Para los usuarios creados **antes** de ese cambio no
hay nada que la cree: `asegurarAdmin()` repara solo al admin, y el migrador solo adopta
perfiles huérfanos, no crea los que faltan.

Hoy no muerde —se consultó la base al desplegarlo: un solo usuario, el admin, con su página
ya creada—, así que no se escribió un relleno para cero filas. Pero si alguna vez hay
usuarios sin página, el síntoma va a ser silencioso: su dominio responde 404 en todo, sin
error. Un `select` de usuarios sin fila en `profiles` lo detecta en un segundo, y el relleno
es el mismo `crearPaginaDe` en un bucle.

## Dos cosas anteriores que la página por usuario dejó más expuestas

**Anotado el 2026-09-24.** Ninguna es de esa entrega; las dos quedaron con más superficie.

- **`isPublished` se filtra en memoria, no en el SQL** (`src/app/[slug]/page.tsx`). Un
  perfil despublicado sale igual de la base para descartarse después, que es lo contrario
  del principio que enuncia el comentario de `getProfileBySlug` dos archivos más allá. No es
  una fuga —la fila nunca llega al cliente—, pero la incoherencia invita a copiar el patrón.
- **Una petición anónima puede escribir.** `adminId()` llama a `asegurarAdmin()`, que hace
  un `insert … on conflict do update` si falta la fila del admin. Antes eso colgaba solo de
  la raíz `/`; ahora también de `/<cualquier-cosa>`, o sea de un espacio de nombres
  ilimitado. El patrón es anterior y está asumido, pero conviene saber que creció.

## La suite falla unas 3 pruebas en 1 de cada 20 corridas

**Abierto desde 2026-09-24.**

`npx vitest run` pasa 725/725 casi siempre, y de vez en cuando caen tres. Reprodujo una vez
en veintiuna corridas y no volvió en las siguientes, así que no se pudo capturar cuáles ni
con qué mensaje. Las sospechas razonables, por orden: estado compartido entre archivos de
test, un mock que se filtra entre ellos, o una dependencia del orden en que vitest los
reparte entre procesos.

Mientras no se identifique, **una corrida roja en CI no se puede dar por buena sin mirar qué
falló**: puede ser esto o puede ser real, y la diferencia importa.
