# Auditoría de interfaz de la app — 13 de septiembre de 2026

Base: `mobile/src/` (9 archivos de ruta, 1 de componentes, 11 de librería) y `mobile/app.json`,
en la versión 1.1.0. Este documento es el punto de partida del pull request que arregla los
puntos de la sección 5, y deja escrito lo que se decidió **no** tocar todavía.

## 1. Inventario

| Archivo | Qué muestra | Qué permite hacer |
|---|---|---|
| `src/app/_layout.tsx` | Pila raíz. Spinner mientras arranca. | Lee el token; si hay PIN o huella pide desbloqueo; redirige a `/login` o a las pestañas. |
| `src/app/login.tsx` | Título, bajada, un campo de contraseña. | Entrar. Muestra el error en rojo. |
| `src/app/(tabs)/_layout.tsx` | Barra de cinco pestañas, solo texto. | Navegar entre Resumen, Contenido, Publicar, Cuentas y Calendario. |
| `src/app/(tabs)/index.tsx` — Resumen | Píldoras de rango, cuatro tarjetas de cifras, «Qué salió hoy» y «Qué viene». | Cambiar rango, tirar para refrescar. Las filas no son tocables. |
| `src/app/(tabs)/contenido.tsx` | Chips de rango y de red, lista de posts ordenados por views ganadas. | Filtrar, abrir un post, refrescar. |
| `src/app/(tabs)/publicar.tsx` | Campo de texto con contador, miniaturas, chips de redes y de fecha, barra de progreso, botones. | Escribir, elegir hasta diez archivos, elegir redes y hora, programar o publicar ahora, cancelar, reintentar. |
| `src/app/(tabs)/cuentas.tsx` | Una tarjeta por red con seguidores y alcance, más un gráfico de barras. | Solo mirar. No hay ninguna acción. |
| `src/app/(tabs)/calendario.tsx` | Posts programados por día, con estado por red. | Solo mirar. No se puede editar ni cancelar. |
| `src/app/post/[id].tsx` | Detalle de un post desde la caché: métricas, atributos crudos, enlace. | Abrir el enlace. No hay barra superior ni botón de volver. |

Componentes compartidos, todos en `src/components/ui.tsx`: `Pantalla`, `Tarjeta`, `Cifra`,
`Sello`, `Cargando`, `ErrorConReintento`, `Vacio`, `PuntoEstado`, `Numero` (sin uso), `Chip`,
`Miniatura`, `Boton`. Más `FilaProgramada`, que vive en `index.tsx`.

Navegación: pila raíz sin cabecera, dentro un grupo de pestañas, y dos rutas sueltas
(`/login` y `/post/[id]`). El detalle de post se empuja sobre la pila raíz, por eso sale sin
cabecera y tapando las pestañas.

## 2. El sistema visual que hay hoy

**Colores.** Hay una paleta única en `ui.tsx`, nueve tokens, y todas las pantallas la usan.
Solo tema oscuro, pero `app.json` declara `"userInterfaceStyle": "automatic"` y nadie envuelve
el navegador en un tema oscuro, así que el fondo de escena por omisión es blanco.

**Tipografía.** Sin escala: los tamaños se escriben a mano en cada pantalla (11, 12, 13, 14,
16, 22, 24). Coherente por accidente, no por diseño.

**Espaciado.** Números sueltos con un ritmo implícito. Sin constantes.

**Componentes.** Hay biblioteca, pero se la evita a ratos: el login arma su propio botón, Resumen
copia el chip a mano, no hay componente de campo de texto.

**Estados.** El patrón de datos es correcto (caché al instante, refresco por detrás, error
degradado a nota al pie), pero `Cargando` es un spinner sin fondo, y el detalle de post tiene
su propio estado de error distinto del resto.

**Íconos.** No hay ninguno. La barra de pestañas es solo texto. Los únicos glifos son
caracteres Unicode sueltos.

## 3. Problemas concretos, del más al menos notorio

### Lo primero que se ve

- **El ícono y el splash son los de la plantilla de Expo.** Azul Expo en el splash, símbolo de
  Expo en el cajón de aplicaciones, y en `assets/images/` siguen los logos de React y de Expo.
- **La app es oscura pero se declara «automatic».** El navegador usa su tema claro por omisión.
- **La barra de estado nunca se configura.** Sobre fondo negro, la hora puede salir en negro.

### Un flash blanco en cada apertura

`Cargando` es un `ActivityIndicator` sin contenedor ni fondo. Se usa como pantalla completa en
los cuatro tabs y en el detalle. Cae sobre el fondo blanco del navegador. Tres líneas de un
archivo lo arreglan para todas las pantallas a la vez.

### Nada responde al tacto

Ningún `Pressable` de la app tiene estado presionado, ni ripple, ni opacidad. «Publicar ahora»
hace un chequeo de red antes de mostrar nada; en ese hueco el dedo ya se levantó y no pasó nada
visible, y el dueño toca dos veces.

### Toques por debajo del mínimo de Android

