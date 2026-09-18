import { useState } from 'react'
import { KeyboardAvoidingView, Text, TextInput, View } from 'react-native'
import { useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Boton, COLORES, Titulo } from '../components/ui'
import { login } from '../lib/session'

export default function Login() {
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [entrando, setEntrando] = useState(false)
  const router = useRouter()
  // El proveedor ya lo monta expo-router en su raíz; acá solo se leen los márgenes.
  const insets = useSafeAreaInsets()

  async function entrar() {
    setEntrando(true)
    const resultado = await login(password)
    setEntrando(false)
    if ('error' in resultado) {
      setError(resultado.error)
      return
    }
    router.replace('/(tabs)')
  }

  return (
    // `height` es el `behavior` de Android: la app dibuja de borde a borde, así que la
    // ventana ya no se encoge sola al abrir el teclado. Y acá el teclado sale de
    // entrada por el `autoFocus`, con lo que «Entrar» nacía tapado.
    <KeyboardAvoidingView
      behavior="height"
      style={{
        flex: 1,
        backgroundColor: COLORES.fondo,
        paddingTop: insets.top,
        paddingBottom: insets.bottom,
      }}
    >
      <View style={{ flex: 1, justifyContent: 'center', padding: 24, gap: 12 }}>
        <Titulo>Tus números</Titulo>
        <Text style={{ color: COLORES.suave }}>Escribe tu contraseña una vez.</Text>
        <TextInput
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoFocus
          onSubmitEditing={entrar}
          placeholder="Contraseña"
          placeholderTextColor={COLORES.tenue}
          style={{
            backgroundColor: COLORES.tarjeta,
            color: COLORES.texto,
            borderRadius: 12,
            padding: 14,
            marginTop: 8,
          }}
        />
        {error ? <Text style={{ color: COLORES.rojo }}>{error}</Text> : null}
        {/* En fila porque `Boton` crece a lo ancho con `flex: 1`, y esta pantalla apila. */}
        <View style={{ flexDirection: 'row' }}>
          <Boton
            texto={entrando ? 'Entrando…' : 'Entrar'}
            onPress={entrar}
            deshabilitado={entrando}
            destacado
          />
        </View>
      </View>
    </KeyboardAvoidingView>
  )
}
