/**
 * El sitio en producción. La app no tiene ambiente de pruebas propio: apunta al
 * mismo backend que el panel, y `EXPO_PUBLIC_API_BASE` existe solo para apuntar a
 * un túnel local mientras se desarrolla.
 */
export const API_BASE = process.env.EXPO_PUBLIC_API_BASE ?? 'https://www.vicente-pareja.cl'
