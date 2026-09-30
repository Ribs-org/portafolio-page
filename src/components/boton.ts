/**
 * El aspecto de un botón, en un solo sitio, para las dos cosas que lo tienen: el `<button>`
 * de `ui.tsx` y el enlace que parece uno.
 *
 * Vive acá y no dentro de `ui.tsx` por el límite de cliente: `ui.tsx` lleva `'use client'`,
 * y Next convierte **todos** los exports de un módulo así en referencias de cliente. Un
 * `const` de texto importado desde un componente de servidor no llega como texto, llega
 * como una función que lanza, y su `toString()` termina dentro del `class=` — medido: la
 * página de 404 se quedó sin ningún estilo, con «Attempted to call ENLACE_BOTON() from the
 * server» escrito en el atributo. Un módulo sin directiva lo cruzan los dos lados.
 */

/**
 * La forma: caja, radio, aire y tipografía. Sin color y sin transición, que es justo lo que
 * el botón y el enlace no comparten — el `<button>` cambia de color al pasar por encima y
 * el enlace primario, de brillo.
 */
export const BOTON_FORMA =
  'inline-flex items-center justify-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-medium'

/**
 * Un enlace con pinta de botón primario. Es una constante y no un componente porque el
 * `<Link>` de Next quiere ser él quien renderice el `<a>`, y porque `Button` es un
 * `<button>`: envolverlo daría un botón dentro de un enlace.
 *
 * Existe porque esta misma cadena estaba copiada carácter por carácter en El Fuego y en la
 * página de 404, y el aspecto de un botón repartido en tres archivos termina diciendo tres
 * cosas distintas.
 */
export const ENLACE_BOTON = `${BOTON_FORMA} bg-brasa text-acero-950 transition-[filter] hover:brightness-110`
