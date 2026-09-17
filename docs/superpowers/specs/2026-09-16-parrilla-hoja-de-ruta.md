# Parrilla — hoja de ruta: del panel personal al producto para creadores

Fecha: 2026-09-16
Estado: aprobada por el dueño; cada subproyecto tiene (o tendrá) su spec

## Qué cambia

Hasta hoy este repo es el panel de una persona: publica en sus redes, mide qué post trajo
gente a su sitio y responde sus comentarios. El dueño decidió convertirlo en **Parrilla**,
un producto para otros creadores: cada uno con sus redes, su calendario, su cola de
comentarios y su página pública medible, con la app Android como puerta de entrada en
Google Play. Primera versión: **beta cerrada por invitación**, con todas las redes que hoy
existen (Instagram, Facebook, YouTube, TikTok, Threads, X).

Nombre: **Parrilla**. Dominio: **tu-parrilla.cl** (comprado el 2026-09-16, delegado a
Cloudflare). Paquete Android: **`cl.tuparrilla.app`** (sin guion: los paquetes no lo
admiten). Página pública de cada creador: `tu-parrilla.cl/<usuario>`.

## Lo que asume hoy un solo dueño (mapa del 2026-09-16)

- Ninguna tabla tiene columna de dueño; la sesión es una contraseña compartida sin
  identidad; el `state` de OAuth no va atado a nadie.
- `cuentasPrimarias` elige «la cuenta más antigua de toda la base» por red: con dos
  usuarios, publicaría el post de uno en la red del otro.
- La unique de `social_accounts` es `(red, id externo)`: un segundo usuario que conecte
  la misma cuenta pisa el token del primero.
- Los crons recorren todas las cuentas en un bucle serial de 240 s con cupos globales.
- Todo permiso de Meta, Google y TikTok funciona porque la app está en modo desarrollo y
  el dueño es el único usuario; faltan los callbacks de baja y de borrado de datos.
- Vercel Hobby: prohíbe uso comercial y solo permite crons diarios.

## Los subproyectos, en orden de dependencia

| # | Subproyecto | Qué entrega | Depende de |
|---|---|---|---|
| 1 | **Usuarios e inquilinos** | `users`, dueño en las tablas raíz, sesión con identidad (web y móvil), ingreso por código al correo, invitaciones, OAuth atado al usuario, cuenta destino por dueño, el dueño migrado como primer usuario | — |
| 2 | **Plataforma para terceros** (papeleo, en paralelo con 1) | callbacks de baja y borrado, páginas legales del producto, App Review de Meta con verificación de negocio, verificación de Google, re-revisión de TikTok con usuarios genéricos | dominio |
| 3 | **Página pública por usuario** | `tu-parrilla.cl/<usuario>`, slugs reservados, `/` del producto, atribución de visitas por dueño | 1 |
| 4 | **Crons por inquilino** | Vercel Pro, trabajo en cola en vez de un bucle, cupos y alertas por usuario, zona horaria por usuario | 1 |
| 5 | **App móvil multiusuario y Play** | ingreso por correo y código en la app, envío automático a Play, prueba cerrada con los creadores de la beta como los 12 testers | 1, 2 |
| 6 | **La beta** | invitaciones a 10–30 creadores, onboarding, soporte, costos | 1–5 |

Cada subproyecto sigue el proceso de siempre: spec aprobada → plan → subagentes con
revisión → PR a `main`. El 2 es papeleo del dueño con apoyo de código puntual (callbacks,
legales) y arranca ya, porque es el de mayor plazo.

## Costos que aparecen sí o sí

Vercel Pro (uso comercial y crons cada cinco minutos), probablemente Neon de pago cuando
crezcan las visitas, verificación de negocio en Meta, y un dominio verificado en Resend
para el correo de ingreso.

## Decisiones ya tomadas

- Beta cerrada antes que registro abierto: sirve de prueba cerrada para Play y permite
  pedir las revisiones con usuarios reales en el video.
- Ingreso por código de seis dígitos al correo, sin contraseñas.
- Página pública tipo linktree por usuario dentro de Parrilla (no un script en sitios
  ajenos), para que el arrastre exista para todos desde el día uno.
