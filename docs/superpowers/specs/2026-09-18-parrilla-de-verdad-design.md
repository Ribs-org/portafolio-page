# Parrilla — «La parrilla de verdad»

Segunda vuelta de la dirección visual. Continúa
`docs/superpowers/specs/2026-09-18-parrilla-direccion-visual-design.md`, que sigue vigente:
los tokens, la tipografía y el vocabulario de aquel spec no se tocan. Este agrega forma
donde aquel puso material.

## Problema

«Fierro y humo» cambió el material y no la forma. Los tokens, Oswald y la brasa
reemplazaron el violeta y las auroras, pero un panel gris con acento naranja sigue siendo
un panel. El dueño lo miró y lo dijo así: *«encontré la transformación muy suave, sigue
muy como antes»*.

La metáfora tampoco está haciendo trabajo. Hoy es decoración: un nombre de producto y una
paleta cálida. Nada en la pantalla se comporta como una parrilla.

## Qué se decidió

De tres direcciones maquetadas, el dueño eligió **la parrilla de verdad**: el calendario
deja de ser una lista y pasa a ser una parrilla, cada día es una grilla con fuego debajo, y
cada post es un corte puesto encima. La cocción del corte dice el estado.

Las otras dos, y por qué no:

- **El calor detrás** (la reja como textura, un borde de brasa en lo que sale ahora).
  Es más barata y sin riesgo, pero es exactamente el tipo de avance que ya se rechazó.
- **El tablero del carnicero** (papel de carnicería, los posts como cortes con su peso).
  Es la más distinta de todo lo que existe, pero bota «Fierro y humo» recién pagado y deja
  la app del teléfono, que quedó oscura, descolgada de un panel claro.

## La regla que ordena todo

**La metáfora tiene que hacer trabajo o no entra.** Un adorno con forma de carne es un
disfraz; lo que justifica el rediseño es que la imagen informe más rápido que el texto que
reemplaza.

De ahí salen las dos apuestas concretas:

1. **La cocción reemplaza el semáforo.** Hoy el estado de cada red es un punto de color de
   8 px y el de la tarjeta un tinte de fondo. Pasan a ser el color y las marcas del corte.
   Un punto de color hay que aprendérselo; una carne cruda contra una quemada no.
2. **El calor reemplaza el conteo.** Hoy, para saber si un día está cargado, hay que contar
   tarjetas. Pasa a ser cuánto fuego tiene la grilla debajo. El volumen —que es la promesa
   del producto— deja de ser un número y pasa a ser una imagen.

Si una idea de parrilla no reemplaza algo que hoy se lee peor, no va.

## A quién le hablamos

Sin cambios respecto del spec anterior: hombres de 20 a 35 del cono sur, perfil tech y
emprendedor, que quieren publicar a volumen y a los que les da vergüenza subir cosas. La
parrilla es el permiso social para hacerlo.

## No objetivos

- **La app del teléfono.** Va después, en su propia entrega, una vez que las primitivas
  estén asentadas en el panel. Hoy su calendario es una lista agrupada por día y no
  comparte código con el del panel.
- **La página pública de cada creador** (`/<slug>`) y la puerta (`/ingresar`). Siguen como
  están: la parrilla es el lugar de trabajo del dueño, no su vitrina.
- **Cambios de función.** Nada de lo que el panel hace cambia. El calendario sigue
  mostrando la misma semana, enlazando al mismo editor y navegando con los mismos enlaces.
- **Los Números, La Mesa y Los Fierros.** Analítica, comentarios y cuentas no reciben
  cortes. La metáfora entra donde hay posts en el tiempo, no en todas partes.

## 1. Las piezas

### El corte

Un post programado. Reemplaza la tarjeta actual del calendario.

**Forma.** Las cuatro esquinas con radios distintos y asimétricos, para que no se lea como
una pastilla redondeada más. La referencia exacta, ya maquetada y validada:
`border-radius: 13px 5px 14px 6px`.

