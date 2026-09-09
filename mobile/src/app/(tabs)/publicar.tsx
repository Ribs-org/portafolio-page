import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import { Alert, ScrollView, Text, TextInput, View } from 'react-native'
import { DateTimePickerAndroid } from '@react-native-community/datetimepicker'
import * as ImagePicker from 'expo-image-picker'
import { useRouter } from 'expo-router'

import { Boton, COLORES, Chip, Miniatura } from '../../components/ui'
import { SesionCaducada } from '../../lib/api'
import { anotarCambio } from '../../lib/cambios'
import {
  ENVIO_INICIAL,
  MAX_ARCHIVOS,
  REDES_PUBLICABLES,
  describirArchivo,
  etiquetaEnvio,
  proximaHoraEnPunto,
  puedeEnviar,
  reducirEnvio,
  textoConfirmacion,
  type Elegido,
  type Retomar,
} from '../../lib/publicar'
import { clearToken } from '../../lib/session'
import { ejecutarEnvio, type SubidaHecha } from '../../lib/subir'
import { NOMBRE_RED } from '../../lib/tipos'
import { useToken } from '../../lib/useToken'

const MAX_TEXTO = 2200

function fechaLegible(fecha: Date): string {
  const dd = String(fecha.getDate()).padStart(2, '0')
  const mm = String(fecha.getMonth() + 1).padStart(2, '0')
  const hh = String(fecha.getHours()).padStart(2, '0')
  const mi = String(fecha.getMinutes()).padStart(2, '0')
  return `${dd}/${mm} a las ${hh}:${mi}`
}

