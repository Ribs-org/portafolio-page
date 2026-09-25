import { useCallback } from 'react'
import { Text, View } from 'react-native'
import { Image } from 'expo-image'
import { useFocusEffect, useRouter } from 'expo-router'
import {
  COLORES,
  Cargando,
  ErrorConReintento,
  Pantalla,
  Sello,
  TIPO_TITULO,
  Vacio,
} from '../../components/ui'
import { Corte, CorteMedia, Grilla, RotuloDia } from '../../components/parrilla'
import { shortDate } from '../../lib/format'
import { agruparPorDia } from '../../lib/agrupar'
import { calorDelDia, coccionDe, NOMBRE_COCCION } from '../../lib/parrilla'
import { clearToken } from '../../lib/session'
import { useScreenData } from '../../lib/useScreenData'
import { useToken } from '../../lib/useToken'
import { type Calendario as CalendarioData } from '../../lib/tipos'
import { etiquetaCuenta } from '../../lib/publicar'

export default function Calendario() {
  const token = useToken()
  const router = useRouter()
  const salir = useCallback(async () => {
    await clearToken()
    router.replace('/login')
  }, [router])

  const { data, cargando, error, sello, refrescar, refrescarSiVieja } = useScreenData<CalendarioData>(
    'calendario',
    '/api/mobile/schedule',
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

  const grupos = agruparPorDia(data.posts)

  return (
    <Pantalla refrescando={cargando} onRefrescar={refrescar}>
      <Sello texto={sello} />
      {grupos.length === 0 ? (
        <Vacio texto="No hay nada programado en esta ventana." />
      ) : (
        grupos.map((grupo) => {
          const calor = calorDelDia(grupo.posts.length)
          return (
            <View key={grupo.dia}>
              <RotuloDia
                dia={shortDate(`${grupo.dia}T00:00`).split(',')[0] ?? grupo.dia}
                cortes={grupo.posts.length}
              />
              <Grilla calor={calor}>
                {grupo.posts.map((post) => {
                  const coccion = coccionDe(post.redes.map((r) => r.estado))
                  return (
                    <Corte key={post.id} coccion={coccion}>
                      <Text
                        style={{
                          color: COLORES.texto,
                          fontSize: 10,
                          fontFamily: TIPO_TITULO,
                          letterSpacing: 1,
                        }}
                      >
                        {post.cuando.slice(11, 16)}
                        {coccion === 'sellada' ? '  ·  SALIENDO' : ''}
                      </Text>

                      {/*
                        La miniatura que la API mandaba desde siempre y esta pantalla
                        nunca dibujaba: el campo `miniatura` llegaba y se descartaba.
                      */}
                      {(() => {
                        // La miniatura primero y la portada como respaldo: la portada es
                        // la carátula diseñada de un video, o sea lo que se ve si no hay
                        // imagen propia.
                        const uri = post.miniatura ?? post.portada
                        if (!uri) return null
                        return (
                          <CorteMedia coccion={coccion}>
                            <Image
                              source={{ uri }}
                              style={{ width: '100%', height: 72 }}
                              contentFit="cover"
                            />
                          </CorteMedia>
                        )
                      })()}

                      <Text style={{ color: COLORES.texto, fontSize: 14 }} numberOfLines={2}>
                        {post.texto || '(sin texto)'}
                      </Text>

                      {/*
                        Las redes en texto, sin el punto de color: la cocción del corte ya
                        dice el estado del conjunto. Lo que el corte no puede decir es
                        cuál de las redes falló, y eso es justo lo que queda acá.
                      */}
                      <View style={{ gap: 2, marginTop: 2 }}>
                        {post.redes.map((r) => (
                          <Text
                            // `r.id` es el destino, no la red: con dos cuentas de la
                            // misma red, `r.red` se repite dentro de un post.
                            key={r.id}
                            // Sin opacidad: sobre la carne cruda, que es la cocción más
                            // clara, el texto al 70% cae a 3.12:1 y no llega al mínimo.
                            // La jerarquía la hace el tamaño, no el desteñido. Es el
                            // mismo error que el panel tuvo y que su revisión atrapó.
                            style={{ color: COLORES.texto, fontSize: 12 }}
                            numberOfLines={2}
                          >
                            {etiquetaCuenta(r)}
                            {r.error ? ` — ${r.error}` : ''}
                          </Text>
                        ))}
                      </View>

                      {/* El estado en palabras: el color nunca es la única señal. */}
                      <Text
                        style={{
                          color: COLORES.texto,
                          fontSize: 10,
                          fontFamily: TIPO_TITULO,
                          textTransform: 'uppercase',
                          letterSpacing: 1,
                        }}
                      >
                        {NOMBRE_COCCION[coccion]}
                      </Text>
                    </Corte>
                  )
                })}
              </Grilla>
            </View>
          )
        })
      )}
    </Pantalla>
  )
}
