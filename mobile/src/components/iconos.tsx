import { View, type ColorValue } from 'react-native'

/**
 * Los iconos de la barra de abajo, dibujados con `View`.
 *
 * Las cinco pestañas no declaraban `tabBarIcon`, así que la barra reservaba el hueco del
 * icono y lo dejaba vacío: se veía el rótulo flotando sobre nada. Eso es lo que no cargaba.
 *
 * Dibujados y no de una librería por dos razones. La primera es que ni
 * `@expo/vector-icons` ni `react-native-svg` están instalados, y los dos son dependencia
 * nativa: agregarlos obliga a compilar un build nuevo y a reinstalarlo a mano, mientras
 * que esto viaja en una actualización por aire al build que ya está en el teléfono. La
 * segunda es que un set genérico no tiene un corte de carne ni una parrilla, y son
 * justo los dos que cuentan acá.
 *
 * `tabBarIcon` recibe `{ color, focused, size }` y devuelve cualquier nodo de React
 * (ver https://docs.expo.dev/router/advanced/tabs/), así que no hace falta más.
 */

const CAJA = 24

function Caja({ children }: { children: React.ReactNode }) {
  return (
    <View style={{ width: CAJA, height: CAJA, alignItems: 'center', justifyContent: 'center' }}>
      {children}
    </View>
  )
}

/**
 * El fuego, para el Resumen. Un cuadrado con tres esquinas redondas y la cuarta en
 * punta, girado para que la punta quede arriba: la gota clásica, al revés.
 */
export function IconoFuego({ color }: { color: ColorValue }) {
  return (
    <Caja>
      <View
        style={{
          width: 15,
          height: 15,
          backgroundColor: color,
          borderTopLeftRadius: 0,
          borderTopRightRadius: 8,
          borderBottomRightRadius: 8,
          borderBottomLeftRadius: 8,
          transform: [{ rotate: '45deg' }],
        }}
      />
    </Caja>
  )
}

/**
 * Un corte, para Contenido. Las cuatro esquinas con radios distintos para que no se
 * lea como una pastilla, y una veta de grasa cruzada que es lo que lo vuelve carne y
 * no una mancha. La veta va en el color del fondo, no en blanco: así funciona igual
 * con la pestaña activa en brasa y con la inactiva en gris.
 */
export function IconoCorte({ color, fondo }: { color: ColorValue; fondo: ColorValue }) {
  return (
    <Caja>
      <View
        style={{
          width: 20,
          height: 15,
          backgroundColor: color,
          borderTopLeftRadius: 9,
          borderTopRightRadius: 4,
          borderBottomRightRadius: 9,
          borderBottomLeftRadius: 4,
          overflow: 'hidden',
          justifyContent: 'center',
        }}
      >
        <View
          style={{
            height: 2.5,
            marginLeft: 4,
            marginRight: 6,
            borderRadius: 2,
            backgroundColor: fondo,
            transform: [{ rotate: '-12deg' }],
          }}
        />
      </View>
    </Caja>
  )
}

/**
 * La parrilla vista desde arriba, para el Calendario: el marco y los tres fierros.
 * Es el icono que más se parece a lo que la pantalla hace, que es repartir cortes
 * sobre los fierros de cada día.
 */
export function IconoParrilla({ color }: { color: ColorValue }) {
  return (
    <Caja>
      <View
        style={{
          width: 19,
          height: 19,
          borderWidth: 1.8,
          borderColor: color,
          borderRadius: 4,
          justifyContent: 'space-evenly',
          paddingHorizontal: 2.5,
        }}
      >
        {[0, 1, 2].map((i) => (
          <View key={i} style={{ height: 1.8, borderRadius: 1, backgroundColor: color }} />
        ))}
      </View>
    </Caja>
  )
}

/**
 * Poner algo al fuego, para Publicar. Una cruz y no un corte sobre la parrilla: a 24
 * puntos los dos dibujos juntos se empastan, y esta es la acción principal de la app
 * — vale más que se lea de una que que rime con el resto.
 */
export function IconoPoner({ color }: { color: ColorValue }) {
  return (
    <Caja>
      <View style={{ width: 18, height: 18, alignItems: 'center', justifyContent: 'center' }}>
        <View
          style={{
            position: 'absolute',
            width: 18,
            height: 2.6,
            borderRadius: 2,
            backgroundColor: color,
          }}
        />
        <View
          style={{
            position: 'absolute',
            width: 2.6,
            height: 18,
            borderRadius: 2,
            backgroundColor: color,
          }}
        />
      </View>
    </Caja>
  )
}

/**
 * Una silueta, para Cuentas. Es el único de los cinco que no sale del mundo de la
 * parrilla, y es a propósito: la pantalla habla de perfiles y seguidores, y forzar un
 * fierro o una tenaza acá dejaría el icono bonito y mudo.
 */
export function IconoCuentas({ color }: { color: ColorValue }) {
  return (
    <Caja>
      <View style={{ width: 20, height: 19, alignItems: 'center' }}>
        <View style={{ width: 8.5, height: 8.5, borderRadius: 4.25, backgroundColor: color }} />
        <View
          style={{
            width: 17,
            height: 8,
            marginTop: 2.5,
            borderTopLeftRadius: 8.5,
            borderTopRightRadius: 8.5,
            backgroundColor: color,
          }}
        />
      </View>
    </Caja>
  )
}
