import { PgDialect } from 'drizzle-orm/pg-core'
import { describe, expect, it, vi } from 'vitest'

// `server-only` no está en `node_modules` (solo lo entiende el bundler de Next), y el
// módulo bajo prueba lo importa: sin este doble, el import ni siquiera resuelve.
vi.mock('server-only', () => ({}))

const { BAJA_DESDE_FACEBOOK, codigoDeBorrado, pasosDeBorrado } = await import('./meta-bajas')

const META_USER = 'u1'

describe('BAJA_DESDE_FACEBOOK', () => {
  it('dice qué pasó y qué hacer, letra por letra', () => {
    // La frase se ve en la tarjeta de la cuenta, en `last_sync_error`. Va acá completa a
    // propósito: cambiarla es cambiar lo que el dueño lee, no un detalle interno.
    expect(BAJA_DESDE_FACEBOOK).toBe('Quitaste la app desde Facebook: vuelve a conectar.')
  })
})

describe('pasosDeBorrado', () => {
  const dialecto = new PgDialect()
  const pasos = pasosDeBorrado(META_USER).map((p) => dialecto.sqlToQuery(p))

  it('borra lo que cuelga de la cuenta antes que la cuenta', () => {
    // El orden importa: `social_posts`, `account_metrics` y `scheduled_post_targets`
    // referencian `social_accounts` sin cascada, así que la fila de la cuenta no se puede
    // borrar mientras alguna siga ahí. Y `post_metrics` va primero porque cuelga de los
    // posts, no de la cuenta.
    const tablas = pasos.map((p) => /delete from\s+"?([a-z_]+)"?/i.exec(p.sql)?.[1])
    expect(tablas).toEqual([
      'post_metrics',
      'post_comments',
      'social_posts',
      'account_metrics',
      'scheduled_post_targets',
      'social_accounts',
    ])
  })

  it('cada paso lleva el id de usuario de Meta como parámetro, nunca en el texto', () => {
    for (const p of pasos) {
      expect(p.params).toContain(META_USER)
      expect(p.sql).not.toContain(META_USER)
    }
  })

  it('ningún paso sale de las dos redes de Meta', () => {
    // Sin esta condición, un dueño que tenga TikTok o YouTube bajo el mismo
    // `meta_user_id` —hoy imposible, mañana un descuido— perdería esas cuentas también.
    for (const p of pasos) {
      expect(p.sql).toMatch(/"?network"?\s+in\s*\(\s*'instagram'\s*,\s*'facebook'\s*\)/i)
    }
  })
})

describe('codigoDeBorrado', () => {
  it('da 16 caracteres de base32 en minúscula', () => {
    // Viaja en la URL que Meta le muestra a la persona: sin mayúsculas ni 0/O ni 1/l,
    // para que se pueda copiar a mano de una pantalla.
    expect(codigoDeBorrado()).toMatch(/^[a-z2-7]{16}$/)
  })

  it('dos llamadas no coinciden', () => {
    expect(codigoDeBorrado()).not.toBe(codigoDeBorrado())
  })
})
