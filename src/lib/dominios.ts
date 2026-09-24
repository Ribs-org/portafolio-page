/**
 * Qué dominio es el del producto.
 *
 * La raíz pública sirve la página de un creador desde el primer día, y cuatro dominios
 * apuntan a este mismo despliegue. Cuando `tu-parrilla.cl` pasó a mostrar la landing, el
 * requisito no fue «que la landing salga» sino el inverso: **que ningún dominio de nadie
 * cambie por accidente**.
 *
 * De ahí la forma de esta función. Sin `DOMINIO_PRODUCTO` configurada devuelve `false`
 * para todo, que significa «comportate como antes de que esto existiera». Un dominio solo
 * entra en la rama nueva si alguien lo escribió a mano en la variable.
 *
 * Acepta varios hosts separados por coma: producción usa uno, pero local y los previews
 * necesitan el suyo para poder ver la landing.
 */
/**
 * Deja un host comparable, venga como venga.
 *
 * El valor de la variable lo escribe una persona en un campo que se llama «dominio», y lo
 * más natural es pegar la URL entera. La primera versión solo aceptaba el dominio pelado:
 * el 2026-09-24 se configuró `https://tu-parrilla.cl/` y la landing no apareció, sin
 * ningún error que lo explicara. Aceptar lo que alguien razonablemente escribiría es parte
 * del trabajo de esta función, no un lujo.
 */
function normalizar(valor: string): string {
  return valor
    .trim()
    .toLowerCase()
    .replace(/^[a-z][a-z0-9+.-]*:\/\//, '') // el esquema, si vino la URL entera
    .replace(/[/?#].*$/, '') // la barra y lo que la siga
    .replace(/:\d+$/, '') // el puerto, que en local viene pegado
    .replace(/^www\./, '') // www y ápice son el mismo sitio
}

export function esDominioDelProducto(
  host: string | null | undefined,
  configurado: string | null | undefined = process.env.DOMINIO_PRODUCTO,
): boolean {
  if (!host || !configurado) return false

  const buscado = normalizar(host)
  if (!buscado) return false

  return configurado
    .split(',')
    .map(normalizar)
    .filter(Boolean)
    .includes(buscado)
}

/**
 * El dominio del producto al que apuntar un enlace, normalizado — el que se usa cuando una
 * página no la sirve el host donde está parado quien la mira. `DOMINIO_PRODUCTO` puede traer
 * varios hosts separados por coma (producción, previews, local); el primero es el que de
 * verdad se comparte, así que es el único que esta función devuelve.
 *
 * `null` sin configurar, igual que `esDominioDelProducto`: es la señal de «no cambies nada».
 */
export function dominioProducto(
  configurado: string | null | undefined = process.env.DOMINIO_PRODUCTO,
): string | null {
  if (!configurado) return null
  const [primero] = configurado.split(',').map(normalizar).filter(Boolean)
  return primero ?? null
}
