# Revisión visual — «Fierro y humo»

Lista para dar por buena la piel nueva del panel (acero frío, brasa `#e8621f` como único
acento, Oswald en títulos, la reja como separador). No hay infraestructura de capturas en
este repo — esto se sigue con el navegador abierto, mirando cada pantalla a dos anchos:
**~400 px** (teléfono, con las devtools o achicando la ventana) y **escritorio** (~1440 px).

Por cada pantalla del panel, la puerta y las legales, revisa estos siete puntos. No se
repiten pantalla por pantalla salvo que haya algo puntual que mirar ahí:

1. El texto se lee sobre la chapa (las tarjetas) y sobre el fondo (`acero-950`).
2. El foco de teclado se ve al tabular por todos los controles interactivos.
3. La pantalla muestra **una sola reja** (la barra bajo la cabecera del panel) — nunca dos.
4. No queda ni un violeta: ni en bordes, ni en sombras, ni en gráficos. El acento vivo es
   la brasa naranja; el violeta viejo (`#8b7cff` y sus variantes) no debe aparecer.
5. Los gráficos con datos reales se leen bien y ninguna serie se confunde con otra.
6. El interruptor (`Switch`/`Toggle`) tiene la perilla dentro de la pista, tanto encendido
   como apagado.
7. Los desplegables (`Select`) se leen al abrirlos — texto legible sobre el fondo del menú.

No todas las pantallas tienen gráficos, interruptor o desplegable; en esos casos los puntos
5–7 no aplican y se puede saltar directo al resto.

## El panel (`src/app/admin/(dash)/`)

Las nueve comparten `layout.tsx`: fondo `bg-acero-950`, cabecera pegajosa con «Salir» y el
nombre del panel en `font-titulo uppercase`, y la única reja del panel justo debajo de la
cabecera. Verifica esa reja una vez por pantalla (punto 3) y confirma que ninguna pantalla
agrega una segunda.

### 1. El Fuego — `/admin` — `page.tsx`

Título en pantalla: **El Fuego**. Desde la entrega 3 de «el panel con poco a priori» no
tiene gráficos: el termómetro de los próximos siete días, las filas de hoy y de lo quemado,
el botón «Poner al fuego» y el pie de ayer en mono. Los puntos 5–7 no aplican. Mira acá que
las filas se lean a 400 px —la hora, los logos de `Redes` y el texto en una línea caben o
se envuelven sin cortar— y que el rojo de «Se quemó» y el motivo del fallo se lean sobre la
chapa. Con una cuenta desconectada en el entorno de prueba se ve la otra cara: la tarjeta
«Conecta tu primera red», sola.

### 2. Los Números — `/admin/analytics` — `analytics/page.tsx`

Título en pantalla: **Los Números**. La más larga, y la que se quedó con los ocho
componentes de `src/components/charts/` (`Panel`, `StatTile`, `BarList`, `Donut`, `Funnel`,
`Heatmap`, `TrafficChart`, `CampaignTable`): trece paneles (tráfico, cuentas, contenido,
links, países, ciudades, dispositivo, sistema, navegador, hora local, embudo, idioma,
últimas visitas). Repite varios de los mismos ocho componentes de gráficos con series
distintas — confirma que los colores de serie no se repiten entre paneles vecinos.

### 3. Los Cortes — `/admin/content` — `content/page.tsx`

Título en pantalla: **Los Cortes**. Tabla de posts (`post-table.tsx`) con columnas
ordenables y un gráfico de «Views ganadas por día». Revisa que los encabezados de columna
ordenables mantengan foco visible al tabular (punto 2) y que la tabla se lea a 400 px
(scroll horizontal propio, no de la página).

### 4. La Mesa — `/admin/comments` — `comments/page.tsx`

Título en pantalla: **La Mesa**. Panel de «Instrucciones para el modelo»
(`instrucciones.tsx`) más la cola (`cola.tsx`). Sin gráficos ni interruptor; revisa sobre
todo el contraste del texto largo de instrucciones sobre la chapa.

### 5. Los Fierros — `/admin/accounts` — `accounts/page.tsx`

Título en pantalla: **Los Fierros**. Un bloque por red social con tarjetas de cuenta
(`cuentas.tsx`): conectar, reconectar, desconectar, sincronizar. Sin gráficos.

### 6. La Parrilla — `/admin/schedule` — `schedule/page.tsx`

Título en pantalla: **La Parrilla**. Compositor (`composer.tsx`) y carga masiva arriba,
pestañas Lista/Calendario abajo. **Acá viven el interruptor y los desplegables reales de
esta lista**: las opciones de TikTok (`tiktok-opciones.tsx`, dentro del compositor) usan
`Select` y `Switch`/`Toggle` — pon ahí el foco de los puntos 6 y 7. Revisa también la vista
de calendario en sí (semanas, celdas de día) a 400 px, donde suele apretar más.

### 7. Un corte — `/admin/schedule/[id]` — `schedule/[id]/page.tsx` + `editor.tsx`

Título en pantalla: **Editar post**. Editor de un post programado: guardar, eliminar,
reordenar media, agregar archivos, copiar URL. Entra a esta pantalla abriendo cualquier
post programado desde La Parrilla o desde una fila de El Fuego.