**Las marcas del fierro.** Bandas horizontales oscuras, cada 14 px, de 3 px de alto, en
`multiply` sobre todo el corte —**incluida la foto del post**. Es lo que hace que la
miniatura se lea como algo puesto sobre la parrilla y no como una foto pegada encima de un
dibujo de carne.

**El veteado.** Tres elipses claras, muy difusas, en posiciones fijas. Es lo que separa
«carne» de «mancha café». Va debajo de las marcas del fierro, nunca encima.

**La cocción**, que es el estado. Cuatro, y son exhaustivas:

| Cocción | Estado hoy | De dónde sale |
|---|---|---|
| Cruda | `scheduled` | Ningún destino publicado ni fallado |
| Sellada | `publishing` | Algún destino en curso |
| A punto | `published` | Todos los destinos publicados |
| Quemada | `failed` | Algún destino falló |

**La precedencia se mantiene tal cual está hoy** en `calendar.tsx`: un fallo en cualquier
destino gana sobre todo lo demás, porque es lo que necesita el ojo. Todos publicados es «a
punto». Cualquier otra cosa queda cruda. Esto no es un cambio de lógica, es la misma
condición vestida distinto.

Los colores de cocción son nuevos y viven en `@theme`, no inventados en el componente:

| Token | Valor | Para |
|---|---|---|
| `--color-carne-cruda` | `#b4554f` | Cruda |
| `--color-carne-sellada` | `#8c3f36` | Sellada |
| `--color-carne-punto` | `#6e3128` | A punto |
| `--color-carne-quemada` | `#3a2a26` | Quemada |
| `--color-grasa` | `#e8d7b8` | Veteado y marcas de red |

**La cruda es la más clara de las cuatro y la quemada la más oscura.** El orden de
luminosidad cuenta la cocción sin depender del tono, que es lo que hace que la escala
sobreviva a un daltonismo protán o deután: los cuatro rojos se vuelven cuatro pardos, pero
siguen ordenados.

### La grilla

Un día. Reemplaza la columna del día.

**El fuego** es un degradado vertical que va de casi nada arriba a brasa abajo, y su
intensidad tiene tres escalones según cuántos cortes haya ese día:

| Escalón | Cortes | Qué se ve | Rótulo |
|---|---|---|---|
| Apagada | 0 | Fondo de acero, borde punteado | «Apagada» |
| Prendida | 1 a 2 | Degradado tenue | «Prendida» |
| Llena | 3 o más | Degradado fuerte, borde de brasa | «Parrilla llena» |

El umbral de 3 sale de la promesa del producto: publicar a volumen. Poner la parrilla llena
en 3 hace que el escalón se alcance en un día de trabajo normal y no sea un trofeo
inalcanzable.

**Los fierros** son bandas horizontales negras cada 13 px, dibujadas **sobre el fuego y
debajo de los cortes**. Ese orden no es decorativo: si los fierros van encima de los cortes
se mezclan con las marcas del corte y el conjunto se ensucia.

**El día vacío** dice «No hay nada puesto. Prendela.» Hoy dice nada: la columna queda en
blanco. Es la única frase de copy nueva de la entrega y existe porque un día apagado es
justamente donde el producto quiere empujar.

### El calor como cifra

`calorDelDia(cantidad)` devuelve `'apagada' | 'prendida' | 'llena'`. Función pura, en
`src/lib/parrilla.ts`, con sus tests. Vive aparte del componente porque el escalón lo va a
querer también el resumen («El Fuego») en la entrega siguiente, y porque un umbral mágico
escrito dentro de un `className` es exactamente el tipo de regla que después nadie
encuentra.

## 2. Lo que no cambia

El calendario conserva, sin excepción:

- La semana de siete columnas, el ancho mínimo de `52rem` y el scroll horizontal.
- Los enlaces de semana anterior y siguiente, y el `weekLabel`.
- El enlace de cada corte al editor, con su `?volver=`.
- La miniatura: imagen, o `coverUrl` del video, o el primer cuadro del video con
  `preload="metadata"`. Los tres casos siguen.
