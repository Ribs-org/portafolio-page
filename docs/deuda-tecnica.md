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

## Dos guardias de choque de unicidad, idénticos, en dos archivos

**Abierto desde 2026-09-24.**

`esChoqueDeUnicidad` (`src/lib/usuarios.ts`) e `isCampaignUniqueViolation`
(`src/lib/social/sync.ts`) son la misma función con otro nombre de restricción: una
comentada en español y otra en inglés, con dos suites de tests que prueban lo mismo. El bug
del `constraint_name` vivió en las dos copias **justamente por eso**, y se arregló dos veces.

Un `esViolacionDeUnicidad(error, nombreRestriccion)` compartido cierra la puerta. Si aparece
un tercer guardia de este tipo antes de que eso pase, la deuda ya costó más de lo que ahorró.

## La prueba que «no envejece» solo mira directorios

**Abierto desde 2026-09-24.**

`src/lib/slugs.test.ts` lee `src/app` y `public/` del disco para exigir que toda ruta real
esté en `RESERVADOS`, y esa es su gracia: agregar una ruta y olvidar la lista rompe el test
en vez de romperle la página a un usuario.

Pero solo lee **directorios**. Una ruta de convención por archivo —`sitemap.ts`,
`manifest.ts`, `opengraph-image.tsx`— no la vería. `robots.ts` ya existe y está cubierto
solo porque alguien lo escribió a mano en la lista, que es exactamente lo que este test
existe para no depender. Hoy no falta ninguna; la garantía es más chica que su promesa.

## El tercer detector de choque de unicidad, y por qué se cuentan tres

**Anotado el 2026-09-24.** Los tres están arreglados; queda escrito el patrón.

`updateProfile` detectaba el choque con `String(error).includes('profiles_slug_unique')`.
Nunca podía casar: drizzle envuelve la consulta fallida en un `DrizzleQueryError` cuyo
mensaje es solo `Failed query: <sql>`, y deja el error del driver en `cause`. Venía desde el
primer commit del repositorio.

Con este van **tres** detectores muertos del mismo choque, escritos en tres formas
distintas, en tres archivos, a lo largo de meses. Ninguno falló ruidosamente: cada uno
degradó en silencio —una sincronización que revienta en vez de reintentar, un reintento de
dirección que nunca ocurre, un mensaje que no dice qué pasó—. El arreglo de los tres cabe en
una función.

La lección operativa, para la próxima vez que haya que reconocer un error de Postgres:

- **El código va en `cause`**, no en el error que se atrapa. Drizzle envuelve siempre.
- **El campo es `constraint_name`**, que es lo que expone `postgres-js`. `constraint` es de
  `node-postgres`, que no es el driver de este proyecto.
- **Comparar contra el texto del mensaje no funciona** y, peor, no falla: devuelve `false` y
  el camino alternativo simplemente no ocurre.
- **Escribe el test con la forma real del driver envuelta por drizzle.** Un test que arma un
  objeto plano `{ code, constraint }` pasa con la función rota; los tres detectores
  sobrevivieron justamente porque nadie los probó, o los probó contra una ficción.

## El arnés de aislamiento solo llega a `src/lib`

**Abierto desde 2026-09-24.**

`aislamiento.test.ts` importa funciones de `src/lib` y comprueba que cada una ate su
consulta al dueño. Eso deja sin protección cualquier consulta escrita **fuera de
`src/lib`**. La del calendario (`schedule/page.tsx`) lo estuvo hasta el 2026-09-29, cuando
El Fuego necesitó la misma lectura y se movió a `src/lib/social/publish/cortes.ts`, donde
el arnés sí la ve. Eso achicó la superficie en una, no la cerró: `grep -rln "getDb()"
src/app` (sin contar el test) da hoy doce archivos que arman su propio SQL, en tres clases:

- **Cuatro páginas del panel**: `schedule/[id]/page.tsx`, `profiles/[id]/page.tsx`,
  `analytics/page.tsx` y `accounts/elegir/page.tsx`.
- **Las acciones de servidor**, `admin/actions.ts`, con decenas de consultas (la guardia de
  `rescheduleTarget` que se añadió el 2026-09-29 es una de ellas).
- **Siete rutas de API**: `api/schedule/posts`, `api/mobile/schedule`, `api/mobile/overview`
  (esta con dos consultas, una por ventana), `api/mobile/accounts`,
  `api/mobile/schedule/accounts`, `api/track/visit` y `api/track/click`.

