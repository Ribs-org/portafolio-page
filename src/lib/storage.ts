import {
  DeleteObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { env } from '@/lib/env'

/** Misma forma que la frase que daba el Blob ausente: el panel sigue diciendo lo mismo. */
export const SIN_ALMACEN = 'Falta configurar Cloudflare R2 (R2_*).'

/**
 * Cada key lleva un UUID: nunca cambia de contenido, así que cachearla para siempre es
 * seguro. R2 no pone un default largo por su cuenta. Compartido entre `guardar` y la
 * subida firmada para que un objeto subido desde el teléfono quede igual que uno subido
 * por el servidor.
 */
export const CACHE_INMUTABLE = 'public, max-age=31536000, immutable'
/** Una hora: un video de 200 MB por datos móviles cabe de sobra, y un link filtrado muere solo. */
const SUBIDA_SEGUNDOS = 3600

export type ObjetoAlmacenado = { key: string; url: string; size: number; uploadedAt: Date }

function sinBarra(base: string): string {
  return base.replace(/\/+$/, '')
}

/**
 * Compone la URL pública de una key. Cada segmento va codificado por separado: las
 * keys terminan en el nombre del archivo que subió el dueño —con espacios y tildes—
 * y codificar la key entera se comería las barras que separan carpeta de archivo.
 */
export function urlPublica(baseUrl: string, key: string): string {
  return `${sinBarra(baseUrl)}/${key.split('/').map(encodeURIComponent).join('/')}`
}

/**
 * Inversa de `urlPublica`. Devuelve null cuando la URL no es de este almacén —una
 * miniatura de Instagram, un blob viejo de Vercel— que es exactamente el caso en que
 * `borrar` no debe tocar nada.
 */
export function keyDesdeUrl(baseUrl: string, url: string): string | null {
  const prefijo = `${sinBarra(baseUrl)}/`
  if (!url.startsWith(prefijo)) return null
  const resto = (url.slice(prefijo.length).split('?')[0] ?? '').split('#')[0] ?? ''
  if (resto === '') return null
  try {
    return resto.split('/').map(decodeURIComponent).join('/')
  } catch {
    // Percent-encoding inválido: no la compusimos nosotros.
    return null
  }
}

type Config = { bucket: string; base: string }

function config(): Config | null {
  const bucket = env('R2_BUCKET')
  const base = env('R2_PUBLIC_BASE')
  return bucket && base ? { bucket, base: sinBarra(base) } : null
}

/**
 * La base pública con la que este módulo compone y descompone URLs, o null sin R2
 * configurado. `storage-gc.ts` la necesita para resolver a qué key apunta cada URL
 * referenciada en la base de datos — expuesta acá en vez de releer `R2_PUBLIC_BASE`
 * en otro archivo, para que las dos lecturas no puedan desincronizarse nunca.
 */
export function basePublica(): string | null {
  return config()?.base ?? null
}

let cliente: S3Client | null = null

function getCliente(): S3Client {
  if (cliente) return cliente
  const accountId = env('R2_ACCOUNT_ID')
  const accessKeyId = env('R2_ACCESS_KEY_ID')
  const secretAccessKey = env('R2_SECRET_ACCESS_KEY')
  if (!accountId || !accessKeyId || !secretAccessKey) throw new Error(SIN_ALMACEN)
  cliente = new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
    // R2 no acepta los checksums que el SDK v3 agrega por defecto desde 3.729; sin
    // esto cada PUT vuelve con un error de firma que no menciona el checksum.
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
  })
  return cliente
}

/** Sube el archivo y devuelve su URL pública. Lanza `SIN_ALMACEN` sin configuración. */
export async function guardar(key: string, body: Blob | Buffer, contentType: string): Promise<string> {
  const conf = config()
  if (!conf) throw new Error(SIN_ALMACEN)
  // A Buffer a propósito: el SDK necesita saber el largo, y con un stream habría que
  // calcularlo aparte. Un video de 50 MB en memoria cabe de sobra en la función.
  const cuerpo = Buffer.isBuffer(body) ? body : Buffer.from(await body.arrayBuffer())
  await getCliente().send(
    new PutObjectCommand({
      Bucket: conf.bucket,
      Key: key,
      Body: cuerpo,
      ContentType: contentType,
      CacheControl: CACHE_INMUTABLE,
    }),
  )
  return urlPublica(conf.base, key)
}

/**
 * Un PUT firmado para que el teléfono suba directo a R2, sin pasar por la función.
 * `Content-Type` y `Cache-Control` viajan dentro de la firma: el cliente tiene que
 * mandarlos tal cual o R2 responde 403, y a cambio nadie puede colar otro tipo.
 */
export async function urlParaSubir(
  key: string,
  contentType: string,
): Promise<{ subir: string; publica: string }> {
  const conf = config()
  if (!conf) throw new Error(SIN_ALMACEN)
  const subir = await getSignedUrl(
    getCliente(),
    new PutObjectCommand({
      Bucket: conf.bucket,
      Key: key,
      ContentType: contentType,
      CacheControl: CACHE_INMUTABLE,
    }),
    { expiresIn: SUBIDA_SEGUNDOS },
  )
  return { subir, publica: urlPublica(conf.base, key) }
}

/**
 * Si el objeto está en el bucket. Falso ante una URL ajena o sin almacén: lo que no es
 * nuestro no puede «existir» para un post. Cualquier otro error de R2 sube, porque no
 * es lo mismo «no está» que «no pude preguntar».
 */
export async function existe(url: string): Promise<boolean> {
  const conf = config()
  if (!conf) return false
  const key = keyDesdeUrl(conf.base, url)
  if (!key) return false
  try {
    await getCliente().send(new HeadObjectCommand({ Bucket: conf.bucket, Key: key }))
    return true
  } catch (error) {
    if ((error as { name?: string }).name === 'NotFound') return false
    throw error
  }
}

/**
 * Borra por URL. Una URL que no es nuestra no es un error: se registra y se ignora,
 * porque `limpiarMedia` llama a esto sobre lo que sea que tenga guardada la fila.
 */
export async function borrar(url: string): Promise<void> {
  const conf = config()
  if (!conf) return
  const key = keyDesdeUrl(conf.base, url)
  if (!key) {
    console.warn('URL ajena al almacén, no se borra:', url.slice(0, 120))
    return
  }
  await getCliente().send(new DeleteObjectCommand({ Bucket: conf.bucket, Key: key }))
}

/** Enumera el bucket entero, paginando. Lo que el barrido necesita para decidir. */
export async function listar(): Promise<ObjetoAlmacenado[]> {
  const conf = config()
  if (!conf) throw new Error(SIN_ALMACEN)
  const s3 = getCliente()
  const objetos: ObjetoAlmacenado[] = []
  let token: string | undefined
  do {
    const pagina = await s3.send(
      new ListObjectsV2Command({ Bucket: conf.bucket, ContinuationToken: token }),
    )
    for (const o of pagina.Contents ?? []) {
      if (!o.Key) continue
      objetos.push({
        key: o.Key,
        url: urlPublica(conf.base, o.Key),
        size: o.Size ?? 0,
        // Sin fecha, se asume recién subido: en un predicado que borra, el default
        // seguro es tratar la edad desconocida como "todavía dentro de la gracia",
        // no como "viejo de sobra". R2 siempre manda LastModified, así que esto es
        // teórico.
        uploadedAt: o.LastModified ?? new Date(),
      })
    }
    token = pagina.IsTruncated ? pagina.NextContinuationToken : undefined
  } while (token)
  return objetos
}
