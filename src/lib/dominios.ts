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
function normalizar(host: string): string {
  return host
    .trim()
    .toLowerCase()
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
