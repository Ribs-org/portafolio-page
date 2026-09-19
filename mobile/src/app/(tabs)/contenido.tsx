import { useCallback, useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { Image } from 'expo-image'
import { useRouter } from 'expo-router'
import {
  Chip,
  COLORES,
  Cargando,
  ErrorConReintento,
  Pantalla,
  Sello,
  TIPO_TITULO,
  Tarjeta,
  Vacio,
} from '../../components/ui'
import { MiniCorte } from '../../components/parrilla'
import { num, pct, shortDate } from '../../lib/format'
import { comoSalio, medianaDe } from '../../lib/parrilla'
import { clearToken } from '../../lib/session'
import { useScreenData } from '../../lib/useScreenData'
import { useToken } from '../../lib/useToken'
import { ETIQUETA_RANGO, NOMBRE_RED, RANGOS, type Posts, type Rango } from '../../lib/tipos'

const REDES = ['instagram', 'facebook', 'youtube', 'threads', 'x']

export default function Contenido() {
  const [rango, setRango] = useState<Rango>('7d')
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
  /*
   * La vara contra la que se mide cada post. Mediana y no promedio: con un viral en la
   * lista, el promedio dejaría a todo lo demás por debajo y ningún post se marcaría.
   *
   * Se calcula sobre lo visible y no sobre todo, a diferencia del panel: acá el filtro
   * de redes es parte de la pregunta —«cómo me va en TikTok»— y la vara tiene que ser
   * la de esa red, no la de todas mezcladas.
   */
  const mediana = medianaDe(
    visibles
      .map((p) => p.metricas.viewsGanadas)
      .filter((v): v is number => v !== null && v !== undefined),
  )

  // Lo que de verdad compara: lo ganado en la ventana, no el acumulado de por vida.
  const ordenados = [...visibles].sort(
    (a, b) => (b.metricas.viewsGanadas ?? 0) - (a.metricas.viewsGanadas ?? 0),
  )

  return (
    <Pantalla refrescando={cargando} onRefrescar={refrescar}>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {RANGOS.map((r) => (
          <Chip key={r} texto={ETIQUETA_RANGO[r]} activo={rango === r} onPress={() => setRango(r)} />
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
                {/* La miniatura con forma de corte: es lo único de la fila con
                    superficie, así que es por donde entra la parrilla sin engordar
                    una lista que se lee de corrido. */}
                <MiniCorte>
                  {post.miniatura ? (
                    <Image source={{ uri: post.miniatura }} style={{ width: 48, height: 48 }} />
                  ) : (
                    <View style={{ width: 48, height: 48, backgroundColor: '#ffffff10' }} />
                  )}
                </MiniCorte>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: COLORES.texto, fontSize: 14 }} numberOfLines={2}>
                    {post.texto || '(sin texto)'}
                  </Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
                    <Text style={{ color: COLORES.tenue, fontSize: 11 }}>
                      {NOMBRE_RED[post.red] ?? post.red} · {shortDate(post.publicadoEl)}
                    </Text>
                    {/*
                      El sello de los que corrieron el doble de la mediana. Es lo que se
                      viene a buscar en esta pantalla —cuáles se fueron de las manos— y
                      antes había que deducirlo comparando números a ojo.
                    */}
                    {comoSalio(post.metricas.viewsGanadas, mediana) === 'se-paso' ? (
                      <Text
                        style={{
                          color: COLORES.brasa,
                          fontSize: 10,
                          fontFamily: TIPO_TITULO,
                          textTransform: 'uppercase',
                          letterSpacing: 1,
                        }}
                      >
                        Se pasó
                      </Text>
                    ) : null}
                  </View>
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
