import 'server-only'
import { eq } from 'drizzle-orm'
import { ajustes, getDb } from '@/db'

export async function leerAjuste(clave: string): Promise<string | null> {
  const [fila] = await getDb().select().from(ajustes).where(eq(ajustes.clave, clave)).limit(1)
  return fila?.valor ?? null
}
