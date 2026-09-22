# TikTok: qué grabar y qué escribir en la revisión

Fecha: 2026-09-17, revisado el 2026-09-22 (mudanza a Supabase y dominios del portal). Reemplaza al guion de
`docs/superpowers/specs/2026-09-15-publicar-en-tiktok-design.md`, escrito cuando Parrilla
era el panel de una sola persona. Ahora es multiusuario por invitación, y el texto de
revisión tiene que decirlo: el revisor va a ver una pantalla de ingreso por correo.

## Antes de apretar grabar

Nada de esto depende del código; si falta algo, el video se cae solo. Lo marcado ya quedó
resuelto: lo de 2026-09-17 en su momento, y lo de 2026-09-22 verificado uno por uno.

### En el portal de TikTok

- [x] **Sandbox activo** (`portafolio-demo`) con tu cuenta como *target user*. La revisión
      exige que la demo corra en sandbox.
- [x] **El sandbox se llama `Tu Parrilla`.** Su nombre y su icono son los que aparecen en la
      pantalla de permisos, o sea en cámara. TikTok le agrega «(Sandbox)» y eso está bien.
- [x] **Icono** subido en Basic Info de las dos apps, el mismo de la pestaña del navegador.
- [x] **Las tres URLs declaradas apuntan a `tu-parrilla.cl`** —Web/Desktop, Terms y
      Privacy—, el mismo dominio donde se graba. Declararlas en otro dominio es la clase de
      contradicción que ya costó un rechazo.

      Ojo con el `www`: `www.vicente-pareja.cl` existe, **`www.tu-parrilla.cl` no**. Tres
      veces seguidas se coló ese prefijo el 2026-09-22 y deja los links rotos, que es
      rechazo automático sin que el revisor llegue a ver el video.
- [x] **`https://tu-parrilla.cl/api/social/tiktok/callback`** en los redirects del sandbox,
      guardado con «Apply changes». El sandbox es una app aparte: lo que agregas en
      producción no llega ahí. El código arma la URL de retorno con `new URL(request.url).origin`,
      o sea con el dominio que navegas, así que tiene que ser exactamente ese.
- [x] **URL properties verificadas en esta app** (confirmado 2026-09-22: las dos figuran en «Verified properties»): `tu-parrilla.cl` y
      `media-bucket.vicente-pareja.cl`, de donde TikTok descarga la media. Sin la segunda,
      `PULL_FROM_URL` falla a mitad del video. Cada app emite su propio token y el diálogo
      genera uno nuevo cada vez que se abre: hay que copiarlo, crear el TXT **sin cerrar la
      ventana**, y verificar ahí mismo.

### En la app de producción (la que TikTok revisa de verdad)

El sandbox solo sirve para que la demo corra aislada. **El revisor mira la app de
producción** —su nombre, descripción, URLs y permisos— y la contrasta con el video. Todo lo
de arriba hay que replicarlo acá, o el video y la ficha se contradicen.

- [x] **Las tres URLs en `tu-parrilla.cl`** y los cuatro scopes.
- [x] **URL properties verificadas** (2026-09-22): `tu-parrilla.cl` y
      `media-bucket.vicente-pareja.cl`. Queda un `https://www.vicente-pareja.cl/` como *URL
      prefix* del dominio viejo; es inofensivo pero se puede borrar.
- [x] **Texto de revisión** cargado, 991/1000. Dice desde la primera línea que el panel es
      por invitación, que es lo que el revisor va a ver en la escena 2.
- [ ] **Icono** subido también acá.
- [ ] **Limpiar los Redirect URIs.** Deben quedar solo los de `tu-parrilla.cl`: el
      formulario pide que el dominio del video coincida con el Web URL declarado, y tener
      `www.vicente-pareja.cl` o una URL de preview de Vercel en la lista lo contradice.
- [ ] **Misma descripción que el sandbox**, en inglés en las dos.
- [ ] **Borrar el video viejo.** Al 2026-09-22 seguía cargado
      `qir-mvfv-qfx (2026-08-26 ...).mp4`, que es **el que TikTok rechazó**. Si se envía así,
      el revisor vuelve a ver el video rechazado.

### Qué credenciales están desplegadas

El código usa **un solo par** (`TIKTOK_CLIENT_KEY` / `TIKTOK_CLIENT_SECRET`) y no distingue
sandbox de producción: la app que se abre al conectar es la dueña de esa llave. Para que la
demo corra en sandbox, el despliegue tiene que tener las **del sandbox**.

Como en Vercel son «Secret» y no se pueden releer, se comprueba así: pulsar **Conectar** en
Cuentas y leer el `client_key` de la barra de direcciones —el código lo pone en la URL de
autorización— y compararlo con el Client key del sandbox en el portal. Si cambias las
variables, hay que **redesplegar**: un cambio de variable no afecta a los despliegues ya
hechos.

### El ensayo, entero y sin grabar

Desde la mudanza a Supabase (2026-09-22) el camino de **escritura** al publicar no se ha
ejercitado: marcar el destino como publicando, guardar el `external_id`, pasar a publicado.
Lo que sí está verificado es la lectura, el `jsonb` de las opciones y la transición de
estado a nivel de base. El ensayo dejó de ser opcional.

- [ ] **Revocar la app desde TikTok** (Perfil → Ajustes y privacidad → Seguridad y permisos
      → Aplicaciones conectadas) **y desconectar TikTok en Cuentas**. Sin esto, la pantalla
      de permisos solo pide lo que aún no concediste y saldrían dos permisos en vez de cuatro.
