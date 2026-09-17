import 'server-only'
import { hkdfSync } from 'node:crypto'
import { and, asc, desc, eq, gt, isNull } from 'drizzle-orm'
import { codigosIngreso, getDb, users, type Usuario } from '@/db'
import { enviarCorreo } from './correo'
import { env } from './env'
import {
  CODIGO_INCORRECTO,
  CORREO_INVALIDO,
  DEMASIADOS_INTENTOS,
  MAX_INTENTOS,
  USUARIO_CON_INGRESOS,
  USUARIO_YA_INVITADO,
  VENTANA_MS,
  VIGENCIA_MS,
  codigoCoincide,
  generarCodigo,
  hashCodigo,
  normalizarCorreo,
  puedePedir,
  vigente,
} from './ingreso'

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

/**
 * Manda un código nuevo al correo, si ese correo está invitado y no pasó el tope. No dice
 * nada de vuelta a propósito: quien llama responde lo mismo exista o no el usuario.
 */
export async function pedir(correo: string): Promise<void> {
  await asegurarAdmin()
  const usuario = await buscarPorCorreo(correo)
  if (!usuario) return
  const now = new Date()
  if (!puedePedir(await pedidosRecientes(usuario.id, now), now)) return
  const db = getDb()
  // Un código nuevo invalida los vivos: solo el último sirve.
  await db
    .update(codigosIngreso)
    .set({ usadoEn: now })
    .where(and(eq(codigosIngreso.userId, usuario.id), isNull(codigosIngreso.usadoEn)))
  const codigo = generarCodigo()
  await db.insert(codigosIngreso).values({
    userId: usuario.id,
    hash: hashCodigo(codigo, claveCodigos()),
    expiraEn: new Date(now.getTime() + VIGENCIA_MS),
  })
  const enviado = await enviarCorreo({
    to: usuario.correo,
    subject: `${codigo} es tu código para entrar a Parrilla`,
    text: `Tu código para entrar a Parrilla es ${codigo}. Vale diez minutos. Si no lo pediste, ignora este correo.`,
  })
  if (!enviado) console.error('[ingreso] no se pudo mandar el código a', usuario.correo)
}

/**
 * Consume el último código vivo de ese correo. Devuelve al usuario o la frase que
 * corresponda; quien llama decide si abre una sesión web o emite un token del teléfono.
 */
export async function canjear(correo: string, codigo: string): Promise<{ usuario: Usuario } | { error: string }> {
  const usuario = await buscarPorCorreo(correo)
  if (!usuario) return { error: CODIGO_INCORRECTO }

  const db = getDb()
  const now = new Date()
  const [fila] = await db
    .select()
    .from(codigosIngreso)
    .where(and(eq(codigosIngreso.userId, usuario.id), isNull(codigosIngreso.usadoEn), gt(codigosIngreso.expiraEn, now)))
    .orderBy(desc(codigosIngreso.createdAt))
    .limit(1)
  if (!fila) return { error: CODIGO_INCORRECTO }
  // Los intentos agotados se dicen en cada reintento, no solo en el que agota el contador.
  if (fila.intentos >= MAX_INTENTOS) return { error: DEMASIADOS_INTENTOS }
  if (!vigente(fila, now)) return { error: CODIGO_INCORRECTO }

  if (!codigoCoincide(codigo, fila.hash, claveCodigos())) {
    const intentos = fila.intentos + 1
    await db.update(codigosIngreso).set({ intentos }).where(eq(codigosIngreso.id, fila.id))
    return { error: intentos >= MAX_INTENTOS ? DEMASIADOS_INTENTOS : CODIGO_INCORRECTO }
  }

  await db.update(codigosIngreso).set({ usadoEn: now }).where(eq(codigosIngreso.id, fila.id))
  await db
    .update(users)
    .set({ primerIngresoEn: usuario.primerIngresoEn ?? now, updatedAt: now })
    .where(eq(users.id, usuario.id))
  return { usuario }
}
