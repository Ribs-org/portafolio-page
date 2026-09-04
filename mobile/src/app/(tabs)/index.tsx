import { useCallback, useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import {
  COLORES,
  Cargando,
  Cifra,
  ErrorConReintento,
  Pantalla,
  PuntoEstado,
  Sello,
  Tarjeta,
  Vacio,
} from '../../components/ui'
import { num, pct, shortDate } from '../../lib/format'
import { clearToken } from '../../lib/session'
import { useScreenData } from '../../lib/useScreenData'
import type { Overview, PostProgramado } from '../../lib/tipos'
import { useToken } from '../../lib/useToken'

const RANGOS = [
  { key: 'hoy', label: 'Hoy' },
  { key: '7d', label: '7 días' },
  { key: '30d', label: '30 días' },
]

export default function Resumen() {
  const [rango, setRango] = useState('7d')
  const token = useToken()
  const router = useRouter()
  const salir = useCallback(async () => {
    await clearToken()
    router.replace('/login')
  }, [router])

  const { data, cargando, error, sello, refrescar } = useScreenData<Overview>(
    `overview:${rango}`,
    `/api/mobile/overview?rango=${rango}`,
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

  return (
    <Pantalla refrescando={cargando} onRefrescar={refrescar}>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {RANGOS.map((r) => (
          <Pressable
            key={r.key}
            onPress={() => setRango(r.key)}
            style={{
              paddingHorizontal: 12,
              paddingVertical: 6,
              borderRadius: 999,
              backgroundColor: rango === r.key ? COLORES.tarjeta : 'transparent',
            }}
          >
            <Text style={{ color: rango === r.key ? COLORES.texto : COLORES.tenue, fontSize: 12 }}>
              {r.label}
            </Text>
          </Pressable>
        ))}
      </View>
      <Sello texto={sello} />
      {error ? <Text style={{ color: COLORES.tenue, fontSize: 11 }}>{error}</Text> : null}

      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Cifra etiqueta="Views ganadas" valor={num(data.kpis.viewsGanadas)} />
        <Cifra etiqueta="Visitas al sitio" valor={num(data.kpis.visitasAlSitio)} />
      </View>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Cifra etiqueta="Arrastre" valor={pct(data.kpis.arrastre)} />
        <Cifra etiqueta="Seguidores" valor={num(data.kpis.seguidores)} />
      </View>

      <Text style={{ color: COLORES.tenue, fontSize: 11, textTransform: 'uppercase', marginTop: 8 }}>
        Qué salió hoy
      </Text>
      {data.hoy.length === 0 ? (
        <Vacio texto="Nada salió en las últimas 24 horas." />
      ) : (
        data.hoy.map((post) => <FilaProgramada key={post.id} post={post} />)
      )}

      <Text style={{ color: COLORES.tenue, fontSize: 11, textTransform: 'uppercase', marginTop: 8 }}>
        Qué viene
      </Text>
      {data.proximos.length === 0 ? (
        <Vacio texto="No queda nada programado. Carga el próximo lote cuando quieras." />
      ) : (
        data.proximos.map((post) => <FilaProgramada key={post.id} post={post} />)
      )}
    </Pantalla>
  )
}

export function FilaProgramada({ post }: { post: PostProgramado }) {
  return (
    <Tarjeta>
      <Text style={{ color: COLORES.tenue, fontSize: 11 }}>{shortDate(post.cuando)}</Text>
      <Text style={{ color: COLORES.texto, fontSize: 14 }} numberOfLines={2}>
        {post.texto || '(sin texto)'}
      </Text>
      <View style={{ flexDirection: 'row', gap: 6, marginTop: 4, alignItems: 'center' }}>
        {post.redes.map((r) => (
          <PuntoEstado key={r.red} estado={r.estado} />
        ))}
      </View>
    </Tarjeta>
  )
}
