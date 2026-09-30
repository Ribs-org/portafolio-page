import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SocialAccount } from '@/db'
import type { FetchedBatch } from './connector'

// `sync.ts` importa `server-only` (a través de `../usuarios`, que también lo hace
// directo), que solo entiende el bundler de Next: se sustituye por un módulo vacío para
// poder importarlo bajo Vitest (mismo motivo que en `usuarios.test.ts`).
vi.mock('server-only', () => ({}))

// La base doblada al nivel de drizzle, no del driver: `syncAccount` solo necesita cuatro
// formas de cadena (`insert…values…onConflictDoUpdate[…returning]`, `select…from…where`,
// `update…set…where`), y todas terminan en un `await`. Cada eslabón se devuelve a sí mismo
// y además es «then-able», así que la misma pieza sirve para las cuatro. Lo único que el
// doble guarda es qué se escribió y en qué tabla: es lo que estos casos miran.
const { escrituras } = vi.hoisted(() => ({ escrituras: [] as Array<{ tabla: unknown; valores: unknown }> }))

vi.mock('@/db', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/db')>()
  const eslabon = (tabla: unknown, filas: unknown[]) => {
    const paso = {
      values: (valores: unknown) => {
        escrituras.push({ tabla, valores })
        return paso
      },
      onConflictDoUpdate: () => paso,
      returning: () => paso,
      from: () => paso,
      where: () => paso,
      set: () => paso,
      then: (ok?: never, err?: never) => Promise.resolve(filas).then(ok, err),
    }
    return paso
  }
  return {
    ...real,
    getDb: () => ({
      insert: (tabla: unknown) => eslabon(tabla, [{ id: 'post-1' }]),
      select: () => eslabon(null, []),
      update: () => eslabon(null, []),
    }),
  }
})

// El conector: lo justo para que `syncAccount` llegue a escribir un snapshot. Sin
// `fetchAccountMetrics`, para que el único `day` escrito sea el de `post_metrics`.
const fetchPosts = vi.fn<() => Promise<FetchedBatch>>()
vi.mock('./index', () => ({
  connectorFor: () => ({
    ensureCredential: async () => 'token',
    fetchPosts: () => fetchPosts(),
  }),
}))

// La zona del dueño de la cuenta, que es lo que este archivo quiere poder mover.
const buscarPorId = vi.fn()
vi.mock('../usuarios', () => ({
  adminId: async () => 'owner-1',
  buscarPorId: (id: string) => buscarPorId(id),
}))

const { isCampaignUniqueViolation, syncAccount } = await import('./sync')

// La forma real de un error de unicidad tal como lo entrega el driver de este proyecto
// (`postgres`, no `node-postgres`): el campo es `constraint_name`, no `constraint` — ver
// `node_modules/postgres/src/connection.js:46`.
const pgError = (constraint_name: string) => ({ code: '23505', constraint_name })

// Y la forma real en la que ese error llega a quien lo atrapa: drizzle-orm 0.45.2 envuelve
// toda consulta fallida en `DrizzleQueryError` y deja el original en `cause` (ver
// `node_modules/drizzle-orm/errors.cjs:35-45` y cada `throw new DrizzleQueryError(...)` en
// `node_modules/drizzle-orm/pg-core/session.js`). Un test que arma un error plano, sin este
// envoltorio, no habría atrapado el bug: la función nunca mira el error que de verdad
// llega.
const drizzleQueryError = (cause: unknown) => Object.assign(new Error('Failed query'), { cause })

describe('isCampaignUniqueViolation', () => {
  it('reconoce un choque de social_posts_campaign_unique envuelto por drizzle', () => {
    const error = drizzleQueryError(pgError('social_posts_campaign_unique'))
    expect(isCampaignUniqueViolation(error)).toBe(true)
  })

  it('no confunde una violación de unicidad de otra restricción', () => {
    const error = drizzleQueryError(pgError('social_accounts_network_external_id_unique'))
    expect(isCampaignUniqueViolation(error)).toBe(false)
  })

  it('no confunde un error cualquiera con un choque de unicidad', () => {
    const error = drizzleQueryError(new Error('la base no responde'))
    expect(isCampaignUniqueViolation(error)).toBe(false)
  })

  it('no revienta si no hay ni error ni cause', () => {
    expect(isCampaignUniqueViolation('algo que no es un error')).toBe(false)
    expect(isCampaignUniqueViolation(null)).toBe(false)
    expect(isCampaignUniqueViolation(undefined)).toBe(false)
  })
})

/**
 * El `day` de un snapshot es la única zona de toda la rama que ensucia el historial en vez
 * de mostrar mal una hora: `getPostRows` compara esas llaves contra `localDay(…, f.zone)`,
 * así que si se escribieran en la zona del servidor, una captura de las 23:30 se leería un
 * día corrida —o fuera de la ventana— para quien la mira. El instante es el mismo en los
 * dos casos; lo único que cambia es la zona del dueño de la cuenta.
 */
describe('syncAccount: el día del snapshot es el del dueño', () => {
  const cuenta = {
    id: 'acc-1',
    ownerId: 'owner-1',
    network: 'instagram',
    handle: '@demo',
    externalId: 'ext-1',
    metaUserId: null,
    accessToken: 'token',
    refreshToken: null,
    expiresAt: null,
    lastSyncedAt: null,
    lastSyncError: null,
    createdAt: new Date('2026-01-01'),
  } satisfies SocialAccount

  beforeEach(() => {
    escrituras.length = 0
    buscarPorId.mockClear()
    vi.useFakeTimers()
    // 23:30 UTC del 5 de octubre: ya es día 6 en Madrid (+02:00) y todavía día 5 en
    // Santiago (−03:00). Un instante cualquiera no distinguiría las dos zonas.
    vi.setSystemTime(new Date('2026-10-05T23:30:00Z'))
    fetchPosts.mockResolvedValue({
      posts: [
        {
          externalId: 'ext-post-1',
          permalink: null,
          caption: null,
          thumbnailUrl: null,
          mediaType: null,
          publishedAt: new Date('2026-10-01T12:00:00Z'),
          metrics: { views: 10, likes: 1, comments: 0, shares: 0, saves: 0, reach: 10 },
        },
      ],
      windowWasCapped: false,
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  /** El `day` que llegó al insert de `post_metrics`. */
  function diaEscrito(): string {
    const fila = escrituras.find((e) => (e.valores as { day?: string }).day !== undefined)
    return (fila!.valores as { day: string }).day
  }

  it('con el dueño en Madrid, las 23:30 UTC son el día siguiente', async () => {
    buscarPorId.mockResolvedValue({ id: 'owner-1', zona: 'Europe/Madrid' })
    await syncAccount(cuenta, true)
    expect(buscarPorId).toHaveBeenCalledWith('owner-1')
    expect(diaEscrito()).toBe('2026-10-06')
  })

  it('con el dueño en Santiago, el mismo instante sigue siendo el día 5', async () => {
    buscarPorId.mockResolvedValue({ id: 'owner-1', zona: 'America/Santiago' })
    await syncAccount(cuenta, true)
    expect(diaEscrito()).toBe('2026-10-05')
  })

  it('sin dueño en la fila, cae al default del sitio y no revienta', async () => {
    buscarPorId.mockResolvedValue(null)
    await syncAccount({ ...cuenta, ownerId: null }, true)
    expect(buscarPorId).not.toHaveBeenCalled()
    expect(diaEscrito()).toBe('2026-10-05')
  })
})
