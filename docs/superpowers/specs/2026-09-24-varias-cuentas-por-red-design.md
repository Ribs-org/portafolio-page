# Varias cuentas por red — diseño

**Problema:** un dueño puede conectar varias cuentas de la misma red —`vicente`,
`vicente clips`, `vicente enseña`— pero solo una de ellas puede recibir publicaciones,
y el sistema elige cuál sin preguntar ni avisar.

**Fecha:** 2026-09-24.

---

## 1. Qué pasa hoy

`cuentasPrimarias` (`src/lib/social/cuentas.ts`) resuelve red → cuenta quedándose con la
más antigua del dueño, vía `primariaDe` (`src/lib/social/cuenta.ts`). El compositor manda
`networks`, la acción llama a `exigirCuentas`, y `crear.ts` escribe un destino por red con
la cuenta que esa función eligió.

El propio código lo anuncia como provisional: el comentario de `cuentasPrimarias` dice
«hasta que la entrega 3 traiga `destinos`, "la cuenta de facebook" es esta».

La consecuencia no es un error, que sería visible: la segunda cuenta queda conectada, se
ve en la pantalla de Cuentas, sincroniza sus métricas, y no puede recibir nada. Nadie te lo
dice.

## 2. El principio que ordena todo lo demás

**El sistema nunca elige entre dos. Una sola posibilidad no es una elección.**

De ahí sale cada decisión de este documento, y también las que no están escritas:

- Si tienes exactamente una cuenta conectada en total, viene marcada. Con dos o más, no
  viene ninguna.
- Un nombre de red se resuelve a una cuenta solo cuando tienes exactamente una en esa red.
  Con dos o más, falla nombrando las candidatas.
- La cuenta primaria no se arregla ni se parametriza: **se borra**. Mientras exista, alguien
  la va a volver a llamar.

## 3. El modelo de datos: no cambia

`scheduled_post_targets` ya guarda `account_id` y su restricción de unicidad es
`(post_id, account_id)`, no `(post_id, network)`. Un post ya puede tener dos destinos en la
misma red siendo cuentas distintas.

**Esta entrega no trae migraciones.** Lo que cambia es de qué hablan las capas de arriba.

La columna `network` de los destinos **se queda**, aunque sea derivable de la cuenta: la
usan el calendario, las métricas y el cron para agrupar y para elegir el publicador.
Quitarla es un refactor aparte que no compra nada hoy.

## 4. Qué se borra y qué lo reemplaza

**Se borran** `cuentasPrimarias` y `exigirCuentas` (`src/lib/social/cuentas.ts`), con sus
cinco llamadores: `crear.ts`, `batch.ts`, `actions.ts` (en la creación y en la edición de un
post, y en `leerCreadorTikTok`), y la ruta de comprobación de la app.

**`primariaDe` NO se borra**, aunque el nombre invite. Su único llamador restante es
`sync.ts`, donde decide qué cuenta hereda la etiqueta de campaña al sincronizar —un asunto
distinto de a dónde sale una publicación, y su comentario ya explica por qué ahí la
ambigüedad es aceptable—. Borrarlo rompe la sincronización.

**Los reemplaza una función con el sentido invertido:** en vez de «elígeme una cuenta para
esta red», recibe identificadores de cuenta y un dueño, y confirma que todas son suyas y
están conectadas. Falla nombrando la primera que no cumpla, distinguiendo los dos motivos
—ajena o desconectada— porque piden arreglos distintos.

Ese cambio de sentido es el corazón del diseño: de resolver a verificar.

`SinCuenta` y `SIN_CUENTA` se conservan para el caso «pediste esta red y no tienes ninguna
cuenta ahí», que sigue existiendo en la API de carga masiva y en la app.

## 5. `diffTargets` pasa a comparar por cuenta

`diffTargets` (`src/lib/social/publish/edit.ts`) compara hoy `t.network` contra la lista
elegida. Pasa a comparar `t.accountId`.

Su regla se mantiene con el mismo sentido, ahora por cuenta: **un destino ya publicado no se
puede quitar**. Si publicaste en `@vicente` y desmarcas `@vicenteclips`, se borra el segundo
y el primero queda.