De todas ellas, solo las tres primeras rutas se leyeron a mano el 2026-09-24 y tenían el
dueño en el `WHERE`; del resto esta entrada no afirma nada, y las dos de `api/track/*`
escriben colgando de un perfil, que es otra forma de acotar. Lo que sí vale para todas:
nada impide que mañana alguien mueva un filtro al `ON` de un join sin que ninguna prueba
chille.

El calendario no se extrajo por criterio sino porque otra pantalla la pedía; el patrón
real del repositorio sigue siendo que el arnés llega a `src/lib` y no a las páginas, las
acciones ni las rutas de API que arman su propio SQL. Cerrarlo de verdad pide decidir
cuáles de esas doce se trasladan a `src/lib`, o extender el arnés para que también las
alcance ahí donde viven.

Y hay una excepción al revés, dentro de `src/lib`: `src/lib/social/meta-bajas.ts`
(`darDeBaja`, `pasosDeBorrado`, `borrarDatosDe`) busca por `social_accounts.meta_user_id` y
**no** filtra por dueño, a propósito. Quien pide ahí no es un dueño con sesión sino Meta,
que no sabe quién es nuestro dueño: el callback de baja o de borrado llega como un `POST`
público cuya única credencial es el `signed_request` firmado con el app secret. Exigirle un
`owner_id` a esas consultas sería pedir un dato que la petición no trae. Lo que sostiene el
aislamiento acá es la firma, no el `WHERE`: por eso nada de ese módulo se llama desde una
acción con sesión ni desde otra ruta sin haber pasado antes por `leerSignedRequest`
(`src/lib/social/meta-firma.ts`), y por eso tampoco está en la lista de `aislamiento.test.ts`
—el arnés lo daría por roto, y no lo está—. Si alguien lo importa desde el panel, el filtro
por dueño hay que ponerlo en el llamador.

La misma excepción alcanza a la página `/borrado/[codigo]`
(`src/app/(legal)/borrado/[codigo]/page.tsx`), que lee `solicitudes_borrado` por el código y
no por dueño: esa tabla no tiene `owner_id` a propósito —cuando la fila se escribe, ese
dueño ya no tiene cuentas de Meta—, y quien consulta la URL es Meta o quien pidió el
borrado, ninguno con sesión. Ahí la llave es el código aleatorio de 16 caracteres, y por eso
la página no muestra nada que necesite más: ni nombre, ni correo, ni handle.

## Dos caminos que crean publicaciones, sin código compartido

**Abierto desde 2026-09-24.**

`crearPostProgramado` (`src/lib/social/publish/crear.ts`) y los `insert` propios de
`POST /api/schedule/batch` (`src/lib/social/publish/batch.ts`) escriben posts y sus
destinos por caminos separados. `batch.ts` no llama a `crearPostProgramado` porque esa
función no sabe de portada (`coverUrl`) ni de `atributos`, dos columnas que solo la carga
masiva escribe. Es una duplicación anterior a esta entrega, que la conservó a propósito
—extender `crearPostProgramado` habría tocado la pieza del camino de publicar que ya usa
el compositor, el más transitado, a cuestas de un cambio de vocabulario—.

El costo: un cambio futuro en cómo se escriben los destinos de un post (la tabla
`scheduled_post_targets`, sus columnas, su validación) hay que hacerlo dos veces, y las dos
copias pueden divergir sin que nada lo note. Cerrarlo pide que `crearPostProgramado` acepte
portada y atributos, o que `batch.ts` la llame para escribir destinos y solo haga sus
propios `insert` para lo que le es propio.

## Un campo nuevo en `ReglaLimpia` no llega solo a los tres caminos que la escriben

**Abierto desde 2026-09-27.**

`reglas_clave` se escribe desde tres sitios, y `ReglaLimpia` es el tipo que los tres comparten.
Agregarle `documento_url` en esta entrega dejó claro que el tipo compartido no reparte nada por
sí solo: cada camino decidió distinto, y dos de las tres decisiones estaban mal.

- **`scheduleBatch`** (`src/lib/social/publish/batch.ts`) es el que lo hace bien: llama a
  `documentoToBlob`, copia el PDF a R2 y guarda **nuestra** URL; si no puede traerlo, rechaza la
  fila ahí mismo.
