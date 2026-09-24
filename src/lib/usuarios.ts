import 'server-only'
import { hkdfSync } from 'node:crypto'
import { and, asc, desc, eq, gt, isNull, sql } from 'drizzle-orm'
import { codigosIngreso, getDb, profiles, users, type Usuario } from '@/db'
import { enviarCorreo } from './correo'
import { env } from './env'
import { direccionBase, primeraDireccionLibre } from './slugs'
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

// El nombre real de la restricción de unicidad de `profiles.slug`, confirmado en
// `drizzle/0000_fuzzy_pet_avengers.sql` (no adivinado). Comprobarlo, y no solo el código
// 23505, es lo que evita confundir este choque con una violación de unicidad ajena —de
// otra columna o tabla— que debería propagarse en vez de reintentarse como si el slug
// elegido ya estuviera ocupado. Mismo criterio que `isCampaignUniqueViolation` en
// `src/lib/social/sync.ts`.
const PROFILES_SLUG_UNIQUE_CONSTRAINT = 'profiles_slug_unique'

/**
 * Un choque con la restricción de unicidad de `profiles.slug`, que Postgres reporta como
 * 23505.
 *
 * Drizzle envuelve el error del driver y deja el original en `cause`, así que se mira en
 * los dos lugares: sin esto, un choque se confundiría con una falla real y la invitación
 * moriría en vez de probar el número siguiente.
 */
export function esChoqueDeUnicidad(error: unknown): boolean {
  const coincide = (candidato: unknown): boolean => {
    // El driver de este proyecto es `postgres` (postgres-js), no `node-postgres`: mapea el
    // campo del error a `constraint_name`, no a `constraint` (ver
    // `node_modules/postgres/src/connection.js:46`). Se comprueban los dos nombres por si
    // alguna capa lo normaliza, pero el que realmente llega es `constraint_name`.
    const { code, constraint_name, constraint } =
      (candidato as { code?: string; constraint_name?: string; constraint?: string }) ?? {}
    return code === '23505' && (constraint_name ?? constraint) === PROFILES_SLUG_UNIQUE_CONSTRAINT
  }
  return coincide(error) || coincide((error as { cause?: unknown })?.cause)
}

/**
 * La página que acompaña a cada usuario desde que existe.
 *
 * Nace publicada y sin `noindex`: una página que nadie puede ver no le sirve a nadie. Y
 * nace acá y no en el primer ingreso para que el invariante sea simple: todo usuario tiene
 * exactamente una página, siempre, y ningún código aguas abajo tiene que resolver qué
 * hacer con un usuario sin ella.
 */
async function crearPaginaDe(usuario: Usuario): Promise<void> {
  const base = direccionBase(usuario.correo)
  const nombre = usuario.nombre?.trim() || base

  await primeraDireccionLibre(base, async (slug) => {
    try {
      await getDb().insert(profiles).values({
        ownerId: usuario.id,
        slug,
        displayName: nombre,
        isDefault: true,
        isPublished: true,
        noindex: false,
      })
      return true
    } catch (error) {
      if (esChoqueDeUnicidad(error)) return false
      throw error
    }
  })
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

  // Solo la primera vez. Esta función corre en cada build, y el dueño ya tiene sus
  // páginas: crear otra en cada despliegue sería una fila nueva por despliegue. Si falla,
  // no hay invitación que quede a medias: la próxima llamada lo reintenta desde cero.
  const [tiene] = await db.select({ id: profiles.id }).from(profiles).where(eq(profiles.ownerId, fila!.id)).limit(1)
  if (!tiene) await crearPaginaDe(fila!)

  return fila!
}

/**
 * El id del admin para lo que solo necesita leer. Escribe únicamente la primera vez, que es
 * la única en que la fila puede no existir: la raíz pública la pedía en cada visita.
 */
export async function adminId(): Promise<string> {
  const correo = normalizarCorreo(env('ADMIN_EMAIL') ?? '')
  if (!correo) throw new Error('ADMIN_EMAIL no está configurada o no es un correo')
  const existente = await buscarPorCorreo(correo)
  return existente ? existente.id : (await asegurarAdmin()).id
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
  try {
    await crearPaginaDe(usuario!)
  } catch (error) {
    // Si la página no se pudo crear, no puede quedar un usuario sin ella: se borra la fila
    // recién creada —acotada por su id— y el error sale tal cual. Sin esto se rompería el
    // invariante que justifica crear la página acá: todo usuario tiene exactamente una
    // página, siempre.
    //
    // El borrado tiene su propio `catch`: si la base ya venía fallando —la causa más
    // probable de que `crearPaginaDe` reviente— el borrado también puede fallar, y su
    // error no debe tapar al original. Se registra y se deja pasar; el que sale siempre es
    // el de `crearPaginaDe`.
    try {
      await getDb().delete(users).where(eq(users.id, usuario!.id))
    } catch (errorAlBorrar) {
      console.error('invitar: no se pudo compensar creando el usuario a medias', errorAlBorrar)
    }
    throw error
  }
  return { usuario: usuario! }
}

