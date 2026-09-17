// El ingreso por correo, en su parte pura: qué correo vale, cómo se genera y se guarda un
// código, cuándo sigue vivo y cuántos se pueden pedir. Quien toca la base y Resend está en
// lib/usuarios.ts y en las acciones de /ingresar.
import { createHash, randomInt, timingSafeEqual } from 'node:crypto'

export const CORREO_INVALIDO = 'Ese correo no se ve bien.'
export const CODIGO_ENVIADO = 'Si tu correo está invitado, te llegará un código en un minuto.'
export const CODIGO_INCORRECTO = 'Ese código no es válido o ya venció.'
export const DEMASIADOS_INTENTOS = 'Demasiados intentos. Pide un código nuevo.'
export const SESION_CADUCADA = 'Tu sesión terminó. Vuelve a entrar.'
export const USUARIO_YA_INVITADO = 'Ese correo ya está invitado.'
export const USUARIO_CON_INGRESOS = 'Ese usuario ya entró alguna vez; no se puede quitar todavía.'

export const VIGENCIA_MS = 10 * 60_000
export const MAX_INTENTOS = 5
export const MAX_CODIGOS_POR_VENTANA = 3
export const VENTANA_MS = 15 * 60_000

const CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
const MAX_CORREO = 254

/** Minúsculas y sin espacios: es la clave por la que se busca al usuario. */
export function normalizarCorreo(bruto: string): string | null {
  const limpio = bruto.trim().toLowerCase()
  if (limpio.length === 0 || limpio.length > MAX_CORREO) return null
  return CORREO.test(limpio) ? limpio : null
}

export function generarCodigo(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0')
}

/** Con la clave derivada, para que una copia de la tabla no sirva de nada por sí sola. */
export function hashCodigo(codigo: string, clave: string): string {
  return createHash('sha256').update(`${codigo}:${clave}`).digest('hex')
}

export function codigoCoincide(codigo: string, hash: string, clave: string): boolean {
  if (!/^\d{6}$/.test(codigo)) return false
  const a = Buffer.from(hashCodigo(codigo, clave), 'hex')
  const b = Buffer.from(hash, 'hex')
  return a.length === b.length && timingSafeEqual(a, b)
}

export function vigente(fila: { expiraEn: Date; usadoEn: Date | null; intentos: number }, now: Date): boolean {
  if (fila.usadoEn) return false
  if (fila.intentos >= MAX_INTENTOS) return false
  return fila.expiraEn.getTime() > now.getTime()
}

/** Tres códigos por usuario cada quince minutos: frena a quien martille «reenviar». */
export function puedePedir(pedidosRecientes: Date[], now: Date): boolean {
  const desde = now.getTime() - VENTANA_MS
  return pedidosRecientes.filter((d) => d.getTime() > desde).length < MAX_CODIGOS_POR_VENTANA
}