- **`updateScheduledPost`** (`src/app/admin/actions.ts`) lo hacía mal y **se arregló en esta
  misma rama**: su `onConflictDoUpdate` esparcía la regla entera, así que cada guardado del
  editor escribía `documento_url = NULL` —el formulario no tiene ese campo, y el validador
  siempre devuelve la clave puesta—. Un post programado por API con su PDF perdía el documento en
  cuanto el dueño cambiaba la hora, y al día siguiente el barrido de R2 borraba el archivo. Ahora
  su `set` nombra solo las columnas que ese editor administra (`columnasEditablesDeRegla`).
- **`crearPostProgramado`** (`src/lib/social/publish/crear.ts`) **sigue abierto**: inserta
  `...input.regla` completo, sin pasar por `documentoToBlob`, así que un `documentoUrl` que le
  llegara quedaría guardado tal cual, apuntando al servidor de un tercero. Hoy no hay llamador
  que pueda hacerlo —el compositor del panel solo arma palabra, mensaje y respuesta, y la ruta
  del teléfono no le pasa `regla`— así que no es un fallo de hoy. Se dejó así porque esta entrega
  es «todo por API» y tocar el camino del compositor no le hacía falta.

Lo que cuesta y lo que enseña: **una columna de este tipo tiene dos formas de fallar, y las dos
son silenciosas.** Guardar una URL ajena hace que el enlace muera cuando el tercero borre su
archivo, y el barrido nunca protege nada porque no hay objeto nuestro que proteger. Pisarla con
`null` borra el archivo que sí era nuestro. Ninguna de las dos da error, y ninguna se ve en la
pantalla del panel, que no muestra el documento en ninguna parte.

Cerrar lo que queda abierto pide una de dos: que `crearPostProgramado` copie el documento como
hace el lote, o que rechace una regla que traiga `documentoUrl` en vez de guardarla a medias. Y
el día que el editor del panel administre documentos de verdad, la salida buena es que los tres
caminos compartan la escritura de la regla en vez de tener cada uno su `insert` —que es la deuda
de más arriba, «Dos caminos que crean publicaciones, sin código compartido», de la que esta es
una consecuencia concreta.

## Los `insert` del lote no van en transacción

**Abierto, anterior a esta entrega.**

`POST /api/schedule/batch` escribe cada fila con varios `insert` separados: el post y sus
destinos, siempre; su media, si la fila trae archivos; y la regla de palabra clave, si la
fila la pidió — hasta cuatro. Si el de los destinos falla después de que el del post (y,
si corresponde, el de la media) ya confirmaron, queda un post con su media y **sin ningún
destino** — invisible para el cron de publicación, porque este solo recorre destinos
pendientes. El dueño ve un post «fantasma» en la carga masiva que nunca sale, sin ningún
error visible después del hecho.

Envolverlos todos en una transacción de drizzle lo cierra.

## Las métricas siguen agrupadas por red, no por cuenta

**Abierto desde 2026-09-24.** Es lo que esta entrega deja pendiente de su propia idea.

`api/mobile/accounts` (`src/app/api/mobile/accounts/route.ts`) y
`src/lib/account-stats.ts` agrupan las filas por `network`, no por cuenta: con dos
cuentas de Instagram conectadas, sus seguidores y sus métricas se suman en una sola
tarjeta, como si fueran una cuenta. Es la misma limitación que ya advertía el README antes
de esta entrega («la analítica todavía agrupa por red»), y elegir a qué cuenta sale cada
publicación no la tocó — programar y medir son caminos distintos.

Cerrarlo pide que `account-stats.ts` agrupe por `accountId` en vez de por `network`, y que
el panel y la app muestren una tarjeta por cuenta en vez de una por red.

## Tres cosas de los trial reels que no se pudieron verificar

**Abierto desde 2026-09-28.** Ninguna cuenta de Instagram con la función habilitada estuvo
disponible para probar el publicador de trial reels de punta a punta, así que estos tres
puntos de `docs/superpowers/specs/2026-09-28-trial-reels-design.md` (sección 10) quedan sin
comprobar:

1. **Si `trial_params` convive con `cover_url` en el mismo contenedor.** No está documentado
   por Meta. `reelContainerParams` (`src/lib/social/publish/instagram.ts`) manda los dos
   campos juntos sin problema declarado; si Graph rechazara la combinación, el síntoma sería
   un trial reel con portada fallando siempre, indistinguible en el código de cualquier otro
   rechazo de contenedor.