### 8. La Vitrina — `/admin/profiles` — `profiles/page.tsx`

Título en pantalla: **La Vitrina**. Grilla de tarjetas de perfil, con «Servir este perfil en
/» como acción destacada — confirma que solo esa acción (o el estado activo) lleva brasa,
sin brasa de adorno en el resto de la tarjeta.

### 9. Los Maestros — `/admin/usuarios` — `usuarios/page.tsx`

Título en pantalla: **Los Maestros**. Paneles «Invitar» e «Invitados», con formularios
(`formularios.tsx`). Revisa el campo de invitar y su botón de submit.

## La puerta (`src/app/ingresar/`)

Pinta su propio fondo (`bg-acero-950`, sin bloque de aurora) y usa `chapa` en la tarjeta.
Ambas pantallas son pasos de un mismo flujo de entrada por correo.

### 10. Entra con tu correo — `/ingresar` — `page.tsx`

Título en pantalla: **Entra con tu correo**. Formulario de correo (`formularios.tsx`,
control `CAMPO`). Confirma que el botón de submit ya no lleva el acento violeta del perfil
(se quitó junto con su `style` inline) y que el primario visible es brasa.

### 11. Tu código — `/ingresar/codigo` — `codigo/page.tsx`

Título en pantalla: **Tu código**. Se llega acá después de pedir el correo; pide el código
recibido. Mismo tratamiento de fondo y tarjeta que la anterior — confirma consistencia
entre ambas.

## Las legales (`src/app/(legal)/`)

Comparten `layout.tsx` con fondo propio y sin aurora.

### 12. Privacidad — `/privacidad` — `(legal)/privacidad/page.tsx`

Título en pantalla: **Privacidad**. Texto largo — el punto 1 (legibilidad sobre la chapa y
el fondo) es el que más importa acá.

### 13. Términos — `/terminos` — `(legal)/terminos/page.tsx`

Título en pantalla: **Términos**. Mismo chequeo que Privacidad.

## Las pantallas de error

No se navega a ellas directo: hay que forzar un error (por ejemplo, cortando la red antes
de una carga, o pidiendo un id que no existe) para verlas.

### 14. Error del panel — cualquier ruta bajo `/admin` — `src/app/admin/(dash)/error.tsx`

Título en pantalla: **Algo se rompió**. Se dispara ante cualquier error no controlado
dentro del panel. Confirma fondo propio y tarjeta `chapa`, sin aurora de fondo.

### 15. Error de la puerta — cualquier ruta bajo `/ingresar` — `src/app/ingresar/error.tsx`

Título en pantalla: **Algo se rompió**. Mismo tratamiento que el error del panel; revisa
que ambos se vean consistentes entre sí.

## La pantalla fácil de olvidar: elegir cuenta

### 16. ¿Qué cuentas conectar? — `/admin/accounts/elegir` — `accounts/elegir/page.tsx`

Título en pantalla: **¿Qué cuentas de [red] conectar?** (el nombre de la red se interpola,
por ejemplo «¿Qué cuentas de Facebook conectar?»). Solo aparece **a mitad de una conexión
de cuentas de Meta o Google**: entra a Los Fierros, arranca «Conectar» en una red que use ese
flujo (Facebook o Google), y complétalo hasta que la red devuelva la lista de páginas o
canales disponibles — ahí aparece esta pantalla con casillas para marcar cuáles conectar.
Si no hay una conexión pendiente, esta ruta redirige de vuelta a Los Fierros con un aviso, así
que hay que estar realmente a mitad del flujo para verla. Revisa que la lista de casillas
se lea sobre su tarjeta y que el estado «ya conectada» de cada fila sea legible.

## Qué NO debe haber cambiado

El cambio de esta entrega fue aditivo: nada de `src/components/profile-view.tsx`,
`src/lib/serve-profile.tsx`, `src/app/page.tsx` ni `src/app/[slug]/` debía tocarse, y las
clases viejas (`ink-*`, `.aurora`, `.aurora-contained`, `.surface`, la fuente Bricolage)
siguen en el CSS a propósito porque las usa la página pública de cada creador.

**Verifica la página pública de un perfil (`/<slug>`) en los dos valores que
`profiles.background_style` admite hoy**, según `src/db/schema.ts:70`
(`backgroundStyle: text('background_style').notNull().default('aurora')`):

- **`aurora`** — el valor por defecto de la columna, el que trae cualquier perfil nuevo.
- **cualquier otro valor** — por ejemplo `plano` o una cadena vacía. El componente
  `ProfileView` no bifurca hoy por este campo (renderiza `.aurora` sin condición alguna),
  así que ambos casos deben verse **idénticos**: el fondo con el halo de aurora y el brillo
  de acento alrededor del avatar. La columna es texto libre sin `CHECK` ni control en el
  editor de perfiles que la exponga todavía; para probar el segundo valor hay que cambiarlo
  directo en la base para un perfil de prueba.

Si alguno de los dos casos se ve distinto al otro, o si la aurora dejó de aparecer en
cualquiera de los dos, algo de esta rama tocó lo que no debía — repórtalo, no lo arregles
acá.
