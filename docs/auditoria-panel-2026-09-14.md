# Auditoría de interfaz del panel — 14 de septiembre de 2026

Base: todo `src/app/admin/**` (17 archivos), los 15 componentes compartidos que esas páginas
importan, `src/app/globals.css` y `src/app/layout.tsx`. Tailwind v4 con `@theme` en
`globals.css`, Next 16, lucide-react, recharts. Este documento es el punto de partida del
pull request que arregla la sección 5, y deja escrito lo que se decidió no tocar todavía.

## 1. Inventario

| Ruta | Qué muestra | Qué permite hacer |
|---|---|---|
| `/admin/login` | Tarjeta centrada con contraseña | Entrar. El único formulario con `useFormStatus` bien puesto |
| `/admin` Resumen | Cuatro cifras con delta, gráfico de tráfico, links más clickeados, embudo, campañas, perfiles | Filtrar por rango, perfil y bots |
| `/admin/analytics` | La más larga: unos trece paneles, de seguidores a idioma | Solo leer, más los filtros |
| `/admin/content` | Cuatro cifras, avisos, tabla de posts con nueve columnas ordenables | Ordenar, filtrar por red, tres toggles, editar la etiqueta en línea, copiar el link |
| `/admin/accounts` | Un bloque por red, una tarjeta por cuenta | Conectar, reconectar, desconectar, sincronizar |
| `/admin/accounts/elegir` | Cuentas que devolvió Meta o Google, con casillas | Marcar y conectar |
| `/admin/schedule` | Compositor y carga masiva siempre arriba; abajo, pestañas Lista y Calendario | Programar, subir CSV, navegar semanas, editar, eliminar, reprogramar |
| `/admin/schedule/[id]` | Editor de un post programado | Guardar, eliminar, reordenar media, agregar archivos |
| `/admin/profiles` | Grilla de tarjetas de perfil | Crear, editar, abrir, hacer principal |
| `/admin/profiles/[id]` | La mejor página: formulario más vista previa en vivo | Todo el CRUD del perfil y sus links |

Navegación: barra superior fija con seis pestañas y «Salir». Sin barra lateral ni migas de pan.

Componentes compartidos: `Panel` y `Empty`, `StatTile`, `BarList`, `CampaignTable`, `Donut`,
`Funnel`, `Heatmap`, `TrafficChart`, `theme.ts`, `useSortedRows`, `FilterBar`, `ui.tsx`
(`Field`, `Input`, `Textarea`, `Select`, `Button`, `Switch`, `Toggle`), `ImageField`, `Icon`,
`ProfileView`.

## 2. El sistema visual que hay hoy

**Colores.** Hay tokens en `globals.css` (`ink-*`, `fg`, `fg-muted`, `fg-faint`, `positive`,
`negative`) y una paleta de gráficos validada en `theme.ts`. Pero `schedule/**` los ignora y usa
los colores crudos de Tailwind: catorce ocurrencias de `red-400`, `emerald-400`, `amber-*`.
Cuatro rojos distintos para una sola idea. Solo tema oscuro, sin `prefers-color-scheme`.

**Tipografía.** Tres fuentes bien elegidas. Sin escala: dieciséis tamaños arbitrarios, casi
todos por debajo de 14 px, con `0.72`, `0.75` y `0.78rem` conviviendo sin razón.

**Ancho.** `max-w-6xl` en todo. En 1440 px quedan 288 px de aire a cada lado, y el editor de
post se limita a 672 px dentro de eso.

**Componentes.** Hay biblioteca en `ui.tsx` y solo dos archivos la usan, ambos bajo
`profiles/[id]`. Cuatro botones primarios distintos, tres superficies para el mismo concepto,
campos de formulario a mano sin borde ni foco.

**Estados.** Sin `loading.tsx`, sin `Suspense`, sin `error.tsx` en todo el proyecto. Cuatro
formas distintas de vacío. Éxito disperso: un ✓ que se va, un «Listo.» que no se va nunca,
redirecciones mudas.

**Íconos.** lucide-react en todo el panel, salvo `schedule/`, que usa flechas de texto.

## 3. Problemas concretos, del más al menos notorio

- **Ninguna página avisa que está cargando.** Al pulsar Analítica, el navegador se queda en
  Resumen sin señal hasta que terminan trece consultas.
- **No hay `error.tsx`.** Si la base no responde, la pantalla blanca de Next en inglés.
- **Calendario no tiene título.** La única página sin `h1`.
- **El compositor está siempre desplegado encima del calendario.** Para ver el calendario hay
  que hacer scroll siempre.
- **«Reprogramar» abre un `prompt()` del navegador** pidiendo `YYYY-MM-DDTHH:MM` a mano.
- **«Desconectar» borra credenciales sin confirmar ni avisar.** El resto del panel sí confirma
  las acciones destructivas.
- **«Conectar» tras el login de Meta no da señal.** Es el clic con más latencia del panel.
- **«Nuevo perfil», «Hacer principal» y «Guardar perfil» tampoco.**
- **Siete campos sin foco visible**: `outline-none` anula la regla global de `:focus-visible`.
- **Dos paletas para el mismo concepto**: `schedule/` contra el resto.
- **La lista de programados crece sin límite**, ordenada de lo más viejo y ya publicado a lo
  próximo, que queda al fondo.
- **Un texto largo rompe la fila de la cola**: sin `line-clamp`.
- **«Listo.» se queda pegado para siempre** en Cuentas.
- **Los errores de Meta salen crudos en inglés** justo cuando algo se rompió.
- **El compositor no tiene ni una etiqueta.** El campo de fecha es un input suelto sin nombre.
- **Los tres controles de Contenido** están pintados con `fg-faint`, un contraste de 3,5:1 en
  12 px.
- **La pestaña activa casi no se distingue**, y no hay migas de pan en las subpáginas.
- **Tres formas de volver** en tres subpáginas.
- **Resumen y Analítica muestran los mismos números arriba.**
- **El editor de post es una columna angosta** con media pantalla vacía.

## 4. Lo que está bien y conviene no tocar

- **La escritura.** Los textos de ayuda explican y los vacíos enseñan qué hacer.
- **`—` en vez de `0`** para lo que la red no reportó, sostenido en todo el panel.
- **`theme.ts`.** Paleta de gráficos validada contra daltonismo y contraste.
- **Los filtros en la URL.** El botón Atrás funciona y las vistas se comparten.
- **El editor de perfil.** Vista previa en vivo, arrastre con teclado, guardado por link.
- **Los comentarios del código.** Explican por qué, no qué.

## 5. Lo que se arregla en este pull request

1. **Carga y error en todo el panel.** `loading.tsx` con esqueletos, `error.tsx` en español con
   «Reintentar», y los paneles pesados de Analítica en `Suspense`.
2. **Calendario al sistema visual del resto.** Tokens en vez de colores crudos, campos y
   botones de `ui.tsx`, título de página, el `prompt()` reemplazado por el selector de fecha,
   el compositor plegado por defecto, la lista con lo próximo primero y un corte, y
   `line-clamp` en los textos.
3. **Estado pendiente en los cinco botones que no lo tienen**, y confirmación en Desconectar.

Más los menores que caen de paso: «Listo.» que se va solo, los errores de Meta con una frase
fija en español y el detalle en el título, los controles de Contenido legibles, y la pestaña
activa con indicador.

## 6. Lo que queda para una decisión aparte

Que Resumen y Analítica dejen de repetirse, el editor de post a dos columnas, migas de pan, y
una escala tipográfica. Son rediseños, no pulido.
