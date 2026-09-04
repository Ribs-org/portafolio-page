import { useCallback, useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { Image } from 'expo-image'
import { useRouter } from 'expo-router'
import {
  COLORES,
  Cargando,
  ErrorConReintento,
  Pantalla,
  Sello,
  Tarjeta,
  Vacio,
} from '../../components/ui'
import { num, pct, shortDate } from '../../lib/format'
import { clearToken } from '../../lib/session'
import { useScreenData } from '../../lib/useScreenData'
import { useToken } from '../../lib/useToken'
import { NOMBRE_RED, type Posts } from '../../lib/tipos'

const REDES = ['instagram', 'facebook', 'youtube', 'threads', 'x']
const RANGOS = ['hoy', '7d', '30d']

export default function Contenido() {
  const [rango, setRango] = useState('7d')
  const [redes, setRedes] = useState<string[]>([])
  const token = useToken()
  const router = useRouter()
  const salir = useCallback(async () => {
    await clearToken()
    router.replace('/login')
  }, [router])

  // La caché se llavea solo por rango y las redes se filtran en memoria: así el
  // detalle de un post lo encuentra sin importar qué chips estaban activos, y
  // alternar redes no dispara una descarga por combinación.
  const { data, cargando, error, sello, refrescar } = useScreenData<Posts>(
    `posts:rango=${rango}`,
    `/api/mobile/posts?rango=${rango}`,
    token,
    salir,
  )

  function alternar(red: string) {
    setRedes(redes.includes(red) ? redes.filter((r) => r !== red) : [...redes, red])
  }

  if (!data && cargando) return <Cargando />
  if (!data) {
    return (
      <Pantalla refrescando={cargando} onRefrescar={refrescar}>
        <ErrorConReintento mensaje={error ?? 'No se pudo cargar.'} onReintentar={refrescar} />
      </Pantalla>
    )
  }

  const visibles =
    redes.length === 0 ? data.posts : data.posts.filter((p) => redes.includes(p.red))
  // Lo que de verdad compara: lo ganado en la ventana, no el acumulado de por vida.
  const ordenados = [...visibles].sort(
    (a, b) => (b.metricas.viewsGanadas ?? 0) - (a.metricas.viewsGanadas ?? 0),
  )

  return (
    <Pantalla refrescando={cargando} onRefrescar={refrescar}>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {RANGOS.map((r) => (
          <Chip key={r} texto={r === 'hoy' ? 'Hoy' : r} activo={rango === r} onPress={() => setRango(r)} />
        ))}
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        <Chip texto="Todas" activo={redes.length === 0} onPress={() => setRedes([])} />
        {REDES.map((red) => (
          <Chip
            key={red}
            texto={NOMBRE_RED[red] ?? red}
            activo={redes.includes(red)}
            onPress={() => alternar(red)}
          />
        ))}
      </View>
      <Sello texto={sello} />

      {ordenados.length === 0 ? (
        <Vacio texto="No publicaste nada en este período." />
      ) : (
        ordenados.map((post) => (
          <Pressable
            key={`${post.red}:${post.externalId}`}
            onPress={() =>
              router.push({
                pathname: '/post/[id]',
                params: { id: post.externalId, red: post.red },
              })
            }
          >
            <Tarjeta>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                {post.miniatura ? (
                  <Image
                    source={{ uri: post.miniatura }}
                    style={{ width: 48, height: 48, borderRadius: 8 }}
                  />
                ) : (
                  <View style={{ width: 48, height: 48, borderRadius: 8, backgroundColor: '#ffffff10' }} />
                )}
                <View style={{ flex: 1 }}>
                  <Text style={{ color: COLORES.texto, fontSize: 14 }} numberOfLines={2}>
                    {post.texto || '(sin texto)'}
                  </Text>
                  <Text style={{ color: COLORES.tenue, fontSize: 11, marginTop: 2 }}>
                    {NOMBRE_RED[post.red] ?? post.red} · {shortDate(post.publicadoEl)}
                  </Text>
                </View>
              </View>
              <View style={{ flexDirection: 'row', gap: 16, marginTop: 6 }}>
                <Text style={{ color: COLORES.suave, fontSize: 12 }}>
                  {num(post.metricas.viewsGanadas)} views
                </Text>
                <Text style={{ color: COLORES.suave, fontSize: 12 }}>
                  {pct(post.metricas.arrastre)} arrastre
                </Text>
              </View>
            </Tarjeta>
          </Pressable>
        ))
      )}
    </Pantalla>
  )
}

export function Chip({ texto, activo, onPress }: { texto: string; activo: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 999,
        backgroundColor: activo ? COLORES.tarjeta : 'transparent',
      }}
    >
      <Text style={{ color: activo ? COLORES.texto : COLORES.tenue, fontSize: 12 }}>{texto}</Text>
    </Pressable>
  )
}