2. **Si el sync de métricas ve un trial reel no graduado.** No aparece en el perfil hasta que
   el dueño lo comparte, así que `GET /{ig-user-id}/media` podría no listarlo — el post
   quedaría `published` sin números en el panel hasta la graduación, y hoy eso no está dicho
   en ningún lado.
3. **La forma exacta del error de rechazo.** `motivoDeRechazo` (mismo archivo) detecta el
   rechazo por texto (`/trial/i` en el cuerpo), porque Meta no documenta el código. `postForm`
   registra el cuerpo completo en el log del servidor (`console.error('Instagram publish:',
   …)`) a propósito: es la única forma de aprender la frase real de Meta el día que el rechazo
   ocurra de verdad, sin haber apostado antes a una forma adivinada.

   Lo que cuesta mientras tanto, dicho sin suavizar: un rechazo definitivo que Meta redacte
   sin la palabra —una cuenta privada, la cuota diaria— cae en «No se pudo hablar con la
   red. Se reintentará.» y se reintenta hasta tres veces antes de fallar, prometiendo un
   reintento que Meta ya negó. Es el mismo trato que hoy recibe cualquier no-ok en un reel
   normal; el mapeo solo lo estrecha para el único caso que Meta deja reconocer. Cerrarlo
   pide ver el error real una vez, y entonces reconocerlo por su código y no por su texto.

   El rechazo que sí reconoce por texto ya no se reintenta: `createContainer` marca ese
   `failed` con `definitivo: true`, y `resolveOutcome` (`publisher.ts`) lo hace fallar en
   el mismo intento en vez de esperar al tercero. Lo de arriba es justo lo que queda fuera
   de ese reconocimiento.

Cerrar las tres pide lo mismo: una cuenta de Instagram con trial reels habilitados y una
tarde — un trial reel con portada, un trial reel sin graduar mirado desde `/api/metrics/posts`,
y una cuenta sin la función para leer el rechazo real del log.

**El calendario y la cola no marcan un trial reel.** Distinto de las tres de arriba: esto no
falta por no haberse podido probar, falta porque no se construyó. Solo la página del editor
de un post programado lo muestra (`resumenOpciones`, «Trial reel — lo compartes tú desde
Instagram»); las vistas de calendario y de cola siguen leyendo la red y el handle, sin esa
marca — spec §6 lo deja dicho así a propósito (es otra entrega). Cerrarlo es llevar
`resumenOpciones` (o su frase) a esas dos vistas.

## Un par de restos chicos de esta entrega

**Anotado el 2026-09-24.** Ninguno tiene efecto observable hoy; quedan escritos para no
perderlos.

- **`validateScheduleDraft` corre dos veces con los mismos datos** en las filas de
  `POST /api/schedule/batch` que traen `redes` (`src/lib/social/publish/batch.ts`): una
  vez para la validación de la forma y otra al derivar `cuentas`. Redundante, sin
  resultado distinto entre una corrida y otra.
- **Las dos rutas móviles simulan `resolverDestinos` en sus propios tests**
  (`src/app/api/mobile/schedule/check/route.test.ts` y
  `src/app/api/mobile/schedule/route.test.ts`), así que la precedencia entre `cuentas` y
  `redes` solo queda cubierta contra la función real en `mobile-api.test.ts`. División
  razonable —ver el ledger de la entrega— pero vale saber dónde vive esa cobertura antes
  de tocar `resolverDestinos`.

## Dos frases de error siguen nombrando «Perfiles», no «La Vitrina»

**Anotado el 2026-09-29**, durante la revisión final del panel con poco a priori (entrega 1
de navegación). `profiles/[id]/editor.tsx:419` y `src/app/admin/actions.ts:221` comparten,
letra por letra, «No puedes borrar tu página principal: primero haz principal a otra página,
desde «Perfiles».» — el nombre viejo de la pestaña que hoy es **La Vitrina**. Las demás cinco
frases visibles que nombraban pestañas por su nombre viejo se corrigieron en esta misma
entrega usando `nombreDe` de `src/lib/vocabulario.ts`; estas dos no, porque las dos tienen
tests que comparan el texto letra por letra (el mensaje de error de `deleteProfile` y su
reflejo en el editor). Cerrarlo cuesta actualizar esos tests junto con la frase — un cambio
chico, pero deliberadamente fuera de esta entrega, que no tocaba tests de otras.

## `rescheduleTarget` mueve la hora del post aunque el destino ya no case

