# El panel con poco a priori — diseño

**Fecha:** 2026-09-29.

**En una frase:** que el panel muestre poco al entrar y más a medida que se hace clic —una
entrada corta, cinco pestañas y un engranaje, y un logo por corte para leer la parrilla de un
vistazo—, implementando de paso las dos entregas de la dirección visual de septiembre que
nunca se hicieron.

**El principio, dicho por el dueño (2026-09-29):** hay mucha información disponible de golpe,
y eso abruma sin necesidad. Poca información a priori; en la medida en que el usuario hace
doble clic, aparecen más funcionalidades. Cuentas es importante en el onboarding y después
debería ocupar poco. Y más ayudas visuales, para comunicar lo mismo de más formas.

---

## 1. Qué ya existe (leer antes de diseñar nada encima)

- **La dirección visual** (`2026-09-18-parrilla-direccion-visual-design.md`) definió tres
  entregas. Se hizo **solo la primera** (tokens, fuentes, cromado). La segunda —el
  vocabulario: nombres, subtítulos en llano— y la tercera —**El Fuego**, la pantalla de
  entrada— **nunca se implementaron**: `grep` de «El Fuego», «Los Fierros» o «La Parrilla» en
  `src/` no encuentra nada. Su tabla de nombres y su red de seguridad siguen vigentes y este
  documento las hereda tal cual.
- **La navegación** (`src/app/admin/(dash)/nav.tsx`): siete pestañas planas —Resumen,
  Analítica, Contenido, Comentarios, Cuentas, Calendario, Perfiles— y una octava, Usuarios,
  solo para el admin. Barra superior pegajosa, `layout.tsx`.
- **El Resumen** (`src/app/admin/(dash)/page.tsx`): el termómetro de días cargados
  (`termometro.tsx`, ya hecho) y cinco paneles de números —Tráfico, Links más clickeados,
  Embudo, Contenido que trae tráfico, Tus perfiles—. Es una página de analítica como entrada.
- **La parrilla** (`schedule/calendar.tsx`): por corte, la hora, la miniatura, el texto en dos
  líneas, y las redes solo en el `title` y en un `sr-only`. **No hay ningún icono de red**:
  para saber a qué red va un corte hay que pasar el cursor. La cola (`schedule/queue.tsx`)
  nombra cada destino con un chip de texto: «Instagram · vicente: programado».
- **Los iconos de las seis redes ya existen** en `src/components/icon.tsx` (`instagram`,
  `tiktok`, `x`, `youtube`, `facebook`, `threads`), como `<Icon name=… />`. Los usa la página
  pública; el panel nunca los ha usado.
- **El primer día:** sin cuentas conectadas, el compositor dice «Todavía no tienes cuentas
  conectadas. Conecta una», y nada más guía. Cuentas está en la barra, al mismo nivel que
  todo lo demás, para siempre.

## 2. El principio, aplicado

Cada pantalla responde una pregunta y pliega lo que no la responde. La regla para decidir
qué se ve de entrada: **si no pide una acción hoy, va un clic más adentro**. Lo que se quemó
pide una acción; el tráfico del mes no. Las cuentas conectadas piden una acción una vez,
el primer día; después no.

Y la segunda regla: **comunicar de más de una forma**. El estado de un corte ya se dice con
color (la cocción) y con palabras (el `sr-only`); la red se dice ahora también con su logo.

## 3. La entrada: El Fuego

Reemplaza al Resumen como `/admin`. De arriba abajo, y nada más que esto:

1. **La barra de días cargados.** El `Termometro` que ya existe, tal cual.
2. **Ahora en la parrilla.** Los cortes de hoy, en orden de hora: la hora, la fila de logos de
   sus destinos, el texto en una línea, el estado en palabras. Sin miniatura. Si no hay nada
   hoy: «La parrilla está fría hoy» y el siguiente corte con su día.
