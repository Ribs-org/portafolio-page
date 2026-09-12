# Entrega continua — una reja antes de producción y la app que se actualiza sola

Fecha: 2026-09-11
Estado: aprobado, pendiente de plan de implementación

Se apoya en lo que ya existe: el repositorio público en GitHub, el despliegue automático de
Vercel desde `main`, y la app Android en Expo con su proyecto de EAS, sus dos perfiles de
build y su canal de actualizaciones ya configurados.

Es la primera vez que este proyecto tiene automatización propia. Hasta hoy, los 443 tests,
el typecheck, el lint y el build los corre una persona a mano antes de fusionar.

## Problema

Dos agujeros, uno grande y uno molesto.

El grande: **nada mira producción antes de que se despliegue**. Vercel despliega cada fusión
a `main` sin correr una sola prueba. Que hasta hoy no haya salido nada roto es mérito del
proceso manual, no del sistema.

El molesto: **poner una función nueva en el teléfono es un trámite**. Hay que construir un
binario, esperarlo, descargarlo, instalarlo a mano. Eso hace que la app quede atrás del
sitio sin que nadie lo decida.

## Objetivo

Que fusionar un pull request sea la única acción necesaria: que nada roto pueda llegar a
producción, y que la app del teléfono tenga la función nueva la próxima vez que se abra.

## No objetivos (de esta versión)

- **Publicar en la tienda pública de Google.** La cuenta es personal y nueva, así que
  producción exige doce probadores durante catorce días. Para un panel privado no tiene
  sentido; se usa la pista de pruebas internas, que está exenta.
- **Quitarle el despliegue a Vercel.** Ver «Decisiones tomadas».
- **iOS.** La app es solo Android por ahora.
- **Enviar un binario a la tienda en cada fusión.** La mayoría de las entregas no tocan nada
  nativo, así que el envío se dispara a mano.
- **Entornos de staging.** Un sitio, una base, un teléfono.

## Decisiones tomadas

| Decisión | Alternativa descartada | Razón |
|---|---|---|
| Proteger `main` y exigir la reja verde | Apagar el despliegue automático de Vercel y desplegar desde el flujo de trabajo | La garantía es la misma —a `main` solo llega lo que pasó— con mucha menos máquina. La alternativa pide un token de Vercel que administrar, pierde los despliegues de vista previa de cada pull request, y agrega un modo de fallo nuevo: el flujo caído deja sin poder desplegar |
| Pista de pruebas internas | La tienda pública | Exenta de la regla de los doce probadores, admite cien invitados por correo, y nadie la encuentra buscando, que es lo correcto para un panel con números propios |
| Actualizaciones por aire para el día a día | Solo la tienda | Casi todo lo que se construye es JavaScript. Por aire llega en minutos; por la tienda, en horas y con revisión de Google de por medio |
| La versión de ejecución se calcula desde la huella de lo nativo | Atada al número de versión, como está hoy | Hoy subir de 1.1.0 a 1.2.0 corta las actualizaciones por aire de las instalaciones existentes. Con la huella, un cambio de JavaScript sigue llegando y uno nativo pide binario nuevo solo |
| La app espera un momento al arrancar | Aplicar en el arranque siguiente, que es lo que hace por defecto | Con el comportamiento por defecto abres la app, ves lo viejo, la cierras y la vuelves a abrir. Para una app que se abre pocas veces al día, un instante de espera compra que la primera vez ya tenga lo nuevo |
| El envío a la tienda se dispara a mano | En cada fusión; en cada etiqueta de versión | Un envío por cambio sería ruidoso y lento sin ganar nada. Y disparado a mano se puede lanzar desde la app de GitHub en el teléfono, con dos toques y sin computador |
| La versión de Node fijada en un archivo | Dejarla implícita | Hoy no está escrita en ninguna parte: la máquina local, Vercel y el flujo de trabajo podrían no coincidir y nadie se enteraría hasta que algo falle solo en uno de los tres |

## 1. La reja

`.github/workflows/ci.yml`, disparado por cada pull request contra `main`. Dos trabajos en
paralelo:

**`sitio`** instala desde el archivo de bloqueo y corre, en este orden: `npm test`,
`npm run typecheck`, `npm run lint` y `npx next build`. El build entra aunque sea el paso
lento porque atrapa lo que el typecheck no ve, como una página que revienta al renderizarse.

Corre **sin ninguna credencial**. El código ya está escrito para eso: `getDb()` crea la
conexión perezosamente, con el comentario que dice que es «para que `next build` no se caiga
antes de que la base exista», y `env()` devuelve `undefined` sin lanzar. Si algún día un
paso necesitara un valor, se le pasa uno falso, nunca un secreto real.

**`app`** corre siempre, en cada pull request contra `main`, sin filtro por ruta. Instala en
`mobile/` y comprueba tipos, que hoy no lo mira nadie. Una comprobación obligatoria que no
llega a correr por un filtro de rutas deja el pull request esperándola para siempre, y el
repositorio es público, así que los minutos son gratis.

Node se fija en un `.nvmrc` en la raíz, y el flujo de trabajo lo lee de ahí en vez de
repetir el número. La versión es la 24, que es la que usan hoy la máquina local y Vercel.

### La protección de `main`

Configuración de GitHub, no código, y por eso va documentada en el README:

- No se puede empujar directo a `main`. Todo entra por pull request.
- Los dos trabajos de la reja son comprobaciones obligatorias.
- La rama tiene que estar al día con `main` antes de fusionar, para que la reja haya corrido
  sobre el código que realmente va a quedar.

Con eso Vercel no necesita esperar nada: lo que llega a `main` ya pasó.

