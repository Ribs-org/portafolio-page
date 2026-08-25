import { describe, it, expect } from 'vitest'
import { compareRows } from './use-sorted-rows'

describe('compareRows', () => {
  // Mock row type for testing
  type TestRow = {
    name: string
    value: number | null | undefined
  }

  describe('numeric comparison', () => {
    it('should sort numbers ascending correctly', () => {
      const a: TestRow = { name: 'a', value: 5 }
      const b: TestRow = { name: 'b', value: 10 }

      const result = compareRows(a, b, 'value', false)
      expect(result).toBeLessThan(0) // a < b in ascending order
    })

    it('should sort numbers descending correctly', () => {
      const a: TestRow = { name: 'a', value: 5 }
      const b: TestRow = { name: 'b', value: 10 }

      const result = compareRows(a, b, 'value', true)
      expect(result).toBeGreaterThan(0) // a > b in descending order (reversed)
    })
  })

  describe('string comparison with locale', () => {
    it('should sort strings ascending with Spanish locale', () => {
      const a: TestRow = { name: 'alfa', value: 1 }
      const b: TestRow = { name: 'beta', value: 2 }

      const result = compareRows(a, b, 'name', false)
      expect(result).toBeLessThan(0) // 'alfa' < 'beta'
    })

    it('should sort strings descending with Spanish locale', () => {
      const a: TestRow = { name: 'alfa', value: 1 }
      const b: TestRow = { name: 'beta', value: 2 }

      const result = compareRows(a, b, 'name', true)
      expect(result).toBeGreaterThan(0) // reversed: 'beta' < 'alfa'
    })

    it('should respect Spanish locale for accented characters', () => {
      const a: TestRow = { name: 'árbol', value: 1 }
      const b: TestRow = { name: 'aro', value: 2 }

      // In Spanish locale, 'á' sorts near 'a', not after 'z'
      const result = compareRows(a, b, 'name', false)
      expect(result).toBeLessThan(0) // 'árbol' < 'aro'
    })
  })

  describe('null handling', () => {
    it('should sink null to bottom in ascending sort', () => {
      const a: TestRow = { name: 'a', value: null }
      const b: TestRow = { name: 'b', value: 10 }

      const result = compareRows(a, b, 'value', false)
      expect(result).toBeGreaterThan(0) // null sinks down
    })

    it('should sink null to bottom in descending sort', () => {
      const a: TestRow = { name: 'a', value: null }
      const b: TestRow = { name: 'b', value: 10 }

      const result = compareRows(a, b, 'value', true)
      expect(result).toBeGreaterThan(0) // null sinks down (same behavior)
    })

    it('should return 0 when both are null', () => {
      const a: TestRow = { name: 'a', value: null }
      const b: TestRow = { name: 'b', value: null }

      const result = compareRows(a, b, 'value', false)
      expect(result).toBe(0) // equal
    })

    it('should return 0 when both are null in descending sort', () => {
      const a: TestRow = { name: 'a', value: null }
      const b: TestRow = { name: 'b', value: null }

      const result = compareRows(a, b, 'value', true)
      expect(result).toBe(0) // equal
    })
  })

  describe('undefined handling', () => {
    it('should sink undefined to bottom in ascending sort', () => {
      const a: TestRow = { name: 'a', value: undefined }
      const b: TestRow = { name: 'b', value: 10 }

      const result = compareRows(a, b, 'value', false)
      expect(result).toBeGreaterThan(0) // undefined sinks down
    })

    it('should sink undefined to bottom in descending sort', () => {
      const a: TestRow = { name: 'a', value: undefined }
      const b: TestRow = { name: 'b', value: 10 }

      const result = compareRows(a, b, 'value', true)
      expect(result).toBeGreaterThan(0) // undefined sinks down (same behavior)
    })

    it('should return 0 when both are undefined', () => {
      const a: TestRow = { name: 'a', value: undefined }
      const b: TestRow = { name: 'b', value: undefined }

      const result = compareRows(a, b, 'value', false)
      expect(result).toBe(0) // equal
    })
  })

  describe('integration with real sort', () => {
    it('should sort array with nulls at the bottom in ascending order', () => {
      const rows: TestRow[] = [
        { name: 'z', value: 15 },
        { name: 'a', value: null },
        { name: 'b', value: 5 },
        { name: 'c', value: 10 },
      ]

      const sorted = rows.sort((a, b) => compareRows(a, b, 'value', false))

      // Should be: 5, 10, 15, null
      expect(sorted[0].value).toBe(5)
      expect(sorted[1].value).toBe(10)
      expect(sorted[2].value).toBe(15)
      expect(sorted[3].value).toBeNull()
    })

    it('should sort array with nulls at the bottom in descending order', () => {
      const rows: TestRow[] = [
        { name: 'z', value: 15 },
        { name: 'a', value: null },
        { name: 'b', value: 5 },
        { name: 'c', value: 10 },
      ]

      const sorted = rows.sort((a, b) => compareRows(a, b, 'value', true))

      // Should be: 15, 10, 5, null (descending but null still last)
      expect(sorted[0].value).toBe(15)
      expect(sorted[1].value).toBe(10)
      expect(sorted[2].value).toBe(5)
      expect(sorted[3].value).toBeNull()
    })
  })
})
