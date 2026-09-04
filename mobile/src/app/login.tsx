import { useState } from 'react'
import { Pressable, Text, TextInput, View } from 'react-native'
import { useRouter } from 'expo-router'
import { COLORES } from '../components/ui'
import { login } from '../lib/session'

export default function Login() {
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [entrando, setEntrando] = useState(false)
  const router = useRouter()

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
    <View style={{ flex: 1, backgroundColor: COLORES.fondo, justifyContent: 'center', padding: 24, gap: 12 }}>
      <Text style={{ color: COLORES.texto, fontSize: 22, fontWeight: '600' }}>Tus números</Text>
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
      <Pressable
        onPress={entrar}
        disabled={entrando}
        style={{ backgroundColor: COLORES.tarjeta, borderRadius: 12, padding: 14, alignItems: 'center' }}
      >
        <Text style={{ color: COLORES.texto }}>{entrando ? 'Entrando…' : 'Entrar'}</Text>
      </Pressable>
    </View>
  )
}
