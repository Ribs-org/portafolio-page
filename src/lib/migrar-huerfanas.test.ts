import { beforeEach, describe, expect, it } from 'vitest'
import { adoptarHuerfanas } from '../../scripts/migrar'

/**
 * Doble mínimo del cliente `postgres` que usa `adoptarHuerfanas`: anota cada consulta (la
 * plantilla ya unida en un solo texto, sin separar los parámetros) y devuelve, en orden, la
 * siguiente respuesta de una cola. Una respuesta puede ser un error —para probar el
 * reintento cuando la dirección elegida choca con `profiles_slug_unique`— sin tener que
 * mockear el paquete `postgres` entero: `adoptarHuerfanas` recibe el cliente como
 * parámetro, así que este doble basta.
 */
type Captura = { sql: string; params: unknown[] }
type RespuestaError = { __error: unknown }

function esRespuestaError(valor: unknown): valor is RespuestaError {
  return Boolean(valor) && typeof valor === 'object' && '__error' in (valor as object)
}

function sqlFalso(colaRespuestas: unknown[]) {
  const capturas: Captura[] = []
  const cola = [...colaRespuestas]

  function entregar() {
    if (cola.length === 0) return Promise.resolve([])
    const siguiente = cola.shift()
    return esRespuestaError(siguiente) ? Promise.reject(siguiente.__error) : Promise.resolve(siguiente)
  }

  const fn = ((strings: TemplateStringsArray, ...values: unknown[]) => {
    capturas.push({ sql: strings.join('?'), params: values })
    return entregar()
  }) as unknown as Parameters<typeof adoptarHuerfanas>[0]

  Object.assign(fn as object, {
    unsafe: (texto: string, params: unknown[] = []) => {
      capturas.push({ sql: texto, params })
      return entregar()
    },
  })

  return { fn, capturas }
}

const errorDeSlugRepetido = { __error: Object.assign(new Error('slug repetido'), { code: '23505', constraint_name: 'profiles_slug_unique' }) }

// Las seis tablas de CON_DUENO en scripts/migrar.ts, cada una con su UPDATE.
const RESPUESTAS_ADOPCION = [[], [], [], [], [], []]

describe('adoptarHuerfanas: la página del admin', () => {
  beforeEach(() => {
    process.env.ADMIN_EMAIL = 'ana@example.com'
  })

  // La línea que justifica este archivo: este script corre antes que todo (vercel.json:
  // `db:migrate && next build`), así que en una base nueva crea al admin. Si no le crea
  // también su página acá, el invariante «todo usuario tiene exactamente una página» nace
  // roto en el mismo despliegue que lo introduce — y `adminId()` encuentra la fila que este
  // script creó, así que nunca llama a `asegurarAdmin()`: la reparación no llega por ahí.
  it('si el admin recién creado no tiene página, le crea una en la dirección de su correo', async () => {
    const { fn, capturas } = sqlFalso([
      [{ id: 'admin-1', nombre: null }], // insert/upsert de users
      ...RESPUESTAS_ADOPCION,
      [], // select de profiles por owner_id: no tiene página
    ])
    await adoptarHuerfanas(fn)
    const creaciones = capturas.filter((c) => c.sql.includes('insert into profiles'))
    expect(creaciones).toHaveLength(1)
    expect(creaciones[0]!.params).toContain('admin-1')
    expect(creaciones[0]!.params).toContain('ana')
  })

  it('si el admin ya tiene página (producción, despliegues después del primero), no crea otra', async () => {
    const { fn, capturas } = sqlFalso([
      [{ id: 'admin-1', nombre: null }],
      ...RESPUESTAS_ADOPCION,
      [{ id: 'perfil-existente' }], // select de profiles por owner_id: ya tiene
    ])
    await adoptarHuerfanas(fn)
    expect(capturas.filter((c) => c.sql.includes('insert into profiles'))).toHaveLength(0)
  })

  it('si la dirección elegida choca con otra página, reintenta con la siguiente', async () => {
    const { fn, capturas } = sqlFalso([
      [{ id: 'admin-1', nombre: null }],
      ...RESPUESTAS_ADOPCION,
      [], // sin página
      errorDeSlugRepetido, // primer intento ('ana') choca
      [], // segundo intento ('ana-2') sigue
    ])
    await adoptarHuerfanas(fn)
    const creaciones = capturas.filter((c) => c.sql.includes('insert into profiles'))
    expect(creaciones).toHaveLength(2)
    expect(creaciones[0]!.params).toContain('ana')
    expect(creaciones[1]!.params).toContain('ana-2')
  })
})