**Abierto desde 2026-09-29.** La escritura del destino sí está protegida: desde esta entrega
el `UPDATE` de `scheduled_post_targets` exige `status = 'failed'` en su `where`, así que un
destino que salió publicado entre la lectura de la acción y su escritura no vuelve a la cola
—que es lo que lo habría hecho publicar de nuevo, porque el cron levanta todo lo `scheduled`
y vencido sin mirar el `externalId`—.

Lo que quedó fuera de esa reja es el `UPDATE` de `scheduled_posts`, que corre antes y sin
condición: en esa carrera la hora del post se mueve igual. No republica ni revive nada, pero
deja dos restos. La hora del post pasa a decir algo que ningún destino está esperando, y un
destino hermano que siguiera en `scheduled` se corre a esa hora nueva: se atrasa, no se
pierde. La acción además devuelve `ok` en ese caso; el `revalidatePath` repinta la verdad en
el acto, y distinguirlo en la respuesta pedía una frase de error nueva, que esta entrega no
podía tocar.

Se dejó así porque cerrarlo no es una condición más: hay que reordenar la acción para
escribir primero el destino, mirar si casó alguna fila, y solo entonces mover la hora del
post —o envolver las dos escrituras en una transacción—. Es media hora de trabajo con su
test del orden nuevo, y nada de lo que hoy se ve en pantalla lo pide.

## El Fuego mira treinta días para nombrar el siguiente corte

**Abierto desde 2026-09-29.**

Cuando hoy no hay nada puesto, El Fuego dice «La parrilla está fría hoy.» y nombra el
siguiente corte. Ese siguiente sale de una segunda lectura acotada a **treinta días**
(`DIAS_ADELANTE` en `src/app/admin/(dash)/page.tsx`), no de toda la agenda. Con algo
programado al día treinta y uno, la pantalla dice que la parrilla está fría y **no dice
nada más**, que es indistinguible de no tener nada agendado nunca.

La ventana existe porque la alternativa era leer la agenda entera del dueño para pintar una
frase: `cortesEntre` trae posts y destinos, y sin tope eso crece con cada publicación
programada de la historia. Treinta días cubre el caso real —un hueco de una semana o dos— a
cambio de un borde que casi nadie toca.

Cerrarlo pide una consulta distinta a la que hay: en vez de una ventana, el **primer** corte
después de mañana ordenado por hora y con `limit 1`, que no depende de ningún tope. Es una
función nueva en `src/lib/social/publish/cortes.ts` con su entrada en el arnés de
aislamiento; media hora. Lo que no conviene es agrandar el número y seguir con una ventana:
mueve el borde, no lo quita.

## «Se quemó» no tiene ventana de fecha ni forma de podarse

**Abierto desde 2026-09-29.**

`quemadosDe` (`src/lib/social/publish/cortes.ts`) trae **todo** destino en `failed` del
dueño, sin mirar la fecha, y El Fuego los lista enteros. Es a propósito: un fallo viejo
sigue pidiendo la acción hasta que alguien lo reprograma, y esconderlo a los siete días
sería perderlo en silencio. Desde esta entrega la lista va del más reciente al más viejo y
cada fila que no es de hoy lleva su día y su mes delante, así que al menos se sabe qué es
qué — que es lo mínimo en una lista sin ventana, donde un fallo puede ser de agosto.

Lo que no tiene es salida propia. Un destino quemado sale de la lista cuando algo lo
devuelve a la cola —reprogramarlo, «Subir ahora» (`subirAhora`, que rearma todo destino
`failed` del corte), guardar el corte en su editor (los `rearmIds` de `diffTargets`, que
rearman cualquier destino `failed` que siga elegido)— o cuando se borra el corte entero
(`borrarPostProgramado`, que lo permite mientras ningún destino haya alcanzado a
publicarse). Las cuatro son efectos de otra cosa: no hay «descartar», ni caducidad, ni
poda. Un dueño que acumule cuarenta fallos de hace meses —una cuenta que se desconectó y
nadie reconectó— abre la pantalla de entrada y ve cuarenta filas, que es exactamente lo
contrario de «solo lo que pide una acción hoy».

Cerrarlo pide una decisión de producto antes que código: qué significa «ya no me importa»
—una columna `descartado_en` en `scheduled_post_targets`, o un estado nuevo en el enum—, un
botón que lo escriba, y la condición correspondiente en `quemadosDe`. Con eso decidido son
una migración, una acción y un test; sin decidirlo, cualquier límite que se ponga hoy
—«solo los últimos treinta días»— esconde trabajo pendiente sin avisar.
