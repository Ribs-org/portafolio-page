# Terceros — entrega C: avisos antes de conectar

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** que Los Fierros diga, junto al botón de cada red, lo que esa red exige o limita hoy, antes de que el usuario se tope con el error.

**Architecture:** un mapa de frases por red en `src/lib/networks.ts` (donde vive `networkLabel`), puro y con test letra por letra; `cuentas.tsx` lo pinta bajo el título de cada bloque. Una segunda frase para Instagram y Facebook se enciende con `META_EN_REVISION=1` mientras la app de Meta siga en modo desarrollo, y se apaga quitando la variable al pasar a Live.

**Tech Stack:** Next.js (App Router), Vitest.

**Spec:** `docs/superpowers/specs/2026-09-30-terceros-codigo-design.md`, §4. Ante conflicto, manda la spec.

## Restricciones globales

- **Las frases son literales** (tabla de la spec §4) y cada una tiene test letra por letra; las frases de error existentes no se tocan.
- **Las rutas no cambian.** Ninguna consulta nueva a la base.
- **Comentarios en español; código en inglés y en llano**, con el estilo del archivo.
- **Un commit** con el pie de autoría del repositorio; documentación con la tarea (`.env.example`, tabla de variables del README, sección de Meta del README).
- **La suite pasa, typecheck, lint y build limpios.**

---

### Tarea 1: Las frases y su sitio en Los Fierros

**Files:**
- Modify: `src/lib/networks.ts`, `src/lib/networks.test.ts` (créalo si no existe)
- Modify: `src/app/admin/(dash)/accounts/page.tsx` (lee la variable en el servidor y la pasa) y `src/app/admin/(dash)/accounts/cuentas.tsx`
- Modify: `.env.example`, `README.md`

**Interfaces:**
- Produces: `AVISO_ANTES_DE_CONECTAR: Partial<Record<SocialNetwork, string>>`; `AVISO_META_EN_REVISION: string`; `avisosDe(network, metaEnRevision: boolean): string[]`.

- [ ] **Step 1: El test que falla**

```ts
import { describe, expect, it } from 'vitest'
import { AVISO_META_EN_REVISION, avisosDe } from './networks'

describe('avisosDe', () => {
  it('cada red dice lo que exige, letra por letra', () => {
    expect(avisosDe('instagram', false)).toEqual([
      'Cuenta Business o Creator, enlazada a una página de Facebook. Una cuenta personal no puede conectar.',
    ])
    expect(avisosDe('facebook', false)).toEqual(['Una página, no un perfil personal.'])
    expect(avisosDe('youtube', false)).toEqual(['Hasta que Google apruebe la cuota de la app, lo que publiques sale privado.'])
    expect(avisosDe('tiktok', false)).toEqual(['Hasta que TikTok apruebe la publicación directa, lo que publiques sale como “Solo yo”.'])
  })
  it('mientras Meta revisa la app, Instagram y Facebook llevan la segunda línea; las demás no', () => {
    expect(AVISO_META_EN_REVISION).toBe(
      'Mientras Meta revisa la app, solo pueden conectar las cuentas que invitamos como testers. Si Facebook dice que la función no está disponible, escríbenos.',
    )
    expect(avisosDe('instagram', true)).toHaveLength(2)
    expect(avisosDe('instagram', true)[1]).toBe(AVISO_META_EN_REVISION)
    expect(avisosDe('facebook', true)).toHaveLength(2)
    expect(avisosDe('tiktok', true)).toHaveLength(1)
    expect(avisosDe('youtube', true)).toHaveLength(1)
  })
})
```

Si `SOCIAL_NETWORKS` incluye redes sin aviso (mira la lista en `networks.ts`), `avisosDe` devuelve `[]` para ellas y el test lo afirma para una.

- [ ] **Step 2: Correr y verlo fallar**

- [ ] **Step 3: Las frases y la pantalla**

En `networks.ts`:

```ts
/**
 * Lo que cada red exige o limita hoy, dicho junto al botón de conectar y no después del
 * error. Frases fijas: cada una tiene test letra por letra. La de Meta en revisión va
 * aparte porque se apaga sola al quitar `META_EN_REVISION` cuando la app pase a Live.
 */
export const AVISO_ANTES_DE_CONECTAR: Partial<Record<SocialNetwork, string>> = {
  instagram: 'Cuenta Business o Creator, enlazada a una página de Facebook. Una cuenta personal no puede conectar.',
  facebook: 'Una página, no un perfil personal.',
  youtube: 'Hasta que Google apruebe la cuota de la app, lo que publiques sale privado.',
  tiktok: 'Hasta que TikTok apruebe la publicación directa, lo que publiques sale como “Solo yo”.',
}
export const AVISO_META_EN_REVISION =
  'Mientras Meta revisa la app, solo pueden conectar las cuentas que invitamos como testers. Si Facebook dice que la función no está disponible, escríbenos.'

export function avisosDe(network: SocialNetwork, metaEnRevision: boolean): string[] {
  const avisos: string[] = []
  const fijo = AVISO_ANTES_DE_CONECTAR[network]
  if (fijo) avisos.push(fijo)
  if (metaEnRevision && (network === 'instagram' || network === 'facebook')) avisos.push(AVISO_META_EN_REVISION)
  return avisos
}
```

`accounts/page.tsx` lee `env('META_EN_REVISION') === '1'` (con `env` de `@/lib/env`) y se lo pasa a `<Cuentas metaEnRevision />`. En `cuentas.tsx`, bajo el `<div className="mb-2 flex items-center gap-3">` del título de cada red, antes de las tarjetas:

```tsx
{avisosDe(network, metaEnRevision).map((aviso) => (
  <p key={aviso} className="mb-2 text-[0.78rem] text-fg-faint">{aviso}</p>
))}
```

- [ ] **Step 4: Verificar y commitear**

Run: `npx vitest run`, `npm run typecheck`, `npm run lint`, `npm run build`. A mano (`next dev -p 3001`): con y sin `META_EN_REVISION=1` en `.env.local`. Documentación:
- `.env.example`: `META_EN_REVISION=` con un comentario de dos líneas (qué muestra, y que se quita al pasar la app de Meta a Live).
- README, tabla de variables: la fila nueva, «No — solo mientras la app de Meta esté en modo desarrollo».
- README, sección de Meta (`grep -n "modo desarrollo" README.md`): una frase — mientras la app esté en modo desarrollo, solo conectan cuentas con rol en la app (testers), y `META_EN_REVISION=1` lo dice en Los Fierros.

```bash
git add src/lib/networks.ts src/lib/networks.test.ts "src/app/admin/(dash)/accounts" .env.example README.md
git commit -m "Los Fierros dicen lo que cada red exige antes de conectar"
```

---

## Lo que ningún test comprueba

Que las frases sean ciertas el día que se lean: la de YouTube y la de TikTok caducan al pasar sus auditorías, y hay que quitarlas ese día (queda dicho en el comentario del mapa).
