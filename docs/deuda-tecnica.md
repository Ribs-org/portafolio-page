# Deuda técnica

Lo que se dejó a medias a propósito, con el porqué y lo que costaría terminarlo. No es una
lista de deseos: cada entrada nació de un problema real que se parcheó para seguir.

---
## El editor y los avatares todavía suben a través de la función

**Abierto desde 2026-09-22.** El compositor ya no: se arregló el 2026-09-23.

Vercel corta los cuerpos de petición en **~4,5 MB**. Está medido contra producción, con
cuerpos de tamaño conocido, no supuesto:

```
 1 MB → 204      4 MB → 204      5 MB → 413
```

Ese número manda sobre cualquier configuración: `serverActions.bodySizeLimit` en
`next.config.ts` no sirve de nada, porque la plataforma rechaza antes de que Next mire. El
síntoma es un `413` en el `POST`, y en pantalla la frase genérica del boundary.

**Resuelto en el compositor:** el navegador pide una URL firmada a
`api/admin/upload-url`, hace el PUT él mismo, y a la acción solo le llegan las URLs, que
se verifican con `keyDesdeUrl` (que sean del bucket, bajo `scheduled/`) y con `existe`
(que el archivo esté de verdad). Ver `lib/subida-directa.ts`.

Y una pieza que no es código: **el bucket necesita una política CORS**. La spec de
2026-09-09 decía «nada que tocar en Cloudflare», y era cierto mientras el único que subía
directo era el teléfono — `fetch` nativo no aplica la política de mismo origen. Con el
navegador subiendo, sin CORS el PUT muere en la verificación previa y se ve como «Failed
to fetch», sin rastro en los logs del servidor porque nunca llega. Aplicada en producción
el 2026-09-23; la receta quedó en `.env.example`.

**Falta en dos lugares**, los dos con el mismo patrón y la misma solución:

| Dónde | Qué sube |
|---|---|
| `admin/(dash)/schedule/[id]/editor.tsx` | media al editar un post |
| `components/image-field.tsx` → `uploadImage` | avatares y portadas |

El editor es más enredado porque teje los archivos con `keptMedia` y con `mediaUrls`, así
que merece su propio rato. `uploadImage` además **miente**: declara un máximo de 8 MB que
la plataforma nunca deja llegar.

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
