import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { Redes } from './redes'

type Destino = Parameters<typeof Redes>[0]['targets'][number]

function destino(over: Partial<Destino> & Pick<Destino, 'network' | 'status'>): Destino {
  return { handle: null, externalId: null, opciones: null, ...over }
}

// El `title` de cada icono repite el handle a propósito (issue #5 de la revisión: mismo
// vocabulario en el `title` del enlace y en los iconos), así que las pruebas de «una sola
// vez» descartan los atributos antes de contar — lo que se prueba es que el `sr-only` no
// lo repita, no que el atributo `title` deje de existir.
function sinAtributos(html: string): string {
  return html.replace(/title="[^"]*"/g, '')
}

describe('Redes', () => {
  it('dibuja un <svg> por destino', () => {
    const targets = [
      destino({ network: 'instagram', status: 'scheduled', handle: '@a' }),
      destino({ network: 'tiktok', status: 'failed', handle: '@b' }),
      destino({ network: 'x', status: 'published', handle: '@c' }),
    ]
    const html = renderToStaticMarkup(createElement(Redes, { targets }))
    expect(html.match(/<svg/g)?.length).toBe(targets.length)
  })

  it('sin detalle: exactamente un sr-only en la fila, con red, handle y estado por destino', () => {
    const targets = [
      destino({ network: 'instagram', status: 'scheduled', handle: '@vicenteclips' }),
      destino({ network: 'tiktok', status: 'failed', handle: '@otra' }),
    ]
    const html = renderToStaticMarkup(createElement(Redes, { targets }))
    expect(html.match(/sr-only/g)?.length).toBe(1)
    expect(html).toContain('Instagram · @vicenteclips: Programado')
    expect(html).toContain('TikTok · @otra: Falló')
  })

  it('con detalle: ningún sr-only de fila, uno por destino con la red delante, y el handle una sola vez', () => {
    const targets = [
      destino({ network: 'instagram', status: 'failed', handle: '@vicenteclips' }),
      destino({ network: 'tiktok', status: 'published', handle: '@otra' }),
    ]
    const html = renderToStaticMarkup(createElement(Redes, { targets, detalle: true }))
    // Un sr-only por destino, no uno más para la fila.
    expect(html.match(/sr-only/g)?.length).toBe(targets.length)
    expect(html).toContain('Instagram ·')
    expect(html).toContain('TikTok ·')
    expect(html).toContain('Falló')
    expect(html).toContain('Publicado')
    const sinTitulos = sinAtributos(html)
    expect(sinTitulos.match(/@vicenteclips/g)?.length).toBe(1)
    expect(sinTitulos.match(/@otra/g)?.length).toBe(1)
  })

  it('las clases: text-negative en un failed, text-positive en un published, ni una ni otra en un scheduled', () => {
    const render = (status: string) => renderToStaticMarkup(createElement(Redes, { targets: [destino({ network: 'instagram', status })] }))

    const failed = render('failed')
    expect(failed).toContain('text-negative')
    expect(failed).not.toContain('text-positive')

    const published = render('published')
    expect(published).toContain('text-positive')
    expect(published).not.toContain('text-negative')

    const scheduled = render('scheduled')
    expect(scheduled).not.toContain('text-negative')
    expect(scheduled).not.toContain('text-positive')
  })
})
