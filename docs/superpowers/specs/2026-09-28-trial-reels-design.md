# Trial reels en Instagram — diseño

**Fecha:** 2026-09-28.

**En una frase:** que un reel de Instagram pueda salir como *trial reel* —visible solo para
quienes no siguen la cuenta, hasta que el dueño lo comparta con todos desde Instagram—,
elegible por destino desde el compositor, la API, el CSV y el teléfono, y documentado para
que un LLM lo use sin adivinar.

Se apila sobre «El documento por privado» (`2026-09-26-documento-por-privado-design.md`): la
documentación para LLM que esta entrega extiende nació ahí.

---

## 1. Qué ya existe (leer antes de diseñar nada encima)

- **Las opciones por destino.** `src/lib/social/publish/opciones.ts` define lo que una red
  obliga a elegir antes de publicar. Hoy solo TikTok pide algo; la unión `OpcionesDestino`
  crece red por red y el resto del sistema solo transporta el objeto. Se guarda en
  `scheduled_post_targets.opciones` (`jsonb`), **por destino y no por post**, porque con dos
  cuentas de la misma red cada una puede pedir algo distinto. El editor de un post programado
  las muestra (`resumenOpciones`) pero no las cambia.
- **Cómo llegan.** El compositor web las manda con el id de la cuenta como sufijo del campo
  (`tiktokModo:<id>`) y `opcionesDesdeFormularioPorCuenta` las arma. La API y el CSV las
  reciben en `opciones`, un objeto cuya clave es el id de la cuenta o el nombre de la red
  cuando la fila tiene exactamente una de esa red (`opcionesDeFila`, `batch.ts`). El teléfono
  **no manda opciones**: por eso TikTok no se ofrece desde ahí.
- **El publicador de Instagram.** `src/lib/social/publish/instagram.ts`. Un video suelto crea
  un contenedor `REELS` (`reelContainerParams`), lo deja procesando y el cron siguiente
  consulta `status_code` antes de publicarlo. Recibe `input.opciones` y hoy lo ignora.
  Cualquier respuesta no-ok de Graph se registra y se convierte en `PUBLISH_NETWORK_ERROR`
  («No se pudo hablar con la red. Se reintentará.»), que gasta un intento de los tres.
- **Las reglas de forma por red.** `validateScheduleDraft` (`validate.ts`) decide por red y
  por conteo de archivos; la regla de media de TikTok vive ahí. La aplican el lote, el
  compositor y las dos rutas del teléfono (`check` antes de subir, `schedule` al crear).
- **El teléfono.** `mobile/src/app/(tabs)/publicar.tsx` elige archivos y cuentas (chips con
  red y handle, `CuentaApp` trae `red`), y manda `{ texto, cuentas, cuando, ahora }` más la
  media. `parseBorradorMovil` (`src/lib/mobile-api.ts`) es la parte del cuerpo que comparten
  el chequeo y la creación.

## 2. Lo que Instagram permite, y lo que no dice

Al crear el contenedor de un reel, Graph acepta `trial_params`, un objeto JSON con
`graduation_strategy`: `MANUAL` (el reel queda en prueba hasta que el dueño lo comparte con
todos **desde la app de Instagram**) o `SS_PERFORMANCE` (Instagram lo comparte solo si rinde
bien en las primeras ~72 horas). Solo aplica a un reel —un video suelto—, no a fotos ni
carruseles. No admite colaboradores; este sistema nunca los manda.

**Lo que Meta no documenta**, y que sale de terceros, así que se trata como probable y no como
seguro: la cuenta tiene que ser profesional, pública y con al menos mil seguidores —o, dicho
al revés, Instagram tiene que haberle habilitado la función—; hay un tope de unos veinte
trial reels al día por API; y **no hay forma de leer después por API si el reel se graduó**.

**Decisión del dueño (2026-09-28): siempre `MANUAL`.** Él decide desde Instagram cuándo
compartirlo; si más adelante quiere que decida Instagram, es un campo opcional (sección 3),
no una reestructura.

## 3. El contrato

**El modelo.** `OpcionesDestino` crece con `OpcionesInstagram = { trialReel: true }`. Sin
migración: es el mismo `jsonb`. `validarOpciones('instagram', raw)` sigue la gramática de
TikTok:

| Entra | Sale |
|---|---|
| ausente, `null`, o `{ trialReel: false }` | `null` — reel normal, no se guarda nada |
| `{ trialReel: true }` | `{ trialReel: true }` |
| cualquier otra forma | `Las opciones de la red no se entendieron.` (frase existente) |

