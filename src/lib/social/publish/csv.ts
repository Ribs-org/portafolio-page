export const CSV_HEADER_ERROR =
  'El encabezado del CSV debe ser exactamente: fecha,texto,redes,media'

/** RFC 4180 in ~40 lines: quoted fields may hold commas, newlines and "" quotes. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false

  for (let i = 0; i < text.length; i++) {
    const char = text[i]!
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        field += char
      }
      continue
    }
    if (char === '"') {
      inQuotes = true
    } else if (char === ',') {
      row.push(field)
      field = ''
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[i + 1] === '\n') i++
      row.push(field)
      field = ''
      if (row.some((cell) => cell !== '')) rows.push(row)
      row = []
    } else {
      field += char
    }
  }
  row.push(field)
  if (row.some((cell) => cell !== '')) rows.push(row)
  return rows
}

function splitPipe(cell: string): string[] {
  return cell
    .split('|')
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
}

export function csvToBatchItems(
  text: string,
): { items: Array<{ fecha: string; texto: string; redes: string[]; media: string[] }> } | { error: string } {
  const rows = parseCsv(text)
  const header = rows[0]
  if (
    !header ||
    header.length !== 4 ||
    header[0] !== 'fecha' ||
    header[1] !== 'texto' ||
    header[2] !== 'redes' ||
    header[3] !== 'media'
  ) {
    return { error: CSV_HEADER_ERROR }
  }

  return {
    items: rows.slice(1).map((row) => ({
      fecha: (row[0] ?? '').trim(),
      texto: row[1] ?? '',
      redes: splitPipe(row[2] ?? ''),
      media: splitPipe(row[3] ?? ''),
    })),
  }
}
