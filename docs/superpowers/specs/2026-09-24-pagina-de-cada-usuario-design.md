# Tu Parrilla — La página de cada usuario

Continúa `2026-09-16-usuarios-e-inquilinos-design.md`, que dejó esto escrito como no
objetivo: «Página pública por usuario en el dominio del producto… aquí solo se reservan
palabras para los slugs». Esta es esa entrega. La landing del producto salió aparte, en el
PR #111.

## Problema

Invitar a alguien crea su fila en `users` y nada más. Entra al panel y **no tiene página**:
los perfiles se crean a mano desde `/admin/profiles` o los siembra el script. Un producto
donde cada creador tiene su página no puede empezar pidiéndole que la cree.

Y la raíz pública sigue resolviendo con `adminId()`, así que **todos los dominios del
despliegue muestran el perfil del dueño**. Los slugs además son globales: `/[slug]` busca
en toda la tabla, de modo que hoy `vicente-pareja.cl/juanito` ya muestra la página de
Juanito en el dominio personal del dueño.

## Qué se decidió

- **La dirección sale del correo.** De `juanito@gmail.com` nace `tu-parrilla.cl/juanito`.
  Se puede cambiar después desde el panel.
- **Una página por usuario**, por ahora.
- **Sin dominios propios de terceros**, por ahora. El del dueño es la excepción que ya
  existe y sigue funcionando.
- **La página nace con el usuario**, no en su primer ingreso.

## La regla que ordena todo

> **Un dominio sirve las páginas de su dueño. El del producto las sirve todas.**

```
tu-parrilla.cl/             → la landing
tu-parrilla.cl/juanito      → la página de Juanito
vicente-pareja.cl/          → la página del dueño
vicente-pareja.cl/juanito   → 404
vicente-pareja.cl/circulo-… → la del dueño, porque es suya
```

Esa última línea es el motivo de la regla y no un detalle: el dueño comparte un perfil de
«círculo cercano» con dirección secreta. La regla simple —«los slugs solo viven en el
dominio del producto»— le habría roto ese enlace sin avisar. Esta, además, generaliza sola
el día que se conecten dominios de terceros: el dominio sabe de quién es y sirve lo suyo.

## No objetivos

- **Dominios propios de terceros.** Ni conectarlos a mano ni por API de Vercel.
- **Varias páginas por usuario.** El esquema las soporta y no se quita nada; simplemente
  nadie nuevo las obtiene.
- **Mover o borrar los perfiles que ya existen.** Ninguno se toca.
- **Registro abierto.** Sigue siendo por invitación.
- **Seguridad a nivel de fila en Postgres.** Fuera de alcance, aunque el motivo por el que
  se descartó cambió: ver «Riesgos».

## 1. La página nace con el usuario

`invitar()` pasa a crear el usuario **y** su perfil en la misma operación. `asegurarAdmin()`
hace lo mismo, porque también crea usuarios.

El invariante que esto compra es el que importa: **todo usuario tiene exactamente una
página, desde que existe**. Ningún código aguas abajo tiene que preguntarse qué hacer con
un usuario sin página, ni el panel mostrar un vacío que nadie sabe resolver.

Se descartó crearla en el primer ingreso: llega más tarde y parte el invariante en dos
estados que después hay que sostener en todas partes.

El perfil nace publicado y sin `noindex`: una página que nadie ve no le sirve a nadie. El
nombre visible sale del `nombre` del usuario si lo hay, y si no, del mismo texto del slug.

## 2. La dirección

Del correo se toma lo que va antes de la arroba y se pasa por `slugify()`, que ya existe en
`src/lib/utils.ts` y hace lo correcto: quita tildes, baja a minúsculas, une con guiones y
corta en 60.

**Reservadas.** Nace `src/lib/slugs.ts` con las direcciones que la app ya usa. Sin esta
lista, alguien con correo `admin@unaempresa.cl` recibiría la dirección `admin`, y su página
quedaría en `/admin`, que es el panel: Next resuelve primero las rutas reales y la comodín
`/[slug]` pierde. Vería el panel en vez de su página, sin ningún error que se lo explique.
Antes no podía pasar, porque las direcciones se escribían a mano.

La lista, verificada contra las rutas que existen y no de memoria: `admin`, `api`,
`ingresar`, `landing`, `privacidad`, `terminos`, `docs`, `icon.svg`, `robots.txt`, los
`.svg` de `public/`, y los `.txt` de verificación de TikTok. Más `_next` y `favicon.ico`,
que son del framework.

