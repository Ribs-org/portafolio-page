import { ImageResponse } from 'next/og'

export const dynamic = 'force-static'

/**
 * La imagen con la que se ve la landing al compartirla.
 *
 * Las páginas de los creadores ya armaban tarjeta completa —`profileMetadata` les pone
 * `openGraph` y `twitter` con su avatar—, pero la puerta de entrada del producto salía
 * como un enlace pelado. Estaba al revés.
 *
 * Vive en una ruta propia y no en el archivo `opengraph-image.tsx` porque la raíz sirve dos
 * cosas según el dominio: la landing en el del producto y el perfil del dueño en el suyo.
 * El archivo se aplicaría a las dos y le pisaría la imagen al perfil.
 *
 * Se dibuja con estilos en línea: el motor de `next/og` no entiende clases de Tailwind ni
 * las variables CSS del proyecto, así que los colores van literales. Son los mismos de
 * `globals.css`: acero y brasa.
 */
const ACERO_950 = '#16181a'
const ACERO_700 = '#2a2e33'
const BRASA = '#e8621f'
const FG = '#f2ebe2'

/** La misma semana del hero: apagados, prendidos y llenos. */
const SEMANA = [1, 0, 3, 1, 3, 0, 1]

export function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          background: ACERO_950,
          padding: 72,
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: 26, letterSpacing: 8, color: '#6b7076' }}>TU PARRILLA</div>
          <div style={{ marginTop: 28, fontSize: 76, fontWeight: 700, color: FG, lineHeight: 1.1 }}>
            Programa la semana.
          </div>
          <div style={{ fontSize: 76, fontWeight: 700, color: FG, lineHeight: 1.1 }}>
            Mira qué trajo cada corte.
          </div>
        </div>

        <div style={{ display: 'flex', gap: 14 }}>
          {SEMANA.map((cortes, i) => (
            <div
              key={i}
              style={{
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'flex-end',
                width: 140,
                height: 150,
                padding: 10,
                borderRadius: 4,
                border: `1px solid ${cortes >= 3 ? BRASA : ACERO_700}`,
                background:
                  cortes === 0
                    ? '#1b1f23'
                    : cortes >= 3
                      ? 'linear-gradient(to bottom, #3a2418, #b8491a)'
                      : 'linear-gradient(to bottom, #23201e, #55301c)',
              }}
            >
              {Array.from({ length: cortes }, (_, j) => (
                <div key={j} style={{ height: 9, marginTop: 7, borderRadius: 2, background: ACERO_950, opacity: 0.7 }} />
              ))}
            </div>
          ))}
        </div>
      </div>
    ),
    { width: 1200, height: 630 },
  )
}
