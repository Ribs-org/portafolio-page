// Las dos decisiones de los scripts de migración, puras para poder probarlas: si el build
// debe migrar, y qué fila registra el baseline. Los scripts en scripts/ solo las llaman.

export const SIN_MIGRACIONES = 'No hay migraciones en drizzle/: corre npm run db:generate primero.'

export type Decision = { accion: 'migrar' } | { accion: 'saltar'; motivo: string }

/**
 * El build del CI no tiene base y no debe fallar por eso. Un preview tampoco migra salvo
 * que la integración de Neon le haya dado su propia rama: hasta entonces tocaría
 * producción. Todo lo demás (producción, development, la máquina del dueño) migra.
 */
export function decidirMigracion(env: {
  databaseUrl?: string
  vercelEnv?: string
  migrarPreviews?: string
}): Decision {
  if (!env.databaseUrl) return { accion: 'saltar', motivo: 'sin DATABASE_URL: build sin base, como el CI' }
  if (env.vercelEnv === 'preview' && env.migrarPreviews !== '1') {
    return { accion: 'saltar', motivo: 'preview sin rama de Neon propia (MIGRAR_PREVIEWS no es 1)' }
  }
  return { accion: 'migrar' }
}

/**
 * Drizzle solo compara la marca de tiempo de la última migración registrada: registrar la
 * primera como aplicada deja a `migrate` aplicando únicamente las siguientes.
 */
export function filaBaseline(
  migraciones: Array<{ hash: string; folderMillis: number }>,
): { hash: string; folderMillis: number } {
  if (migraciones.length === 0) throw new Error(SIN_MIGRACIONES)
  const primera = [...migraciones].sort((a, b) => a.folderMillis - b.folderMillis)[0]!
  return { hash: primera.hash, folderMillis: primera.folderMillis }
}
