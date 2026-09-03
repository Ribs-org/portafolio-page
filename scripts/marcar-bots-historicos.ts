/**
 * Reclasifica como bots las visitas históricas que la detección por user-agent no
 * pudo ver.
 *
 * Hasta que la baliza del navegador reemplazó al conteo en el render, cualquier
 * petición HTTP a la página quedaba anotada como visita, y los escáneres que se
 * presentan como un Chrome normal pasaban el filtro. Este script marca lo que quedó
 * en la base con esa firma. Es una heurística conservadora, no una certeza: exige
 * las cuatro señales a la vez.
 *
 *   1. sin etiqueta `?s=`      — no llegó desde un post publicado
 *   2. sin referente           — nadie la enlazó; apareció sola
 *   3. fuera de Chile          — donde está la audiencia real
 *   4. visitante de una sola visita — nunca volvió
 *
 * Una persona real fuera de Chile que escribe la URL a mano y no vuelve queda
 * marcada por error. Es el costo aceptado: en los datos medidos, ese perfil son
 * 383 visitantes con 2% de etiquetas contra 51% de los chilenos.
 *
 * Uso:
 *   npx tsx scripts/marcar-bots-historicos.ts          (marcha en seco)
 *   npx tsx scripts/marcar-bots-historicos.ts --aplicar
 *
 * Antes de aplicar escribe los ids afectados en scripts/bots-marcados-<fecha>.json,
 * para poder revertir: UPDATE visits SET is_bot = false WHERE id IN (...).
 */
import { writeFileSync } from 'node:fs'
import { neon } from '@neondatabase/serverless'

const url = process.env.DATABASE_URL
if (!url) throw new Error('Falta DATABASE_URL (usa: dotenv -e .env.local -- npx tsx ...)')
const sql = neon(url)

const aplicar = process.argv.includes('--aplicar')

async function main() {
  const sospechosas = await sql`
    select v.id, v.country, v.created_at
    from visits v
    where v.is_bot = false
      and v.campaign is null
      and v.referrer is null
      and (v.country is null or v.country <> 'CL')
      and (select count(*) from visits o where o.visitor_hash = v.visitor_hash) = 1
  `

  const [antes] = await sql`
    select count(*)::int as humanas,
           count(*) filter (where country = 'CL')::int as chile
    from visits where is_bot = false
  `

  console.log(`visitas hoy marcadas como humanas: ${antes.humanas} (Chile: ${antes.chile})`)
  console.log(`coinciden con las cuatro señales:   ${sospechosas.length}`)
  console.log(`quedarían como humanas:             ${antes.humanas - sospechosas.length}`)

  const porPais = new Map<string, number>()
  for (const v of sospechosas) {
    const key = (v.country as string | null) ?? '??'
    porPais.set(key, (porPais.get(key) ?? 0) + 1)
  }
  console.log(
    'por país:',
    [...porPais.entries()].sort((a, b) => b[1] - a[1]).map(([c, n]) => `${c}:${n}`).join(' '),
  )

  if (!aplicar) {
    console.log('\nMarcha en seco. Repite con --aplicar para escribir.')
    return
  }

  const ids = sospechosas.map((v) => v.id as string)
  if (ids.length === 0) {
    console.log('\nNada que marcar.')
    return
  }

  const respaldo = `scripts/bots-marcados-${new Date().toISOString().slice(0, 10)}.json`
  writeFileSync(respaldo, JSON.stringify(ids, null, 2))
  console.log(`\nRespaldo de ${ids.length} ids en ${respaldo}`)

  await sql`update visits set is_bot = true where id = any(${ids}::uuid[])`
  console.log('Marcadas. Los gráficos las excluyen desde ahora.')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
