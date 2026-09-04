const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

/** `—` y nunca `0`: la red que no reportó un número no reportó un cero. */
export function num(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—'
  if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(1).replace('.', ',')} M`
  if (Math.abs(value) >= 1_000) return `${(value / 1_000).toFixed(1).replace('.', ',')} mil`
  return String(value)
}

export function pct(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—'
  return `${value.toFixed(1).replace('.', ',')}%`
}

/**
 * El API manda ISO con el offset del sitio ya aplicado; leer sus dígitos es más
 * honesto que construir un Date, que volvería a traducir a la zona del teléfono.
 */
export function shortDate(iso: string): string {
  const mes = MESES[Number(iso.slice(5, 7)) - 1] ?? ''
  return `${Number(iso.slice(8, 10))} ${mes}, ${iso.slice(11, 16)}`
}

