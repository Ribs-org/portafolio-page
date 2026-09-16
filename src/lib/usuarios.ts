import 'server-only'
import { hkdfSync } from 'node:crypto'
import { asc, desc, eq } from 'drizzle-orm'
import { codigosIngreso, getDb, users, type Usuario } from '@/db'
import { env } from './env'
import { USUARIO_CON_INGRESOS, USUARIO_YA_INVITADO, VENTANA_MS, normalizarCorreo, CORREO_INVALIDO } from './ingreso'

/** La clave con la que se hashean los códigos: derivada, para no reutilizar AUTH_SECRET. */
export function claveCodigos(): string {
  const secret = env('AUTH_SECRET')
  if (!secret) throw new Error('AUTH_SECRET is not set')
  return Buffer.from(hkdfSync('sha256', secret, 'parrilla-codigos-v1', 'codigos', 32)).toString('hex')
}

/**
 * El primer usuario nace de ADMIN_EMAIL en el primer uso, no en la migración (el SQL no
 * puede leer variables). Idempotente: si ya existe, solo garantiza el rol.
 */
export async function asegurarAdmin(): Promise<Usuario> {
  const correo = normalizarCorreo(env('ADMIN_EMAIL') ?? '')
  if (!correo) throw new Error('ADMIN_EMAIL no está configurada o no es un correo')
  const db = getDb()
  const [fila] = await db
    .insert(users)
    .values({ correo, rol: 'admin' })
    .onConflictDoUpdate({ target: users.correo, set: { rol: 'admin', updatedAt: new Date() } })
    .returning()
  return fila!
}

export async function buscarPorCorreo(correo: string): Promise<Usuario | null> {
  const [fila] = await getDb().select().from(users).where(eq(users.correo, correo)).limit(1)
  return fila ?? null
}

export async function buscarPorId(id: string): Promise<Usuario | null> {
  const [fila] = await getDb().select().from(users).where(eq(users.id, id)).limit(1)
  return fila ?? null
}

export async function listarUsuarios(): Promise<Usuario[]> {
  return getDb().select().from(users).orderBy(asc(users.invitadoEn))
}

export async function invitar(correoBruto: string, nombre: string | null): Promise<{ usuario: Usuario } | { error: string }> {
  const correo = normalizarCorreo(correoBruto)
  if (!correo) return { error: CORREO_INVALIDO }
  if (await buscarPorCorreo(correo)) return { error: USUARIO_YA_INVITADO }
  const [usuario] = await getDb().insert(users).values({ correo, nombre: nombre?.trim() || null }).returning()
  return { usuario: usuario! }
}

/** En esta entrega solo se quita a quien nunca entró; el chequeo «sin datos» llega con el dueño en las tablas. */
export async function quitar(id: string): Promise<{ ok: true } | { error: string }> {
  const usuario = await buscarPorId(id)
  if (!usuario) return { ok: true }
  if (usuario.rol === 'admin' || usuario.primerIngresoEn) return { error: USUARIO_CON_INGRESOS }
  await getDb().delete(users).where(eq(users.id, id))
  return { ok: true }
}

/** Fechas de los códigos pedidos por este usuario en la ventana, para `puedePedir`. */
export async function pedidosRecientes(userId: string, now: Date): Promise<Date[]> {
  const filas = await getDb()
    .select({ createdAt: codigosIngreso.createdAt })
    .from(codigosIngreso)
    .where(eq(codigosIngreso.userId, userId))
    .orderBy(desc(codigosIngreso.createdAt))
    .limit(10)
  const desde = now.getTime() - VENTANA_MS
  return filas.map((f) => f.createdAt).filter((d) => d.getTime() > desde)
}
