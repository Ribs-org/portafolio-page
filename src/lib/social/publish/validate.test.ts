import { describe, expect, it } from 'vitest'
import { validateScheduleDraft, type ScheduleDraft } from './validate'

const now = new Date('2026-08-31T12:00:00Z')
const base: ScheduleDraft = {
  caption: 'Hola',
  imageCount: 1,
  videoCount: 0,
  networks: ['instagram'],
  scheduledAt: new Date('2026-08-31T13:00:00Z'),
}

describe('validateScheduleDraft', () => {
  it('acepta una foto con caption, destino y hora futura', () => {
    expect(validateScheduleDraft(base, now)).toBeNull()
  })

  it('acepta un solo video', () => {
    expect(validateScheduleDraft({ ...base, imageCount: 0, videoCount: 1 }, now)).toBeNull()
  })

  it('acepta un carrusel mixto de hasta diez', () => {
    expect(validateScheduleDraft({ ...base, imageCount: 8, videoCount: 2 }, now)).toBeNull()
  })

  it('rechaza no adjuntar nada', () => {
    expect(validateScheduleDraft({ ...base, imageCount: 0 }, now)).toMatch(/archivo/)
  })

  it('rechaza más de diez archivos', () => {
    expect(validateScheduleDraft({ ...base, imageCount: 11 }, now)).toMatch(/diez/)
  })

  it('rechaza quedarse sin destino', () => {
    expect(validateScheduleDraft({ ...base, networks: [] }, now)).toMatch(/plataforma/)
  })

  it('rechaza una hora pasada o ilegible', () => {
    expect(validateScheduleDraft({ ...base, scheduledAt: new Date('2026-08-31T11:59:00Z') }, now)).toMatch(/futuro/)
    expect(validateScheduleDraft({ ...base, scheduledAt: null }, now)).toMatch(/fecha/)
  })

  it('rechaza un caption sobre el límite de Instagram', () => {
    expect(validateScheduleDraft({ ...base, caption: 'x'.repeat(2201) }, now)).toMatch(/largo/)
  })

  it('acepta caption vacío: un carrusel sin texto es un post legítimo', () => {
    expect(validateScheduleDraft({ ...base, caption: '' }, now)).toBeNull()
  })
})

describe('validación por destino (Threads y X)', () => {
  it('acepta texto puro cuando ningún destino exige archivo', () => {
    expect(
      validateScheduleDraft(
        { ...base, imageCount: 0, networks: ['x', 'threads', 'facebook'] },
        now,
      ),
    ).toBeNull()
  })

  it('rechaza texto puro si Instagram o YouTube están marcados', () => {
    expect(
      validateScheduleDraft({ ...base, imageCount: 0, networks: ['x', 'instagram'] }, now),
    ).toMatch(/archivo/)
    expect(
      validateScheduleDraft({ ...base, imageCount: 0, networks: ['youtube'] }, now),
    ).toMatch(/archivo/)
  })

  it('280 exactos pasan por X; 281 no', () => {
    const conX = { ...base, networks: ['x'], imageCount: 0 }
    expect(validateScheduleDraft({ ...conX, caption: 'x'.repeat(280) }, now)).toBeNull()
    expect(validateScheduleDraft({ ...conX, caption: 'x'.repeat(281) }, now)).toMatch(/280/)
  })

  it('500 exactos pasan por Threads; 501 no', () => {
    const conTh = { ...base, networks: ['threads'], imageCount: 0 }
    expect(validateScheduleDraft({ ...conTh, caption: 'x'.repeat(500) }, now)).toBeNull()
    expect(validateScheduleDraft({ ...conTh, caption: 'x'.repeat(501) }, now)).toMatch(/500/)
  })

  it('un texto largo sin X ni Threads marcados sigue valiendo hasta 2200', () => {
    expect(validateScheduleDraft({ ...base, caption: 'x'.repeat(2200) }, now)).toBeNull()
  })
})
