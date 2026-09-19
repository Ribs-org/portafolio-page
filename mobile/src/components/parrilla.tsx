import { View, Text } from 'react-native'
import type { ReactNode } from 'react'
import { COCCION, GRASA, calorDelDia, type Calor, type Coccion } from '../lib/parrilla'
import { COLORES, TIPO_TITULO } from './ui'

/**
 * La parrilla en el teléfono. Gemela de las clases `.grilla` y `.corte` del panel
 * (`src/app/globals.css`), con dos diferencias que impone React Native y que no son
 * pereza:
 *
 * 1. **Sin degradados.** No hay `expo-linear-gradient` instalado y agregarlo es una
 *    dependencia nativa, o sea un build nuevo y una reinstalación a mano; esto viaja por
 *    aire al que ya está en el teléfono. El fuego se arma con capas superpuestas y el
 *    corte usa el extremo claro de su cocción, que es justo el que tiene el contraste
 *    verificado contra el texto.
 * 2. **Sin los fierros de la grilla.** En el panel son bandas cada 13 px sobre el fuego.
 *    Acá habría que dibujarlas una por una porque no existe `repeating-linear-gradient`,
 *    y serían cientos de vistas en una lista que se desplaza. Las marcas del corte sí
 *    están, que son las que cuentan la cocción; las de la grilla eran ambiente.
 */

/** Cuántas marcas lleva un corte. Cubren 126 px; lo que sobre lo recorta el contenedor. */
const MARCAS = 9
const PASO_MARCA = 14

const OPACIDAD_MARCA: Record<Coccion, number> = {
  // La cruda casi no tocó el fierro todavía.
  cruda: 0.08,
  sellada: 0.3,
  punto: 0.3,
  quemada: 0.55,
}

/** Las tres capas con las que se finge el fuego, de arriba abajo. */
const FUEGO: Record<Calor, { color: string; alto: number }[]> = {
  apagada: [],
  prendida: [
    { color: 'rgba(196,52,26,0.05)', alto: 0.4 },
    { color: 'rgba(232,98,31,0.13)', alto: 0.35 },
    { color: 'rgba(255,138,61,0.22)', alto: 0.25 },
  ],
  llena: [
    { color: 'rgba(196,52,26,0.12)', alto: 0.4 },
    { color: 'rgba(232,98,31,0.3)', alto: 0.35 },
    { color: 'rgba(255,138,61,0.46)', alto: 0.25 },
  ],
}

/** Un día: el fuego debajo y los cortes encima. */
export function Grilla({ calor, children }: { calor: Calor; children: ReactNode }) {
  return (
    <View
      style={{
        position: 'relative',
        borderRadius: 4,
        borderWidth: 1,
        borderStyle: calor === 'apagada' ? 'dashed' : 'solid',
        borderColor: calor === 'llena' ? 'rgba(232,98,31,0.4)' : COLORES.tarjeta,
        backgroundColor: calor === 'apagada' ? COLORES.tarjeta : COLORES.fondo,
        overflow: 'hidden',
        padding: 10,
        gap: 8,
      }}
    >
      {/* El fuego, detrás de todo. `flex` reparte las tres capas de arriba abajo. */}
      <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} pointerEvents="none">
        {FUEGO[calor].map((capa, i) => (
          <View key={i} style={{ flex: capa.alto, backgroundColor: capa.color }} />
        ))}
      </View>
      {children}
    </View>
  )
}

/** El rótulo de un día: qué día es y cómo está la parrilla. */
export function RotuloDia({ dia, cortes }: { dia: string; cortes: number }) {
  const calor = calorDelDia(cortes)
  return (
    <View
      style={{
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'baseline',
        marginTop: 8,
        marginBottom: 6,
        gap: 8,
      }}
    >
      <Text
        style={{
          color: COLORES.suave,
          fontSize: 11,
          textTransform: 'uppercase',
          fontFamily: TIPO_TITULO,
          letterSpacing: 1.2,
        }}
      >
        {dia}
      </Text>
      <Text
        style={{
          color: calor === 'llena' ? COLORES.brasa : COLORES.suave,
          fontSize: 10,
          textTransform: 'uppercase',
          fontFamily: TIPO_TITULO,
          letterSpacing: 1,
        }}
      >
        {calor === 'llena' ? 'Parrilla llena' : calor === 'prendida' ? 'Prendida' : 'Apagada'}
      </Text>
    </View>
  )
}

/**
 * Un post, como un corte sobre el fierro.
 *
 * Las cuatro esquinas con radios distintos para que no se lea como una tarjeta más, el
 * veteado de la grasa debajo y las marcas del fierro encima.
 */
export function Corte({ coccion, children }: { coccion: Coccion; children: ReactNode }) {
  return (
    <View
      style={{
        position: 'relative',
        backgroundColor: COCCION[coccion].claro,
        borderTopLeftRadius: 13,
        borderTopRightRadius: 5,
        borderBottomRightRadius: 14,
        borderBottomLeftRadius: 6,
        borderWidth: 1,
        borderColor: 'rgba(0,0,0,0.35)',
        overflow: 'hidden',
        padding: 10,
        gap: 4,
      }}
    >
      {/* El veteado: tres manchas claras y muy tenues. Sin degradado radial quedan más
          duras que en el panel, así que van a menos opacidad para que no se lean como
          objetos sino como grasa. */}
      <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} pointerEvents="none">
        <View
          style={{
            position: 'absolute',
            left: '22%',
            top: '28%',
            width: 34,
            height: 6,
            borderRadius: 4,
            backgroundColor: GRASA,
            opacity: 0.14,
          }}
        />
        <View
          style={{
            position: 'absolute',
            left: '58%',
            top: '58%',
            width: 24,
            height: 5,
            borderRadius: 3,
            backgroundColor: GRASA,
            opacity: 0.11,
          }}
        />
        <View
          style={{
            position: 'absolute',
            left: '38%',
            top: '76%',
            width: 18,
            height: 4,
            borderRadius: 3,
            backgroundColor: GRASA,
            opacity: 0.09,
          }}
        />
      </View>

      {/*
        Las marcas del fierro sobre la carne. Van antes que el contenido a propósito: en
        React Native el hermano que viene después se pinta encima, así que dejarlas
        últimas las pondría sobre el texto y lo rayaría. La miniatura es el único
        elemento que sí las quiere encima, y para eso está `CorteMedia`.
      */}
      <Marcas coccion={coccion} />

      {children}
    </View>
  )
}

/** El rayado del fierro, para superponer. */
function Marcas({ coccion }: { coccion: Coccion }) {
  return (
    <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} pointerEvents="none">
      {Array.from({ length: MARCAS }, (_, i) => (
        <View
          key={i}
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: i * PASO_MARCA,
            height: 3,
            backgroundColor: `rgba(0,0,0,${OPACIDAD_MARCA[coccion]})`,
          }}
        />
      ))}
    </View>
  )
}

/**
 * La miniatura del post, con sus propias marcas encima.
 *
 * Sin esto la foto sale limpia sobre una carne rayada, que es una foto pegada encima de
 * un dibujo y no algo puesto sobre la parrilla. Es el mismo error que el panel tuvo en
 * su primera versión y que la revisión atrapó.
 */
export function CorteMedia({ coccion, children }: { coccion: Coccion; children: ReactNode }) {
  return (
    <View style={{ position: 'relative', borderRadius: 8, overflow: 'hidden' }}>
      {children}
      <Marcas coccion={coccion} />
    </View>
  )
}
