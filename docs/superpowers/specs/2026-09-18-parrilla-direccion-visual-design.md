# Parrilla — dirección visual «Fierro y humo»

Fecha: 2026-09-18
Estado: aprobada por el dueño, sección por sección

Rediseño completo de la interfaz del panel y de la puerta de entrada. No cambia ninguna
función: cambia cómo se ve, cómo se llama y qué se ve primero.

## Problema

El panel se ve como cualquier herramienta: violeta oscuro, acento morado, fondo de auroras,
vocabulario neutro. No dice nada de quién lo hizo ni para quién es, y su pantalla de entrada
premia mirar gráficos por sobre publicar, que es lo contrario del hábito que el producto
quiere instalar.

## A quién le hablamos

Hombres de veinte a treinta y cinco del cono sur, chilenos o argentinos, con algún nivel de
perfil técnico y ánimo emprendedor, que quieren construir marca personal por volumen de
publicación. El asado es el código cultural compartido, y el que hace de la parrilla algo
masculino sin necesidad de decirlo.

## Decisiones tomadas

1. **Asado completo.** Las secciones se renombran y el producto habla en asado, no solo
   cambia de colores.
2. **Alcance.** El asado vive en lo que ve el creador. La página pública de cada creador
   queda con su propia marca, porque ahí quien mira es su audiencia.
3. **Entrada.** El fuego primero: qué sale hoy, qué se quemó. Los números pasan a su sección.
4. **Tono: masculino por código, no por exclusión.** La estética, el humor y el vocabulario
   hablan al ICP sin nombrarlo. Ningún texto deja a nadie fuera: una creadora que llegue al
   producto compra igual, y ningún pantallazo fuera de contexto se lee mal.
5. **Dirección visual: «Fierro y humo».** La parrilla como herramienta y no como fiesta.
   Descartadas «Brasa sobre carbón» (negro con naranja es terreno transitado) y «Carnicería
   esmaltada» (obligaba a rehacer los ocho gráficos en tema claro).

## No objetivos

- **La portada de `tu-parrilla.cl`.** No existe: hoy la raíz sirve el linktree del dueño.
  Crearla choca con el subproyecto 3, que mueve la página del creador a `/<usuario>` y libera
  la raíz. Se hace allá, ya con esta dirección definida.
- **La página pública de cada creador** (`/<slug>`), por la decisión 2.
- **La app Android.** El subproyecto 5 la rehace.
- **Cambios de función.** Nada de lo que el panel hace cambia en este rediseño.

## 1. Sistema visual

### Neutros

Acero con sesgo frío, elegidos y no heredados de un gris puro.

| Token | Valor | Uso |
|---|---|---|
| `--color-acero-950` | `#16181a` | fondo de la página |
| `--color-acero-900` | `#1d2124` | superficie de paneles y barra |
| `--color-acero-800` | `#242a2f` | superficie elevada, filas alternas |
| `--color-acero-700` | `#2a2e33` | bordes |
| `--color-fg` | `#f2ebe2` | texto |
| `--color-fg-muted` | `#948a80` | texto secundario |
| `--color-fg-faint` | `#6b7076` | etiquetas y subtítulos en llano |

Los tokens `ink-*` actuales se reemplazan por `acero-*`. El nombre cambia a propósito: deja
sin compilar cualquier pantalla que se quedara con la paleta vieja.

### Acento y semánticos

- **Brasa `#e8621f`**, y solo para lo que está caliente o es accionable: botón primario,
  pestaña activa, estado «al fuego», barra de días encendida, foco del teclado. Nunca
  decorativo.
- **Semánticos, separados del acento:** bien `#74bf6a`, atención `#e5a52a`,
  quemado `#f0614f`.

### El choque con los gráficos, y su resolución

`src/components/charts/theme.ts` trae una paleta categórica validada contra la superficie
actual: banda de luminosidad, piso de croma, separación para daltonismo (peor ΔE 8.4), piso
de visión normal (19.3) y contraste, todo documentado en el propio archivo.

Dos consecuencias, y la segunda es la importante:

1. La superficie sobre la que se validó pasa de `#17151f` a **`#1d2124`**, que es la del panel
   y no la de la página: los gráficos viven dentro de un `Panel`. Misma banda de luminosidad,
   un pelo más fría, así que la validación se conserva; se actualiza `CHART.surface` a ese
   valor.
2. **La serie 2 es naranja `#d95926` y el acento pasa a ser naranjo.** Conviviendo, nadie
   distingue «esto es un dato» de «esto es interactivo». Se reemplaza esa serie por un cian
   `#1f9aa8`, que mantiene la separación con sus vecinas. Las otras siete no se tocan. El
   naranjo queda reservado a la marca.

`CHART.grid`, `CHART.axis`, `CHART.muted`, `CHART.text` y `CHART.secondary` se reajustan a
los neutros de acero.

### Tipografía

