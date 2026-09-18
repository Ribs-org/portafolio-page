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

/** Lineal a sRGB: el inverso de `lineal`, para volver a un hex tras operar en espacio lineal. */
const aSrgb = (c: number) => {
  const claro = Math.min(1, Math.max(0, c))
  return claro <= 0.0031308 ? claro * 12.92 : 1.055 * claro ** (1 / 2.4) - 0.055
}

function aHex(rgb: [number, number, number]): string {
  const canal = (c: number) => Math.round(aSrgb(c) * 255).toString(16).padStart(2, '0')
  return `#${canal(rgb[0])}${canal(rgb[1])}${canal(rgb[2])}`
}

/**
 * Matrices de Machado, Oliveira y Fernandes (2009), «A Physiologically-based Model for
 * Simulation of Color Vision Deficiency», IEEE TVCG 15(6). Son las matrices de severidad
 * 1.0 (dicromacia completa) de la Tabla 1 del artículo, aplicadas en RGB lineal — no sobre
 * sRGB directamente, que es el error común que subestima la confusión real. Es el mismo
 * conjunto que redistribuyen Chromium (cc/paint, filtro «Vision deficiencies» de DevTools)
 * y Coblis, así que los números son verificables contra herramientas de referencia.
 */
const MATRICES: Record<'protan' | 'deutan' | 'tritan', readonly [number, number, number][]> = {
  protan: [
    [0.152286, 1.052583, -0.204868],
    [0.114503, 0.786281, 0.099216],
    [-0.003882, -0.048116, 1.051998],
  ],
  deutan: [
    [0.367322, 0.860646, -0.227968],
    [0.280085, 0.672501, 0.047413],
    [-0.01182, 0.04294, 0.968881],
  ],
  tritan: [
    [1.255528, -0.076749, -0.178779],
    [-0.078411, 0.930809, 0.147602],
    [0.004733, 0.691367, 0.3039],
  ],
}

/** Simula cómo se ve `hex` con daltonismo total (severidad 1.0) del `tipo` dado. */
export function simular(hex: string, tipo: 'protan' | 'deutan' | 'tritan'): string {
  const [r, g, b] = rgb(hex).map(lineal) as [number, number, number]
  const m = MATRICES[tipo]
  const salida: [number, number, number] = [
    m[0][0] * r + m[0][1] * g + m[0][2] * b,
    m[1][0] * r + m[1][1] * g + m[1][2] * b,
    m[2][0] * r + m[2][1] * g + m[2][2] * b,
  ]
  return aHex(salida)
}
