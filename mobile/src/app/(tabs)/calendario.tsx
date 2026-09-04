import { useCallback } from 'react'
import { Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import {
  COLORES,
  Cargando,
  ErrorConReintento,
  Pantalla,
  PuntoEstado,
  Sello,
  Tarjeta,
  Vacio,
} from '../../components/ui'
import { shortDate } from '../../lib/format'
import { agruparPorDia } from '../../lib/agrupar'
import { clearToken } from '../../lib/session'
import { useScreenData } from '../../lib/useScreenData'
import { useToken } from '../../lib/useToken'
import { NOMBRE_RED, type Calendario as CalendarioData } from '../../lib/tipos'

export default function Calendario() {
  const token = useToken()
  const router = useRouter()
  const salir = useCallback(async () => {
    await clearToken()
    router.replace('/login')
  }, [router])

  const { data, cargando, error, sello, refrescar } = useScreenData<CalendarioData>(
    'calendario',
    '/api/mobile/schedule',
    token,
    salir,
  )

  if (!data && cargando) return <Cargando />
  if (!data) {
    return (
      <Pantalla refrescando={cargando} onRefrescar={refrescar}>
        <ErrorConReintento mensaje={error ?? 'No se pudo cargar.'} onReintentar={refrescar} />
      </Pantalla>
    )
  }

  const grupos = agruparPorDia(data.posts)

  return (
    <Pantalla refrescando={cargando} onRefrescar={refrescar}>
      <Sello texto={sello} />
      {grupos.length === 0 ? (
        <Vacio texto="No hay nada programado en esta ventana." />
      ) : (
        grupos.map((grupo) => (
          <View key={grupo.dia} style={{ gap: 8 }}>
            <Text style={{ color: COLORES.tenue, fontSize: 11, textTransform: 'uppercase', marginTop: 8 }}>
              {shortDate(`${grupo.dia}T00:00`).split(',')[0]}
            </Text>
            {grupo.posts.map((post) => (
              <Tarjeta key={post.id}>
                <Text style={{ color: COLORES.tenue, fontSize: 11 }}>
                  {post.cuando.slice(11, 16)}
                </Text>
                <Text style={{ color: COLORES.texto, fontSize: 14 }} numberOfLines={2}>
                  {post.texto || '(sin texto)'}
                </Text>
                <View style={{ gap: 4, marginTop: 4 }}>
                  {post.redes.map((r) => (
                    <View key={r.red} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <PuntoEstado estado={r.estado} />
                      <Text style={{ color: COLORES.suave, fontSize: 12 }}>
                        {NOMBRE_RED[r.red] ?? r.red}
                        {r.error ? ` — ${r.error}` : ''}
                      </Text>
                    </View>
                  ))}
                </View>
              </Tarjeta>
            ))}
          </View>
        ))
      )}
    </Pantalla>
  )
}