- [ ] **Reconectar** y comprobar que la pantalla muestra los cuatro permisos.
- [ ] **Sincronizar** y ver los videos con contadores en Contenido.
- [ ] **Un video directo «Solo yo»**, un **carrusel de tres fotos** y un **borrador**.
- [ ] **Desconectar** y ver que la tarjeta desaparece.
- [ ] Borrar los posts de prueba de la parrilla.

### Justo antes de rodar

- [ ] **Revocar y desconectar otra vez**: el ensayo te dejó conectado.
- [ ] Media lista: un video vertical corto y tres fotos JPG o WebP.
- [ ] Ventana limpia: sin pestañas de más, sin notificaciones, sin datos de otra persona
      en pantalla.

Todo se graba entrando por **`tu-parrilla.cl`**: el código arma la URL de retorno con el
dominio que navegas, y TikTok exige que coincida con la Web URL declarada en el formulario.

## Texto de revisión (inglés)

Cabe en los 1000 caracteres del formulario.

```
Parrilla is a private dashboard for creators. There is no public signup: an admin invites an email and the person signs in with a six-digit code. Each creator connects their own accounts and sees only their own data.

Login Kit / user.info.basic: the creator authorizes their own TikTok account from Accounts. We keep open_id and display_name to label it; tokens are encrypted at rest.

Display API / video.list: a daily job reads that creator's own public videos and counters.

Content Posting API / video.publish: from the Calendar the creator schedules a video or photo carousel to their own account. We call creator_info first; the creator picks a privacy level from the returned options (never a default), sets comment, duet and stitch toggles (off by default) and the commercial disclosure, and sees the consent notice. Media is pulled from our verified domain.

video.upload: the same form sends the media to the creator's inbox as a draft instead.

We never read other people's data.
```

## Guion del video

Cuatro a cinco minutos, una sola toma, subtítulos en inglés. Entre corchetes, lo que dices
o rotulas; el resto es lo que haces.

**1. Quién eres y dónde corre esto.** La pestaña del sitio con su icono, y al lado Basic
Info con el mismo icono. La pestaña Sandbox con tu cuenta como target user.
*[Same icon on the website and in Basic Info. This demo runs in sandbox.]*

**2. El panel es privado.** Abre `/ingresar`. Escribe tu correo, pulsa el botón, muestra el
código que llega al correo, escríbelo, entra.
*[No public signup. An admin invites an email address; the person signs in with a six-digit
code. Each creator only ever sees their own data.]*

Esto es nuevo respecto del video anterior y conviene que se vea: explica de una sola vez por
qué no hay registro abierto y por qué nadie ve lo de otro.

**3. Login Kit — `user.info.basic`.** Ve a Cuentas. TikTok aparece sin conectar. Pulsa
Conectar. En la pantalla de permisos, **detente tres segundos** y deja leer los cuatro:
perfil, ver tus videos públicos, publicar, y cargar borrador. Si solo salen dos, es que no
revocaste la app desde TikTok: corta y empieza de nuevo, porque ahí se demuestran los cuatro
scopes de una sola vez. Autoriza. Vuelve y muestra la tarjeta con el nombre de la cuenta.
*[user.info.basic: we keep open_id and display_name to label the account. Tokens are
encrypted at rest.]*

**4. Display API — `video.list`.** Pulsa Sincronizar. Abre Contenido y muestra tus videos
con sus contadores, y la columna de visitas que cada uno trajo al sitio.
*[video.list is read-only, and only over the creator's own videos.]*

**5. Content Posting — `video.publish`, video.** Calendario, publicación nueva, sube el
video, marca TikTok. Enseña el bloque de opciones sin tocarlo: el nombre de la cuenta, la
privacidad **sin elegir**, las casillas de comentarios, dúo y pegar apagadas, el contenido
comercial y el aviso legal. Intenta programar sin elegir privacidad y deja ver que se
bloquea. Elige «Solo yo». Programa para dentro de un minuto. Espera la corrida: la etiqueta
pasa a publicando y luego a publicado. Abre TikTok y muestra el video en tu perfil, privado.
*[creator_info first. The privacy level is chosen by the creator, never defaulted. We poll
the publish status until it completes.]*

> **El pinger corre cada 5 minutos, no cada uno.** «Programa para dentro de un minuto» puede
> ser hasta cinco minutos de cámara esperando, en un video que dura cuatro o cinco. Programa
> este video y **haz la escena 6 mientras se publica**; cuando vuelvas, ya salió. La espera
> se llena con contenido en vez de con silencio, y la toma sigue siendo una sola.

**6. `video.publish`, fotos.** Lo mismo con tres fotos, más rápido, hasta verlas en el
perfil.
*[The same flow posts a photo carousel.]*

**7. `video.upload`, borrador.** Publicación nueva con un video, marca «Enviar como
borrador». Programa, espera, la etiqueta dice que está en tu bandeja de TikTok. Abre TikTok,
muestra la notificación y el borrador listo para editar.
*[video.upload sends the media to the creator's inbox as a draft, to finish in the app.]*

**8. Salir limpio.** En Cuentas, pulsa Desconectar: la tarjeta desaparece. Entra a los
ajustes de TikTok y revoca la app desde ahí también.
*[Disconnecting deletes the stored tokens. The creator can also revoke access from TikTok.]*

**9. Cierre** en `/privacidad`, enseñando qué se guarda y cómo se borra.

## Errores que ya costaron un rechazo

- El video anterior no mostraba el flujo **entero en sandbox**. Que se vea la pestaña de
  sandbox al principio.
- Había permisos pedidos y no demostrados. Los cuatro tienen su escena: 3, 4, 5 y 7.
- El icono no coincidía con el del sitio. Escena 1.
- Si el texto de revisión describe un panel de una sola persona y el video muestra un
  ingreso por correo con invitaciones, es una contradicción: por eso este texto lo dice
  desde la primera línea.
