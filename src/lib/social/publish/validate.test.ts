import { describe, expect, it } from 'vitest'
import { validateScheduleDraft, type ScheduleDraft, TIKTOK_MEDIA, extensionDe } from './validate'

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

  it('rechaza una hora pasada sin opts', () => {
    expect(
      validateScheduleDraft({ ...base, scheduledAt: new Date('2026-08-31T11:59:00Z') }, now),
    ).toBe('La hora debe estar en el futuro.')
  })

  it('acepta la misma fecha pasada con allowPast: true', () => {
    expect(
      validateScheduleDraft(
        { ...base, scheduledAt: new Date('2026-08-31T11:59:00Z') },
        now,
        { allowPast: true },
      ),
    ).toBeNull()
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

  it('rechaza el post totalmente vacío', () => {
    expect(
      validateScheduleDraft({ ...base, imageCount: 0, caption: '', networks: ['x'] }, now),
    ).toMatch(/texto|archivo/)
  })

  it('rechaza las formas que X y Threads no aceptan, al programar', () => {
    expect(
      validateScheduleDraft({ ...base, imageCount: 0, videoCount: 1, networks: ['x'] }, now),
    ).toMatch(/video/)
    expect(
      validateScheduleDraft({ ...base, imageCount: 5, networks: ['x'] }, now),
    ).toMatch(/cuatro/)
    expect(
      validateScheduleDraft({ ...base, imageCount: 2, networks: ['threads'] }, now),
    ).toMatch(/un solo archivo/)
  })
})

describe('extensionDe', () => {
  it('lee la extensión de un nombre o una URL, sin querystring, en minúscula', () => {
    expect(extensionDe('clip.MP4')).toBe('mp4')
    expect(extensionDe('https://ej.com/a.JPG?x=1')).toBe('jpg')
    expect(extensionDe('https://drive.google.com/uc?id=abc')).toBe('')
    expect(extensionDe('sin-extension')).toBe('')
  })
})

describe('validación por destino (TikTok)', () => {
  const tt = { ...base, networks: ['tiktok'] }

  it('acepta un video solo', () => {
    expect(validateScheduleDraft({ ...tt, imageCount: 0, videoCount: 1, formats: ['mp4'] }, now)).toBeNull()
    expect(validateScheduleDraft({ ...tt, imageCount: 0, videoCount: 1, formats: ['mov'] }, now)).toBeNull()
  })

  it('acepta de una a treinta y cinco fotos', () => {
    expect(validateScheduleDraft({ ...tt, imageCount: 1, formats: ['jpg'] }, now)).toBeNull()
    expect(validateScheduleDraft({ ...tt, imageCount: 35, formats: Array(35).fill('webp') }, now)).toBeNull()
    expect(validateScheduleDraft({ ...tt, imageCount: 36 }, now)).toBe(TIKTOK_MEDIA)
  })

  it('el tope de diez sigue rigiendo si otra red acompaña', () => {
    expect(validateScheduleDraft({ ...tt, networks: ['tiktok', 'instagram'], imageCount: 11 }, now)).toMatch(/diez/)
  })

  it('rechaza cero archivos, dos videos y la mezcla', () => {
    expect(validateScheduleDraft({ ...tt, imageCount: 0, videoCount: 0 }, now)).toMatch(/archivo/)
    expect(validateScheduleDraft({ ...tt, imageCount: 0, videoCount: 2 }, now)).toBe(TIKTOK_MEDIA)
    expect(validateScheduleDraft({ ...tt, imageCount: 1, videoCount: 1 }, now)).toBe(TIKTOK_MEDIA)
  })

  it('rechaza los formatos que TikTok no toma, y difiere los desconocidos', () => {
    expect(validateScheduleDraft({ ...tt, imageCount: 1, formats: ['png'] }, now)).toBe(TIKTOK_MEDIA)
    expect(validateScheduleDraft({ ...tt, imageCount: 1, formats: ['gif'] }, now)).toBe(TIKTOK_MEDIA)
    expect(validateScheduleDraft({ ...tt, imageCount: 0, videoCount: 1, formats: ['avi'] }, now)).toBe(TIKTOK_MEDIA)
    expect(validateScheduleDraft({ ...tt, imageCount: 1, formats: [''] }, now)).toBeNull()
  })

  it('los formatos no molestan a las demás redes', () => {
    expect(validateScheduleDraft({ ...base, imageCount: 1, formats: ['png'] }, now)).toBeNull()
  })

  it('el caption de TikTok llega hasta 2200', () => {
    expect(validateScheduleDraft({ ...tt, imageCount: 1, caption: 'x'.repeat(2200) }, now)).toBeNull()
    expect(validateScheduleDraft({ ...tt, imageCount: 1, caption: 'x'.repeat(2201) }, now)).toMatch(/largo/)
  })
})
