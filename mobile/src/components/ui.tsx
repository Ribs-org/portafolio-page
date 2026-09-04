import { ActivityIndicator, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native'
import type { ReactNode } from 'react'
import { num } from '../lib/format'

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
  return <ActivityIndicator color={COLORES.suave} style={{ marginTop: 32 }} />
}

export function ErrorConReintento({ mensaje, onReintentar }: { mensaje: string; onReintentar: () => void }) {
  return (
    <Tarjeta>
      <Text style={{ color: COLORES.texto }}>{mensaje}</Text>
      <Pressable onPress={onReintentar}>
        <Text style={{ color: COLORES.verde, marginTop: 6 }}>Reintentar</Text>
      </Pressable>
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

export function Numero({ children }: { children: number | null }) {
  return <Text style={{ color: COLORES.suave, fontSize: 13 }}>{num(children)}</Text>
}
