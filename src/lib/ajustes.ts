import 'server-only'
import { eq } from 'drizzle-orm'
import { ajustes, getDb } from '@/db'

export async function leerAjuste(clave: string): Promise<string | null> {
  const [fila] = await getDb().select().from(ajustes).where(eq(ajustes.clave, clave)).limit(1)
  return fila?.valor ?? null
}

export async function guardarAjuste(clave: string, valor: string): Promise<void> {
  await getDb()
    .insert(ajustes)
    .values({ clave, valor })
    .onConflictDoUpdate({ target: ajustes.clave, set: { valor, updatedAt: new Date() } })
}
