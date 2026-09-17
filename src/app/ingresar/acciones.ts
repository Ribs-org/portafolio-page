'use server'

import { and, desc, eq, gt, isNull } from 'drizzle-orm'
import { redirect } from 'next/navigation'
import { codigosIngreso, getDb, users } from '@/db'
import { createSession } from '@/lib/auth'
import { enviarCorreo } from '@/lib/correo'
import {
  CODIGO_INCORRECTO,
  CORREO_INVALIDO,
  DEMASIADOS_INTENTOS,
  MAX_INTENTOS,
  VIGENCIA_MS,
  codigoCoincide,
  generarCodigo,
  hashCodigo,
  normalizarCorreo,
  puedePedir,
  vigente,
} from '@/lib/ingreso'
import { asegurarAdmin, buscarPorCorreo, claveCodigos, pedidosRecientes } from '@/lib/usuarios'

export type FormState = { error?: string; ok?: boolean; correo?: string }

/**
 * Siempre la misma frase, exista o no el correo: la lista de invitados no se revela por
 * la diferencia entre dos mensajes. El admin se asegura acá para que el primer ingreso
 * del dueño funcione sin ningún paso previo.
 */
export async function pedirCodigo(_prev: FormState, formData: FormData): Promise<FormState> {
  const correo = normalizarCorreo(String(formData.get('correo') ?? ''))
  if (!correo) return { error: CORREO_INVALIDO }
  await asegurarAdmin()
  const usuario = await buscarPorCorreo(correo)
  if (usuario) {
    const now = new Date()
    if (puedePedir(await pedidosRecientes(usuario.id, now), now)) {
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
  }
  redirect(`/ingresar/codigo?correo=${encodeURIComponent(correo)}`)
}

export async function canjearCodigo(_prev: FormState, formData: FormData): Promise<FormState> {
  const correo = normalizarCorreo(String(formData.get('correo') ?? ''))
  const codigo = String(formData.get('codigo') ?? '').replace(/\D/g, '')
  if (!correo) return { error: CORREO_INVALIDO }
  const usuario = await buscarPorCorreo(correo)
  if (!usuario) return { error: CODIGO_INCORRECTO, correo }

  const db = getDb()
  const now = new Date()
  const [fila] = await db
    .select()
    .from(codigosIngreso)
    .where(and(eq(codigosIngreso.userId, usuario.id), isNull(codigosIngreso.usadoEn), gt(codigosIngreso.expiraEn, now)))
    .orderBy(desc(codigosIngreso.createdAt))
    .limit(1)
  if (!fila) return { error: CODIGO_INCORRECTO, correo }
  // Los intentos agotados se dicen en cada reintento, no solo en el que agota el contador.
  if (fila.intentos >= MAX_INTENTOS) return { error: DEMASIADOS_INTENTOS, correo }
  if (!vigente(fila, now)) return { error: CODIGO_INCORRECTO, correo }

  if (!codigoCoincide(codigo, fila.hash, claveCodigos())) {
    const intentos = fila.intentos + 1
    await db.update(codigosIngreso).set({ intentos }).where(eq(codigosIngreso.id, fila.id))
    return { error: intentos >= MAX_INTENTOS ? DEMASIADOS_INTENTOS : CODIGO_INCORRECTO, correo }
  }

  await db.update(codigosIngreso).set({ usadoEn: now }).where(eq(codigosIngreso.id, fila.id))
  await db
    .update(users)
    .set({ primerIngresoEn: usuario.primerIngresoEn ?? now, updatedAt: now })
    .where(eq(users.id, usuario.id))
  await createSession(usuario)
  redirect('/admin')
}
