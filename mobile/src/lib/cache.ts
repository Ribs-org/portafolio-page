import AsyncStorage from '@react-native-async-storage/async-storage'

export type Cached<T> = { data: T; savedAt: number }

/** Cinco minutos: lo justo para que abrir dos veces seguidas no golpee la red. */
const FRESH_MS = 5 * 60_000

/**
 * Qué decir del dato guardado y si conviene refrescar. La app siempre muestra lo que
 * tiene y refresca por detrás; esto solo decide el sello y si vale la pena la llamada.
 */
export function freshness(
  savedAt: number | null,
  now: number,
): { fresca: boolean; etiqueta: string | null } {
  if (savedAt === null) return { fresca: false, etiqueta: null }
  const edad = now - savedAt
  const etiqueta =
    edad < 60_000
      ? 'recién'
      : edad < 3600_000
        ? `hace ${Math.floor(edad / 60_000)} min`
        : edad < 86_400_000
          ? `hace ${Math.floor(edad / 3600_000)} h`
          : `hace ${Math.floor(edad / 86_400_000)} d`
  return { fresca: edad < FRESH_MS, etiqueta }
}

export async function readCache<T>(key: string): Promise<Cached<T> | null> {
  try {
    const raw = await AsyncStorage.getItem(`cache:${key}`)
    return raw ? (JSON.parse(raw) as Cached<T>) : null
  } catch {
    return null
  }
}

export async function writeCache<T>(key: string, data: T): Promise<void> {
  try {
    await AsyncStorage.setItem(`cache:${key}`, JSON.stringify({ data, savedAt: Date.now() }))
  } catch {
    // Una caché que no se pudo escribir no es motivo para arruinar la pantalla.
  }
}
