import { randomBytes } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Turns .env.example into a working .env.local, inventing the two secrets that
 * only need to be random.
 *
 * Written from Node rather than piped through the shell on purpose: on Windows,
 * `"value" | vercel env add` and `echo value > .env.local` both prepend a UTF-8
 * BOM, which silently corrupts a signing key — see src/lib/env.ts.
 */

const ROOT = process.cwd()
const TEMPLATE = join(ROOT, '.env.example')
const TARGET = join(ROOT, '.env.local')

/** Filled in automatically. Everything else has to come from a human or an integration. */
const GENERATED = ['AUTH_SECRET', 'FINGERPRINT_SALT'] as const

/** Required for the app to boot. SITE_TIMEZONE and BLOB_READ_WRITE_TOKEN degrade gracefully. */
const REQUIRED = ['DATABASE_URL', 'ADMIN_PASSWORD', 'AUTH_SECRET', 'FINGERPRINT_SALT'] as const

const secret = () => randomBytes(32).toString('base64url')

/** Names of the variables that carry a non-empty value in an env file. */
function filled(contents: string): Set<string> {
  const names = new Set<string>()
  for (const line of contents.split(/\r?\n/)) {
    const match = /^\s*([A-Z_][A-Z0-9_]*)\s*=(.*)$/.exec(line)
    if (match && match[2].trim() !== '') names.add(match[1])
  }
  return names
}

function create() {
  const template = readFileSync(TEMPLATE, 'utf8')

  const contents = template.replace(
    /^(AUTH_SECRET|FINGERPRINT_SALT)=$/gm,
    (_, name: string) => `${name}=${secret()}`,
  )

  writeFileSync(TARGET, contents, 'utf8')

  console.log('.env.local creado.\n')
  console.log(`  ${GENERATED.join(' y ')} ya vienen generadas.\n`)
  console.log('Te falta llenar a mano:')
  console.log('  DATABASE_URL          → la copias de Neon, o `vercel env pull .env.local`')
  console.log('  ADMIN_PASSWORD        → la eliges tú, es la puerta a /admin')
  console.log('  BLOB_READ_WRITE_TOKEN → opcional, solo para subir imágenes\n')
  console.log('Después:')
  console.log('  npm run db:setup      → crea las tablas y siembra los perfiles')
  console.log('  npm run dev           → http://localhost:3000')
}

function inspect() {
  const present = filled(readFileSync(TARGET, 'utf8'))
  const missing = REQUIRED.filter((name) => !present.has(name))

  console.log('Ya existe un .env.local, así que no lo toqué.\n')

  if (missing.length === 0) {
    console.log('Están todas las variables necesarias. Puedes seguir con:')
    console.log('  npm run db:setup')
    console.log('  npm run dev')
    return
  }

  console.log(`Le faltan ${missing.length} variable(s): ${missing.join(', ')}\n`)

  const generable = missing.filter((name) => (GENERATED as readonly string[]).includes(name))
  if (generable.length > 0) {
    console.log('Copia estas líneas dentro del archivo:\n')
    for (const name of generable) console.log(`${name}=${secret()}`)
    console.log('')
  }

  const manual = missing.filter((name) => !(GENERATED as readonly string[]).includes(name))
  if (manual.length > 0) {
    console.log(`Y consigue tú mismo: ${manual.join(', ')}`)
  }
}

function main() {
  if (!existsSync(TEMPLATE)) {
    throw new Error('Falta .env.example. ¿Estás corriendo esto desde la raíz del proyecto?')
  }

  if (existsSync(TARGET)) inspect()
  else create()
}

try {
  main()
} catch (error) {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
}
