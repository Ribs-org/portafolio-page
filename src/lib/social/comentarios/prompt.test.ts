import { describe, expect, it } from 'vitest'
import { armarPrompt, limpiarBorrador } from './prompt'

const base = {
  instrucciones: 'Responde corto.',
  caption: 'Tres cosas que aprendí este año.',
  comentario: '¿Cuánto cobras por esto?',
  autor: '@vecina',
}

describe('armarPrompt', () => {
  it('lleva las instrucciones del dueño en el mensaje de sistema', () => {
    expect(armarPrompt(base).system).toContain('Responde corto.')
  })

  it('lleva la publicación, el comentario y quién lo dejó', () => {
    const { prompt } = armarPrompt(base)
    expect(prompt).toContain('Tres cosas que aprendí este año.')
    expect(prompt).toContain('¿Cuánto cobras por esto?')
    expect(prompt).toContain('@vecina')
  })

  it('dice que la publicación no tiene texto en vez de mandar un hueco', () => {
    const { prompt } = armarPrompt({ ...base, caption: null })
    expect(prompt).toContain('sin texto')
    expect(prompt).not.toContain('null')
  })

  it('no nombra al autor cuando la red no lo dio', () => {
    const { prompt } = armarPrompt({ ...base, autor: null })
    expect(prompt).not.toContain('null')
    expect(prompt).toContain('¿Cuánto cobras por esto?')
  })
})

describe('limpiarBorrador', () => {
  it('quita las comillas que envuelven toda la respuesta', () => {
    expect(limpiarBorrador('"¡Gracias!"', 100)).toBe('¡Gracias!')
    expect(limpiarBorrador('«¡Gracias!»', 100)).toBe('¡Gracias!')
  })

  it('no toca las comillas de adentro', () => {
    expect(limpiarBorrador('Le dije "ya voy" y fui.', 100)).toBe('Le dije "ya voy" y fui.')
  })

  it('no despoja dos frases entrecomilladas, que no son un solo par que envuelve todo', () => {
    expect(limpiarBorrador('"hola" y "chao"', 100)).toBe('"hola" y "chao"')
    expect(limpiarBorrador("'está' o 'no está'", 100)).toBe("'está' o 'no está'")
    expect(limpiarBorrador('«hola» y «chao»', 100)).toBe('«hola» y «chao»')
  })

  it('quita el prefijo con el que el modelo a veces se presenta', () => {
    expect(limpiarBorrador('Respuesta: ¡Gracias!', 100)).toBe('¡Gracias!')
    expect(limpiarBorrador('respuesta:¡Gracias!', 100)).toBe('¡Gracias!')
  })

  it('recorta al límite de la red por puntos de código', () => {
    expect(limpiarBorrador('🙂🙂🙂', 2)).toBe('🙂🙂')
  })

  it('devuelve cadena vacía cuando no queda nada', () => {
    expect(limpiarBorrador('  ""  ', 100)).toBe('')
  })
})
