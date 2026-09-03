// The LLM editor's free-form content taxonomy. The system only transports it:
// flat object, scalar values, sane size — no opinion on what a "hook" is.

export type Atributos = Record<string, string | number | boolean>

export const ATRIBUTOS_ERROR = 'Los atributos deben ser un objeto plano de valores simples.'

const MAX_KEYS = 20
const MAX_SERIALIZED = 2000

export function validateAtributos(
  value: unknown,
): { atributos: Atributos | null } | { error: string } {
  if (value === undefined || value === null) return { atributos: null }
  if (typeof value !== 'object' || Array.isArray(value)) return { error: ATRIBUTOS_ERROR }

  const entries = Object.entries(value as Record<string, unknown>)
  if (entries.length === 0) return { atributos: null }
  if (entries.length > MAX_KEYS) return { error: ATRIBUTOS_ERROR }
  for (const [, v] of entries) {
    if (typeof v !== 'string' && typeof v !== 'number' && typeof v !== 'boolean') {
      return { error: ATRIBUTOS_ERROR }
    }
  }
  if (JSON.stringify(value).length > MAX_SERIALIZED) return { error: ATRIBUTOS_ERROR }
  return { atributos: value as Atributos }
}