## 2. La actualización por aire

`.github/workflows/app-por-aire.yml`, disparado al empujar a `main` cuando el cambio tocó
`mobile/`. Publica la actualización al canal de producción de EAS, que es el que usa el
binario que está instalado.

Necesita un token de Expo guardado como secreto del repositorio, `EXPO_TOKEN`. Es la única
credencial nueva de esta entrega.

El flujo no corre tests: la reja ya los corrió sobre ese mismo código antes de dejarlo
fusionar. Repetirlos sería pagar dos veces por la misma respuesta.

### Que la espere al arrancar

Por defecto Expo descarga la actualización en segundo plano y la aplica en el arranque
siguiente. Se cambia para que la app espere un momento acotado al arrancar y, si alcanzó a
bajarla, la use de inmediato. Si no alcanza, sigue con la que tenía y la aplicará después:
nunca se queda esperando indefinidamente ni muestra una pantalla en blanco.

El plan de implementación fija la clave exacta y el número de milisegundos contra la versión
de `expo-updates` que esté instalada, no contra la documentación de otra versión.

## 3. La versión de ejecución

En `app.json`, la política pasa de estar atada al número de versión a calcularse desde la
huella de lo nativo.

Con eso: un cambio de JavaScript conserva la misma huella, así que la actualización llega
por aire aunque hayamos subido el número de versión. Un cambio que agregue una librería
nativa cambia la huella, esa actualización deja de alcanzar a los binarios viejos, y el
sistema mismo nos dice que toca binario nuevo, sin que nadie tenga que acordarse.

**Costo de una sola vez:** la instalación que hay hoy en el teléfono quedará en la versión de
ejecución vieja y dejará de recibir actualizaciones por aire. Hay que instalar un binario
nuevo una vez. Después de eso, nunca más.

Ese binario lo produce la entrega 2 con un build de vista previa lanzado a mano, el mismo
APK que ya se usó para instalar la app la primera vez. No espera a la entrega 3: si
esperara, el cambio de la versión de ejecución dejaría el teléfono sin actualizaciones
durante todo el tiempo que tarde el trámite de Google, que es justo lo contrario de lo que
esta entrega busca.

## 4. La Play Store

### Lo que hay que hacer una vez, fuera del repositorio

Cuenta de desarrollador de Google Play: 25 dólares una vez, más una verificación de
identidad que puede tardar días. Después, crear la app en la consola y completar los
formularios obligatorios: clasificación de contenido, seguridad de datos y política de
privacidad. El paso a paso vive en `docs/play-store.md`.

Una **cuenta de servicio de Google** con permiso para publicar. Su archivo JSON **nunca entra
al repositorio**: se sube una sola vez al almacén de credenciales de EAS.

### Lo que cambia en el repositorio

`eas.json` gana un perfil de envío que apunta a la **pista interna**, y el perfil de build de
producción gana el incremento automático del número interno de versión, que Google exige que
suba en cada binario y que es una causa clásica de envíos rechazados.

`.github/workflows/app-tienda.yml` se dispara **a mano**. Construye el paquete de producción
y lo envía a la pista interna en un solo paso. Al ser disparado a mano, se puede lanzar desde
la app de GitHub en el teléfono.

### Cómo se instala

Te agregas como probador con tu correo, aceptas la invitación, y la instalas desde la Play
Store. Desde ahí se actualiza como cualquier app del teléfono cuando sube un binario nuevo, y
por aire cuando el cambio es solo JavaScript.

## Manejo de errores

**La reja falla:** no se puede fusionar. Es la función, no un fallo. El pull request muestra
qué paso falló y con qué salida.

**La publicación por aire falla:** la app sigue con lo último que recibió. Nadie queda con la
pantalla en blanco. El fallo se ve en la pestaña de acciones del repositorio.

**Una actualización sale mala:** se revierte con un comando de EAS y el teléfono vuelve a la
anterior en el arranque siguiente. Con la reja delante es poco probable, porque los tests ya
corrieron sobre ese código.

**El envío a la tienda falla:** no afecta nada de lo que ya está instalado ni al sitio. Se
vuelve a lanzar cuando se corrija la causa.

## Testing

Los flujos de trabajo no se prueban con tests: se prueban usándolos. La verificación de cada
entrega es un pull request de prueba que los haga correr de verdad, uno que pase y uno que
falle a propósito, para comprobar que la reja bloquea y no solo decora.

## Secretos nuevos

| Secreto | Dónde vive | Para qué |
|---|---|---|
| `EXPO_TOKEN` | Secretos del repositorio en GitHub | Publicar la actualización por aire y lanzar builds |
| Cuenta de servicio de Google | Almacén de credenciales de EAS | Enviar el paquete a la Play Store |

Ninguno entra al repositorio. El de Expo se puede revocar y regenerar desde la cuenta de
Expo sin tocar nada más.

## Costos

GitHub Actions es gratis: el repositorio es público. EAS tiene un plan gratuito que alcanza
para el ritmo al que se construyen binarios, que es raro; las actualizaciones por aire, que
son lo que se usa a diario, son generosas. Google Play, 25 dólares una vez.

## Las entregas

| # | Entrega | Qué toca | Depende de ti |
|---|---|---|---|
| 1 | La reja | `ci.yml`, `.nvmrc`, README, y la protección de `main` en GitHub | nada |
| 2 | La actualización por aire | `app-por-aire.yml`, la versión de ejecución, la espera al arrancar, y un APK nuevo para instalar una vez | el `EXPO_TOKEN` |
| 3 | La Play Store | el perfil de envío, `app-tienda.yml`, `docs/play-store.md` | la cuenta creada y verificada |
