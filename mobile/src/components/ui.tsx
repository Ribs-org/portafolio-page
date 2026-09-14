import { ActivityIndicator, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native'
import type { ReactNode } from 'react'
import { Image } from 'expo-image'

export const COLORES = {
  fondo: '#0b0b0f',
  tarjeta: '#16161d',
  texto: '#f2f2f5',
  suave: '#a1a1ad',
  tenue: '#6b6b78',
  verde: '#34d399',
  gris: '#6b6b78',
  rojo: '#f87171',
  ambar: '#fbbf24',
}

// El destello de Android al tocar: el mismo blanco del texto, casi transparente.
const RIPPLE = { color: COLORES.texto + '22' }

export function Pantalla({
  children,
  refrescando,
  onRefrescar,
}: {
  children: ReactNode
  refrescando: boolean
  onRefrescar: () => void
}) {
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: COLORES.fondo }}
      contentContainerStyle={{ padding: 16, paddingBottom: 48, gap: 12 }}
      refreshControl={
        <RefreshControl refreshing={refrescando} onRefresh={onRefrescar} tintColor={COLORES.suave} />
      }
    >
      {children}
    </ScrollView>
  )
}

export function Tarjeta({ children }: { children: ReactNode }) {
  return (
    <View style={{ backgroundColor: COLORES.tarjeta, borderRadius: 16, padding: 14, gap: 6 }}>
      {children}
    </View>
  )
}

export function Cifra({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <View style={{ flex: 1, backgroundColor: COLORES.tarjeta, borderRadius: 16, padding: 14 }}>
      <Text style={{ color: COLORES.tenue, fontSize: 11, textTransform: 'uppercase' }}>
        {etiqueta}
      </Text>
      <Text style={{ color: COLORES.texto, fontSize: 24, fontWeight: '600', marginTop: 4 }}>
        {valor}
      </Text>
    </View>
  )
}

export function Sello({ texto }: { texto: string | null }) {
  if (!texto) return null
  return <Text style={{ color: COLORES.tenue, fontSize: 11 }}>Actualizado {texto}</Text>
}

export function Cargando() {
  return (
    <View
      style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: COLORES.fondo,
      }}
    >
      <ActivityIndicator color={COLORES.suave} />
    </View>
  )
}

export function ErrorConReintento({ mensaje, onReintentar }: { mensaje: string; onReintentar: () => void }) {
  return (
    <Tarjeta>
      <Text style={{ color: COLORES.texto }}>{mensaje}</Text>
      <View style={{ flexDirection: 'row', marginTop: 4 }}>
        <Boton texto="Reintentar" onPress={onReintentar} destacado />
      </View>
    </Tarjeta>
  )
}

export function Vacio({ texto }: { texto: string }) {
  return (
    <Text style={{ color: COLORES.tenue, textAlign: 'center', marginTop: 24, lineHeight: 20 }}>
      {texto}
    </Text>
  )
}

const COLOR_ESTADO: Record<string, string> = {
  published: COLORES.verde,
  scheduled: COLORES.gris,
  failed: COLORES.rojo,
  publishing: COLORES.ambar,
}

/** El mismo semáforo del panel: verde publicado, gris programado, rojo falló. */
export function PuntoEstado({ estado }: { estado: string }) {
  return (
    <View
      style={{
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: COLOR_ESTADO[estado] ?? COLORES.gris,
      }}
    />
  )
}

/**
 * El control más usado de la app: filtros, rangos, el selector de archivos y el de
 * fecha. De ahí los 44 dp más el `hitSlop`: en reposo se ve casi igual que antes,
 * pero el dedo ya no falla.
 */
export function Chip({
  texto,
  activo,
  onPress,
  deshabilitado,
}: {
  texto: string
  activo: boolean
  onPress: () => void
  deshabilitado?: boolean
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={deshabilitado}
      hitSlop={4}
      android_ripple={deshabilitado ? undefined : RIPPLE}
      style={({ pressed }) => ({
        paddingHorizontal: 12,
        paddingVertical: 10,
        minHeight: 44,
        justifyContent: 'center',
        borderRadius: 999,
        backgroundColor: activo ? COLORES.tarjeta : 'transparent',
        opacity: deshabilitado ? 0.5 : pressed ? 0.7 : 1,
      })}
    >
      <Text style={{ color: activo ? COLORES.texto : COLORES.tenue, fontSize: 12 }}>{texto}</Text>
    </Pressable>
  )
}

/**
 * Un archivo elegido: la imagen o un bloque con «video», y una equis para quitarlo.
 * Sin `onQuitar` la equis no se dibuja: es como el envío en curso marca un archivo
 * que ya viaja como no removible.
 */
export function Miniatura({
  uri,
  esVideo,
  onQuitar,
}: {
  uri: string
  esVideo: boolean
  onQuitar?: () => void
}) {
  return (
    <View style={{ width: 72, height: 72 }}>
      {esVideo ? (
        <View
          style={{
            width: 72,
            height: 72,
            borderRadius: 10,
            backgroundColor: '#ffffff10',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text style={{ color: COLORES.suave, fontSize: 11 }}>Video</Text>
        </View>
      ) : (
        <Image source={{ uri }} style={{ width: 72, height: 72, borderRadius: 10 }} />
      )}
      {onQuitar ? (
        <Pressable
          onPress={onQuitar}
          hitSlop={14}
          style={{
            position: 'absolute',
            top: -6,
            right: -6,
            width: 22,
            height: 22,
            borderRadius: 11,
            backgroundColor: COLORES.fondo,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text style={{ color: COLORES.texto, fontSize: 12 }}>✕</Text>
        </Pressable>
      ) : null}
    </View>
  )
}

export function Boton({
  texto,
  onPress,
  deshabilitado,
  destacado,
}: {
  texto: string
  onPress: () => void
  deshabilitado?: boolean
  destacado?: boolean
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={deshabilitado}
      android_ripple={deshabilitado ? undefined : RIPPLE}
      style={({ pressed }) => ({
        flex: 1,
        backgroundColor: destacado ? COLORES.verde : COLORES.tarjeta,
        borderRadius: 12,
        padding: 14,
        minHeight: 48,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: deshabilitado ? 0.5 : pressed ? 0.7 : 1,
      })}
    >
      <Text style={{ color: destacado ? COLORES.fondo : COLORES.texto, fontWeight: '600' }}>{texto}</Text>
    </Pressable>
  )
}
