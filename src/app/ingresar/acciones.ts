'use server'

import { redirect } from 'next/navigation'
import { createSession } from '@/lib/auth'
import { CORREO_INVALIDO, DEMASIADOS_INTENTOS, normalizarCorreo } from '@/lib/ingreso'
import { demasiadosIntentos } from '@/lib/limite-ip'
import { canjear, pedir } from '@/lib/usuarios'

export type FormState = { error?: string; ok?: boolean; correo?: string }

/**
 * Siempre la misma frase, exista o no el correo: la lista de invitados no se revela por
 * la diferencia entre dos mensajes. El admin se asegura acá para que el primer ingreso
 * del dueño funcione sin ningún paso previo.
 */
export async function pedirCodigo(_prev: FormState, formData: FormData): Promise<FormState> {
  const correo = normalizarCorreo(String(formData.get('correo') ?? ''))
  if (!correo) return { error: CORREO_INVALIDO }
  if (await demasiadosIntentos('pedir', 10, 10 * 60_000)) redirect(`/ingresar/codigo?correo=${encodeURIComponent(correo)}`)
  await pedir(correo)
  redirect(`/ingresar/codigo?correo=${encodeURIComponent(correo)}`)
}

export async function canjearCodigo(_prev: FormState, formData: FormData): Promise<FormState> {
  const correo = normalizarCorreo(String(formData.get('correo') ?? ''))
  const codigo = String(formData.get('codigo') ?? '').replace(/\D/g, '')
  if (!correo) return { error: CORREO_INVALIDO }
  if (await demasiadosIntentos('canjear', 20, 10 * 60_000)) return { error: DEMASIADOS_INTENTOS, correo }

  const resultado = await canjear(correo, codigo)
  if ('error' in resultado) return { error: resultado.error, correo }

  await createSession(resultado.usuario)
  redirect('/admin')
}
