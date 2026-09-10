# Mapa: supuesto «una cuenta por red» en portafolio-page

Fecha: 2026-09-10. Levantado por exploración del código antes de diseñar multicuentas.

## 1. Esquema (`src/db/schema.ts`)

| Ubicación | Qué asume una cuenta por red | Qué necesitaría multicuenta |
|---|---|---|
| `socialAccounts.network` (:142) | `unique()` literal: una fila por red | Quitar el unique; el `id` uuid pasa a ser la referencia real |
| `socialPosts` unique `(network, externalId)` (:164-185) | La identidad del post es red + id externo | `accountId` FK y unique `(accountId, externalId)` |
| `socialPosts.campaign` unique global (:175) | El tag `ig-…`/`fb-…` se arma por red | El prefijo debe distinguir cuentas o la atribución `?s=` se vuelve ambigua |
| `accountMetrics` unique `(network, day)` (:223-244) | Una lectura de seguidores por red y día | `accountId` y unique `(accountId, day)` |
| `scheduledPostTargets` unique `(postId, network)` (:274-300) | No se puede programar el mismo post a dos páginas | `accountId` y unique `(postId, accountId)` |
| `visits.referrerNetwork` (:84) | Etiqueta de origen del tráfico, no FK | Sin cambio |
| `SOCIAL_NETWORKS` (:133) | Enum de redes usado como llave de iteración de cuentas | Sigue como enum de tipo; deja de ser llave de cuentas |

## 2. OAuth

| Ubicación | Hoy | Multicuenta |
|---|---|---|
| `connect/route.ts` | `/api/social/[network]/connect`, sin id de cuenta | Un parámetro «agregar otra» |
| `callback/route.ts:436-468` | upsert `onConflictDoUpdate({ target: network })`: la segunda cuenta pisa a la primera | Upsert por `(network, externalId)` |
| `mayConnectAccount` (`connector.ts:86-92`) | Bloquea conectar otra cuenta de la misma red | Pasa a decidir «nueva» vs «reconectar la misma» |
| `pickInstagramAccount` / `pickFacebookPage` | Varias candidatas → una sola vía env var | Página de selección; guardar todas las elegidas |
| YouTube discovery (:162-221) | Toma `items[0]` | Listar canales y elegir |
| TikTok | Una cuenta por autorización (inherente) | Varias autorizaciones = varias filas |
| `sync.ts:19-30` `ensureYouTubeAccount` | YouTube nace por env vars | Filas explícitas |

## 3. Sincronización

| Ubicación | Hoy | Multicuenta |
|---|---|---|
| `sync.ts:114-123` `syncNetwork(network)` | `[account]` = primera fila de la red | `syncAccount(accountId)` |
| `sync.ts:202-224` `syncAll` | Itera conectores (uno por red) | Itera cuentas |
| `sync.ts:57-102` upsert de posts | conflict `(network, externalId)` | `(accountId, externalId)` |
| `sync.ts:163-177` archivado | Compara todos los posts de la red contra lo que trajo una cuenta | **Filtrar por cuenta o la cuenta A archiva el catálogo de la B** |
| `campaign.ts:33-36` `campaignTagFor(network, externalId)` | Prefijo por red | Discriminador de cuenta |
| `connector.ts` tipo `Connector` | `fetchPosts(account, token)` ya recibe la cuenta entera | Los conectores no cambian; cambia el orquestador |

## 4. Publicación

| Ubicación | Hoy | Multicuenta |
|---|---|---|
| `publish/run.ts:142-147` | Token por red, primera fila | Token por `target.accountId` |
| `publish/publisher.ts` | Recibe `accountExternalId` y token ya resueltos | Sin cambio de forma |
| `publish/batch.ts:25-34` `BatchItem.redes: string[]` | Contrato público por nombre de red | Aceptar cuenta; mantener `redes` compatible |
| `publish/batch.ts:311` | Un target por red | Un target por cuenta |
| `publish/validate.ts` | Reglas por tipo de red | Sin cambio |
| `publish/edit.ts` `diffTargets` | Máximo un target por red | Comparar por cuenta |
| `schedule/composer.tsx:36-50` | Una casilla por red | Una por cuenta, agrupadas por red |

## 5. Panel

| Ubicación | Hoy | Multicuenta |
|---|---|---|
| `content/connections.tsx:44-106` | Una tarjeta por red | N tarjetas por red + «Agregar cuenta» |
| `posts.ts:284-310` `getConnections` | Map por red, descarta filas extra | Devolver todas |
| `content/page.tsx` chips de red | Filtro por red | Filtro por cuenta cuando hay más de una |
| `content/post-table.tsx` | Solo muestra la red | Mostrar el handle |
| `analytics/accounts.tsx`, `analytics/page.tsx` | Tarjeta y series por red | Por cuenta, red como subetiqueta |
| `actions.ts:351` `disconnectNetwork(network)` | Por red | `disconnectAccount(accountId)` |

## 6. API de métricas

| Ubicación | Hoy | Multicuenta |
|---|---|---|
| `api/metrics/posts` `?red=` | Filtro por red | `?cuenta=` adicional; `cuenta` en cada post |
| `metrics-api.ts` `MetricPost.red` | Solo red | Agregar `cuenta` |
| `posts.ts` `getPostRows` | Sin noción de cuenta | Join/filtro opcional |
| `account-stats.ts` `buildAccountCards` | Agrupa por red | Por cuenta |

## 7. App móvil

| Ubicación | Hoy | Multicuenta |
|---|---|---|
| `api/mobile/accounts`, `overview` (`ultimoPorRed`) | Map por red: la segunda cuenta pisa a la primera | Sumar por cuenta |
| `mobile/src/lib/tipos.ts` | `red` como identificador | Campo `cuenta` |
| `cuentas.tsx`, `publicar.tsx` | Tarjeta y toggles por red | Por cuenta, agrupadas por red |

## 8. Docs

`api-editor.md` (redes como destino), `README.md:127-186` (una variable por red, `INSTAGRAM_IG_USER_ID`, `FACEBOOK_PAGE_ID`, «no olvida qué cuenta era»).

## Riesgos

1. **Archivado cruzado**: sincronizar la cuenta A archivaría los posts de la cuenta B de la misma red.
2. **Migración de cuatro uniques** y backfill de `accountId` (hoy solo existe el nombre de red como referencia; con una cuenta por red el backfill es trivial).
3. **Tag de campaña**: el prefijo por red deja de identificar la cuenta; el tag es la única llave entre posts y tráfico.
4. **OAuth diseñado para impedir una segunda cuenta**: el guard existe porque conectar otra cuenta archivaba el catálogo entero.
5. **Contratos públicos** (`redes`, `red`, `?red=`) consumidos por el editor-LLM y la app: hay que agregar, no reemplazar.
