import 'server-only'
import { and, eq } from 'drizzle-orm'
import { ajustes, getDb } from '@/db'

/**
 * Los ajustes de cada usuario: su voz para los borradores, su texto de privado. El cupo de
 * lecturas de X no vive aquí por usuario sino en la fila del admin, porque mide una llave
 * de API compartida por todo el despliegue: repartirla por persona la gastaría N veces.
 */

export async function leerAjuste(ownerId: string, clave: string): Promise<string | null> {
  const [fila] = await getDb()
    .select()
    .from(ajustes)
    .where(and(eq(ajustes.ownerId, ownerId), eq(ajustes.clave, clave)))
    .limit(1)
  return fila?.valor ?? null
}

export async function guardarAjuste(ownerId: string, clave: string, valor: string): Promise<void> {
  // La única es del par (owner_id, clave): cada dueño tiene su propia fila para la misma
  // clave, así que el upsert no necesita ningún rodeo.
  await getDb()
    .insert(ajustes)
    .values({ ownerId, clave, valor })
    .onConflictDoUpdate({
      target: [ajustes.ownerId, ajustes.clave],
      set: { valor, updatedAt: new Date() },
    })
}
