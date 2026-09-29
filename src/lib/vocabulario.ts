// El vocabulario del panel, en un solo sitio. La dirección visual (docs/superpowers/specs/
// 2026-09-18-parrilla-direccion-visual-design.md, §2) bautizó cada pantalla con el nombre del
// asado y le exigió un subtítulo en llano debajo, para que a los seis meses se siga
// encontrando todo. Las rutas no cambian nunca: son las de siempre, y esta tabla solo les
// pone nombre. Nadie fuera de este archivo escribe «Los Fierros».
//
// `/admin` se llama Resumen mientras sea la página de números que es hoy; la entrega 3 de
// «el panel con poco a priori» la reemplaza por El Fuego y cambia esta fila, no otra cosa.

export type Pantalla = {
  ruta: string
  nombre: string
  subtitulo: string
  /** Pestaña de la barra, o entrada del engranaje de Ajustes. */
  grupo: 'pestana' | 'ajustes'
  soloAdmin?: true
}

export const PANTALLAS: readonly Pantalla[] = [
  { ruta: '/admin', nombre: 'Resumen', subtitulo: 'tus números de un vistazo', grupo: 'pestana' },
  { ruta: '/admin/schedule', nombre: 'La Parrilla', subtitulo: 'lo que viene y cómo salió lo que ya se fue', grupo: 'pestana' },
  { ruta: '/admin/content', nombre: 'Los Cortes', subtitulo: 'cada publicación y lo que trajo', grupo: 'pestana' },
  { ruta: '/admin/comments', nombre: 'La Mesa', subtitulo: 'lo que te responden y tus respuestas', grupo: 'pestana' },
  { ruta: '/admin/analytics', nombre: 'Los Números', subtitulo: 'visitas, clics y de dónde vienen', grupo: 'pestana' },
  { ruta: '/admin/accounts', nombre: 'Los Fierros', subtitulo: 'tus redes conectadas', grupo: 'ajustes' },
  { ruta: '/admin/profiles', nombre: 'La Vitrina', subtitulo: 'tus páginas públicas', grupo: 'ajustes' },
  { ruta: '/admin/usuarios', nombre: 'Los Maestros', subtitulo: 'quién puede entrar', grupo: 'ajustes', soloAdmin: true },
]

function visibles(esAdmin: boolean): Pantalla[] {
  return PANTALLAS.filter((p) => !p.soloAdmin || esAdmin)
}

export function pestanas(esAdmin: boolean): Pantalla[] {
  return visibles(esAdmin).filter((p) => p.grupo === 'pestana')
}

export function ajustes(esAdmin: boolean): Pantalla[] {
  return visibles(esAdmin).filter((p) => p.grupo === 'ajustes')
}

/**
 * La pantalla a la que pertenece una ruta: `/admin` solo exacta; las demás, por segmento
 * (`/admin/schedule/abc` es La Parrilla, `/admin/scheduleX` no es nada). Devuelve todas las
 * pantallas, incluida la de admin, porque decide qué se marca activo, no qué se muestra.
 */
export function pantallaDe(pathname: string): Pantalla | null {
  if (pathname === '/admin') return PANTALLAS[0]!
  return PANTALLAS.find((p) => p.ruta !== '/admin' && (pathname === p.ruta || pathname.startsWith(`${p.ruta}/`))) ?? null
}
