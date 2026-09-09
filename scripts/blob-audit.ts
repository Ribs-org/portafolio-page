/**
 * Mide el bucket: cuánto pesa, en qué carpetas, y quiénes son los archivos grandes.
 *
 * Es la herramienta con la que se diagnosticó el problema (1.302 MB en Vercel Blob,
 * 98,7 % en 26 videos) y con la que se comprueba que la migración hizo lo que dice.
 *
 * Uso:
 *   npm run blobs:auditar
 */
import { listar } from '../src/lib/storage'

const MB = 1024 * 1024

async function main() {
  const objetos = await listar()
  const total = objetos.reduce((suma, o) => suma + o.size, 0)
  console.log(`TOTAL: ${objetos.length} archivos, ${(total / MB).toFixed(1)} MB`)

  const porCarpeta = new Map<string, { n: number; bytes: number }>()
  for (const o of objetos) {
    const carpeta = o.key.split('/')[0] ?? '(raíz)'
    const acumulado = porCarpeta.get(carpeta) ?? { n: 0, bytes: 0 }
    acumulado.n += 1
    acumulado.bytes += o.size
    porCarpeta.set(carpeta, acumulado)
  }
  console.log('\n--- por carpeta ---')
  for (const [carpeta, e] of [...porCarpeta].sort((a, b) => b[1].bytes - a[1].bytes)) {
    console.log(`${carpeta.padEnd(14)} ${String(e.n).padStart(5)} arch  ${(e.bytes / MB).toFixed(1)} MB`)
  }

  const esVideo = (key: string) => /\.(mp4|mov|m4v|webm|avi|mkv)$/i.test(key)
  const videos = objetos.filter((o) => esVideo(o.key))
  const imagenes = objetos.filter((o) => !esVideo(o.key))
  console.log('\n--- por tipo ---')
  for (const [nombre, grupo] of [['video', videos], ['imagen', imagenes]] as const) {
    const bytes = grupo.reduce((s, o) => s + o.size, 0)
    console.log(`${nombre.padEnd(7)} ${String(grupo.length).padStart(5)} arch  ${(bytes / MB).toFixed(1)} MB`)
  }

  console.log('\n--- 15 más pesados ---')
  for (const o of [...objetos].sort((a, b) => b.size - a.size).slice(0, 15)) {
    const fecha = o.uploadedAt.toISOString().slice(0, 10)
    console.log(`${(o.size / MB).toFixed(1).padStart(7)} MB  ${fecha}  ${o.key.slice(0, 80)}`)
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
