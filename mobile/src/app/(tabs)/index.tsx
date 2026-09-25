import { useCallback, useState } from 'react'
import { Text, View } from 'react-native'
import { useFocusEffect, useRouter } from 'expo-router'
import {
  COLORES,
  Cargando,
  Chip,
  Cifra,
  ErrorConReintento,
  Etiqueta,
  Pantalla,
  PuntoEstado,
  Sello,
  Tarjeta,
  Vacio,
} from '../../components/ui'
import { num, pct, shortDate } from '../../lib/format'
import { etiquetaCuenta } from '../../lib/publicar'
import { clearToken } from '../../lib/session'
import { useScreenData } from '../../lib/useScreenData'
import {
  ETIQUETA_RANGO,
  RANGOS,
  type Overview,
  type PostProgramado,
  type Rango,
} from '../../lib/tipos'
import { useToken } from '../../lib/useToken'

export default function Resumen() {
  const [rango, setRango] = useState<Rango>('7d')
  const token = useToken()
  const router = useRouter()
  const salir = useCallback(async () => {
    await clearToken()
    router.replace('/login')
  }, [router])

  const { data, cargando, error, sello, refrescar, refrescarSiVieja } = useScreenData<Overview>(
    `overview:${rango}`,
    `/api/mobile/overview?rango=${rango}`,
    token,
    salir,
  )

  // Al volver a esta pestaña: si Publicar acaba de crear un post, o la caché ya es
  // vieja, refresca sola. Es lo que hace aparecer el post recién programado.
  useFocusEffect(refrescarSiVieja)

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
          <Chip key={r} texto={ETIQUETA_RANGO[r]} activo={rango === r} onPress={() => setRango(r)} />
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

      <Etiqueta margenArriba>Qué salió hoy</Etiqueta>
      {data.hoy.length === 0 ? (
        <Vacio texto="Nada salió en las últimas 24 horas." />
      ) : (
        data.hoy.map((post) => <FilaProgramada key={post.id} post={post} />)
      )}

      <Etiqueta margenArriba>Qué viene</Etiqueta>
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
      {/* El punto solo tiene color, y el color no dice de qué red es. Con el nombre al
          lado se lee igual que el calendario; envuelve porque tres redes no caben. */}
      <View
        style={{
          flexDirection: 'row',
          flexWrap: 'wrap',
          gap: 10,
          marginTop: 4,
          alignItems: 'center',
        }}
      >
        {post.redes.map((r) => (
          // `r.id` es el destino, no la red: con dos cuentas de la misma red, `r.red`
          // se repite dentro de un post y ya no sirve de clave.
          <View key={r.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <PuntoEstado estado={r.estado} />
            <Text style={{ color: COLORES.tenue, fontSize: 11 }}>{etiquetaCuenta(r)}</Text>
          </View>
        ))}
      </View>
    </Tarjeta>
  )
}