**Y una prueba que la mantiene honesta.** Una lista escrita a mano envejece: el día que
alguien agregue `/precios`, nadie se va a acordar de esta lista, y el primer usuario con
correo `precios@` se va a encontrar con una página invisible. Así que el test no compara
contra una lista fija: **lee las rutas de primer nivel que existen en `src/app` y en
`public/`, y exige que todas estén reservadas**. Si alguien agrega una ruta y olvida la
lista, el test falla y le dice cuál falta.


**Desempate.** Si `juanito` está tomada o reservada, se prueba `juanito-2`, `juanito-3`, y
así. Se descartó el sufijo al azar: nunca choca, pero le deja una dirección fea a la
mayoría para cubrir un caso raro.

**La carrera.** Dos invitaciones simultáneas pueden elegir el mismo número. La única
garantía verdadera es la restricción de unicidad que ya tiene la columna: si el `insert`
falla por ella, se reintenta con el siguiente. El bucle tiene tope, y si se agota, la
invitación falla con una frase clara en vez de dejar un usuario a medio crear.

## 3. Qué sirve cada dominio

`esDominioDelProducto()` ya existe y decide por el host, con la misma salvaguarda: sin
`DOMINIO_PRODUCTO` configurada, todo se comporta como antes.

- **`/`** — en el dominio del producto, la landing. En cualquier otro, la página del dueño
  de ese dominio, que hoy se resuelve con `adminId()` igual que hasta ahora.
- **`/[slug]`** — en el dominio del producto, cualquier página publicada. En cualquier
  otro, solo las del dueño de ese dominio; el resto responde 404.

«El dueño del dominio» hoy es siempre el admin, porque no hay tabla que relacione dominios
con usuarios. Eso es deliberado: la regla queda escrita, y el día que existan dominios de
terceros se reemplaza esa resolución sin tocar el resto.

## 4. Lo que no cambia

- El panel ya está aislado por dueño y lo cuidan las doce comprobaciones de
  `aislamiento.test.ts`. Esta entrega no lo toca.
- El cron, la app del teléfono y la publicación siguen igual.
- Los perfiles que ya existen se quedan donde están, con sus direcciones.
- `SITE_TIMEZONE`, las llaves de API y la alerta de publicación fallida siguen atadas al
  despliegue y al dueño, como las dejó la spec anterior.

## 5. Alcance en archivos

| Archivo | Qué pasa |
|---|---|
| `src/lib/slugs.ts` | nuevo: las reservadas y la función que arma una dirección libre |
| `src/lib/slugs.test.ts` | nuevo: reservadas, desempate, tildes, y que la lista cubra las rutas reales |
| `src/lib/usuarios.ts` | `invitar()` y `asegurarAdmin()` crean también el perfil |
| `src/lib/profiles.ts` | buscar por slug acepta un dueño opcional para acotar |
| `src/app/[slug]/page.tsx` | 404 si la página no es del dueño del dominio |
| `src/app/page.tsx` | la rama que no es landing resuelve el dueño del dominio |

## 6. Cómo se comprueba

- **`slugs.test.ts`**: que `admin` y compañía nunca salgan; que `Juan Pérez` dé
  `juan-perez`; que el desempate cuente bien; que un correo sin parte usable caiga en algo
  válido y no en cadena vacía. Y el que no envejece: que **toda** ruta de primer nivel de
  `src/app` y `public/` esté reservada, leyéndolas del disco en vez de una lista escrita a mano.
- **`usuarios`**: que invitar deje usuario y perfil, y que invitar dos veces el mismo
  nombre produzca direcciones distintas.
- **A mano, en un preview**: invitar un correo nuevo, entrar con él y ver su página en
  `/<slug>`. Es la única prueba de que las piezas se tocan de verdad.

## Riesgos y cabos sueltos

- **El dueño tiene más de un perfil y la regla nueva dice uno.** No se borra ninguno y nada
  se rompe, pero el panel tendrá que decidir si le deja crear más. Decisión pendiente del
  dueño, anotada a propósito y no resuelta acá.
- **La carrera del slug.** Mitigada con reintento sobre la restricción de la base, que es
  la única garantía real. Si el tope se agota, la invitación falla en vez de mentir.
- **La seguridad a nivel de fila volvió a ser posible.** La spec de inquilinos la descartó
  porque «el driver HTTP de Neon no mantiene sesión entre consultas». Desde la mudanza a
  Supabase el driver es `postgres-js` sobre TCP y sí la mantiene, así que ese motivo dejó
  de ser cierto. No entra en este alcance, pero conviene que quede escrito.
