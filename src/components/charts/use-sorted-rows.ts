'use client'

import { useMemo, useState } from 'react'

/**
 * Pure comparison function for sorting table rows.
 *
 * Nulls sink to the bottom in both directions on purpose: "no data" is not a small
 * number, and letting it win the ascending sort buries the rows worth reading.
 */
export function compareRows<T extends Record<string, unknown>>(
  a: T,
  b: T,
  key: string,
  descending: boolean,
): number {
  const left = a[key]
  const right = b[key]

  if (left == null && right == null) return 0
  if (left == null) return 1
  if (right == null) return -1

  const comparison =
    typeof left === 'string' && typeof right === 'string'
      ? left.localeCompare(right, 'es')
      : Number(left) - Number(right)

  return descending ? -comparison : comparison
}

/**
 * Column sorting for a table of plain rows.
 *
 * Nulls sink to the bottom in both directions on purpose: "no data" is not a small
 * number, and letting it win the ascending sort buries the rows worth reading.
 */
export function useSortedRows<T extends Record<string, unknown>>(
  rows: T[],
  initialKey: keyof T & string,
) {
  const [sortKey, setSortKey] = useState<string>(initialKey)
  const [descending, setDescending] = useState(true)

  const sorted = useMemo(() => {
    return [...rows].sort((a, b) => compareRows(a, b, sortKey, descending))
  }, [rows, sortKey, descending])

  function toggle(key: string) {
    if (key === sortKey) setDescending((value) => !value)
    else {
      setSortKey(key)
      setDescending(true)
    }
  }

  return { sorted, sortKey, descending, toggle }
}
