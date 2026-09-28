import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  MAX_DOCUMENTO_BYTES,
  MAX_MENSAJE,
  MAX_PALABRA,
  MAX_RESPUESTA,
  REGLA_DOCUMENTO,
  REGLA_MENSAJE,
  REGLA_PALABRA,
  REGLA_RESPUESTA,
} from './social/comentarios/reglas'
import { MAX_BATCH_ITEMS } from './social/publish/batch'
import { TRIAL_REEL_MEDIA } from './social/publish/opciones'

// Estas tres pruebas son la reja que impide que `public/docs/api.json` y
// `public/docs/api-llm.md` —la documentación para un LLM que llama a la API a ciegas—
// se desvíen del código real. Ver la sección 9 de
// docs/superpowers/specs/2026-09-26-documento-por-privado-design.md.

describe('la documentación para LLM no le miente al código', () => {
  it('cada frase de error de la guía existe como constante del código', () => {
    const guia = readFileSync('public/docs/api-llm.md', 'utf8')
    for (const frase of [REGLA_PALABRA, REGLA_MENSAJE, REGLA_RESPUESTA, REGLA_DOCUMENTO, TRIAL_REEL_MEDIA]) {
      expect(guia).toContain(frase)
    }
  })

  it('cada límite del esquema es el que el validador aplica', () => {
    const esquema = JSON.parse(readFileSync('public/docs/api.json', 'utf8'))
    // El tope de filas por lote también: la guía lo dice en su tabla de errores («Máximo 50
    // posts por lote»), así que si la constante cambiara y el esquema no, el documento miente.
    expect(esquema.properties.posts.maxItems).toBe(MAX_BATCH_ITEMS)
    const regla = esquema.properties.posts.items.properties.regla.properties
    expect(regla.palabra.maxLength).toBe(MAX_PALABRA)
    expect(regla.mensaje.maxLength).toBe(MAX_MENSAJE)
    expect(regla.respuestaPublica.maxLength).toBe(MAX_RESPUESTA)
    // `maxBytes` no es una palabra clave de JSON Schema: es una anotación nuestra, porque el
    // tope no es del largo de la URL sino del archivo que hay detrás, y el esquema no tiene
    // forma de expresar eso. Los validadores la ignoran; el LLM la lee. Que quede dicho en
    // el propio esquema con una `description`, para que nadie la confunda con estándar.
    expect(regla.documentoUrl.maxBytes).toBe(MAX_DOCUMENTO_BYTES)
  })

  it('el esquema declara exactamente los campos que el validador lee', () => {
    // En los dos sentidos: un campo que el esquema inventa haría que un LLM mande algo
    // que se ignora, y uno que el validador lee y el esquema no declara haría que nunca
    // lo use. Las dos son formas de mentir.
    const esquema = JSON.parse(readFileSync('public/docs/api.json', 'utf8'))
    const declarados = Object.keys(esquema.properties.posts.items.properties).sort()
    expect(declarados).toEqual(
      ['atributos', 'cuentas', 'fecha', 'media', 'opciones', 'portada', 'redes', 'regla', 'texto'].sort(),
    )
  })
})
