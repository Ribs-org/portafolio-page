/**
 * Lo mínimo para poder afirmar en un test que la paleta de datos se lee.
 *
 * Existe porque `theme.ts` documentaba su validación en un comentario: al cambiar una
 * serie, ese comentario quedaba mintiendo y nadie se enteraba. Aquí la propiedad se mide.
 *
 * ΔE es CIE76, no CIEDE2000: para decidir «estos dos se confunden» a las distancias que
 * nos importan basta, y se puede leer de una sentada.
 */

function canal(hex: string, desde: number): number {
  return parseInt(hex.slice(desde, desde + 2), 16) / 255
}

function rgb(hex: string): [number, number, number] {
  const limpio = hex.replace('#', '')
  if (limpio.length !== 6) throw new Error(`Color no reconocido: ${hex}`)
  return [canal(limpio, 0), canal(limpio, 2), canal(limpio, 4)]
}

/** sRGB a lineal: el paso que casi todo el mundo se salta y que descuadra cualquier cálculo. */
const lineal = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)

function luminancia(hex: string): number {
  const [r, g, b] = rgb(hex).map(lineal) as [number, number, number]
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** Razón de contraste WCAG: 1 es invisible, 21 es blanco sobre negro. */
export function contraste(a: string, b: string): number {
  const la = luminancia(a)
  const lb = luminancia(b)
  const claro = Math.max(la, lb)
  const oscuro = Math.min(la, lb)
  return (claro + 0.05) / (oscuro + 0.05)
}

function lab(hex: string): [number, number, number] {
  const [r, g, b] = rgb(hex).map(lineal) as [number, number, number]
  const x = (r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047
  const y = r * 0.2126 + g * 0.7152 + b * 0.0722
  const z = (r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116)
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))]
}

/** ΔE CIE76. Por debajo de 15, dos series se confunden en un gráfico apretado. */
export function distancia(a: string, b: string): number {
  const [l1, a1, b1] = lab(a)
  const [l2, a2, b2] = lab(b)
  return Math.hypot(l1 - l2, a1 - a2, b1 - b2)
}
