import { useCallback } from 'react'
import { Text, View } from 'react-native'
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
import { num } from '../../lib/format'
import { clearToken } from '../../lib/session'
import { useScreenData } from '../../lib/useScreenData'
import { useToken } from '../../lib/useToken'
import { NOMBRE_RED, type Cuentas as CuentasData } from '../../lib/tipos'

const RANGO = '30d'

export default function Cuentas() {
  const token = useToken()
  const router = useRouter()
  const salir = useCallback(async () => {
    await clearToken()
    router.replace('/login')
  }, [router])

  const { data, cargando, error, sello, refrescar } = useScreenData<CuentasData>(
    `cuentas:${RANGO}`,
    `/api/mobile/accounts?rango=${RANGO}`,
    token ?? '',
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

  const maximo = Math.max(1, ...data.serie.map((p) => p.visitasAlPerfil ?? 0))

  return (
    <Pantalla refrescando={cargando} onRefrescar={refrescar}>
      <Sello texto={sello} />
      {data.cuentas.length === 0 ? (
        <Vacio texto="Todavía no hay lecturas de cuenta. La primera llega con la sincronización de esta noche." />
      ) : (
        data.cuentas.map((cuenta) => (
          <Tarjeta key={cuenta.red}>
            <Text style={{ color: COLORES.tenue, fontSize: 11, textTransform: 'uppercase' }}>
              {NOMBRE_RED[cuenta.red] ?? cuenta.red}
            </Text>
            <Text style={{ color: COLORES.texto, fontSize: 24, fontWeight: '600' }}>
              {num(cuenta.seguidores)}
            </Text>
            <Text style={{ color: COLORES.suave, fontSize: 12 }}>
              seguidores
              {cuenta.seguidoresGanados === null
                ? ' · — en el período'
                : cuenta.seguidoresGanados === 0
                  ? ' · sin cambio'
                  : ` · +${num(cuenta.seguidoresGanados)} en el período`}
            </Text>
            <Text style={{ color: COLORES.tenue, fontSize: 12, marginTop: 4 }}>
              Visitas al perfil{cuenta.dia ? ` (${cuenta.dia})` : ''}: {num(cuenta.visitasAlPerfil)} ·
              Alcance: {num(cuenta.alcance)}
            </Text>
          </Tarjeta>
        ))
      )}

      {data.serie.length > 1 ? (
        <Tarjeta>
          <Text style={{ color: COLORES.tenue, fontSize: 11, textTransform: 'uppercase' }}>
            Visitas al perfil por día
          </Text>
          {/* Barras de vistas planas: una librería de gráficos sería una dependencia
              nativa más que puede romper el build, y esto se lee igual de bien. */}
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 3, height: 80, marginTop: 8 }}>
            {data.serie.map((punto) => (
              <View
                key={punto.fecha}
                style={{
                  flex: 1,
                  height: Math.max(2, ((punto.visitasAlPerfil ?? 0) / maximo) * 76),
                  backgroundColor: punto.visitasAlPerfil === null ? '#ffffff14' : COLORES.verde,
                  borderRadius: 2,
                }}
              />
            ))}
          </View>
        </Tarjeta>
      ) : null}
    </Pantalla>
  )
}
