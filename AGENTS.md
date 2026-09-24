<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

---

# La documentación se actualiza con el cambio, no después

Este repositorio documenta en español y en prosa. Los documentos son para quien llegue
después —persona o modelo— sin nada del contexto de hoy, así que **quedarse desactualizados
es peor que no existir**: un README que dice «Neon» cuando la base es Supabase no deja a
nadie sin información, lo manda en la dirección equivocada con confianza.

**Antes de dar por terminado cualquier cambio, revisa esta lista y actualiza lo que
corresponda, en el mismo commit o en uno propio dentro de la misma rama.** No es opcional y
no espera a que alguien lo pida.

| Si tocaste… | Actualiza |
|---|---|
| una URL pública, o qué se sirve en ella | la tabla de URLs del `README.md` |
| una variable de entorno (nueva, renombrada, con otro significado) | `.env.example` **y** la tabla de variables del `README.md` |
| un proveedor externo (base de datos, almacenamiento, correo, una API social) | `README.md` en todos los sitios que lo nombren — usa `grep`, no la memoria |
| el modelo de datos, o quién es dueño de qué | la sección de aislamiento por dueño del `README.md` |
| el flujo de alta de un usuario | los pasos de puesta en marcha del `README.md` |
| el árbol de archivos, si agregaste un módulo con responsabilidad propia | el árbol del final del `README.md` |
| algo que dejaste a medias a propósito | `docs/deuda-tecnica.md`, con la fecha, el porqué y lo que costaría terminarlo |
| el despliegue, las migraciones o la reja de pull requests | la sección correspondiente del `README.md` |

Dos reglas que hacen que esto funcione:

- **Busca, no recuerdes.** Antes de decir que la documentación está al día, corre `grep` en
  `README.md` y `docs/` con el nombre de lo que cambiaste —el proveedor, la variable, la
  función—. La memoria de lo que dice un documento de 600 líneas es siempre peor que el
  comando.
- **Si un comentario o un documento describe algo que ya no es cierto, es un defecto**, del
  mismo peso que un test que pasa con el código roto. Arréglalo cuando lo veas, aunque no
  sea lo que estabas haciendo.

Lo que **no** va en la documentación: el detalle de una implementación que el código ya
cuenta, ni un registro de lo que pasó en una sesión. Los documentos explican **por qué** algo
es como es, no narran cómo se llegó.
