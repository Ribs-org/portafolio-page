import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { PANTALLAS, ajustes, pantallaDe, pestanas } from './vocabulario'

describe('el vocabulario del panel', () => {
  it('cada pantalla apunta a una ruta que existe de verdad bajo (dash)', () => {
    // La tabla es de presentación: si alguien renombra una carpeta y no la tabla, la
    // pestaña llevaría a un 404 y ningún typecheck lo vería. El sistema de archivos sí.
    const base = join(process.cwd(), 'src', 'app', 'admin', '(dash)')
    for (const p of PANTALLAS) {
      const carpeta = p.ruta === '/admin' ? base : join(base, p.ruta.replace('/admin/', ''))
      expect(existsSync(join(carpeta, 'page.tsx')), `${p.ruta} no tiene page.tsx`).toBe(true)
    }
  })

  it('no hay dos pantallas con la misma ruta ni con el mismo nombre', () => {
    const rutas = PANTALLAS.map((p) => p.ruta)
    const nombres = PANTALLAS.map((p) => p.nombre)
    expect(new Set(rutas).size).toBe(rutas.length)
    expect(new Set(nombres).size).toBe(nombres.length)
  })

  it('cinco pestañas, y Ajustes con dos entradas para un usuario y tres para el admin', () => {
    expect(pestanas(false).map((p) => p.ruta)).toEqual([
      '/admin',
      '/admin/schedule',
      '/admin/content',
      '/admin/comments',
      '/admin/analytics',
    ])
    expect(pestanas(true)).toEqual(pestanas(false))
    expect(ajustes(false).map((p) => p.ruta)).toEqual(['/admin/accounts', '/admin/profiles'])
    expect(ajustes(true).map((p) => p.ruta)).toEqual(['/admin/accounts', '/admin/profiles', '/admin/usuarios'])
  })

  it('pantallaDe resuelve por prefijo, y /admin solo exacto', () => {
    expect(pantallaDe('/admin')?.ruta).toBe('/admin')
    expect(pantallaDe('/admin/schedule/abc')?.ruta).toBe('/admin/schedule')
    expect(pantallaDe('/admin/accounts/elegir')?.ruta).toBe('/admin/accounts')
    expect(pantallaDe('/admin/profiles/xyz')?.ruta).toBe('/admin/profiles')
    // Un prefijo de texto que no es un segmento no cuenta: /admin/scheduleX no es la parrilla.
    expect(pantallaDe('/admin/scheduleX')).toBeNull()
    expect(pantallaDe('/ingresar')).toBeNull()
  })

  it('todas llevan subtítulo en llano: es la red de seguridad de los nombres', () => {
    for (const p of PANTALLAS) expect(p.subtitulo.length).toBeGreaterThan(8)
  })
})