`trialReel: false` se acepta a propósito: un teléfono o un modelo que manda el interruptor
apagado no tiene por qué recibir un error de forma. La graduación **no viaja**: el publicador
manda `MANUAL` siempre. El día que se quiera lo otro: `graduacion?: 'manual' | 'automatica'`
con `manual` por defecto, y lo ya guardado sigue valiendo.

**La regla de media, nueva y pura.** Un trial reel es exactamente un video, sin fotos. Frase
fija: `Un trial reel es un solo video, sin fotos.` Depende de la opción y no de la red, así que
no cabe en `validateScheduleDraft` tal como está: es una función aparte que recibe las
opciones resueltas por cuenta y los conteos, y la llaman los cuatro caminos —lote, compositor,
chequeo y creación del teléfono—. Se rechaza al programar, antes de subir un byte.

**API y CSV.** Sin campo nuevo. `opciones` ya existe y la clave se resuelve con la regla que
un modelo ya conoce:

```json
"opciones": { "instagram": { "trialReel": true } }
```

o, con dos cuentas de Instagram en la fila, por id de cuenta. En el CSV es el mismo JSON en la
sexta columna.

**Portada.** Se sigue mandando `cover_url` cuando la hay. Que conviva con `trial_params` no
está documentado; es un punto abierto (sección 10).

## 4. El publicador y sus errores

Con `trialReel` en el destino, `reelContainerParams` suma
`trial_params={"graduation_strategy":"MANUAL"}` (form-encoded, como todo lo demás que va a
`/media`). Nada más cambia: mismo camino asíncrono, misma consulta de `status_code`, misma
portada.

**La elegibilidad solo se descubre al publicar.** No hay API para preguntar «¿esta cuenta
puede?»: Meta dice que no al crear el contenedor. Hoy ese rechazo caería en
`PUBLISH_NETWORK_ERROR` y se reintentaría tres veces con una frase que miente («se
reintentará» a un servidor que ya contestó que no). Así que `postForm` deja de devolver
`null` a secas ante un no-ok: devuelve el cuerpo del error de Graph, y `publish` lo mira. Si es
un rechazo por trial reel, el destino falla **en ese mismo intento**, sin gastar los otros dos
(`resolveOutcome` lo distingue con `definitivo: true`: Meta ya decidió que no, así que
reintentarlo no cambiaría la respuesta), con la frase fija

```
Instagram no permite trial reels en esta cuenta.
```

Un rechazo que Graph redacte sin la palabra «trial» —Meta la cambia, o rechaza por otra razón
que no la usa— no se reconoce como definitivo: sigue el trato genérico de siempre,
`PUBLISH_NETWORK_ERROR` reintentado hasta tres veces. Todo lo demás sigue exactamente como hoy.

**No se convierte el trial en reel normal por cuenta propia.** Eso publicaría a los seguidores
algo que el dueño pidió esconder. Falla a la vista. El editor no deja apagar la opción, y
«Reintentar» conserva `opciones` y vuelve a pedir el mismo trial reel: la única forma de
mandarlo como reel normal hoy es borrar el post y programar otro sin la opción.

**Una debilidad escrita, no disimulada:** Meta no documenta qué código devuelve ese rechazo.
La detección va por el texto del error (`trial` en el mensaje). Si Meta cambia la frase, el
fallo vuelve a verse como el genérico: no se pierde nada, se explica peor. El intento de
aprendizaje queda en el log del servidor, que registra el cuerpo completo.

## 5. Las superficies

**Compositor web.** Con una cuenta de Instagram marcada y **exactamente un video** adjunto,
aparece un bloque por cuenta —el mismo lugar y forma que el de TikTok— con un interruptor:
«Publicar como trial reel». Debajo, una línea: *solo lo ven quienes no te siguen; tú decides
desde Instagram cuándo compartirlo con todos.* Con fotos, carrusel o sin video, el bloque no
aparece. El campo se llama `instagramTrial:<id>`. El editor de un post programado lo muestra
como «Trial reel — lo compartes tú desde Instagram» y no lo cambia.

**Teléfono.** La primera opción por destino que aprende a pedir. Bajo los chips, con una
cuenta de Instagram marcada y un solo video elegido, un interruptor por cuenta: «Trial reel ·
@handle». El cuerpo gana `opciones`, un objeto llaveado por id de cuenta, y `parseBorradorMovil`
lo acepta con la misma forma laxa que `cuentas`; la validación de fondo la hace el servidor con
`validarOpcionesPorCuenta` **después** de `resolverDestinos`, porque la red que cuenta es la
de la cuenta real. Las dos rutas —`check` y `schedule`— aplican lo mismo, el chequeo antes de
subir un byte.

