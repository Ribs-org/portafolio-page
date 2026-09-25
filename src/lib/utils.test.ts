import { describe, expect, it } from 'vitest'
import { enlacePublicoDe, rutaMostradaDe, rutaPublicaDe, urlPublicaDe } from './utils'

describe('rutaPublicaDe', () => {
  const ADMIN = 'admin-1'

  it('el perfil principal del admin del despliegue vive en la raíz', () => {
    const perfil = { isDefault: true, slug: 'admin', ownerId: ADMIN }
    expect(rutaPublicaDe(perfil, ADMIN)).toBe('/')
  })

  // El caso que esta función existe para arreglar: `isDefault` marca la página principal
  // de CUALQUIER usuario, pero la raíz del sitio solo sirve la del admin del despliegue.
  // Confundir ambas cosas manda al invitado a la página de otro.
  it('el perfil principal de un usuario invitado vive en su propia dirección, no en la raíz', () => {
    const perfil = { isDefault: true, slug: 'ana', ownerId: 'invitado-1' }
    expect(rutaPublicaDe(perfil, ADMIN)).toBe('/ana')
  })

  it('un perfil que no es el principal vive en su dirección, sea quien sea su dueño', () => {
    const perfil = { isDefault: false, slug: 'segundo-perfil', ownerId: ADMIN }
    expect(rutaPublicaDe(perfil, ADMIN)).toBe('/segundo-perfil')
  })

  it('un perfil sin dueño (huérfano, en plena migración) nunca vive en la raíz', () => {
    const perfil = { isDefault: true, slug: 'huerfano', ownerId: null }
    expect(rutaPublicaDe(perfil, ADMIN)).toBe('/huerfano')
  })
})

describe('enlacePublicoDe', () => {
  const ADMIN = 'admin-1'
  const PRODUCTO = 'tu-parrilla.cl'

  it('en el dominio del producto, la principal del admin no vive en /: vive en /<slug>, como cualquier otra', () => {
    const perfil = { isDefault: true, slug: 'vicente', ownerId: ADMIN }
    const enlace = enlacePublicoDe(perfil, ADMIN, { enElProducto: true, dominioProducto: PRODUCTO })
    expect(enlace).toBe('/vicente')
  })

  it('en el dominio del producto, la página de un invitado vive en /<slug>', () => {
    const perfil = { isDefault: true, slug: 'ana', ownerId: 'invitado-1' }
    const enlace = enlacePublicoDe(perfil, ADMIN, { enElProducto: true, dominioProducto: PRODUCTO })
    expect(enlace).toBe('/ana')
  })

  it('fuera del dominio del producto, la principal del admin sigue en /', () => {
    const perfil = { isDefault: true, slug: 'vicente', ownerId: ADMIN }
    const enlace = enlacePublicoDe(perfil, ADMIN, { enElProducto: false, dominioProducto: PRODUCTO })
    expect(enlace).toBe('/')
  })

  it('fuera del dominio del producto, un perfil secundario del admin sigue en /<slug>', () => {
    const perfil = { isDefault: false, slug: 'segundo', ownerId: ADMIN }
    const enlace = enlacePublicoDe(perfil, ADMIN, { enElProducto: false, dominioProducto: PRODUCTO })
    expect(enlace).toBe('/segundo')
  })

  // El caso que este arreglo existe para resolver: un dominio que no es el del producto
  // solo sirve las páginas del admin. La página de un invitado ahí da 404, así que el
  // enlace tiene que apuntar al dominio del producto, donde de verdad existe.
  it('fuera del dominio del producto, la página de un invitado manda al dominio del producto', () => {
    const perfil = { isDefault: true, slug: 'ana', ownerId: 'invitado-1' }
    const enlace = enlacePublicoDe(perfil, ADMIN, { enElProducto: false, dominioProducto: PRODUCTO })
    expect(enlace).toBe('https://tu-parrilla.cl/ana')
  })

  it('sin DOMINIO_PRODUCTO configurado, la página de un invitado no cambia: es la restricción global de la rama', () => {
    const perfil = { isDefault: true, slug: 'ana', ownerId: 'invitado-1' }
    const enlace = enlacePublicoDe(perfil, ADMIN, { enElProducto: false, dominioProducto: null })
    expect(enlace).toBe('/ana')
  })
})