3. **Se quemó.** Solo si algún destino está en `failed` con fecha de hoy o anterior y sin
   reprogramar. Cada fila: la hora, el logo del destino que falló, el texto en una línea, el
   motivo en llano, y el botón de reprogramar que ya tiene la cola. Si no hay nada, la sección
   no existe.
4. **Poner al fuego**, el botón primario, que lleva al compositor de La Parrilla abierto.
5. **Al pie, en mono:** ayer. «6 cortes servidos» siempre; «· 1.2k miradas» solo si el sync ya
   trajo las métricas de esos cortes —si no, se omite, no se inventa un cero—.

**El primer día.** Sin ninguna cuenta conectada, El Fuego no dibuja nada de lo anterior: una
sola tarjeta, «Conecta tu primera red», con una línea que dice para qué, y un botón que
lleva a Los Fierros. Con al menos una cuenta, esa tarjeta no vuelve a aparecer.

**Los números se mudan enteros.** Los cinco paneles del Resumen actual pasan a Los Números
(`/admin/analytics`), debajo de lo que esa página ya tiene, con los mismos componentes y los
mismos datos. No se pierde ningún panel; solo dejan de ser lo primero que se ve.

## 4. La navegación

Cinco pestañas y un engranaje. Las pestañas, con los nombres de la dirección visual:

| Pestaña | Ruta (no cambia) | Subtítulo en llano, bajo el título de la pantalla |
|---|---|---|
| El Fuego | `/admin` | qué se está cocinando ahora |
| La Parrilla | `/admin/schedule` | lo que viene y cómo salió lo que ya se fue |
| Los Cortes | `/admin/content` | cada publicación, lo que hizo en la red y lo que trajo |
| La Mesa | `/admin/comments` | lo que te responden y tus respuestas |
| Los Números | `/admin/analytics` | visitas, clics y de dónde vienen |

A la derecha, separado, un engranaje con el rótulo **Ajustes**, que despliega tres entradas,
cada una con su nombre y su subtítulo en la misma línea:

| Entrada | Ruta (no cambia) | Subtítulo |
|---|---|---|
| Los Fierros | `/admin/accounts` | tus redes conectadas |
| La Vitrina | `/admin/profiles` | tus páginas públicas |
| Los Maestros | `/admin/usuarios` | quién puede entrar — solo el admin la ve |

El menú es un `<details>` con un `<summary>` (el engranaje), no un componente con estado:
funciona sin JavaScript, se cierra al navegar porque se remonta con la ruta (`key={pathname}`,
no porque la página cambie — el layout no se remonta solo al navegar entre rutas hijas), y el
teclado lo abre con Enter. Una ruta de Ajustes activa marca el engranaje, no una pestaña.

**La red de seguridad de la dirección visual, obligatoria:** cada pantalla lleva su subtítulo
en llano en `--color-fg-faint` bajo el título; las rutas no cambian; el vocabulario vive en
un solo módulo de presentación (`src/lib/vocabulario.ts`: la tabla de arriba, y nada más) y
el código sigue en inglés y en llano. Las frases de error no se tocan: tienen tests letra por
letra.

## 5. Un logo por corte

Un componente `Redes` (`src/app/admin/(dash)/schedule/redes.tsx`): recibe los destinos de un
corte y dibuja una fila de iconos de 14 px, uno por destino, en el orden de los destinos. El
color base es el del texto, a opacidad plena: sobre la carne cruda el atenuado no llega al
mínimo de contraste. **El color del corte lo sigue poniendo la cocción**. Un
destino en `failed` tiñe su icono de `negative`; uno en `published`, de `positive`; los demás
quedan en gris. Con dos cuentas de la misma red, dos iconos iguales. Cada icono lleva el
handle y el estado en `title`; el `sr-only` que dice «Instagram · vicente: programado,
TikTok · clips: servido» va en la fila entera cuando los iconos son la única lectura (la
parrilla, El Fuego), y delante de cada icono cuando el texto visible ya dice el handle y el
estado (la cola, con `detalle`) — ahí un `sr-only` de fila repetiría los dos y solo falta
decir la red. El texto que hoy vive en el chip no se pierde, cambia de sitio.

