'use server'

import { redirect } from 'next/navigation'
import { createSession } from '@/lib/auth'
import { CORREO_INVALIDO, normalizarCorreo } from '@/lib/ingreso'
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
  await pedir(correo)
  redirect(`/ingresar/codigo?correo=${encodeURIComponent(correo)}`)
}

export async function canjearCodigo(_prev: FormState, formData: FormData): Promise<FormState> {
  const correo = normalizarCorreo(String(formData.get('correo') ?? ''))
  const codigo = String(formData.get('codigo') ?? '').replace(/\D/g, '')
  if (!correo) return { error: CORREO_INVALIDO }

  const resultado = await canjear(correo, codigo)
  if ('error' in resultado) return { error: resultado.error, correo }

  await createSession(resultado.usuario)
  redirect('/admin')
}