`Chip` mide unos 28 px de alto y Android pide 48. Es el control más usado: filtros, rangos, el
selector de archivos y el de fecha. La equis de las miniaturas está fuera de la miniatura y
mide unos 38 px con el `hitSlop`.

### Cosas que se tocan y no hacen nada

En Publicar, mientras hay un envío en curso, los chips de red y de fecha se dibujan igual que
activos pero su `onPress` no hace nada. Los botones sí se atenúan; los chips, no. Y «Programar»
y «Publicar ahora» salen apagados al abrir la pestaña sin decir qué falta.

### El detalle de un post es un callejón sin salida

Sin cabecera ni botón de volver. Sin safe-area, así que la primera línea queda debajo de la
hora y la batería. Estado «no encontrado» como frase suelta sin acción. La tabla de atributos
imprime claves crudas de la API en inglés. Las filas de métricas desbordan con valores largos.

### El mismo concepto con dos caras

- Resumen rotula los rangos «7 días» y «30 días»; Contenido rotula «7d» y «30d».
- Cuentas habla de «el período» sin decir cuál.
- Los posts programados en Resumen son una hilera de puntos anónimos; en Calendario, una lista
  con nombre de red y error.
- «Reintentar» es texto plano en un lugar y botón verde en otro.

### Texto largo y pantallas chicas

- Cinco pestañas sin íconos con etiquetas de hasta diez caracteres; «Calendario» se corta en
  360 dp.
- Cuentas imprime una fecha ISO cruda.
- El error de red en Calendario no tiene `numberOfLines` ni `flex: 1` y desborda la tarjeta.
- Publicar no tiene `KeyboardAvoidingView`: con el teclado abierto los botones quedan tapados.
- Login abre el teclado al instante y en pantallas chicas empuja el botón fuera de vista.

### Retroalimentación del envío

- Al terminar un envío, se limpia la etiqueta «Listo» y se navega a Calendario en el mismo
  tick: la confirmación nunca se ve.
- «Comprobando…» y «Guardando…» no tienen spinner. La barra de progreso solo aparece al subir.
- En login, «Entrando…» sin spinner, y el error anterior no se limpia al volver a escribir.

### Funciones que la app promete y no tiene

- No hay forma de cerrar sesión.
- Cuentas no administra nada: ni reconectar ni desconectar.
- Calendario es de solo lectura: un post programado por error no se puede cancelar.
- Si el desbloqueo biométrico falla, se va al login con el texto de la primera vez.
- Contenido no ofrece el filtro de TikTok aunque hay posts de TikTok.

### Detalles menores

`Numero` sin uso. El signo más de «＋ Fotos o video» es el de ancho completo. El contador del
caption no avisa al acercarse al límite. El gráfico de Cuentas no tiene eje ni cifras. Ni un
solo `accessibilityLabel`; los puntos de estado codifican solo por color. Siete dependencias
instaladas y sin usar.

## 4. Lo que está bien y conviene no tocar

- **La estrategia de datos** en `useScreenData.ts`: caché al instante, refresco por detrás,
  error degradado a nota al pie. Es lo que hace que el vistazo se sienta instantáneo.
- **La paleta centralizada.** Nueve tokens, un archivo, adoptada de verdad.
- **El tono del texto en español.** Los vacíos explican la causa y dan el siguiente paso.
- **`num()` y `pct()`**: «—» y nunca cero para lo que la red no reportó, coma decimal.
- **La máquina de estados del envío**: separa rechazo de caída de red y reintenta desde el
  archivo exacto. La presentación necesita trabajo; la lógica no.
- **El manejo de zonas horarias**: leer los dígitos del ISO evita que un post de las 23:00 salte
  de día.

## 5. Lo que se arregla en este pull request

1. **Los primeros diez segundos.** Fondo oscuro en `Cargando`, tema oscuro declarado en el
   navegador y en `app.json`, barra de estado clara, ícono y splash propios a partir de la
   bandera que ya usa el sitio, y fuera los assets de la plantilla.
2. **El tacto.** Estado presionado, ripple y 48 dp de alto en `Chip` y `Boton`. Resumen y el
   login pasan a usar los componentes en vez de copiarlos. Los rangos se rotulan igual en todas
   partes. Los chips deshabilitados se atenúan como los botones.
3. **Los bordes de pantalla.** Cabecera con botón de volver en el detalle de post, safe-area,
   `KeyboardAvoidingView` en Publicar y en el login, estado de error del detalle igual al del
   resto, `numberOfLines` y `flex` donde el texto largo desborda, y los atributos crudos con
   etiqueta en español o escondidos.

Más los menores que caen de paso: el signo más, `Numero`, la fecha ISO en Cuentas, y que la
confirmación «Listo» se vea un momento antes de saltar al calendario.

## 6. Lo que queda para una decisión aparte

Cerrar sesión, administrar cuentas desde el teléfono, cancelar un post programado, el filtro de
TikTok en Contenido, íconos en la barra de pestañas y accesibilidad. Son funciones que faltan,
no pulido, y cada una merece su propia decisión.
