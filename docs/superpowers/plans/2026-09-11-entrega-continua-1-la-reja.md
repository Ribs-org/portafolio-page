# Entrega continua, entrega 1: la reja — plan de implementación

> **Para quien ejecute esto:** SUB-SKILL OBLIGATORIA: usa superpowers:subagent-driven-development
> (recomendada) o superpowers:executing-plans para implementar tarea por tarea. Los pasos
> usan casillas (`- [ ]`) para marcar avance.

**Meta:** que ningún pull request pueda fusionarse a `main` sin que los tests, el typecheck,
el lint y el build hayan pasado, de modo que Vercel nunca despliegue código que nadie miró.

**Arquitectura:** un flujo de trabajo de GitHub Actions con dos trabajos en paralelo, uno
para el sitio y otro para la app. `main` protegida con los dos como comprobaciones
obligatorias. La versión de Node deja de ser implícita y se fija en un archivo que el flujo
de trabajo lee.

**Tech Stack:** GitHub Actions, Node 24, npm, Vitest, TypeScript, ESLint, Next.js.

**Spec:** `docs/superpowers/specs/2026-09-11-entrega-continua-design.md` (sección 1 y la fila
«1 · La reja» de la tabla de entregas).

## Restricciones globales

- **Ningún secreto en el flujo de trabajo.** Ya está verificado que `npx next build` pasa sin
  credenciales: la conexión a la base se crea perezosamente y `env()` devuelve `undefined` en
  vez de lanzar. Si algún paso necesitara un valor, se le da uno falso, nunca uno real.
- El flujo de trabajo corre en cada pull request contra `main`, y sus dos trabajos corren
  siempre, sin filtros por ruta. Ver «Ruling sobre los filtros por ruta».
- Comentarios solo para restricciones que el código no puede mostrar. Los archivos de
  GitHub Actions se comentan poco: el YAML dice lo que hace.
- El README se escribe en español, segunda persona, frases cortas, el tono del resto.
- Commits en español, en presente, terminando con:
  `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>` y
  `Claude-Session: https://claude.ai/code/session_016vd6a3VaPhM2LUSJ3Jp1LE`
- Disciplina git: HEAD verificado antes de empezar, jamás checkout/reset/rebase/stash,
  `git add` por archivo.
- **La protección de `main` no la aplica el implementador.** Es configuración del
  repositorio y la aplica el controlador. La tarea 2 solo la documenta.

## Ruling sobre los filtros por ruta

El spec dice que el trabajo de la app «corre solo cuando el pull request toca `mobile/`». **Se
implementa sin ese filtro**, y el spec se corrige en la tarea 2.

La razón es una trampa conocida de GitHub: si una comprobación obligatoria no llega a correr
porque el filtro de rutas no calzó, el pull request queda esperándola para siempre y no se
puede fusionar. Las salidas son hacer la comprobación no obligatoria, que la deja sin
dientes, o agregar un trabajo falso que reporte éxito cuando se salta, que es más máquina que
el problema. Como el repositorio es público y los minutos son gratis, correr siempre los dos
trabajos cuesta un minuto de cómputo regalado en un pull request de solo documentación, y
elimina la trampa entera.

---

## Estructura de archivos

| Archivo | Responsabilidad |
|---|---|
| `.nvmrc` | la versión de Node, en un solo lugar, que el flujo de trabajo lee |
| `mobile/package.json` | gana el script `typecheck`, que hoy no existe |
| `.github/workflows/ci.yml` | la reja: dos trabajos en paralelo |
| `README.md` | qué corre la reja y cómo queda configurada la protección de `main` |

---

### Task 1: La reja

**Archivos:**
- Crear: `.nvmrc`
- Modificar: `mobile/package.json`
- Crear: `.github/workflows/ci.yml`

**Interfaces:**
- Produce: los nombres de los dos trabajos, `sitio` y `app`. La tarea 2 los nombra en el
  README y el controlador los usa como comprobaciones obligatorias, así que **no los
  renombres**.

- [x] **Paso 1: La versión de Node**

Crea `.nvmrc` en la raíz con una sola línea:

```
24
```

Es la versión que usan hoy la máquina local (`v24.15.0`) y Vercel. Un solo dígito: `.nvmrc`
acepta la versión mayor y así no hay que tocarlo en cada parche.

- [x] **Paso 2: El script de typecheck de la app**

`mobile/package.json` tiene hoy `start`, `reset-project`, `android`, `ios`, `web` y `lint`.
No tiene `typecheck`, y el del sitio se llama así. Agrégalo con el mismo cuerpo que usa la
raíz:

```json
    "typecheck": "tsc --noEmit"
```

- [x] **Paso 3: Correrlo y ver qué sale**

Corre: `npm --prefix mobile run typecheck`

Nadie había comprobado nunca los tipos de la app. **El controlador ya lo corrió y sale
limpio**, así que lo esperado es que pase. La instrucción de abajo queda por si el árbol
cambió entre medio.

- Si pasa limpio, sigue al paso 4.
- Si falla, **no arregles el código de la app por tu cuenta**. Reporta `BLOCKED` con la lista
  completa de errores que salieron. El controlador decide si se arreglan acá, si se arreglan
  en una tarea aparte, o si la reja entra primero solo con el lint de la app. Arreglar tipos
  ajenos sin que nadie los haya mirado es exactamente donde un cambio «obvio» rompe algo.

