import { Tabs } from 'expo-router'
import { COLORES } from '../../components/ui'

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: COLORES.fondo },
        headerTitleStyle: { color: COLORES.texto },
        tabBarStyle: { backgroundColor: COLORES.tarjeta, borderTopColor: '#00000000' },
        tabBarActiveTintColor: COLORES.texto,
        tabBarInactiveTintColor: COLORES.tenue,
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Resumen' }} />
      <Tabs.Screen name="contenido" options={{ title: 'Contenido' }} />
      <Tabs.Screen name="cuentas" options={{ title: 'Cuentas' }} />
      <Tabs.Screen name="calendario" options={{ title: 'Calendario' }} />
    </Tabs>
  )
}
