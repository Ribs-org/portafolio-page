import { Tabs } from 'expo-router'
import { COLORES, TIPO_TITULO } from '../../components/ui'
import {
  IconoCorte,
  IconoCuentas,
  IconoFuego,
  IconoParrilla,
  IconoPoner,
} from '../../components/iconos'

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: COLORES.fondo },
        // El título de cada pestaña es el título de la pantalla: va en la voz de los títulos.
        headerTitleStyle: {
          color: COLORES.texto,
          fontFamily: TIPO_TITULO,
          letterSpacing: 1,
          textTransform: 'uppercase',
        },
        tabBarStyle: { backgroundColor: COLORES.tarjeta, borderTopColor: '#00000000' },
        // La pestaña activa en brasa: antes se distinguía solo por blanco contra gris.
        tabBarActiveTintColor: COLORES.brasa,
        tabBarInactiveTintColor: COLORES.tenue,
        // El rótulo también en la voz de los títulos, pero chico: el icono manda y el
        // texto confirma. Sin `textTransform` acá — a 10 puntos las mayúsculas de una
        // condensada como Oswald se empastan.
        tabBarLabelStyle: { fontFamily: TIPO_TITULO, fontSize: 11, letterSpacing: 0.6 },
      }}
    >
      {/*
        Los cinco `tabBarIcon`: sin ellos la barra reservaba el hueco del icono y lo
        dejaba en blanco, con el rótulo flotando sobre nada. `color` ya llega resuelto
        por `tabBarActiveTintColor` / `tabBarInactiveTintColor`, así que el icono no
        decide su color, solo lo usa.
      */}
      <Tabs.Screen
        name="index"
        options={{ title: 'Resumen', tabBarIcon: ({ color }) => <IconoFuego color={color} /> }}
      />
      <Tabs.Screen
        name="contenido"
        options={{
          title: 'Contenido',
          // El corte necesita el color del fondo de la barra para la veta de grasa.
          tabBarIcon: ({ color }) => <IconoCorte color={color} fondo={COLORES.tarjeta} />,
        }}
      />
      <Tabs.Screen
        name="publicar"
        options={{ title: 'Publicar', tabBarIcon: ({ color }) => <IconoPoner color={color} /> }}
      />
      <Tabs.Screen
        name="cuentas"
        options={{ title: 'Cuentas', tabBarIcon: ({ color }) => <IconoCuentas color={color} /> }}
      />
      <Tabs.Screen
        name="calendario"
        options={{
          title: 'Calendario',
          tabBarIcon: ({ color }) => <IconoParrilla color={color} />,
        }}
      />
    </Tabs>
  )
}
