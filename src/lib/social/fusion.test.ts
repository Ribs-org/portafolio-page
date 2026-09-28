import { PgDialect } from 'drizzle-orm/pg-core'
import { describe, expect, it } from 'vitest'
import {
  FUSION_DISTINTA_RED,
  FUSION_MISMA_CUENTA,
  FUSION_MUERTA_VIVA,
  FUSION_NO_ES_TUYA,
  FUSION_VIVA_SIN_CREDENCIAL,
  decidirFusion,
  pasosDeFusion,
} from './fusion'

const DUENO = 'owner-1'
const muerta = { id: 'muerta', ownerId: DUENO, network: 'tiktok', conectada: false }
const viva = { id: 'viva', ownerId: DUENO, network: 'tiktok', conectada: true }

describe('decidirFusion', () => {
  it('una tarjeta sin credencial se puede fusionar en una viva de la misma red y del mismo dueño', () => {
    expect(decidirFusion(muerta, viva, DUENO)).toEqual({ ok: true })
  })

  it('no se fusiona en sí misma', () => {
    expect(decidirFusion(muerta, { ...muerta, conectada: true }, DUENO)).toEqual({ error: FUSION_MISMA_CUENTA })
  })

  it('las dos tienen que ser del dueño que pide', () => {
    expect(decidirFusion({ ...muerta, ownerId: 'otro' }, viva, DUENO)).toEqual({ error: FUSION_NO_ES_TUYA })
    expect(decidirFusion(muerta, { ...viva, ownerId: 'otro' }, DUENO)).toEqual({ error: FUSION_NO_ES_TUYA })
  })

  it('las dos tienen que ser de la misma red', () => {
    expect(decidirFusion(muerta, { ...viva, network: 'instagram' }, DUENO)).toEqual({ error: FUSION_DISTINTA_RED })
  })

  it('la que se absorbe tiene que estar sin credencial: una viva no se fusiona por error', () => {
    // La fusión borra la fila absorbida. Solo una que ya no puede volver a conectarse
    // —la identidad que dio otra app— es candidata; una viva se desconecta primero, a
    // propósito, no de pasada.
    expect(decidirFusion({ ...muerta, conectada: true }, viva, DUENO)).toEqual({ error: FUSION_MUERTA_VIVA })
  })

  it('la que absorbe tiene que estar conectada', () => {
    expect(decidirFusion(muerta, { ...viva, conectada: false }, DUENO)).toEqual({ error: FUSION_VIVA_SIN_CREDENCIAL })
  })
})

describe('pasosDeFusion', () => {
  const dialecto = new PgDialect()
  const pasos = pasosDeFusion('muerta', 'viva', DUENO).map((p) => dialecto.sqlToQuery(p))

  it('recorre las cuatro tablas que cuelgan de una cuenta y termina borrando la muerta', () => {
    // El orden importa: las métricas de los posts duplicados se mueven ANTES de borrar
    // esos posts (el borrado las arrastraría en cascada), y la cuenta se borra al final,
    // cuando ya nada la referencia — las tres tablas sin cascada impedirían borrarla antes.
    const tablas = pasos.map((p) => /(?:update|delete from|into)\s+"?([a-z_]+)"?/i.exec(p.sql)?.[1])
    expect(tablas).toEqual([
      'post_metrics',
      'social_posts',
      'social_posts',
      'account_metrics',
      'account_metrics',
      'scheduled_post_targets',
      'scheduled_post_targets',
      'post_comments',
      'social_accounts',
    ])
  })

  it('cada paso lleva los ids como parámetros, nunca interpolados en el texto', () => {
    for (const p of pasos) {
      expect(p.sql).not.toContain('muerta')
      expect(p.sql).not.toContain('viva')
      expect(p.params.length).toBeGreaterThan(0)
    }
  })

  it('el borrado final ata la cuenta al dueño, no solo al id', () => {
    const ultimo = pasos[pasos.length - 1]!
    expect(ultimo.sql).toMatch(/delete from "?social_accounts"?/i)
    expect(ultimo.params).toEqual(['muerta', DUENO])
  })

  it('lo que chocaría con una unique se resuelve a favor de la viva, y el resto se mueve', () => {
    // social_posts: un mismo video sincronizado bajo las dos identidades. Sus métricas
    // por día pasan al post de la viva (solo los días que a ese le faltan) y el duplicado
    // se borra; los posts que la viva no tiene cambian de cuenta.
    expect(pasos[0]!.sql).toMatch(/update "?post_metrics"?/i)
    expect(pasos[0]!.sql).toMatch(/not exists/i)
    expect(pasos[1]!.sql).toMatch(/delete from "?social_posts"?/i)
    expect(pasos[2]!.sql).toMatch(/update "?social_posts"?[\s\S]*set "?account_id"?/i)
    // account_metrics y scheduled_post_targets: mover lo que no choca, borrar lo que sí.
    expect(pasos[3]!.sql).toMatch(/update "?account_metrics"?[\s\S]*not exists/i)
    expect(pasos[4]!.sql).toMatch(/delete from "?account_metrics"?/i)
    expect(pasos[5]!.sql).toMatch(/update "?scheduled_post_targets"?[\s\S]*not exists/i)
    expect(pasos[6]!.sql).toMatch(/delete from "?scheduled_post_targets"?/i)
    // post_comments no tiene unique: todo se mueve.
    expect(pasos[7]!.sql).toMatch(/update "?post_comments"?[\s\S]*set "?account_id"?/i)
    expect(pasos[7]!.sql).not.toMatch(/not exists/i)
  })
})
