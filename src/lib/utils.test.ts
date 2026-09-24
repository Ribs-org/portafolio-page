import { describe, expect, it } from 'vitest'
import { rutaPublicaDe } from './utils'

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