- [x] **Paso 4: El flujo de trabajo**

Crea `.github/workflows/ci.yml`:

```yaml
name: CI

on:
  pull_request:
    branches: [main]

# Un empujón nuevo al mismo pull request cancela la corrida anterior: la respuesta que
# importa es la del último commit.
concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true

jobs:
  sitio:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version-file: .nvmrc
          cache: npm
      - run: npm ci
      - run: npm test
      - run: npm run typecheck
      - run: npm run lint
      # Sin credenciales a propósito: el build tiene que pasar sin base ni secretos, y ya
      # está verificado que pasa.
      - run: npx next build

  app:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version-file: .nvmrc
          cache: npm
          cache-dependency-path: mobile/package-lock.json
      - run: npm ci
        working-directory: mobile
      - run: npm run typecheck
        working-directory: mobile
      - run: npm run lint
        working-directory: mobile
```

Los dos trabajos no declaran `needs`, así que corren en paralelo.

- [x] **Paso 5: Verificar la sintaxis**

El YAML no se ejecuta en tu máquina, pero sí se puede comprobar que es válido:

Corre: `node -e "require('fs').readFileSync('.github/workflows/ci.yml','utf8')" && npx --yes js-yaml .github/workflows/ci.yml > /dev/null && echo "YAML válido"`

Esperado: imprime `YAML válido`. Si `js-yaml` no está disponible sin red, basta con revisar
la indentación a ojo y decirlo en el reporte.

Corre también los cuatro comandos del trabajo `sitio` localmente, para confirmar que el
flujo de trabajo no pide nada que no exista: `npm test`, `npm run typecheck`, `npm run lint`
y `npx next build`.

- [x] **Paso 6: Commit**

```bash
git add .nvmrc mobile/package.json .github/workflows/ci.yml
git commit
```

Mensaje: `Corre los tests y el build en cada pull request`

---

### Task 2: El instructivo

**Archivos:**
- Modificar: `README.md`
- Modificar: `docs/superpowers/specs/2026-09-11-entrega-continua-design.md`
- Modificar: este plan (marcar las casillas)

- [x] **Paso 1: El README**

Busca dónde el README habla de cómo se trabaja en el repositorio. Si no hay una sección
natural, crea `## Cómo entra un cambio` antes de la primera sección de despliegue. Agrega:

```markdown
Cada pull request contra `main` dispara la reja: dos trabajos en paralelo que tienen que
quedar verdes antes de poder fusionar.

- **sitio** corre los tests, el typecheck, el lint y el build de producción. Corre sin
  ninguna credencial, a propósito: si el build empieza a necesitar un secreto para compilar,
  queremos enterarnos acá y no en Vercel.
- **app** comprueba los tipos y el lint del proyecto de `mobile/`.

`main` está protegida. No se puede empujar directo: todo entra por pull request, los dos
trabajos son obligatorios, y la rama tiene que estar al día con `main` antes de fusionar,
para que la reja haya corrido sobre el código que de verdad va a quedar.

Por eso Vercel no espera a nadie. Lo que llega a `main` ya pasó por la reja.

Si alguna vez hay que reconfigurar esto, la protección vive en **Settings → Branches →
Branch protection rules** del repositorio, sobre `main`, con estas casillas: exigir pull
request antes de fusionar, exigir que las comprobaciones `sitio` y `app` pasen, y exigir que
la rama esté al día.
```

- [x] **Paso 2: Corregir el spec**

En `docs/superpowers/specs/2026-09-11-entrega-continua-design.md`, la sección 1 dice que el
trabajo de la app «corre solo cuando el pull request toca `mobile/`». Eso ya no es lo que se
implementó. Reemplaza esa frase para que diga que corre siempre, y agrega en una línea la
razón: una comprobación obligatoria que no llega a correr por un filtro de rutas deja el pull
request esperándola para siempre, y el repositorio es público, así que los minutos son
gratis.

- [x] **Paso 3: Las casillas**

Marca `[x]` los pasos de este plan que quedaron hechos.

- [x] **Paso 4: Verificar y commit**

Corre `npm run lint`. Lee la sección nueva del README de corrido junto a sus vecinas.

```bash
git add README.md docs/superpowers/specs/2026-09-11-entrega-continua-design.md docs/superpowers/plans/2026-09-11-entrega-continua-1-la-reja.md
git commit
```

Mensaje: `Explica qué revisa la reja y cómo queda protegida main`

---

## Lo que hace el controlador, no el implementador

Después de fusionar, el controlador aplica la protección de `main` en la configuración del
repositorio, con los dos trabajos como comprobaciones obligatorias, y comprueba que funciona
abriendo un pull request de prueba que falle a propósito. Una reja que no se probó bloqueando
es decoración.

## Lo que esta entrega no hace

- **No actualiza la app por aire.** Eso es la entrega 2 y necesita tu token de Expo.
- **No toca la Play Store.** Eso es la entrega 3.
- **No cambia cómo despliega Vercel.** Sigue desplegando cada fusión a `main`; la diferencia
  es que ahora a `main` solo llega lo que pasó por la reja.
