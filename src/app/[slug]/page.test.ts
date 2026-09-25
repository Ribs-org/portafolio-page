import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * `/[slug]` decide, con el host de la petición, quién es «el dueño de este dominio»
 * (`esDominioDelProducto` + `adminId`, ver `src/lib/dominios.ts`) y se lo pasa a
 * `getProfileBySlug` para que el filtro quede en el SQL. Estos tests prueban esa
 * resolución sin tocar una base real: `getProfileBySlug` y `@/lib/usuarios` van mockeados,
 * y `esDominioDelProducto` corre de verdad porque es una función pura sobre `process.env`.
 *
 * También prueban la parte que no puede filtrarse: la respuesta para «esa dirección no
 * existe» y para «existe pero es de otro dueño» tiene que ser indistinguible (mismo 404,
 * mismo título), porque `getProfileBySlug` ya devuelve `null` en los dos casos.
 */
const estado = vi.hoisted(() => ({ host: null as string | null }))

vi.mock('next/headers', () => ({
  headers: async () => ({ get: (name: string) => (name === 'host' ? estado.host : null) }),
}))

const notFound = vi.hoisted(() =>
  vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND')
  }),
)
vi.mock('next/navigation', () => ({ notFound }))

vi.mock('@/lib/usuarios', () => ({ adminId: async () => 'admin-1' }))

const getProfileBySlug = vi.hoisted(() => vi.fn())
vi.mock('@/lib/profiles', () => ({ getProfileBySlug }))

// Renderizar el perfil de verdad arrastra `ProfileView`, `VisitTracker`, etc., que no
// aportan nada a esta prueba: acá solo importa a quién se le pidió el perfil y qué pasa
// cuando no hay ninguno.
vi.mock('@/lib/serve-profile', () => ({
  profileMetadata: (profile: { displayName: string }) => ({ title: profile.displayName }),
  renderProfile: (profile: unknown) => profile,
}))

const { default: ProfilePage, generateMetadata } = await import('./page')

const PERFIL = { id: 'p1', ownerId: 'admin-1', isPublished: true, displayName: 'El dueño' }

beforeEach(() => {
  vi.clearAllMocks()
  estado.host = null
  delete process.env.DOMINIO_PRODUCTO
})

function params(slug: string) {
  return { params: Promise.resolve({ slug }), searchParams: Promise.resolve({}) }
}

describe('/[slug]: un dominio sirve las páginas de su dueño; el del producto las sirve todas', () => {
  it('en el dominio personal, pide el perfil acotado al dueño (adminId)', async () => {
    estado.host = 'vicente-pareja.cl'
    getProfileBySlug.mockResolvedValue(PERFIL)
    await ProfilePage(params('juanito'))
    expect(getProfileBySlug).toHaveBeenCalledWith('juanito', 'admin-1')
  })

  it('en el dominio del producto, pide el perfil sin acotar a ningún dueño', async () => {
    process.env.DOMINIO_PRODUCTO = 'tu-parrilla.cl'
    estado.host = 'tu-parrilla.cl'
    getProfileBySlug.mockResolvedValue(PERFIL)
    await ProfilePage(params('juanito'))
    expect(getProfileBySlug).toHaveBeenCalledWith('juanito', undefined)
  })

  it('sin DOMINIO_PRODUCTO configurada, se comporta como el dominio personal aunque el host sea el del producto', async () => {
    estado.host = 'tu-parrilla.cl' // el mismo host que se usaría como DOMINIO_PRODUCTO, pero la variable no está puesta
    getProfileBySlug.mockResolvedValue(PERFIL)
    await ProfilePage(params('juanito'))
    expect(getProfileBySlug).toHaveBeenCalledWith('juanito', 'admin-1')
  })

  it('perfil de otro dueño en el dominio personal: 404 de verdad, no una página en 200', async () => {
    estado.host = 'vicente-pareja.cl'
    getProfileBySlug.mockResolvedValue(null) // el filtro por dueño ya lo dejó afuera en el SQL
    await expect(ProfilePage(params('prueba-nueva'))).rejects.toThrow('NEXT_NOT_FOUND')
    expect(notFound).toHaveBeenCalledOnce()
  })

  it('dirección que no existe: el mismo 404 que la de otro dueño', async () => {
    estado.host = 'vicente-pareja.cl'
    getProfileBySlug.mockResolvedValue(null)
    await expect(ProfilePage(params('no-existe-nunca'))).rejects.toThrow('NEXT_NOT_FOUND')
    expect(notFound).toHaveBeenCalledOnce()
  })

  it('generateMetadata no filtra por HTML: "de otro dueño" y "no existe" dan el mismo resultado', async () => {
    estado.host = 'vicente-pareja.cl'
    getProfileBySlug.mockResolvedValue(null)
    const deOtroDueno = await generateMetadata({ params: Promise.resolve({ slug: 'prueba-nueva' }) })
    const queNoExiste = await generateMetadata({ params: Promise.resolve({ slug: 'no-existe-nunca' }) })
    expect(deOtroDueno).toEqual(queNoExiste)
  })

  /**
   * Un `mockResolvedValue(null)` fijo no puede detectar que `generateMetadata` olvidó
   * mandar el `ownerId`: devuelve `null` pase lo que pase y el test pasa igual aunque la
   * consulta salga sin acotar. Acá el mock depende de si le llegó un `ownerId`: si lo
   * recibe (la consulta va acotada, como debe ser) no hay fila que devolver; si no lo
   * recibe (bug: la consulta salió sin filtrar), "encuentra" el perfil ajeno y lo filtra
   * el `<title>` — que es justo la fuga que este test tiene que atajar.
   */
  it('generateMetadata acota la consulta al dueño: si no lo hiciera, filtraría el título de un perfil ajeno', async () => {
    estado.host = 'vicente-pareja.cl'
    getProfileBySlug.mockImplementation(async (_slug: string, ownerId?: string) =>
      ownerId ? null : PERFIL,
    )
    const meta = await generateMetadata({ params: Promise.resolve({ slug: 'prueba-nueva' }) })
    expect(meta).toEqual({ title: 'No encontrado' })
  })
})