| Rol | Familia | Uso |
|---|---|---|
| Títulos | **Oswald** 600/700 | mayúsculas, tracking `0.03em`, títulos de sección y de pantalla |
| Cuerpo | **Instrument Sans** | se queda tal cual |
| Datos | **JetBrains Mono** | se queda: horas, cifras, etiquetas de estado |

Entra Oswald por `next/font/google` en `src/app/layout.tsx` como `--font-oswald`; sale
Bricolage Grotesque, que no se usa en ningún otro lado. El token `--font-display` apunta a
Oswald.

### La reja

El motivo estructural: barras verticales paralelas hechas con
`repeating-linear-gradient(90deg, var(--color-acero-700) 0 3px, transparent 3px 13px)`,
10 px de alto. Separa bloques mayores dentro de una pantalla, **una sola vez por pantalla**, y
nunca como textura de fondo.

Reemplaza a `.aurora` **en el panel y en la puerta**, pero **`.aurora` no se borra**: la usa la
página pública de cada creador, que está fuera de alcance, y `aurora` es además uno de los
valores que `profiles.background_style` guarda en la base. Borrarla rompería páginas de
creadores y datos existentes.

Lo mismo vale para `.surface`: la comparten el panel y la página pública. El panel deja de
usarla y pasa a **`.chapa`**, una superficie nueva de acero sin desenfoque; `.surface` se queda
intacta para la página pública.

De ahí se sigue una regla para toda la entrega 1: **el cambio es aditivo**. Los tokens
`ink-*` y las clases `.aurora`, `.aurora-contained` y `.surface` quedan donde están; lo nuevo
convive. Y como `body` pinta hoy `--color-ink-950` para todo el sitio, **el panel, la puerta y
las legales pintan su propio fondo** en sus layouts en vez de heredarlo, para que la página
pública quede byte a byte igual.

## 2. Estructura y vocabulario

### El mapa de nombres

| Hoy | Nuevo | Subtítulo en llano |
|---|---|---|
| Resumen | **El Fuego** | qué se está cocinando ahora |
| Calendario | **La Parrilla** | lo que viene y cómo salió lo que ya se fue |
| Contenido | **Los Cortes** | cada publicación y lo que trajo |
| Analítica | **Los Números** | visitas, clics y de dónde vienen |
| Comentarios | **La Mesa** | lo que te responden y tus respuestas |
| Cuentas | **Los Fierros** | tus redes conectadas |
| Perfiles | **La Vitrina** | tus páginas públicas |
| Usuarios | **Los Maestros** | quién puede entrar |

### La red de seguridad

El riesgo del asado completo es que a los seis meses no encuentres nada. Se resuelve así, y
las tres partes son obligatorias:

1. **Cada pantalla lleva su subtítulo en llano**, en `--color-fg-faint`, bajo el título. La
   tabla de arriba es su fuente.
2. **Las rutas no cambian.** `/admin/schedule`, `/admin/accounts`, `/admin/comments` siguen
   siendo lo que son, así que los enlaces guardados funcionan.
3. **El código sigue en inglés y en llano.** El vocabulario vive en un solo módulo de
   presentación, no repartido por el árbol.

### El vocabulario de las acciones

| Concepto | Palabra |
|---|---|
| una publicación | un **corte** |
| programar | **poner al fuego** |
| publicar de inmediato | **al fuego ahora** |
| publicado | **servido** |
| en proceso | **al fuego** |
| falló | **se quemó** |
| nada programado | **la parrilla está fría** |

### La frontera del copy

Lo temático es el marco; **los mensajes que explican un fallo quedan en castellano llano**.
Cuando algo se rompe, la claridad manda sobre la gracia: en pantalla se leen juntos y
funciona — «quemado · TikTok no acepta el archivo: revisa tamaño».

Eso protege algo concreto: esas frases son constantes exportadas y hay tests que las verifican
letra por letra. No se tocan.

### El Fuego: la pantalla nueva

Reemplaza a la analítica como entrada. De arriba abajo:

1. **La barra de días cargados.** Doce barras, una por día, **empezando por hoy**, encendidas
   en brasa hasta donde alcance lo que hay programado. Un día cuenta como cargado si tiene al
   menos un corte por salir; el conteo **se corta en el primer hueco**, porque lo que mide es
   cuántos días aguantas sin volver, no cuántos días sueltos tienes ocupados. Cuando quedan
   dos o menos, **toda la barra** pasa a ámbar. Al lado, en mono: «6 días cargados». Es la
   pieza que empuja el volumen y lo primero que se ve.
2. **Ahora en la parrilla.** Lo que sale hoy: hora, texto recortado a una línea, redes en
   mono, estado.
3. **Se quemó.** Solo si hay algo. Cada fila con su motivo en llano y el botón de reintento.
4. **Poner al fuego**, el botón primario.
5. **Al pie, en mono:** lo de ayer, «6 cortes servidos · 1.2k miradas».

