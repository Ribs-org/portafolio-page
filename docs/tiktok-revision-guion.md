# TikTok: qué grabar y qué escribir en la revisión

Fecha: 2026-09-17. Reemplaza al guion de
`docs/superpowers/specs/2026-09-15-publicar-en-tiktok-design.md`, escrito cuando Parrilla
era el panel de una sola persona. Ahora es multiusuario por invitación, y el texto de
revisión tiene que decirlo: el revisor va a ver una pantalla de ingreso por correo.

## Antes de apretar grabar

Nada de esto depende del código; si falta algo, el video se cae solo.

- [ ] **Sandbox activo** con tu cuenta como *target user*, y sus credenciales en el
      despliegue donde vas a grabar. La revisión exige que la demo corra en sandbox.
- [ ] **Icono** subido en Basic Info, el mismo que se ve en la pestaña del navegador.
- [ ] **URL properties verificadas**: el dominio del sitio y el subdominio de R2 del que
      TikTok descarga la media. Sin eso, `PULL_FROM_URL` falla a mitad del video.
- [ ] **TikTok reconectado en Cuentas**. El token viejo no tiene `video.upload` ni
      `video.publish`; hasta que reconectes, el compositor te lo dice.
- [ ] **Un ensayo completo sin grabar**: un video directo, un carrusel de tres fotos y un
      borrador. Si algo falla, falla ahí y no delante de la cámara.
- [ ] Media lista: un video vertical corto y tres fotos JPG o WebP.
- [ ] Ventana limpia: sin pestañas de más, sin notificaciones, sin datos de otra persona
      en pantalla.

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
Conectar. En la pantalla de permisos, **detente** y deja leer los cuatro permisos. Autoriza.
Vuelve y muestra la tarjeta con el nombre de la cuenta.
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
