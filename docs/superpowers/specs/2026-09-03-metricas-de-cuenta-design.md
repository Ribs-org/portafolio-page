# Métricas de cuenta — seguidores, visitas al perfil y alcance

Fecha: 2026-09-03
Estado: aprobado, pendiente de plan de implementación

Se apoya en los conectores de lectura y en la sincronización diaria que ya llena
`social_posts` / `post_metrics`. Esto agrega la otra mitad del cuadro: cómo va la
cuenta, no cada publicación.

## Problema

El dueño quiere saber cuánta gente llega a su perfil y cuántos lo empiezan a seguir
— lo que Instagram le muestra en la app. Ese dato no existe en el panel, y a nivel
de publicación **no existe en ninguna API**: probado contra la cuenta real,
Instagram responde «The Media Insights API does not support the follows metric for
this media» para `follows`, `profile_visits`, `profile_activity` y `navigation`,
con y sin `metric_type=total_value`.

Lo que sí existe es el nivel de cuenta, y ahí hay bastante.

## Objetivo

Una tabla de métricas diarias por cuenta que la sincronización nocturna llena, y una
sección «Tus cuentas» en Analytics que muestre seguidores por red con su variación,
más las curvas de visitas al perfil y alcance.

## Lo que cada red entrega (verificado contra las cuentas reales, 2026-09-03)

| Red | Métrica | Endpoint | Naturaleza |
|---|---|---|---|
| Instagram | visitas al perfil (122) | `/{ig-id}/insights?metric=profile_views&metric_type=total_value&period=day` | valor del día |
| Instagram | alcance (3.206) | `/{ig-id}/insights?metric=reach&period=day` | valor del día |
| Instagram | views (6.845), cuentas que interactuaron (88) | `metric=views,accounts_engaged&metric_type=total_value&period=day` | valor del día |
| Instagram | seguidores | `/{ig-id}?fields=followers_count` | acumulado |
| Facebook | seguidores (1) | `/{page-id}?fields=followers_count,fan_count` | acumulado |
| YouTube | suscriptores, views totales, nº de videos | `channels.list?part=statistics` | acumulado |

**Las page insights de Facebook están muertas para esta página**: `page_fans`,
`page_impressions_unique`, `page_fan_adds` responden «The value must be a valid
insights metric», y `page_views_total`, `page_post_engagements`,
`page_daily_follows_unique` vuelven vacías. Facebook aporta solo seguidores.

**YouTube diario oficial descartado**: `subscribersGained` por día vive en la
YouTube Analytics API, que exige el scope `yt-analytics.readonly` y reconectar la
cuenta. El crecimiento se deriva por diferencia entre lecturas acumuladas, que para
la pregunta «cuántos seguidores gané» responde igual sin pedirle nada al dueño.

## No objetivos

- **Atribuir seguidores a un post.** No existe en ninguna API a ese nivel; fingirlo
  con una correlación temporal sería inventar.
- **Reconectar YouTube por el scope de Analytics.** Decisión del dueño: el
  crecimiento por diferencia basta.
- **Rellenar el histórico.** Ninguna de estas APIs entrega el pasado con
  granularidad diaria fiable; la serie empieza el día que se despliega esto.
- **TikTok y las redes sin conector de lectura.** Entran cuando entren.

## Decisiones tomadas

| Decisión | Alternativa descartada | Razón |
|---|---|---|
| Una tabla `account_metrics` con la unión de campos, todos nullable | Una tabla por red | Las redes comparten la mitad de las métricas y la UI las compara lado a lado; un `null` ya significa «esta red no lo da», que es la misma disciplina del resto |
| Separar contadores acumulados de valores del día | Guardar todo como «valor» | Mezclarlos haría que un total de seguidores se sume como si fuera tráfico; el crecimiento acumulado se deriva por diferencia y el diario se lee tal cual |
| Crecimiento por `periodChange` (el mismo de los posts) | Cálculo propio | Ya sabe distinguir «creció esto» de «no lo puedo saber», la corrección que se hizo hoy mismo |
| Un paso por red dentro de la sincronización diaria existente | Un cron nuevo | Es el mismo momento y la misma cadencia; un cron aparte solo agrega una cosa que se puede caer sola |
| Fallar suave: si una red no responde, su fila del día queda sin esa métrica | Abortar la sincronización | Las métricas de cuenta son un extra; nunca deben tumbar la sincronización de publicaciones que sí funciona |

## La tabla

`account_metrics`, una fila por (red, día):

```
network        text      not null
day            date      not null
-- contadores acumulados (crecimiento por diferencia)
followers      integer   -- IG, FB, YT (suscriptores)
totalViews     integer   -- YT
videoCount     integer   -- YT
-- valores del día, tal como los entrega la red
profileViews   integer   -- IG
reach          integer   -- IG
views          integer   -- IG
accountsEngaged integer  -- IG
capturedAt     timestamptz not null default now()
unique (network, day)
```

Idéntico molde a `post_metrics`: la unicidad por (red, día) hace que re-sincronizar
el mismo día actualice en vez de duplicar.

## El contrato del conector

`Connector` gana un método opcional:

```ts
fetchAccountMetrics?(account: SocialAccount, token: string): Promise<AccountMetricValues>
```

con `AccountMetricValues = { followers, totalViews, videoCount, profileViews, reach,
views, accountsEngaged }`, todos `number | null`. Una red sin el método simplemente
no aporta fila. Instagram, Facebook y YouTube lo implementan; TikTok no.

La sincronización, después de guardar las publicaciones de una red, llama el método
dentro de su propio `try/catch`: un fallo se registra en el log y sigue.

## El panel

Analytics gana la sección **«Tus cuentas»**:

- Una tarjeta por red conectada: seguidores actuales y su variación en el período
  (`periodChange` sobre las lecturas acumuladas; `—` cuando no se puede saber).
- Un gráfico de **visitas al perfil** y **alcance** por día (solo Instagram hoy; la
  serie se dibuja con las redes que tengan dato).
- Lo que una red no entrega se muestra `—`, nunca cero.

## Manejo de errores

Frases fijas no aplican: nada de esto es interactivo. Los fallos van a
`console.error` truncado y la fila del día queda incompleta, que es la lectura
honesta.

## Testing

Puro con Vitest:

- Normalización de cada red: payload de la API → `AccountMetricValues` (incluidos
  los casos «métrica ausente» y «respuesta de error»), con fixtures capturados de
  las respuestas reales.
- El armado de las tarjetas: lecturas acumuladas + rango → seguidores y variación,
  reusando `periodChange`.

HTTP y DB sin test, como todo el repo.

## Variables de entorno nuevas

Ninguna.
