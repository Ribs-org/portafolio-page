import { Tabs } from 'expo-router'
import { COLORES, TIPO_TITULO } from '../../components/ui'

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
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Resumen' }} />
      <Tabs.Screen name="contenido" options={{ title: 'Contenido' }} />
      <Tabs.Screen name="publicar" options={{ title: 'Publicar' }} />
      <Tabs.Screen name="cuentas" options={{ title: 'Cuentas' }} />
      <Tabs.Screen name="calendario" options={{ title: 'Calendario' }} />
    </Tabs>
  )
}
