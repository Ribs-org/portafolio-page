import { useCallback, useEffect, useState } from 'react'
import { DarkTheme, Stack, ThemeProvider, useRouter, type Theme } from 'expo-router'
// Del subcamino y no del paquete: el índice reexporta los seis grosores de Oswald y
// Metro se lleva los seis al paquete — 528 KB de tipografía para usar 88. `useFonts`
// sale de `expo-font`, que ya es dependencia directa.
import { Oswald_600SemiBold } from '@expo-google-fonts/oswald/600SemiBold'
import { useFonts } from 'expo-font'
import * as LocalAuthentication from 'expo-local-authentication'
import { StatusBar } from 'expo-status-bar'
import { COLORES, Cargando, TIPO_TITULO } from '../components/ui'
import { readToken } from '../lib/session'

// Sin esto el navegador pinta su tema claro debajo de todo: el fondo de escena y
// las cabeceras nativas salían blancos aunque cada pantalla se dibuje oscura.
const TEMA: Theme = {
  ...DarkTheme,
  colors: { ...DarkTheme.colors, background: COLORES.fondo, card: COLORES.tarjeta },
}

export default function RootLayout() {
  const [listo, setListo] = useState(false)
  const router = useRouter()
  /*
   * Oswald en tiempo de ejecución y no por el plugin de `expo-font`: el plugin es más
   * eficiente pero exige `prebuild`, o sea tocar la tubería nativa, y esto es un cambio
   * de piel. La espera cae dentro de la compuerta de carga que esta pantalla ya tenía.
   * Si la fuente no carga, se entra igual con la del sistema: quedarse en la pantalla de
   * inicio por una tipografía sería peor que verse distinto.
   */
  const [fuentesListas, errorFuentes] = useFonts({ Oswald_600SemiBold })

  const arrancar = useCallback(async () => {
    const token = await readToken()
    if (!token) {
      setListo(true)
      router.replace('/login')
      return
    }
    // El candado del dispositivo: `hasHardwareAsync`/`isEnrolledAsync` solo ven
    // biometría (huella o cara), así que un teléfono con solo PIN o patrón
    // pasaba directo sin pedir nada — pese a que el README promete que ese
    // candado también protege. `getEnrolledLevelAsync` cubre los tres: PIN,
    // patrón y biometría. Si no hay nada inscrito (`SecurityLevel.NONE`), no
    // se inventa una barrera propia — el token ya está en el llavero del
    // sistema.
    const nivel = await LocalAuthentication.getEnrolledLevelAsync()
    if (nivel !== LocalAuthentication.SecurityLevel.NONE) {
      const { success } = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Desbloquea para ver tus números',
      })
      if (!success) {
        setListo(true)
        router.replace('/login')
        return
      }
    }
    setListo(true)
    router.replace('/(tabs)')
  }, [router])

  useEffect(() => {
    // La regla ve una función que llama setState desde un efecto y no puede mirar
    // más allá del primer `await`: acá nada se fija de forma síncrona — primero se
    // lee el llavero y, si corresponde, el candado del dispositivo. Un arranque
    // asíncrono es exactamente el caso que un efecto existe para cubrir.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void arrancar()
  }, [arrancar])

  return (
    <ThemeProvider value={TEMA}>
      <StatusBar style="light" />
      {listo && (fuentesListas || errorFuentes) ? (
        <Stack
          screenOptions={{ headerShown: false, contentStyle: { backgroundColor: COLORES.fondo } }}
        >
          {/* La única pantalla con cabecera: el detalle se empuja sobre esta pila y sin
              ella no hay cómo volver ni queda libre la franja de la hora. Declararla
              acá y no en el propio archivo la deja puesta también mientras el detalle
              busca en la caché y cuando no encuentra el post — ese archivo vuelve
              antes con `Cargando`. Las demás rutas siguen saliendo del sistema de
              archivos: nombrar una no esconde el resto. */}
          <Stack.Screen
            name="post/[id]"
            options={{
              headerShown: true,
              title: 'Detalle',
              headerTitleStyle: { color: COLORES.texto, fontFamily: TIPO_TITULO },
              headerTintColor: COLORES.brasa,
              headerStyle: { backgroundColor: COLORES.tarjeta },
              contentStyle: { backgroundColor: COLORES.fondo },
            }}
          />
        </Stack>
      ) : (
        <Cargando />
      )}
    </ThemeProvider>
  )
}
