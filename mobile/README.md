# Vicente · Números

Esta es la app para el celular de Vicente. Muestra, de un vistazo, los números de
sus redes (Instagram, Facebook, YouTube): seguidores, alcance, publicaciones
recientes y el detalle de cada post. Los datos son los mismos que ve el panel web,
leídos desde `https://www.vicente-pareja.cl/api/mobile/*`.

No se publica en Google Play ni en la App Store. Se instala directamente en el
teléfono desde un archivo `.apk` que se genera bajo pedido.

## Qué necesitas

Una cuenta gratuita en [expo.dev](https://expo.dev). Basta con registrarse una vez
con un correo; no cuesta nada y no requiere tarjeta.

## Cómo generar el instalable (`.apk`)

Cada vez que se quiera una versión nueva de la app (por ejemplo, después de un
cambio), hay que "construirla":

1. Abre una terminal en la carpeta `mobile/` de este proyecto.
2. Ejecuta:

   ```bash
   npx eas-cli build -p android --profile preview
   ```

3. La primera vez te va a pedir iniciar sesión con tu cuenta de Expo (el correo y
   la contraseña que creaste en expo.dev). Las veces siguientes ya queda
   recordado.
4. El comando se demora unos minutos (se construye en los servidores de Expo, no
   en tu computador). Al terminar, imprime un link (algo como
   `https://expo.dev/artifacts/eas/....apk`).

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

- No publica ni programa contenido: es solo para mirar números.
- No manda notificaciones (no avisa solo cuando hay un dato nuevo).
- No existe versión para iPhone, solo Android.
