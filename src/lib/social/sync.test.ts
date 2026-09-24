import { describe, expect, it, vi } from 'vitest'

// `sync.ts` importa `server-only` (a través de `../usuarios`, que también lo hace
// directo), que solo entiende el bundler de Next: se sustituye por un módulo vacío para
// poder importarlo bajo Vitest (mismo motivo que en `usuarios.test.ts`).
vi.mock('server-only', () => ({}))

const { isCampaignUniqueViolation } = await import('./sync')

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