## 6. Las opciones pasan a ser por destino

`validarOpcionesPorRed` y `opcionesDesdeFormulario`
(`src/lib/social/publish/opciones.ts`) se llavean hoy por red: `raw.tiktok` es un objeto.
Pasan a llavearse por identificador de cuenta.

**Por qué no basta compartirlas entre las cuentas de una red:** la API de TikTok consulta
`creator_info` por creador, y los niveles de privacidad permitidos pueden diferir entre una
cuenta y otra. Compartir las opciones permite mandar a una cuenta una privacidad que no
admite, y eso se descubre al publicar.

Si marcas dos cuentas de TikTok, el formulario muestra dos bloques de opciones.

**Y el bloque de TikTok se consulta por cuenta.** `leerCreadorTikTok`
(`src/app/admin/actions.ts`) trae hoy el nombre, el avatar y las privacidades permitidas de
la cuenta primaria de TikTok; su propio comentario dice «la misma a la que
`crearPostProgramado` va a apuntar el destino». Pasa a recibir un identificador de cuenta
—verificando que sea del dueño— y el compositor la llama una vez por cada cuenta de TikTok
marcada. Es la misma razón del párrafo anterior vista desde la interfaz: las privacidades
que ofrece el formulario tienen que ser las de **esa** cuenta.

## 7. El compositor

`src/app/admin/(dash)/schedule/composer.tsx` deja de listar las redes de `SOCIAL_NETWORKS`
y lista las cuentas conectadas del dueño, con su red y su handle: `Instagram · @vicente`.
Orden: por red y, dentro de la red, por antigüedad — el mismo que ya usa `getCuentas`
(`src/lib/posts.ts`).

- **Una red sin cuenta conectada no aparece.** Hoy se ofrece y falla al enviar. Si no hay
  ninguna cuenta, en vez de una lista vacía va una frase con enlace a Cuentas.
- **Una cuenta con la credencial vencida aparece apagada, con el motivo.** Esconderla haría
  que la publicación desapareciera sin explicación.
- **Solo las redes publicables.** El conjunto `ENABLED` del compositor sigue mandando: una
  cuenta de una red que todavía no publica no se ofrece.
- **Nada viene marcado, salvo que tengas exactamente una cuenta conectada en total.** Hoy
  Instagram viene marcado siempre.
- **La revisión de archivos contra las reglas de TikTok** se activa si marcaste cualquier
  cuenta de TikTok.

Un post sin ningún destino marcado no se envía, con una frase que lo diga.

## 8. El editor de un post programado

`src/app/admin/(dash)/schedule/[id]/editor.tsx` muestra y quita destinos por cuenta. Un
post con dos cuentas de Instagram muestra dos filas, cada una con su handle.

Sigue **sin poder agregar** destinos de TikTok, por el mismo motivo que hoy: no puede
recoger sus opciones. Esa limitación no es de esta entrega y no se toca.

**El calendario y la cola de la web** (`schedule/calendar.tsx`, `schedule/queue.tsx`,
`schedule/etiqueta.ts`) muestran hoy la red de cada destino. Con dos cuentas de la misma red
se vería «instagram» repetido, así que pasan a mostrar el handle. Es el mismo cambio que la
app necesita en su calendario, por la misma razón.

## 9. La API de carga masiva

`src/app/api/schedule/batch/route.ts` recibe hoy `redes: string[]` por post.

- Gana `cuentas: string[]`, que acepta identificadores de cuenta.
- **Conserva `redes`** con la regla del principio: cada nombre se resuelve solo si el dueño
  tiene exactamente una cuenta conectada en esa red. Con dos o más, el post falla con un
  mensaje que nombra las candidatas y sus handles.
- Si vienen las dos, manda `cuentas`.

Así las cargas masivas ya escritas siguen andando hasta el día que la elección deje de ser
única, y ese día se enteran.

## 10. La app del teléfono

**Entra en esta entrega.** Dejarla fuera no sería acotar el alcance: el disparador del fallo
es exactamente la acción que esta entrega habilita —conectar la segunda cuenta—, así que
sería diferir un defecto que nosotros creamos.

