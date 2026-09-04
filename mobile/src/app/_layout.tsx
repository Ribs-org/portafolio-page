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
    // El candado del dispositivo: si el teléfono no tiene huella ni PIN, no se
    // inventa una barrera propia — el token ya está en el llavero del sistema.
    const puede = await LocalAuthentication.hasHardwareAsync()
    const inscrito = puede ? await LocalAuthentication.isEnrolledAsync() : false
    if (inscrito) {
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