describe('urlPublicaDe', () => {
  const ADMIN = 'admin-1'
  const PRODUCTO = 'tu-parrilla.cl'
  const ORIGIN = 'https://tu-parrilla.cl'

  // El bug que este arreglo existe para resolver: el editor de la principal del admin, en
  // el dominio del producto, mostraba y copiaba `${origin}/` (la landing) en vez de la
  // dirección real del perfil — a diferencia de «Ver página», que ya usaba `enlacePublicoDe`
  // y sí apuntaba a `/<slug>`. Las dos tienen que coincidir siempre.
  it('en el dominio del producto, la principal del admin copia /<slug>, no la raíz', () => {
    const perfil = { isDefault: true, slug: 'vicente', ownerId: ADMIN }
    const url = urlPublicaDe(perfil, ADMIN, { enElProducto: true, dominioProducto: PRODUCTO }, ORIGIN)
    expect(url).toBe('https://tu-parrilla.cl/vicente')
  })

  it('fuera del dominio del producto, la principal del admin sigue copiando la raíz', () => {
    const perfil = { isDefault: true, slug: 'vicente', ownerId: ADMIN }
    const url = urlPublicaDe(perfil, ADMIN, { enElProducto: false, dominioProducto: PRODUCTO }, ORIGIN)
    expect(url).toBe('https://tu-parrilla.cl/')
  })

  it('un perfil secundario compone la ruta relativa con el origen actual', () => {
    const perfil = { isDefault: false, slug: 'segundo', ownerId: ADMIN }
    const url = urlPublicaDe(perfil, ADMIN, { enElProducto: false, dominioProducto: PRODUCTO }, ORIGIN)
    expect(url).toBe('https://tu-parrilla.cl/segundo')
  })

  // Cuando `enlacePublicoDe` ya manda a un dominio ajeno al origen actual, esa URL
  // absoluta se deja tal cual: componerla con el origen de quien mira la duplicaría mal.
  it('cuando el enlace ya es absoluto (dominio ajeno), no se compone con el origen actual', () => {
    const perfil = { isDefault: true, slug: 'ana', ownerId: 'invitado-1' }
    const url = urlPublicaDe(
      perfil,
      ADMIN,
      { enElProducto: false, dominioProducto: PRODUCTO },
      'https://vicente-parrilla.cl',
    )
    expect(url).toBe('https://tu-parrilla.cl/ana')
  })

  it('sin DOMINIO_PRODUCTO configurado, nada cambia: la restricción global de la rama', () => {
    const perfil = { isDefault: true, slug: 'vicente', ownerId: ADMIN }
    const url = urlPublicaDe(perfil, ADMIN, { enElProducto: false, dominioProducto: null }, ORIGIN)
    expect(url).toBe('https://tu-parrilla.cl/')
  })
})

describe('rutaMostradaDe', () => {
  const ADMIN = 'admin-1'
  const PRODUCTO = 'tu-parrilla.cl'

  // El mismo desfase de `urlPublicaDe`, pero en las etiquetas de solo texto de
  // `(dash)/profiles/page.tsx` y `(dash)/page.tsx`: mostraban `/` para la principal del
  // admin aunque el host actual fuera el del producto, donde en realidad vive en `/<slug>`.
  it('en el dominio del producto, la principal del admin muestra /<slug>, no /', () => {
    const perfil = { isDefault: true, slug: 'vicente', ownerId: ADMIN }
    const ruta = rutaMostradaDe(perfil, ADMIN, { enElProducto: true, dominioProducto: PRODUCTO })
    expect(ruta).toBe('/vicente')
  })

  it('fuera del dominio del producto, la principal del admin sigue mostrando /', () => {
    const perfil = { isDefault: true, slug: 'vicente', ownerId: ADMIN }
    const ruta = rutaMostradaDe(perfil, ADMIN, { enElProducto: false, dominioProducto: PRODUCTO })
    expect(ruta).toBe('/')
  })

  // Solo texto, no un enlace: si `enlacePublicoDe` ya resolvió una URL absoluta hacia el
  // dominio del producto, se muestra únicamente el camino, sin el dominio como ruido.
  it('si el enlace real es absoluto, muestra solo el camino', () => {
    const perfil = { isDefault: true, slug: 'ana', ownerId: 'invitado-1' }
    const ruta = rutaMostradaDe(perfil, ADMIN, { enElProducto: false, dominioProducto: PRODUCTO })
    expect(ruta).toBe('/ana')
  })
})
