# Deuda técnica

Lo que se dejó a medias a propósito, con el porqué y lo que costaría terminarlo. No es una
lista de deseos: cada entrada nació de un problema real que se parcheó para seguir.

---

## El panel sube los archivos a través de la función

**Abierto desde 2026-09-22.**

Al programar una publicación con video, el compositor manda el archivo dentro del
`FormData` de la acción de servidor (`crearPublicacion` en `src/app/admin/actions.ts`). El
archivo cruza la función de Vercel entera antes de llegar a R2.

Eso choca con el tope de cuerpo de las acciones de servidor, que Next fija en **1 MB** por
defecto. El síntoma es un `413 Content Too Large` en el `POST /admin/schedule`, y en
pantalla la frase genérica «una consulta no respondió», que no dice nada del tamaño.

**El parche:** `serverActions.bodySizeLimit: '50mb'` en `next.config.ts`. Destraba el
ensayo del video de TikTok, pero el archivo se sigue cargando entero en memoria de la
función, y el techo pasa a ser el de la plataforma.

**El arreglo de fondo:** que el panel suba directo a R2 con una URL firmada, exactamente
como ya hace la app del teléfono. Casi todo está construido y probado:

| Pieza | Dónde |
|---|---|
| Ruta que firma el PUT | `src/app/api/mobile/upload-url/route.ts` |
| Validación de nombre, tipo y tamaño | `prepararSubida` en `src/lib/mobile-api.ts` |
| Firma contra R2 | `urlParaSubir` en `src/lib/storage.ts` |
| Barrido de lo subido que nunca se usó | el cron diario |

Falta una ruta equivalente para la sesión web —la del teléfono se guarda con
`requireMobileUser`, que espera un token Bearer—, que el compositor suba cada archivo antes
de enviar el formulario, y que la acción reciba `media: [{ url, mediaType }]` en vez de
archivos. Con eso el límite desaparece y ningún byte cruza la función.

## El boundary del panel esconde el error real

**Abierto desde 2026-09-22.**

`src/app/admin/(dash)/error.tsx` dice «una consulta no respondió» pase lo que pase. Cuando
el fallo fue un `413` por tamaño de archivo, esa frase mandó la depuración en la dirección
equivocada durante una hora: se buscó un problema de base de datos que no existía.

Conviene que el boundary distinga al menos entre un fallo de red o tamaño y uno de
consulta, o que el compositor atrape el `413` y diga que el archivo es muy grande.

## El panel muestra tiempos relativos sin protección de hidratación

**Abierto desde 2026-09-22.**

Textos como «Sincronizado hace 5 horas» o «la conexión vence mañana» se calculan en el
servidor y otra vez en el cliente. Si el cálculo cruza un cambio de unidad entre ambos,
React aborta la hidratación con el error #418 y cae al boundary — que además muestra la
frase equivocada, ver arriba. Es intermitente y difícil de reproducir a pedido.
