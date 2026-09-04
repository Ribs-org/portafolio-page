import { useCallback, useEffect, useState } from 'react'
import { Stack, useRouter } from 'expo-router'
import * as LocalAuthentication from 'expo-local-authentication'
import { View } from 'react-native'
import { COLORES, Cargando } from '../components/ui'
import { readToken } from '../lib/session'

export default function RootLayout() {
  const [listo, setListo] = useState(false)
  const router = useRouter()

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

  if (!listo) {
    return (
      <View style={{ flex: 1, backgroundColor: COLORES.fondo, justifyContent: 'center' }}>
        <Cargando />
      </View>
    )
  }

  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: COLORES.fondo } }} />
}
