/**
 * Chart tokens. The categorical order is fixed and never cycled — a ninth series
 * folds into "Otro" rather than inventing a hue.
 *
 * Validated against the dashboard surface (#17151f) in dark mode: lightness band,
 * chroma floor, adjacent CVD separation (worst ΔE 8.4), normal-vision floor (19.3)
 * and contrast (all ≥ 3:1) all pass.
 */
export const SERIES = [
  '#3987e5', // blue
  '#d95926', // orange
  '#199e70', // aqua
  '#c98500', // yellow
  '#d55181', // magenta
  '#008300', // green
  '#9085e9', // violet
  '#e66767', // red
] as const

export const CHART = {
  surface: '#17151f',
  grid: '#2c2c2a',
  axis: '#383835',
  muted: '#898781',
  text: '#edeaf2',
  secondary: '#9c96ad',
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