/**
 * En esta entrega solo se quita a quien nunca entró; el chequeo «sin datos» llega con el
 * dueño en las tablas.
 *
 * Y ese conjunto —quien nunca entró— es exactamente el que ahora siempre tiene página:
 * `profiles.owner_id` referencia a `users.id` con ON DELETE restrict, y todo usuario nace
 * con su perfil (`crearPaginaDe`). Borrar la fila de `users` sin borrar antes su perfil
 * violaría esa restricción siempre, no en un caso raro. Por eso el perfil se borra primero,
 * dentro de la misma transacción que el usuario: todo o nada, para no dejar nunca a alguien
 * a medio quitar —ni, al revés, un usuario sin su página.
 */
export async function quitar(id: string): Promise<{ ok: true } | { error: string }> {
  const usuario = await buscarPorId(id)
  if (!usuario) return { ok: true }
  if (usuario.rol === 'admin' || usuario.primerIngresoEn) return { error: USUARIO_CON_INGRESOS }
  try {
    await getDb().transaction(async (tx) => {
      await tx.delete(profiles).where(eq(profiles.ownerId, id))
      await tx.delete(users).where(eq(users.id, id))
    })
  } catch (error) {
    console.error('quitar: no se pudo borrar al usuario', error)
    return { error: 'No se pudo quitar al usuario. Intenta de nuevo.' }
  }
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
 * Manda un código nuevo al correo, si ese correo está invitado y no pasó el tope. Devuelve
 * si el correo salió; quien llama desde el camino público lo ignora a propósito, porque la
 * respuesta al visitante es la misma exista o no el usuario.
 */
export async function pedir(correo: string): Promise<boolean> {
  await asegurarAdmin()
  const usuario = await buscarPorCorreo(correo)
  if (!usuario) return false
  const now = new Date()
  if (!puedePedir(await pedidosRecientes(usuario.id, now), now)) return false
  const db = getDb()
  // Un código nuevo invalida los vivos: solo el último sirve.
  await db
    .update(codigosIngreso)
    .set({ usadoEn: now })
    .where(and(eq(codigosIngreso.userId, usuario.id), isNull(codigosIngreso.usadoEn)))
  const codigo = generarCodigo()
  const [nueva] = await db
    .insert(codigosIngreso)
    .values({
      userId: usuario.id,
      hash: hashCodigo(codigo, claveCodigos()),
      expiraEn: new Date(now.getTime() + VIGENCIA_MS),
    })
    .returning()
  // En desarrollo no hay Resend: el código sale por la consola del servidor, que es la
  // única forma de probar el ingreso en local. En producción esto no se ejecuta nunca.
  if (process.env.NODE_ENV !== 'production') {
    console.log(`[ingreso] código para ${usuario.correo}: ${codigo}`)
  }
  const enviado = await enviarCorreo({
    to: usuario.correo,
    subject: `${codigo} es tu código para entrar a Parrilla`,
    text: `Tu código para entrar a Parrilla es ${codigo}. Vale diez minutos. Si no lo pediste, ignora este correo.`,
  })
  if (!enviado) {
    console.error('[ingreso] no se pudo mandar el código a', usuario.correo)
    // El cupo frena a quien martilla «reenviar», no a quien no recibió nada: si el correo no salió, la fila no cuenta.
    await getDb().delete(codigosIngreso).where(eq(codigosIngreso.id, nueva!.id))
    return false
  }
  return true
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
    // En SQL y no en memoria: dos intentos a la vez leerían el mismo número y el tope de cinco no se cumpliría.
    const [actualizada] = await db
      .update(codigosIngreso)
      .set({ intentos: sql`${codigosIngreso.intentos} + 1` })
      .where(eq(codigosIngreso.id, fila.id))
      .returning({ intentos: codigosIngreso.intentos })
    const intentos = actualizada?.intentos ?? fila.intentos + 1
    return { error: intentos >= MAX_INTENTOS ? DEMASIADOS_INTENTOS : CODIGO_INCORRECTO }
  }

  await db.update(codigosIngreso).set({ usadoEn: now }).where(eq(codigosIngreso.id, fila.id))
  await db
    .update(users)
    .set({ primerIngresoEn: usuario.primerIngresoEn ?? now, updatedAt: now })
    .where(eq(users.id, usuario.id))
  return { usuario }
}

/**
 * Sube la versión de sesión: la cookie del panel y el token del teléfono de esa persona
 * dejan de valer en su próxima petición. No toca a nadie más ni obliga a rotar
 * AUTH_SECRET, que además cifra los tokens de Instagram, Facebook y YouTube.
 */
export async function cerrarSesiones(id: string): Promise<void> {
  await getDb()
    .update(users)
    .set({ sesionVersion: sql`${users.sesionVersion} + 1`, updatedAt: new Date() })
    .where(eq(users.id, id))
}
