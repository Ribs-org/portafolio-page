# Publicar la app en la Play Store — paso a paso

Este documento es para ti, no para el código. Son los trámites que hay que hacer una vez en
la consola de Google para que «Vicente · Números» se instale desde la Play Store y se
actualice como cualquier otra app del teléfono.

**La app va a la pista de pruebas internas, no a la tienda pública.** Nadie la va a encontrar
buscando. Es lo correcto para un panel con tus números, y además evita la regla de Google que
exige doce probadores durante catorce días para publicar en producción desde una cuenta
personal nueva.

Tiempo total de trabajo tuyo: alrededor de una hora, repartida. La espera real es la
verificación de identidad, que Google puede tardar días en resolver.

---

## Parte 1 — La cuenta (empieza por acá, tiene espera)

1. Entra a [play.google.com/console](https://play.google.com/console) con la cuenta de
   Google que quieras que sea la dueña de la app. **Elígela con cuidado: mover una app a otra
   cuenta después es un trámite largo.**
2. Elige el tipo de cuenta **personal**. La de organización pide una entidad legal y un
   número D-U-N-S; no lo necesitas.
3. Paga los **25 dólares**. Es un cobro único, no una suscripción.
4. Completa la **verificación de identidad**: Google pide un documento y, a veces, una
   dirección. Aquí es donde se va el tiempo. Puede resolverse en horas o tardar varios días.

No sigas hasta que la cuenta aparezca verificada. Los pasos siguientes no se dejan completar
sin eso.

---

## Parte 2 — Crear la app

1. En la consola, **Crear app**.
2. Nombre: `Vicente · Números`. Es el que se ve en el teléfono.
3. Idioma predeterminado: español.
4. Marca que es una **app**, no un juego, y que es **gratuita**.
5. Acepta las declaraciones de políticas y de leyes de exportación.

Al crearla, Google te deja en un panel con una lista de tareas pendientes. Las de la sección
siguiente son las obligatorias.

---

## Parte 3 — Los formularios obligatorios

Google no deja publicar nada, ni siquiera a la pista interna, hasta que estén completos.
Ninguno es largo para una app como esta.

### Política de privacidad

Pide una **URL pública**. Tu sitio ya tiene páginas legales, así que probablemente ya existe;
si no, hay que publicar una. Tiene que decir qué datos recoge la app y qué se hace con ellos.

En tu caso la respuesta honesta y corta es: la app no recoge datos de nadie más que de ti,
guarda tu sesión en el almacenamiento seguro del teléfono, y habla únicamente con tu propio
sitio.

### Seguridad de los datos

Un cuestionario sobre qué recoge la app y si lo comparte. Para esta app:

- **¿Recoge o comparte datos de usuarios?** Sí, pero solo los que tú mismo produces.
- **Tipos de datos:** archivos y documentos, por las fotos y videos que eliges para publicar.
- **¿Se comparten con terceros?** No. Van a tu propio servidor.
- **¿Se cifran en tránsito?** Sí, todo va por HTTPS.
- **¿Puede el usuario pedir que se borren?** Sí, tú controlas la base.

Responde según lo que la app realmente hace. Si aquí mientes y Google lo detecta, la
suspensión es de la cuenta, no de la app.

### Clasificación de contenido

Un cuestionario con un correo de contacto. Para una herramienta de productividad sin
contenido generado por terceros, la clasificación sale apta para todo público y toma dos
minutos.

### Público objetivo

Marca **mayores de 18**. Evita las obligaciones extra que Google impone a las apps que
pueden llegar a menores.

### App de acceso restringido

Hay una sección donde declaras si la app requiere credenciales para funcionar. Marca que sí,
y explica en una línea que es una herramienta privada de una sola persona. Si Google pidiera
credenciales de prueba para revisarla, dale una cuenta de prueba, **nunca la tuya**.

---

## Parte 4 — La cuenta de servicio

Esto es lo que le permite a EAS subir binarios sin que tú entres a la consola cada vez.

1. En Play Console, ve a **Configuración → Acceso a la API**.
2. Vincula un proyecto de Google Cloud. Si no tienes uno, la misma pantalla te deja crearlo.
3. Crea una **cuenta de servicio**. Google te lleva a la consola de Cloud para hacerlo.
4. En Cloud, dentro de esa cuenta de servicio, crea una **clave JSON** y descárgala.
5. Vuelve a Play Console y **concédele acceso** a esa cuenta de servicio sobre tu app, con
   permiso para publicar versiones.

**Ese archivo JSON es una credencial.** No lo guardes en el repositorio, no lo pegues en un
chat y no lo mandes por correo. Cuando lo tengas, avísame y lo subimos al almacén de
credenciales de EAS, que es donde tiene que vivir.

---

## Parte 5 — El primer binario

El primero hay que subirlo con más ceremonia que los siguientes, porque Google necesita
existir la ficha antes de aceptar envíos automáticos.

1. Yo lanzo el build de producción desde EAS y te paso el archivo `.aab` cuando esté listo.
2. En Play Console, ve a **Pruebas → Pruebas internas** y crea una versión.
3. Sube ese archivo.
4. En las notas de la versión, escribe cualquier cosa corta. Es obligatorio y nadie más lo
   va a leer.
5. Revisa y publica.

Google revisa incluso las versiones internas, pero es rápido: normalmente minutos, a veces
unas horas.

---

## Parte 6 — Instalarla

1. En **Pruebas internas → Probadores**, crea una lista y agrega **tu propio correo de
   Google**, el mismo con el que entras a la Play Store en tu teléfono.
2. Copia el **enlace de participación** que aparece ahí.
3. Ábrelo en el teléfono y acepta ser probador.
4. El enlace te lleva a la ficha de la app en la Play Store. Instálala desde ahí.

Desde este momento la app se comporta como cualquier otra del teléfono: se actualiza sola
cuando subimos un binario nuevo, y por aire —en minutos, sin pasar por Google— cuando el
cambio es solo JavaScript, que es la mayoría.

---

## Qué pasa después, cada vez

De aquí en adelante casi nunca vas a volver a esta consola.

- **Cambio de JavaScript**, que es casi todo: se fusiona el pull request y la actualización
  llega sola al teléfono. No toca la tienda.
- **Cambio nativo**, que es raro: lanzas el flujo de la tienda desde la app de GitHub en el
  teléfono, con dos toques. EAS construye el binario, lo envía a la pista interna, y Google
  lo distribuye.

---

## Errores comunes, para que no te agarren

**«Version code ya usado».** Google exige que cada binario suba un número interno. EAS lo
incrementa solo una vez configurado; si algún día ves este error, es que esa configuración se
perdió.

**La app no aparece en la Play Store del teléfono.** Casi siempre es que el correo de la lista
de probadores no es el mismo con el que iniciaste sesión en la tienda. También puede tardar
unos minutos en aparecer después de aceptar la invitación.

**«Tu app no cumple con la política de datos».** Algún formulario de la Parte 3 quedó
incompleto o dice algo distinto a lo que la app hace.

**La cuenta queda en verificación para siempre.** Pasa. Google tiene un formulario de soporte
para eso; insiste por ahí y no creando una cuenta nueva, que empeora las cosas.
