import { useEffect, useState } from 'react'
import { Linking, Pressable, ScrollView, Text, View } from 'react-native'
import { useLocalSearchParams } from 'expo-router'
import { COLORES, Cargando, Tarjeta } from '../../components/ui'
import { readCache } from '../../lib/cache'
import { num, pct, shortDate } from '../../lib/format'
import { NOMBRE_RED, type PostMetrica, type Posts } from '../../lib/tipos'

export default function DetallePost() {
  const { id, red } = useLocalSearchParams<{ id: string; red: string }>()
  const [post, setPost] = useState<PostMetrica | null>(null)
  const [buscado, setBuscado] = useState(false)

  useEffect(() => {
    // Busca en todas las cachés de listas: la última que la contenga sirve. El
    // `setState` ocurre dentro de `buscar()`, no de forma síncrona en el cuerpo del
    // efecto, así que la regla `react-hooks/set-state-in-effect` no aplica: es un
    // arranque asíncrono legítimo (leer la caché no tiene versión síncrona).
    async function buscar() {
      for (const rango of ['hoy', '7d', '30d']) {
        const guardado = await readCache<Posts>(`posts:rango=${rango}`)
        const encontrado = guardado?.data.posts.find(
          (p) => p.externalId === id && p.red === red,
        )
        if (encontrado) {
          setPost(encontrado)
          break
        }
      }
      setBuscado(true)
    }
    void buscar()
  }, [id, red])

  if (!buscado) return <Cargando />
  if (!post) {
    return (
      <View style={{ flex: 1, backgroundColor: COLORES.fondo, padding: 16 }}>
        <Text style={{ color: COLORES.suave }}>
          Vuelve a la lista y ábrelo de nuevo: este post no está en lo descargado.
        </Text>
      </View>
    )
  }

  const filas: [string, string][] = [
    ['Views (acumulado)', num(post.metricas.views)],
    ['Views ganadas', num(post.metricas.viewsGanadas)],
    ['Likes', num(post.metricas.likes)],
    ['Comentarios', num(post.metricas.comentarios)],
    ['Compartidos', num(post.metricas.compartidos)],
    ['Alcance', num(post.metricas.alcance)],
    ['Visitas al sitio', num(post.metricas.visitasAlSitio)],
    ['Clicks', num(post.metricas.clicks)],
    ['CTR', pct(post.metricas.ctr)],
    ['Arrastre', pct(post.metricas.arrastre)],
  ]

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: COLORES.fondo }}
      contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 48 }}
    >
      <Text style={{ color: COLORES.tenue, fontSize: 11 }}>
        {NOMBRE_RED[post.red] ?? post.red} · {shortDate(post.publicadoEl)}
      </Text>
      <Text style={{ color: COLORES.texto, fontSize: 16, lineHeight: 22 }}>
        {post.texto || '(sin texto)'}
      </Text>

      <Tarjeta>
        {filas.map(([etiqueta, valor]) => (
          <View key={etiqueta} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={{ color: COLORES.suave, fontSize: 13 }}>{etiqueta}</Text>
            <Text style={{ color: COLORES.texto, fontSize: 13 }}>{valor}</Text>
          </View>
        ))}
      </Tarjeta>

      {post.atributos ? (
        <Tarjeta>
          <Text style={{ color: COLORES.tenue, fontSize: 11, textTransform: 'uppercase' }}>
            Atributos
          </Text>
          {Object.entries(post.atributos).map(([clave, valor]) => (
            <View key={clave} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={{ color: COLORES.suave, fontSize: 13 }}>{clave}</Text>
              <Text style={{ color: COLORES.texto, fontSize: 13 }}>{String(valor)}</Text>
            </View>
          ))}
        </Tarjeta>
      ) : null}

      {post.permalink ? (
        <Pressable onPress={() => Linking.openURL(post.permalink!)}>
          <Tarjeta>
            <Text style={{ color: COLORES.verde }}>Abrir en {NOMBRE_RED[post.red] ?? post.red} ↗</Text>
          </Tarjeta>
        </Pressable>
      ) : null}
    </ScrollView>
  )
}
