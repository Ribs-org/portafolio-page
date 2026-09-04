# App Android — versión 1, solo lectura

Fecha: 2026-09-04
Estado: aprobado, pendiente de plan de implementación

Primer cliente móvil del sistema. Se apoya en todo lo construido: los conectores de
lectura, la sincronización diaria, el calendario de publicación y las métricas de
cuenta. No agrega lógica de negocio — la muestra.

## Problema

Todo lo que el sistema sabe vive en un panel pensado para el escritorio. El dueño
quiere dos cosas que el navegador del celular no da bien: **el vistazo** (mirar cómo
van sus videos en la calle, sin prender el computador) y **el repaso** (sentarse a
comparar posts y decidir la próxima parrilla desde el sillón).

## Objetivo

Una app Android nativa, en TypeScript, con cuatro pantallas de solo lectura —
Resumen, Contenido, Cuentas y Calendario — que abre rápido, se lee con el pulgar y
sirve igual sin señal mostrando lo último que supo.

## No objetivos (de esta versión)

- **Publicar o subir videos.** Es el siguiente proyecto, y la arquitectura elegida
  existe en parte para no estorbarlo.
- **Notificaciones push.** El dueño eligió «vistazo y repaso», no «vigilante».
- **iOS.** Mismo código el día que se quiera; hoy no se compila ni se prueba.
- **Editar nada desde el teléfono.** Ni posts programados, ni etiquetas, ni perfiles.
- **Play Store.** Instalación directa; publicar después no exige rehacer nada.

## Decisiones tomadas

| Decisión | Alternativa descartada | Razón |
|---|---|---|
| React Native con Expo | PWA instalable; Kotlin nativo | TypeScript compartido con el repo; compila en la nube (el dueño está en Windows, sin Android Studio); es el único camino cómodo para subir videos después; y sirve para iOS sin reescribir |
| Carpeta `mobile/` en este repositorio | Repositorio aparte | Un solo historial, tipos compartidos, y ninguna sincronización manual entre proyectos |
| Endpoints propios bajo `/api/mobile/` | Reusar `/api/metrics/posts` | Son dos consumidores distintos (la app y el editor-LLM) con llaves y ritmos distintos; compartir puerta haría que un cambio para la app rompiera al otro |
| Token de larga vida firmado con llave derivada aparte | Reusar `AUTH_SECRET` directo | Rotar `AUTH_SECRET` volvería indescifrables los tokens de redes guardados (usa la misma llave vía HKDF) y obligaría a reconectar todo. Revocar el teléfono debe costar un número, no una tarde |
| Contraseña una vez + candado biométrico local | Sesión corta con re-login | El dueño es el único usuario; la fricción diaria no compra seguridad, el candado del dispositivo sí |
| Caché de la última respuesta por pantalla | Solo red | Es lo que hace que «el vistazo» sea instantáneo y que la app sirva en el metro |
| Listas en vez de tablas | Portar la tabla del panel | Ocho columnas en un teléfono no se leen; la tarjeta por post sí |
| Actualizaciones por aire (expo-updates) | Reinstalar el APK en cada cambio | Iterar sobre una app instalada a mano sería insoportable sin esto |

## Arquitectura

```
portafolio-page/
├─ src/                     el sitio y el panel (sin cambios de estructura)
│  └─ app/api/mobile/       los endpoints que la app consume
└─ mobile/                  la app Expo, con su propio package.json
   ├─ app/                  pantallas (expo-router, enrutado por archivos)
   ├─ lib/                  cliente de API, sesión, caché, formateo (puro y testeable)
   └─ components/           tarjetas, estados de carga/error/vacío
```

`mobile/` queda fuera del build y del chequeo de tipos de Next: es un proyecto
vecino, no un módulo del sitio.

## La API

Cinco rutas nuevas. **Ninguna calcula métricas por su cuenta**: reusan
`getKpis`, `getPostRows`, `buildAccountCards`, `buildAccountSeries` y las consultas
del calendario que ya existen y ya están probadas.

| Ruta | Entrada | Salida |
|---|---|---|
| `POST /api/mobile/session` | `{ password }` | `{ token }` o 401 |
| `GET /api/mobile/overview` | `?rango=hoy\|7d\|30d` | KPIs del período, publicado hoy, próximos programados |
| `GET /api/mobile/posts` | `?rango=&red=` (red repetible) | posts con métricas y atributos |
| `GET /api/mobile/accounts` | `?rango=` | tarjetas por red y serie de visitas/alcance |
| `GET /api/mobile/schedule` | — | próximos 30 días de posts programados con estado por red |

