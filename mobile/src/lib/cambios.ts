/**
 * La marca en memoria de «la app escribió algo en el servidor». Las pantallas que
 * muestran lo programado (Resumen, Calendario) la comparan con la fecha de su caché al
 * recibir foco: si la caché es anterior al cambio, refrescan aunque parezca fresca.
 * En memoria a propósito: al reabrir la app la caché se refresca sola por edad.
 */
let ultimoCambio = 0

export function anotarCambio(now: number = Date.now()): void {
  ultimoCambio = now
}

export function huboCambioDesde(savedAt: number | null): boolean {
  return savedAt === null || savedAt < ultimoCambio
}