export default function Publicar() {
  const token = useToken()
  const router = useRouter()
  const [texto, setTexto] = useState('')
  const [archivos, setArchivos] = useState<Elegido[]>([])
  const [redes, setRedes] = useState<string[]>(['instagram'])
  const [fecha, setFecha] = useState<Date>(() => proximaHoraEnPunto(new Date()))
  const [envio, despachar] = useReducer(reducirEnvio, ENVIO_INICIAL)
  const [aviso, setAviso] = useState<string | null>(null)
  // Lo que ya subió en un intento anterior y el AbortController del envío en curso.
  // Refs, no estado: cambiarlos no debe redibujar, y el orquestador los lee entre awaits.
  const subidas = useRef<(SubidaHecha | null)[]>([])
  const ultimoBorrador = useRef<{ texto: string; redes: string[]; cuando: string | null; ahora: boolean } | null>(null)
  const abortar = useRef<AbortController | null>(null)

  const salir = useCallback(async () => {
    await clearToken()
    router.replace('/login')
  }, [router])

  async function elegir() {
    const permiso = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (!permiso.granted) {
      setAviso('Sin permiso para ver la galería.')
      return
    }
    const resultado = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images', 'videos'],
      allowsMultipleSelection: true,
      selectionLimit: MAX_ARCHIVOS - archivos.length,
    })
    if (resultado.canceled) return
    const nuevos: Elegido[] = []
    for (const asset of resultado.assets) {
      const descrito = describirArchivo(asset)
      if ('error' in descrito) {
        setAviso(descrito.error)
        return
      }
      nuevos.push(descrito)
    }
    setAviso(null)
    setArchivos([...archivos, ...nuevos].slice(0, MAX_ARCHIVOS))
    // Archivos distintos, subidas distintas: lo subido antes ya no corresponde.
    subidas.current = []
  }

  function quitar(indice: number) {
    setArchivos(archivos.filter((_, i) => i !== indice))
    subidas.current = []
  }

  function alternarRed(red: string) {
    setRedes(redes.includes(red) ? redes.filter((r) => r !== red) : [...redes, red])
  }

  function elegirFecha() {
    // Android no tiene un selector de fecha y hora en uno: primero el día, luego la hora.
    // onValueChange (no onChange, que la versión instalada marca deprecado) solo se
    // dispara cuando el usuario confirma: cancelar el diálogo no llama a nada.
    DateTimePickerAndroid.open({
      value: fecha,
      mode: 'date',
      minimumDate: new Date(),
      onValueChange: (_evento, dia) => {
        if (!dia) return
        DateTimePickerAndroid.open({
          value: dia,
          mode: 'time',
          is24Hour: true,
          onValueChange: (_evento2, conHora) => {
            if (!conHora) return
            setFecha(conHora)
          },
        })
      },
    })
  }

  async function enviar(ahora: boolean, retomar: Retomar) {
    if (!token) return
    const borrador =
      retomar.paso === 'chequeando'
        ? { texto: texto.trim(), redes, cuando: ahora ? null : fecha.toISOString(), ahora }
        : ultimoBorrador.current
    if (!borrador) return
    ultimoBorrador.current = borrador
    const control = new AbortController()
    abortar.current = control
    try {
      subidas.current = await ejecutarEnvio({
        token,
        borrador,
        archivos,
        subidas: subidas.current,
        retomar,
        despachar,
        signal: control.signal,
      })
    } catch (e) {
      if (e instanceof SesionCaducada) {
        await salir()
        return
      }
      throw e
    } finally {
      abortar.current = null
    }
  }

  function programar() {
    void enviar(false, { paso: 'chequeando' })
  }

  function publicarAhora() {
    Alert.alert('Publicar ahora', textoConfirmacion(redes), [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Publicar', onPress: () => void enviar(true, { paso: 'chequeando' }) },
    ])
  }

  function reintentar() {
    if (envio.paso !== 'error') return
    const retomar = envio.retomar
    despachar({ tipo: 'reintentar' })
    void enviar(ultimoBorrador.current?.ahora ?? false, retomar)
  }

  function cancelar() {
    abortar.current?.abort()
  }

  // Tras «hecho»: se vacía el formulario y se salta al Calendario, que refresca al
  // recibir foco porque anotamos el cambio. Un efecto y no un `if` en el render:
  // navegar es un efecto secundario, y los `setState` de acá son la reacción a un
  // paso del envío, exactamente el caso que la regla no puede ver por sí sola.
  useEffect(() => {
    if (envio.paso !== 'hecho') return
    anotarCambio()
    despachar({ tipo: 'cancelar' })
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTexto('')
    setArchivos([])
    setRedes(['instagram'])
    setFecha(proximaHoraEnPunto(new Date()))
    subidas.current = []
    ultimoBorrador.current = null
    router.navigate('/(tabs)/calendario')
  }, [envio.paso, router])

  const ocupado = envio.paso === 'chequeando' || envio.paso === 'subiendo' || envio.paso === 'creando'
  const etiqueta = etiquetaEnvio(envio)
  const error = envio.paso === 'listo' ? envio.error : envio.paso === 'error' ? envio.mensaje : null

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: COLORES.fondo }}
      contentContainerStyle={{ padding: 16, paddingBottom: 48, gap: 14 }}
      keyboardShouldPersistTaps="handled"
    >
      <TextInput
        value={texto}
        onChangeText={setTexto}
        multiline
        maxLength={MAX_TEXTO}
        editable={!ocupado}
        placeholder="Texto del post…"
        placeholderTextColor={COLORES.tenue}
        style={{
          backgroundColor: COLORES.tarjeta,
          color: COLORES.texto,
          borderRadius: 12,
          padding: 14,
          minHeight: 120,
          textAlignVertical: 'top',
        }}
      />
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text style={{ color: COLORES.tenue, fontSize: 11 }}>En YouTube el primer renglón es el título</Text>
        <Text style={{ color: COLORES.tenue, fontSize: 11 }}>
          {texto.length} / {MAX_TEXTO}
        </Text>
      </View>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
        {archivos.map((a, i) => (
          <Miniatura key={`${a.uri}:${i}`} uri={a.uri} esVideo={a.mediaType === 'video'} onQuitar={() => quitar(i)} />
        ))}
        {archivos.length < MAX_ARCHIVOS && !ocupado ? (
          <Chip texto="＋ Fotos o video" activo={false} onPress={() => void elegir()} />
        ) : null}
      </View>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {REDES_PUBLICABLES.map((red) => (
          <Chip
            key={red}
            texto={NOMBRE_RED[red] ?? red}
            activo={redes.includes(red)}
            onPress={() => (ocupado ? undefined : alternarRed(red))}
          />
        ))}
      </View>

      <Chip texto={`Cuándo: ${fechaLegible(fecha)}`} activo onPress={() => (ocupado ? undefined : elegirFecha())} />

      {aviso ? <Text style={{ color: COLORES.rojo }}>{aviso}</Text> : null}
      {error ? <Text style={{ color: COLORES.rojo }}>{error}</Text> : null}
      {etiqueta ? <Text style={{ color: COLORES.suave }}>{etiqueta}</Text> : null}
      {envio.paso === 'subiendo' ? (
        <View style={{ height: 4, backgroundColor: '#ffffff10', borderRadius: 2 }}>
          <View style={{ height: 4, width: `${Math.round(envio.progreso * 100)}%`, backgroundColor: COLORES.verde, borderRadius: 2 }} />
        </View>
      ) : null}

      <View style={{ flexDirection: 'row', gap: 10 }}>
        {envio.paso === 'error' ? (
          <Boton texto="Reintentar" onPress={reintentar} destacado />
        ) : ocupado ? (
          <Boton texto="Cancelar" onPress={cancelar} deshabilitado={envio.paso !== 'subiendo'} />
        ) : (
          <>
            <Boton texto="Programar" onPress={programar} deshabilitado={!puedeEnviar(texto, archivos.length)} />
            <Boton texto="Publicar ahora" onPress={publicarAhora} deshabilitado={!puedeEnviar(texto, archivos.length)} destacado />
          </>
        )}
      </View>
    </ScrollView>
  )
}