- `mobile/src/app/(tabs)/publicar.tsx` pasa de interruptores de redes, con `['instagram']`
  por omisión, a listar cuentas con la misma regla de marcado que la web.
- Necesita un endpoint que le liste las cuentas conectadas del usuario. Va bajo
  `src/app/api/mobile/`, autenticado igual que el resto de esa familia.
- `src/app/api/mobile/schedule/check/route.ts` verifica cuentas en vez de exigir redes.
- El calendario de la app (`(tabs)/calendario.tsx`, `(tabs)/index.tsx`) muestra hoy
  `post.redes`. Pasa a mostrar el handle, para que dos cuentas de la misma red no se vean
  como «instagram» repetido.

## 11. Pertenencia: la pieza de seguridad

La función que reemplaza a `exigirCuentas` recibe identificadores **que vienen del
navegador o del teléfono**. Tiene que confirmar que cada cuenta pertenece al dueño de la
sesión antes de crear ningún destino.

Sin eso, alguien podría programar una publicación en la cuenta de otro usuario mandando su
identificador. Es el mismo aislamiento por dueño que el resto del sistema ya sostiene, y va
verificado en `src/lib/aislamiento.test.ts`, con el arnés que ya existe ahí: mirar el SQL
generado y exigir que `owner_id` vaya como parámetro ligado dentro del `WHERE`.

La verificación corre **antes** de escribir nada, como ya hace `crear.ts`, para que un
fallo no deje un post a medias.

## 12. Casos borde, y cómo se responden

| Caso | Respuesta |
|---|---|
| Una cuenta se desconecta entre marcarla y enviar | Falla nombrándola; no se crea nada |
| Un identificador de cuenta ajena | Falla; no se crea nada |
| Un destino ya publicado que se desmarca | No se puede quitar; error claro |
| Dos destinos de la misma red en un post | Independientes: el cron elige el publicador por `network` y trabaja por destino. Si uno falla, el otro sale |
| Ninguna cuenta marcada | No se envía |
| Ninguna cuenta conectada | El compositor no muestra una lista vacía, muestra a dónde ir |

## 13. Pruebas

- **Aislamiento:** verificar cuentas ata la consulta al dueño. En `aislamiento.test.ts`, con
  el arnés existente.
- **Rechazo de cuenta ajena:** un identificador de otro dueño no crea ningún destino.
- **Dos cuentas de la misma red:** un post crea dos destinos; el fallo de uno no impide el
  otro.
- **`diffTargets` por cuenta:** agregar, quitar y rearmar; y que un destino publicado no se
  pueda quitar.
- **Opciones por destino:** dos cuentas de TikTok con opciones distintas se validan y se
  guardan por separado.
- **La regla del nombre de red:** con una cuenta resuelve; con dos falla nombrando las
  candidatas.
- **El marcado por omisión:** con una cuenta viene marcada; con dos no viene ninguna.

`aislamiento.test.ts` tiene hoy un caso llamado «social/cuentas: `cuentasPrimarias` filtra
por dueño». Esa función deja de existir: el caso se **reemplaza** por el equivalente sobre
la verificación nueva, no se borra. La propiedad que protegía sigue haciendo falta.

Las pruebas corren sin `DATABASE_URL`, como toda la suite.

## 14. Fuera de alcance

- **Familias de cuentas** —agrupar `vicente clips` y sus redes bajo un nombre— es una capa
  encima de los destinos y va en su propia entrega.
- **Compartir una cuenta entre dos usuarios.** La restricción de unicidad global sobre
  `(network, external_id)` se queda como está.
- **Quitar la columna `network`** de los destinos.
- **Un cron por inquilino.** Sigue recorriendo todo el despliegue, como hoy.

## 15. Lo que ningún test puede comprobar

Esto toca el camino de publicar, que es el único donde un error sale a internet con el
nombre del dueño. Ninguna prueba automática confirma que un corte salió a la cuenta
correcta.

Antes de confiar en esta entrega hay que publicar a mano, con dos cuentas reales de la misma
red y algo inocuo, y mirar que cada cosa haya salido donde debía.