- El marcado del día de hoy.

## 3. Accesibilidad

Un rediseño que tapa una foto con bandas negras tiene que decir hasta dónde.

- **Las marcas del fierro sobre la miniatura van al 34% de negro como máximo.** Por encima
  de eso la foto deja de reconocerse, y reconocer el post de un vistazo es la función de la
  miniatura.
- **El texto del corte se verifica contra la cocción más clara y la más oscura**, con el
  helper que ya existe en `src/components/charts/color.ts`. El mínimo es 4.5:1 en las
  cuatro cocciones. Si una no llega, se ajusta el color del texto de esa cocción, no se
  baja el requisito.
- **La cocción no puede ser el único portador del estado.** El corte lleva además su
  estado en texto accesible (`title` y contenido para lector de pantalla), porque el
  esquema de color es la segunda señal, no la única. Esto ya existe hoy en los puntos
  (`title={network: status}`) y no se pierde.
- **La escala se comprueba bajo daltonismo** con `simular()` del mismo módulo: las cuatro
  cocciones tienen que seguir distinguiéndose en protán y deután por luminosidad.
- **Una sola animación en toda la entrega**: el humo del corte sellado, que es informativo
  —algo está saliendo en este momento—. Va dentro del bloque
  `prefers-reduced-motion: reduce` que el proyecto ya tiene. Nada más se mueve: esto es una
  herramienta de trabajo, no una pantalla de bienvenida.

## 4. Alcance en archivos

- `src/app/globals.css` — tokens de carne y grasa en `@theme`; clases `.corte`, sus cuatro
  cocciones, `.grilla` y sus tres escalones, en `@layer components`. Aditivo: no se borra
  ni se redefine nada de «Fierro y humo».
- `src/lib/parrilla.ts` — `calorDelDia()`. Nuevo.
- `src/lib/parrilla.test.ts` — sus tests. Nuevo.
- `src/app/admin/(dash)/schedule/calendar.tsx` — la columna y la tarjeta se rehacen sobre
  las clases nuevas. Es el único componente que cambia.

Cuatro archivos, uno de ellos existente. La entrega es chica a propósito: la primitiva se
prueba en el calendario antes de repartirla.

## 5. Las entregas

1. **La parrilla.** Todo lo de arriba. Al terminar, el calendario es una parrilla y nada
   más cambió.
2. **Los cortes.** La cola de programados y Contenido adoptan el corte. Entrega aparte
   porque son listas densas y el corte ahí compite con la lectura rápida; hay que medirlo
   con la primitiva ya asentada.
3. **El teléfono.** El calendario del móvil, con las mismas cocciones.

## 6. Cómo se comprueba

El repo no tiene infraestructura de capturas y no se inventa una acá.

- `calorDelDia()` se cubre con tests: los tres escalones y los dos bordes (2 y 3).
- Los contrastes y el daltonismo se verifican con `contraste()` y `simular()` de
  `src/components/charts/color.ts`, **en un test**, no en un comentario. El spec anterior
  aprendió esto por las malas: la validación que vivía en un comentario quedó obsoleta en
  silencio.
- El resto es revisión mirando, sobre el preview del PR, contra la maqueta aprobada.

## Riesgos anotados

- **Que se vea de juguete.** El corte tiene que verse hecho de material, no dibujado con
  emojis. El veteado y las marcas del fierro son lo que lo sostiene; si al mirarlo en el
  preview parece un sticker, se oscurece el veteado antes que agrandar el corte.
- **Que la miniatura se pierda.** El tope de 34% en las marcas existe por esto. Si en el
  preview la foto no se reconoce, se baja el tope, no se quitan las marcas.
- **Que el fuego canse.** El degradado es estático y solo el escalón «llena» lleva borde de
  brasa. Si la semana entera llena resulta ruidosa, se baja la opacidad del escalón llena;
  no se elimina el escalón, que es el que cuenta la historia del volumen.
- **Que el corte no escale a listas densas.** Es la razón de que la entrega 2 sea aparte y
  no venga en esta.
