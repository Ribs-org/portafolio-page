import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { Alert, KeyboardAvoidingView, ScrollView, Text, TextInput, View } from 'react-native'
import { DateTimePickerAndroid } from '@react-native-community/datetimepicker'
import * as ImagePicker from 'expo-image-picker'
import { useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { Boton, COLORES, Chip, ErrorConReintento, Miniatura } from '../../components/ui'
import { SesionCaducada, apiGet } from '../../lib/api'
import { anotarCambio } from '../../lib/cambios'
import {
  ENVIO_INICIAL,
  MAX_ARCHIVOS,
  describirArchivo,
  etiquetaCuenta,
  etiquetaEnvio,
  proximaHoraEnPunto,
  puedeEnviar,
  reducirEnvio,
  textoConfirmacion,
  vieneMarcada,
  type Elegido,
  type Retomar,
} from '../../lib/publicar'
import { clearToken } from '../../lib/session'
import { ejecutarEnvio, type SubidaHecha } from '../../lib/subir'
import type { CuentaApp } from '../../lib/tipos'
import { useToken } from '../../lib/useToken'

const MAX_TEXTO = 2200

/**
 * `disponibles` no alcanza para distinguir «todavía no sabemos» de «el dueño no tiene
 * ninguna»: las dos empiezan en una lista vacía. Este estado sí las distingue, para
 * poder dibujar cargando/error/vacío en vez de una fila de chips en blanco que se ve
 * igual en los tres casos.
 */
type EstadoCuentas = { paso: 'cargando' } | { paso: 'error' } | { paso: 'listo'; disponibles: CuentaApp[] }

// El contenedor mide desde su padre y el teclado desde la pantalla; en medio está la
// cabecera. Es el estándar de Android (expo-router no reexporta `useHeaderHeight`): confirmar en el teléfono la primera vez.
const ALTO_CABECERA = 56

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
  const insets = useSafeAreaInsets()
  const [texto, setTexto] = useState('')
  const [archivos, setArchivos] = useState<Elegido[]>([])
  const [cuentas, setCuentas] = useState<string[]>([])
  const [cuentasEstado, setCuentasEstado] = useState<EstadoCuentas>({ paso: 'cargando' })
  // Solo cuando ya se supo qué cuentas hay: mientras carga o si falló, no hay ninguna
  // que ofrecer — el estado de arriba es el que distingue esos dos casos de «ninguna».
  // Memoizada: un `[]` nuevo en cada render volvía a disparar el efecto de abajo que
  // la usa como dependencia.
  const disponibles = useMemo(
    () => (cuentasEstado.paso === 'listo' ? cuentasEstado.disponibles : []),
    [cuentasEstado],
  )
  const [fecha, setFecha] = useState<Date>(() => proximaHoraEnPunto(new Date()))
  const [envio, despachar] = useReducer(reducirEnvio, ENVIO_INICIAL)
  const [aviso, setAviso] = useState<string | null>(null)
  // Lo que ya subió en un intento anterior y el AbortController del envío en curso.
  // Refs, no estado: cambiarlos no debe redibujar, y el orquestador los lee entre awaits.
  const subidas = useRef<(SubidaHecha | null)[]>([])
  const ultimoBorrador = useRef<{ texto: string; cuentas: string[]; cuando: string | null; ahora: boolean } | null>(
    null,
  )
  const abortar = useRef<AbortController | null>(null)

  const salir = useCallback(async () => {
    await clearToken()
    router.replace('/login')
  }, [router])

  // La misma regla que la web: con una sola cuenta conectada viene marcada, porque no
  // hay entre qué elegir; con dos o más no viene ninguna (`vieneMarcada`). Separada de
  // `aviso` (avisos del selector de archivos) a propósito: `elegir()` no debe poder
  // borrar un error de carga de cuentas que sigue siendo cierto, y viceversa.
  const cargarCuentas = useCallback(async () => {
    if (!token) return
    setCuentasEstado({ paso: 'cargando' })
    let lista: CuentaApp[]
    try {
      ;({ cuentas: lista } = await apiGet<{ cuentas: CuentaApp[] }>('/api/mobile/schedule/accounts', token))
    } catch (e) {
      if (e instanceof SesionCaducada) {
        await salir()
        return
      }
      setCuentasEstado({ paso: 'error' })
      return
    }
    setCuentasEstado({ paso: 'listo', disponibles: lista })
    setCuentas(lista.filter((c) => vieneMarcada(c, lista)).map((c) => c.id))
  }, [token, salir])

  useEffect(() => {
    // La regla ve `setCuentasEstado({ paso: 'cargando' })` antes del primer `await`
    // dentro de `cargarCuentas` y no puede saber que es el arranque legítimo del
    // pedido de red, no un `setState` gratuito disparado a ciegas desde el efecto.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void cargarCuentas()
  }, [cargarCuentas])

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
    // Archivos distintos, subidas distintas: lo subido antes ya no corresponde. Y un
    // reintento pendiente apuntaba a índices de la lista vieja, así que también se
    // descarta: se vuelve a listo y el próximo envío arranca del chequeo.
    subidas.current = []
    despachar({ tipo: 'cancelar' })
  }

  function quitar(indice: number) {
    setArchivos(archivos.filter((_, i) => i !== indice))
    subidas.current = []
    despachar({ tipo: 'cancelar' })
  }

  function alternarCuenta(id: string) {
    setCuentas(cuentas.includes(id) ? cuentas.filter((c) => c !== id) : [...cuentas, id])
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
        ? { texto: texto.trim(), cuentas, cuando: ahora ? null : fecha.toISOString(), ahora }
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
    const elegidas = disponibles.filter((c) => cuentas.includes(c.id))
    Alert.alert('Publicar ahora', textoConfirmacion(elegidas), [
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
  // navegar es un efecto secundario.
  useEffect(() => {
    if (envio.paso !== 'hecho') return
    anotarCambio()
    // La espera es la confirmación: limpiar y navegar en el mismo tick borraba
    // «Listo» antes de que alcanzara a dibujarse, y el envío terminaba sin acuse.
    const salto = setTimeout(() => {
      despachar({ tipo: 'cancelar' })
      setTexto('')
      setArchivos([])
      // La misma regla que al abrir la pantalla: con una sola cuenta conectada, vuelve
      // marcada; con dos o más, ninguna.
      setCuentas(disponibles.filter((c) => vieneMarcada(c, disponibles)).map((c) => c.id))
      setFecha(proximaHoraEnPunto(new Date()))
      setAviso(null)
      subidas.current = []
      ultimoBorrador.current = null
      router.navigate('/(tabs)/calendario')
    }, 1000)
    return () => clearTimeout(salto)
  }, [envio.paso, router, disponibles])

  // 'hecho' también cuenta: durante el segundo que se ve «Listo» la pantalla ya no
  // acepta nada, para que un toque de más no despache el mismo post dos veces.
  const ocupado =
    envio.paso === 'chequeando' || envio.paso === 'subiendo' || envio.paso === 'creando' || envio.paso === 'hecho'
  const etiqueta = etiquetaEnvio(envio)
  const error = envio.paso === 'listo' ? envio.error : envio.paso === 'error' ? envio.mensaje : null

  return (
    // `height` es el `behavior` de Android: la app dibuja de borde a borde, así que la
    // ventana ya no se encoge sola al abrir el teclado y el texto largo dejaba
    // «Programar» y «Publicar ahora» debajo de las teclas.
    <KeyboardAvoidingView
      behavior="height"
      keyboardVerticalOffset={insets.top + ALTO_CABECERA}
      style={{ flex: 1, backgroundColor: COLORES.fondo }}
    >
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
            <Miniatura
              key={`${a.uri}:${i}`}
              uri={a.uri}
              esVideo={a.mediaType === 'video'}
              onQuitar={ocupado ? undefined : () => quitar(i)}
            />
          ))}
          {archivos.length < MAX_ARCHIVOS && !ocupado ? (
            <Chip texto="+ Fotos o video" activo={false} onPress={() => void elegir()} />
          ) : null}
        </View>

        {cuentasEstado.paso === 'cargando' ? (
          <Text style={{ color: COLORES.tenue, fontSize: 12 }}>Cargando cuentas…</Text>
        ) : cuentasEstado.paso === 'error' ? (
          <ErrorConReintento mensaje="No se pudieron cargar las cuentas." onReintentar={() => void cargarCuentas()} />
        ) : disponibles.length === 0 ? (
          // Cierto tanto si no hay ninguna cuenta como si la única que hay es de una
          // red que el teléfono no ofrece (hoy, TikTok): el endpoint ya las filtró, y
          // desde acá no se puede distinguir un caso del otro.
          <Text style={{ color: COLORES.tenue, fontSize: 12 }}>
            No hay ninguna cuenta lista para publicar desde el teléfono. Conecta una en la
            pestaña Cuentas.
          </Text>
        ) : (
          <>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {disponibles.map((c) =>
                c.conectada ? (
                  <Chip
                    key={c.id}
                    texto={etiquetaCuenta(c)}
                    activo={cuentas.includes(c.id)}
                    onPress={() => alternarCuenta(c.id)}
                    deshabilitado={ocupado}
                  />
                ) : (
                  // No es un `Chip`: nunca se puede tocar, así que no lleva su
                  // `deshabilitado` (que atenúa con opacidad 0.5 un texto ya tenue —
                  // el mismo contraste insuficiente que `calendario.tsx` evita para un
                  // estado transitorio, y acá sería uno permanente). Texto a contraste
                  // completo más la palabra que falta, como «reconéctala» en el panel.
                  <View
                    key={c.id}
                    style={{ paddingHorizontal: 12, paddingVertical: 10, minHeight: 44, justifyContent: 'center' }}
                  >
                    <Text style={{ color: COLORES.texto, fontSize: 12 }}>
                      {etiquetaCuenta(c)} · <Text style={{ color: COLORES.rojo }}>reconéctala</Text>
                    </Text>
                  </View>
                ),
              )}
            </View>
            {cuentas.length === 0 ? (
              <Text style={{ color: COLORES.tenue, fontSize: 11 }}>Elige al menos una cuenta.</Text>
            ) : null}
          </>
        )}

        <Chip
          texto={`Cuándo: ${fechaLegible(fecha)}`}
          activo
          onPress={elegirFecha}
          deshabilitado={ocupado}
        />

        {aviso ? <Text style={{ color: COLORES.rojo }}>{aviso}</Text> : null}
        {error ? <Text style={{ color: COLORES.rojo }}>{error}</Text> : null}
        {etiqueta ? <Text style={{ color: COLORES.suave }}>{etiqueta}</Text> : null}
        {/* La barra se llena en brasa y no en verde: el verde es el «publicado» del semáforo
            y acá todavía no se publicó nada — recién se está subiendo el archivo. */}
        {envio.paso === 'subiendo' ? (
          <View style={{ height: 4, backgroundColor: '#ffffff10', borderRadius: 2 }}>
            <View style={{ height: 4, width: `${Math.round(envio.progreso * 100)}%`, backgroundColor: COLORES.brasa, borderRadius: 2 }} />
          </View>
        ) : null}

        <View style={{ flexDirection: 'row', gap: 10 }}>
          {envio.paso === 'error' ? (
            <Boton texto="Reintentar" onPress={reintentar} destacado />
          ) : ocupado ? (
            <Boton texto="Cancelar" onPress={cancelar} deshabilitado={envio.paso !== 'subiendo'} />
          ) : (
            <>
              <Boton
                texto="Programar"
                onPress={programar}
                deshabilitado={!puedeEnviar(texto, archivos.length, cuentas.length)}
              />
              <Boton
                texto="Publicar ahora"
                onPress={publicarAhora}
                deshabilitado={!puedeEnviar(texto, archivos.length, cuentas.length)}
                destacado
              />
            </>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}