Todas menos `session` exigen `Authorization: Bearer <token>`; sin él o con uno
inválido responden 401 con el cuerpo `No autorizado`, el molde del resto del repo.

Los nulos viajan como `null` y significan «la red no lo reportó», nunca cero.

## La sesión

1. La app manda la contraseña del panel a `POST /api/mobile/session`. El endpoint
   la compara con `passwordMatches` (el mismo del panel) y limita intentos por IP
   con el mismo molde de mejor esfuerzo que el login.
2. Devuelve un JWT HS256 sin expiración, con `{ purpose: 'mobile', v }`, firmado
   con una llave **derivada de `AUTH_SECRET` por HKDF con el info
   `portafolio-mobile-v1`** — distinta de la que cifra los tokens de redes.
3. `v` se compara contra `MOBILE_TOKEN_VERSION` (por defecto `'1'`). **Subir ese
   número en Vercel revoca todos los teléfonos** sin tocar nada más.
4. El teléfono guarda el token en `expo-secure-store` (respaldado por el almacén de
   claves de Android), nunca en almacenamiento común.
5. Candado local opcional con `expo-local-authentication` (huella o PIN del
   dispositivo) al abrir la app.
6. Un 401 en cualquier pantalla borra el token y vuelve a la pantalla de contraseña.

## Las pantallas

Cuatro pestañas. Todas: tirar para refrescar, y tres estados explícitos (cargando,
error con reintento, vacío que explica por qué).

**Resumen.** Selector de rango (hoy · 7 días · 30 días). Cuatro cifras grandes del
período: views ganadas, visitas al sitio, arrastre, seguidores totales. Debajo,
«qué salió hoy» (lo publicado, con su estado por red) y «qué viene» (los próximos
programados).

**Contenido.** Lista de posts: miniatura, texto truncado, red, fecha, views ganadas
y arrastre. Arriba, chips de red multi-selección y selector de rango y de orden.
Tocar un post abre su detalle: todas sus métricas, sus atributos si los tiene, y un
botón que lo abre en la red.

**Cuentas.** Tarjeta por red con seguidores y su variación en el período, más el
gráfico de visitas al perfil y alcance por día.

**Calendario.** Lo programado agrupado por día, con el semáforo del panel: verde
publicado, gris programado, rojo falló, ámbar publicando.

## Caché y sin señal

Cada pantalla guarda su última respuesta con su marca de tiempo. Al abrir muestra
eso de inmediato bajo un sello «actualizado hace X» y refresca por detrás; si la red
falla, se queda con lo viejo y lo dice. Sin caché previa y sin red, el estado de
error con reintento.

## Manejo de errores

Frases fijas en español en la app; detalle técnico solo a la consola de desarrollo.
Las rutas nuevas siguen el molde del repo: cuerpo `No autorizado` en 401, JSON con
`{ error }` y frase fija en 400, y el detalle upstream a `console.error` truncado.

## Construcción e instalación

- Cuenta de Expo (gratuita) del dueño; el build corre en **EAS Build** (nube) y
  devuelve un `.apk` por link.
- Perfil `preview` para el APK instalable a mano; el perfil de tienda queda
  configurado pero sin usar.
- **Actualizaciones por aire** con `expo-updates`: los cambios de JS llegan al
  abrir la app. Solo se reinstala cuando cambia el andamiaje nativo.
- La URL base de la API es `https://www.vicente-pareja.cl`, con override por
  variable de entorno para desarrollo.

## Testing

- **Backend**: la emisión y verificación del token (puro, con Vitest en la raíz).
  Las rutas reusan funciones ya probadas; sin tests nuevos de HTTP, como el resto.
- **App**: la lógica pura de `mobile/lib` (formateo de fechas y números, agrupación
  por día, decisión de caché fresca/vieja, estado de sesión) con Vitest propio en
  `mobile/`. Sin pruebas de render, igual que el repo no prueba componentes.

## Variables de entorno nuevas

`MOBILE_TOKEN_VERSION` — opcional, por defecto `'1'`. Subirlo revoca los teléfonos.