**Una app vieja no manda `opciones` y publica reels normales.** No se rompe nada, así que el
orden de despliegue es el de siempre: web primero, `eas update` a los dos canales
inmediatamente después.

**`mobile/README.md` cambia con el cambio.** Hoy dice que TikTok no se ofrece desde el
teléfono porque «no hay dónde pedir sus opciones por publicación». Después de esto sí hay
dónde: la razón cierta pasa a ser que el bloque de TikTok necesita consultar `creator_info`
y sus interacciones, y eso el teléfono todavía no lo tiene.

## 6. Errores y casos borde

| Caso | Respuesta |
|---|---|
| `trialReel: true` con fotos, carrusel o sin video | La fila falla al programar: `Un trial reel es un solo video, sin fotos.` |
| `opciones` de Instagram con otra forma | `Las opciones de la red no se entendieron.` |
| `trialReel: true` en un destino que no es Instagram | Misma frase de forma: esa red no pide eso |
| La cuenta no puede hacer trial reels | Falla **al publicar**, ese destino, con `Instagram no permite trial reels en esta cuenta.` |
| Dos cuentas de Instagram, trial solo en una | Correcto: la opción es por destino |
| El reel se graduó (o no) | No se sabe por API; el panel lo muestra como publicado y marcado trial reel |
| Un teléfono viejo | No manda `opciones`: reel normal |

## 7. La documentación para LLM

`public/docs/api-editor.md` (personas) y `public/docs/api-llm.md` + `public/docs/api.json`
(máquina) ganan la forma de `opciones` para Instagram y la frase nueva. Y tres cosas que un
modelo tiene que saber para no prometer de más, escritas donde las va a leer:

1. Solo aplica a **un video**.
2. La elegibilidad se descubre **al publicar**, no al programar: una fila aceptada puede
   fallar después en ese destino, con su frase.
3. **Después no hay forma de saber por API si se graduó.** Eso se mira en Instagram.

`src/lib/docs-api.test.ts` gana la frase nueva en la lista que ata la guía a las constantes.

## 8. Pruebas

Puras: `validarOpciones('instagram', …)` con su tabla; la regla de media; `reelContainerParams`
con y sin trial (el JSON exacto de `trial_params`); el mapeo del error de Graph; y
`resumenOpciones('instagram', …)`.

De integración: una fila del lote con `trialReel` y un video guarda `{ trialReel: true }` en su
destino; con fotos se rechaza **antes** de subir media (la mutación de mover la comprobación
después tiene que hacer caer el test). La ruta y el chequeo del teléfono aceptan y rechazan lo
mismo. De documentación: la frase existe como constante.

## 9. Fuera de alcance

- Que Instagram decida la graduación (`SS_PERFORMANCE`). Decisión del dueño; sección 3 deja
  el sitio.
- Saber después si un trial reel se graduó. No hay API.
- Cambiar la opción en el editor de un post ya programado. Regla existente para todas las
  opciones.
- Traer TikTok al teléfono. Esta entrega abre la puerta (el teléfono aprende a mandar
  `opciones`); TikTok necesita además su consulta de creador.

## 10. Puntos abiertos, para verificar al implementar

Tres cosas que no se pueden saber sin una cuenta con la función habilitada. Se verifican al
implementar si se puede, y si no, quedan escritas en `docs/deuda-tecnica.md` con lo que
costaría comprobarlas:

1. **`trial_params` con `cover_url`.** No documentado. Si Meta lo rechaza, la portada de un
   trial reel se omite y se dice.
2. **Si el sync de métricas ve un trial reel.** No aparece en el perfil hasta graduarse; puede
   que `GET /{ig-user-id}/media` tampoco lo liste. Si es así, el post publicado no tendrá
   números hasta que se gradúe, y eso tiene que estar dicho en la guía.
3. **La forma exacta del error de rechazo.** Sección 4: hoy se detecta por texto.

## 11. Lo que depende del dueño, no del código

Nada de esto se puede probar de punta a punta sin una cuenta de Instagram a la que la función
le esté habilitada. Antes de confiar en la entrega: un trial reel real, con algo inocuo, y
mirar en Instagram que salió como prueba; una cuenta sin la función, para ver la frase fija; y
si el post aparece con números en el panel o no (punto abierto 2).
