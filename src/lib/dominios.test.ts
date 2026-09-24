import { describe, expect, it } from 'vitest'
import { esDominioDelProducto } from './dominios'

/**
 * La raíz pública sirve la página de un creador desde hace meses, en cuatro dominios. Esta
 * función decide cuál de esos dominios pasa a mostrar la landing del producto, y el
 * requisito no negociable es el inverso: que ningún dominio de nadie cambie por accidente.
 *
 * De ahí la forma de los casos: sin configuración devuelve `false` siempre, que es
 * «comportate como hasta ayer».
 */
describe('esDominioDelProducto', () => {
  it('sin la variable puesta, ningún host es el del producto', () => {
    expect(esDominioDelProducto('tu-parrilla.cl', undefined)).toBe(false)
    expect(esDominioDelProducto('tu-parrilla.cl', '')).toBe(false)
    expect(esDominioDelProducto('tu-parrilla.cl', '   ')).toBe(false)
  })

  it('reconoce el host configurado', () => {
    expect(esDominioDelProducto('tu-parrilla.cl', 'tu-parrilla.cl')).toBe(true)
  })

  it('deja fuera a los demás dominios, que es lo que de verdad importa', () => {
    const conf = 'tu-parrilla.cl'
    expect(esDominioDelProducto('vicente-pareja.cl', conf)).toBe(false)
    expect(esDominioDelProducto('www.vicente-pareja.cl', conf)).toBe(false)
    expect(esDominioDelProducto('solo-a-mano.cl', conf)).toBe(false)
    expect(esDominioDelProducto('octavio-parejamiranda.com', conf)).toBe(false)
  })

  it('trata el www como el mismo sitio, en los dos sentidos', () => {
    expect(esDominioDelProducto('www.tu-parrilla.cl', 'tu-parrilla.cl')).toBe(true)
    expect(esDominioDelProducto('tu-parrilla.cl', 'www.tu-parrilla.cl')).toBe(true)
  })

  it('ignora el puerto, que en local viene pegado al host', () => {
    expect(esDominioDelProducto('tu-parrilla.cl:3000', 'tu-parrilla.cl')).toBe(true)
    expect(esDominioDelProducto('localhost:3000', 'localhost')).toBe(true)
  })

  it('no distingue mayúsculas ni espacios de más', () => {
    expect(esDominioDelProducto('TU-PARRILLA.CL', '  tu-parrilla.cl  ')).toBe(true)
  })

  it('acepta varios hosts separados por coma, para previews y local', () => {
    const conf = 'tu-parrilla.cl, localhost'
    expect(esDominioDelProducto('localhost:3000', conf)).toBe(true)
    expect(esDominioDelProducto('tu-parrilla.cl', conf)).toBe(true)
    expect(esDominioDelProducto('vicente-pareja.cl', conf)).toBe(false)
  })

  /**
   * Un campo que se llama «dominio» invita a pegar la URL entera, con esquema y barra. El
   * 2026-09-24 pasó exactamente eso y la landing no apareció, sin ningún error que lo
   * explicara: la variable estaba puesta y el despliegue era nuevo, pero el valor no
   * coincidía. Aceptar lo que una persona escribiría es parte del trabajo.
   */
  it('acepta la URL entera, que es lo que uno pega', () => {
    for (const valor of [
      'https://tu-parrilla.cl',
      'https://tu-parrilla.cl/',
      'http://tu-parrilla.cl',
      'tu-parrilla.cl/',
      'https://www.tu-parrilla.cl/',
      '  https://TU-PARRILLA.CL/  ',
    ]) {
      expect(esDominioDelProducto('tu-parrilla.cl', valor), valor).toBe(true)
    }
  })

  it('no confunde un dominio con otro que lo contenga', () => {
    expect(esDominioDelProducto('otra-tu-parrilla.cl', 'tu-parrilla.cl')).toBe(false)
    expect(esDominioDelProducto('tu-parrilla.cl.evil.com', 'tu-parrilla.cl')).toBe(false)
  })

  it('un host ausente nunca es el del producto', () => {
    expect(esDominioDelProducto(null, 'tu-parrilla.cl')).toBe(false)
    expect(esDominioDelProducto('', 'tu-parrilla.cl')).toBe(false)
  })
})
