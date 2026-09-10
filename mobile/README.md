# Vicente · Números

Esta es la app para el celular de Vicente. Muestra, de un vistazo, los números de
sus redes (Instagram, Facebook, YouTube): seguidores, alcance, publicaciones
recientes y el detalle de cada post, y desde la versión 1.1 también **publica**:
eliges fotos o un video de la galería, escribes el texto, marcas las redes y lo
programas, o lo mandas a salir ahora. Los datos son los mismos que ve el panel web,
leídos desde `https://www.vicente-pareja.cl/api/mobile/*`.

No se publica en Google Play ni en la App Store. Se instala directamente en el
teléfono desde un archivo `.apk` que se genera bajo pedido.

## Qué necesitas

Una cuenta gratuita en [expo.dev](https://expo.dev). Basta con registrarse una vez
con un correo; no cuesta nada y no requiere tarjeta.

## Cómo generar el instalable (`.apk`)

Solo hace falta cuando cambia algo **nativo** de la app (un módulo nuevo, la versión
en `app.json`). Los cambios de pantalla y de lógica llegan solos, ver la sección
siguiente.

1. Abre una terminal **dentro de la carpeta `mobile/`** de este proyecto. Todos los
   comandos de abajo se corren ahí; corridos desde la raíz crean archivos sueltos
   que no sirven.
2. **La primera vez en un computador**, inicia sesión con tu cuenta de Expo:

   ```bash
   npx eas-cli login
   ```

   El proyecto ya está creado y vinculado en la cuenta `vicentepareja` (se hizo el
   2026-09-10 con `eas init` y `eas update:configure`; `app.json` guarda el id). No
   hay que volver a hacerlo.
3. Ejecuta:

   ```bash
   npx eas-cli build -p android --profile preview
   ```

4. El comando sube el proyecto y lo construye en los servidores de Expo, no en tu
   computador. En el plan gratis puede pasar un rato en cola antes de empezar; en
   total suele ser entre diez y treinta minutos. Al terminar, imprime un link (algo
   como `https://expo.dev/artifacts/eas/....apk`). Si cerraste la terminal, el
   mismo link aparece en
   [expo.dev/accounts/vicentepareja/projects/vicente-numeros/builds](https://expo.dev/accounts/vicentepareja/projects/vicente-numeros/builds).

## Cómo mandar un cambio sin reinstalar

Cuando cambia una pantalla o la lógica (no un módulo nativo), basta con:

```bash
npx eas-cli update --channel preview --message "qué cambió"
```

La app lo descarga la próxima vez que se abre y lo aplica en la apertura siguiente.
Solo llega a los teléfonos que tengan instalada la misma versión de `app.json`; si
subiste la versión, hay que generar el APK de nuevo.

## Cómo instalarla en el teléfono

1. Abre ese link **desde el navegador del teléfono** (no hace falta cable ni
   computador: puedes mandarte el link por WhatsApp o correo y abrirlo ahí mismo).
2. El teléfono va a descargar un archivo `.apk` y, al abrirlo, Android va a pedir
   permiso para "instalar apps desconocidas" (porque no viene de Google Play).
   Se acepta una vez; queda guardado para la próxima.
3. Termina la instalación como cualquier app. Va a aparecer un ícono llamado
   "Vicente · Números".

## Cómo entrar

La primera vez que se abre, pide la **misma contraseña del panel web**. Se escribe
una sola vez: después la sesión queda abierta. Si el teléfono tiene huella
digital o PIN configurado, la app usa ese candado para protegerse cada vez que se
abre — no hay que volver a escribir la contraseña.

## Cómo publicar desde el teléfono

En la pestaña **Publicar**:

1. Escribe el texto. En YouTube, el primer renglón es el título del video.
2. Toca **Fotos o video** y elige de la galería (hasta diez archivos; un video de
   hasta 500 MB).
3. Marca las redes. Instagram viene marcada.
4. Toca **Cuándo** para elegir día y hora, y luego **Programar**. O toca
   **Publicar ahora**: confirma, y sale en los próximos cinco minutos.

La subida muestra el avance de cada archivo. Si se corta la señal, **Reintentar**
retoma desde el archivo que falló, sin volver a subir los anteriores. Al terminar, la
app salta al Calendario con el post recién programado.

Lo que no se puede hacer desde el teléfono, y sigue siendo del panel web: poner una
portada, etiquetar con atributos, y editar o borrar lo ya programado.

## Si se pierde el teléfono

Para revocar el acceso de un teléfono perdido o robado, sin tener que hacer nada
más:

1. Entra al proyecto en Vercel.
2. Sube en 1 la variable de entorno `MOBILE_TOKEN_VERSION` (por defecto vale `1`;
   súbela a `2`).
3. Eso invalida de inmediato todas las sesiones de la app ya abiertas en
   cualquier teléfono — van a pedir la contraseña de nuevo la próxima vez que se
   abran.

Este paso **no afecta** las conexiones con Instagram, Facebook o YouTube: no hace
falta volver a autorizar nada de eso, solo se cierra el acceso desde el celular.

## Qué no hace todavía

- No pone portada ni atributos, y no edita lo ya programado: eso sigue en el panel.
- No manda notificaciones (no avisa solo cuando hay un dato nuevo).
- No existe versión para iPhone, solo Android.