Dónde va:

- **La parrilla** (`calendar.tsx`): bajo la hora, antes de la miniatura.
- **La cola** (`queue.tsx`): reemplaza al chip de texto. El motivo de un fallo y el botón de
  reprogramar siguen ahí, al lado del icono teñido.
- **El Fuego**: en «Ahora en la parrilla» y en «Se quemó».

No va en el editor de un corte ni en el compositor: ahí la red se elige, no se lee.

## 6. La regla del doble clic, pantalla por pantalla

| Pantalla | Se ve de entrada | Un clic más adentro |
|---|---|---|
| El Fuego | días cargados, hoy, lo quemado, el botón | La Parrilla, Los Números |
| La Parrilla | la semana, el botón de poner al fuego | el compositor (`<details>`, como hoy), la carga masiva (`<details>`, como hoy), el editor de un corte |
| Los Números | el selector de período y los paneles que ya tiene | los cinco paneles mudados del Resumen, debajo |
| Los Fierros | las tarjetas de cuentas | fusionar, desconectar, el id para la API |
| La Vitrina, La Mesa, Los Cortes, Los Maestros | como hoy | como hoy |

## 7. Casos borde

| Caso | Respuesta |
|---|---|
| Un enlace guardado a `/admin/accounts` | Abre Los Fierros; el engranaje aparece activo. Ninguna ruta cambió. |
| Un usuario que no es admin | No ve Los Maestros; el engranaje tiene dos entradas. |
| Hoy no sale nada, y nada se quemó | El Fuego: la barra, «La parrilla está fría hoy» con el siguiente corte, el botón, el pie. |
| Ayer no salió nada | El pie dice «Ayer no salió nada.» |
| Un corte con seis destinos | Seis iconos en una fila; en la celda del calendario la fila se envuelve. |
| La cocción y el icono se contradicen (corte «cruda», un destino `failed`) | No pasa: la cocción ya toma `failed` como prioridad (`coccionDe`). |
| Ancho de teléfono en el navegador | Las cinco pestañas caben; el engranaje queda a la derecha. La barra ya hace `overflow-x-auto` por si acaso. |

## 8. Fuera de alcance

- La app del teléfono: el dueño pidió empezar por la web. Sus pantallas no cambian.
- Rediseñar el calendario, la cola o el editor: se les añade el logo y se les quita texto.
- Los Números como pantalla nueva: recibe los paneles mudados, no se reordena.
- Cambiar rutas o frases de error.

## 9. Pruebas

Puras: el vocabulario (cada ruta tiene nombre y subtítulo, y ninguna ruta se inventa —el test
compara contra las rutas reales del árbol `(dash)`); la selección de El Fuego (qué cortes son
«hoy», cuáles «se quemaron», el pie de ayer con y sin métricas); el mapa de estado a color del
componente `Redes`. De estructura: las pestañas y las entradas del engranaje según el rol.
Y la reja de siempre: `npx vitest run`, typecheck, lint, build.

**Lo que ningún test comprueba:** que la parrilla se lea de un vistazo. Eso se mira con el
dueño, en pantalla, después de la entrega 2.

## 10. Las entregas

Tres, cada una desplegable sola, con su propio plan y su propio PR, en este orden:

1. **Navegación, Ajustes y vocabulario.** El módulo de vocabulario, la barra con cinco
   pestañas y el engranaje, los subtítulos en cada pantalla. Cuentas, Perfiles y Usuarios
   salen de la barra. Es lo que quita ruido de golpe; el Resumen sigue siendo la entrada hasta
   la entrega 3.
2. **Los logos.** El componente `Redes` en la parrilla y en la cola. Independiente de la 1.
3. **El Fuego.** La pantalla nueva, la selección de hoy y de lo quemado, el pie de ayer, la
   tarjeta del primer día, y la mudanza de los cinco paneles a Los Números. Usa `Redes`.

Cada entrega deja el `README.md` cierto (la sección que describe el panel y sus pestañas) al
terminar, no al final de las tres.