La analítica actual se muda **entera y sin perder nada** a Los Números: los mismos
componentes, los mismos filtros, la misma ruta `/admin/analytics`.

## 3. Componentes

La base cambia en cinco archivos y se propaga sola:

| Archivo | Qué cambia |
|---|---|
| `src/app/globals.css` | tokens `acero-*`, `.reja` y `.chapa` nuevas; nada se borra |
| `src/app/layout.tsx` | entra Oswald; Bricolage se queda mientras la página pública lo use |
| `src/components/ui.tsx` | los nueve controles sobre los tokens nuevos |
| `src/components/charts/theme.ts` | el cian por el naranja, neutros de acero |
| `src/components/charts/panel.tsx` | `.chapa` en vez de `.surface` |
| `src/app/admin/(dash)/layout.tsx` | pinta su propio fondo de acero; fuera la aurora |

Los otros siete gráficos (`bar-list`, `campaign-table`, `donut`, `funnel`, `heatmap`,
`stat-tile`, `traffic-chart`) heredan del tema; se revisan pero no se reescriben.

Lo que pide criterio y no solo tokens:

- **Las píldoras de estado** del calendario: `AL FUEGO`, `SERVIDO`, `QUEMADO`, en mayúsculas
  de mono, con el semántico de fondo al 12% y el texto al color pleno.
- **El interruptor** (`Switch`): pista en `acero-700`, perilla encendida en brasa. Conserva el
  arreglo de posición del 2026-09-17.
- **Las fichas de cifras** (`StatTile`): la brasa solo cuando el número es accionable, no en
  todas.
- **El foco del teclado**: `outline` en brasa, que ya es como funciona hoy con el acento.

## 4. Alcance

**Dentro:** el panel entero (`/admin/**`), `/ingresar` y su pantalla de código, las páginas
legales (`/privacidad`, `/terminos`) y la pantalla de error del panel.

**Fuera:** la portada del producto (no existe; subproyecto 3), la página pública de cada
creador, y la app Android (subproyecto 5).

## 5. Las entregas

Tres, cada una desplegable sola, con su propio plan y su propio PR, en este orden:

1. **La base.** Tokens, fuentes, la reja, el tema de gráficos, los controles, y el cromado
   del panel **y de la puerta**: `/ingresar`, la pantalla de código, las legales y las
   pantallas de error. Al terminar, todo se ve «Fierro y humo» y se sigue llamando igual.
   Ninguna estructura cambia.
2. **El vocabulario.** Navegación, títulos, subtítulos en llano, botones, estados y vacíos.
   El módulo de presentación con el mapa de nombres.
3. **El Fuego.** La pantalla nueva, el cálculo de días cargados y el traslado de la analítica
   a Los Números.

**Por qué la puerta va en la base y no aparte**, que era el plan inicial: `src/components/ui.tsx`
lo comparten el panel y la puerta. Vestir los controles y dejar la puerta para después la
dejaría con campos de acero sobre fondo violeta con auroras, y cada entrega tiene que poder
desplegarse sin verse a medio hacer.

## 6. Cómo se comprueba

Un rediseño se verifica mirando, y este repo no tiene infraestructura de capturas; no se
inventa una.

**Lo que sí lleva tests**, porque es puro:

- **El cálculo de días cargados**: dada una lista de momentos programados y un «ahora»,
  cuántos días consecutivos desde hoy tienen al menos un corte por salir, y si la barra va en
  brasa o en ámbar. Casos: parrilla vacía; solo hoy; un hueco al segundo día, que corta el
  conteo aunque haya cortes al cuarto; exactamente dos días, que es el umbral del ámbar; más
  de doce días, que llena la barra sin desbordarla; y un corte de hoy cuya hora ya pasó, que
  no cuenta.
- **El mapa de vocabulario**: que toda sección tenga nombre y subtítulo, y que no queden
  nombres repetidos.

**Lo que va con lista de revisión manual**, por pantalla y a dos anchos (teléfono ~400 px y
escritorio): contraste del texto sobre cada superficie, las tres píldoras de estado, los ocho
gráficos con datos reales, el foco del teclado visible, y que ninguna pantalla muestre dos
rejas.

**La puerta de siempre:** `npm test`, `npm run typecheck`, `npm run lint` y `npx next build`
en verde antes de cada PR.

## Riesgos anotados

- **La navegabilidad del asado completo.** Mitigada por los subtítulos en llano, las rutas
  intactas y el código en inglés. Si aun así cuesta encontrar algo, el arreglo es barato:
  el mapa vive en un solo módulo.
- **El cansancio a los seis meses.** Es la razón de haber elegido «Fierro y humo» sobre las
  otras dos: sobria de base, con la brasa como único acento y usada con avaricia.
- **La validación de color de los gráficos.** Cambiar una serie obliga a rehacer la
  comprobación de separación para daltonismo entre la serie nueva y sus vecinas. Va en la
  entrega 1, no después.
