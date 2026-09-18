/**
 * Chart tokens. The categorical order is fixed and never cycled — a ninth series
 * folds into "Otro" rather than inventing a hue.
 *
 * La validación (piso de croma, separación para daltonismo, contraste ≥ 3:1) ya no
 * se afirma aquí de palabra: se mide en `color.test.ts` contra la superficie de
 * referencia, que es la de la chapa (`CHART.surface`) porque los gráficos viven
 * dentro de un `Panel`, no sobre el fondo de la página.
 */
export const SERIES = [
  '#3987e5', // blue
  '#1f9aa8', // cian, no naranja: el naranja es la brasa de la marca y se confundía con lo accionable
  '#199e70', // aqua
  '#c98500', // yellow
  '#d55181', // magenta
  '#008300', // green
  '#9085e9', // violet
  '#e66767', // red
] as const

export const CHART = {
  surface: '#1d2124',
  grid: '#242a2f',
  axis: '#2a2e33',
  muted: '#6b7076',
  text: '#f2ebe2',
  secondary: '#948a80',
} as const

/** Sequential blue, low → high. On a dark surface, near-zero recedes to the plane. */
export const SEQUENTIAL = [
  '#1b2338',
  '#184f95',
  '#256abf',
  '#3987e5',
  '#5598e7',
  '#86b6ef',
  '#cde2fb',
] as const

/** Ordinal steps for the funnel. Nothing darker than step 600 on dark. */
export const ORDINAL = ['#86b6ef', '#3987e5', '#184f95'] as const

export const POSITIVE = '#0ca30c'
export const NEGATIVE = '#d03b3b'

export function seriesColor(index: number): string {
  return SERIES[index % SERIES.length]!
}
