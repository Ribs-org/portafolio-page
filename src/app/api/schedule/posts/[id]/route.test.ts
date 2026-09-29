import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BORRADO_YA_PUBLICADO } from '@/lib/schedule-api'

vi.mock('server-only', () => ({}))
vi.mock('@/lib/usuarios', () => ({ adminId: async () => 'admin-1' }))

// Se dobla solo la función que toca la base: lo que se prueba acá es la puerta —la
// llave, el mapeo de cada resultado a su código— no la regla, que tiene su propio test.
const borrar = vi.fn()
vi.mock('@/lib/social/publish/borrar', () => ({
  borrarPostProgramado: (...args: unknown[]) => borrar(...args),
}))

const { DELETE } = await import('./route')

function peticion(auth: string | null): Request {
  return new Request('https://ejemplo.cl/api/schedule/posts/p1', {
    method: 'DELETE',
    headers: auth ? { authorization: auth } : {},
  })
}
const params = Promise.resolve({ id: 'p1' })

beforeEach(() => {
  vi.stubEnv('SCHEDULE_API_KEY', 'llave')
  borrar.mockReset()
})
afterEach(() => vi.unstubAllEnvs())

describe('DELETE /api/schedule/posts/{id}', () => {
  it('sin la llave, o con otra, es 401 y no toca nada', async () => {
    expect((await DELETE(peticion(null), { params })).status).toBe(401)
    expect((await DELETE(peticion('Bearer otra'), { params })).status).toBe(401)
    expect(borrar).not.toHaveBeenCalled()
  })

  it('sin llave configurada el endpoint queda cerrado, aunque manden una', async () => {
    vi.stubEnv('SCHEDULE_API_KEY', '')
    expect((await DELETE(peticion('Bearer '), { params })).status).toBe(401)
    expect(borrar).not.toHaveBeenCalled()
  })

  it('borra a nombre del admin, con el id de la ruta', async () => {
    borrar.mockResolvedValueOnce('borrado')
    const r = await DELETE(peticion('Bearer llave'), { params })
    expect(r.status).toBe(200)
    expect(await r.json()).toEqual({ ok: true, id: 'p1' })
    expect(borrar).toHaveBeenCalledWith('admin-1', 'p1')
  })

  it('un post que no existe (o no es del admin) es 404', async () => {
    borrar.mockResolvedValueOnce('no-existe')
    const r = await DELETE(peticion('Bearer llave'), { params })
    expect(r.status).toBe(404)
    expect(await r.json()).toEqual({ error: 'Ese post no existe.' })
  })

  it('un post ya publicado o publicando es 409 con la frase del panel', async () => {
    borrar.mockResolvedValueOnce('publicado')
    const r = await DELETE(peticion('Bearer llave'), { params })
    expect(r.status).toBe(409)
    expect(await r.json()).toEqual({ error: BORRADO_YA_PUBLICADO })
  })
})
