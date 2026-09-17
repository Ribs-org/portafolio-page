'use client'

import Image from 'next/image'
import { useEffect, useState } from 'react'
import { leerCreadorTikTok } from '@/app/admin/actions'
import { Field, GroupLabel, Select, Toggle } from '@/components/ui'
import { TIKTOK_CREADOR_ILEGIBLE, type CreadorTikTok } from '@/lib/social/publish/tiktok-creador'
import { ETIQUETA_PRIVACIDAD, type PrivacidadTikTok } from '@/lib/social/publish/opciones'

const MUSIC_USAGE = 'https://www.tiktok.com/legal/page/global/music-usage-confirmation/en'
const BRANDED_CONTENT = 'https://www.tiktok.com/legal/page/global/bc-policy/en'

// Cacheada a nivel de módulo: marcar y desmarcar TikTok en el compositor (soloFotos
// cambia el árbol y remonta este componente) no debe repetir la consulta a
// creator_info por cada toggle. Un error la limpia para que el siguiente montaje
// reintente en vez de quedar pegado al mismo fallo.
let creadorPromesa: ReturnType<typeof leerCreadorTikTok> | null = null

/**
 * Lo que TikTok obliga a preguntar antes de publicar directo, en el orden y con los
 * valores iniciales que su guía exige: privacidad sin elegir, interacciones apagadas,
 * comercial apagado. Cada campo lleva el nombre que `opcionesDesdeFormulario` lee.
 *
 * `soloFotos` esconde dúo y pegar: TikTok no los ofrece en carruseles.
 */
export function TikTokOpciones({ soloFotos }: { soloFotos: boolean }) {
  const [creador, setCreador] = useState<CreadorTikTok | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [borrador, setBorrador] = useState(false)
  const [privacidad, setPrivacidad] = useState<PrivacidadTikTok | ''>('')
  const [comercial, setComercial] = useState(false)
  const [tipoComercial, setTipoComercial] = useState<'marca_propia' | 'patrocinado'>('marca_propia')

  useEffect(() => {
    let vivo = true
    if (!creadorPromesa) creadorPromesa = leerCreadorTikTok()
    creadorPromesa
      .then((r) => {
        if (!vivo) return
        if ('error' in r) {
          creadorPromesa = null
          setAviso(r.error)
        } else {
          setCreador(r.creador)
        }
      })
      .catch(() => {
        creadorPromesa = null
        if (vivo) setAviso(TIKTOK_CREADOR_ILEGIBLE)
      })
    return () => {
      vivo = false
    }
  }, [])

  /*
   * Sin creator_info se ofrece solo «Solo yo», no las cuatro.
   *
   * Antes se ofrecían las cuatro confiando en que el cron volvería a consultar y fallaría
   * con frase propia. Y falla — pero quince minutos después, por correo, tras gastar los
   * tres intentos. Elegir aquí la única que TikTok acepta siempre cambia un fallo diferido
   * y silencioso por una limitación visible en el momento. Cuando la app quede aprobada,
   * creator_info responde y el selector se abre solo, sin tocar esto.
   */
  const privacidades = creador?.privacidades ?? (['SELF_ONLY'] as const)
  const patrocinado = comercial && tipoComercial === 'patrocinado'
  const patrocinadoPrivado = patrocinado && privacidad === 'SELF_ONLY'

  return (
    <div className="space-y-4 rounded-xl bg-white/[0.04] p-4">
      <div className="flex items-center gap-3">
        {creador?.avatarUrl ? (
          <Image src={creador.avatarUrl} alt="" width={32} height={32} unoptimized className="h-8 w-8 rounded-full" />
        ) : null}
        <div>
          <GroupLabel>TikTok</GroupLabel>
          <p className="text-sm">
            {creador ? `Se publicará en la cuenta ${creador.nombre}` : aviso ?? 'Leyendo tu cuenta…'}
          </p>
          {!creador && aviso ? (
            <p className="mt-1 text-[0.72rem] text-fg-faint">
              No pudimos leer tus opciones de TikTok, así que solo queda «Solo yo», la única
              que la red acepta siempre. Recarga si quieres reintentarlo.
            </p>
          ) : null}
        </div>
      </div>

      <input type="hidden" name="tiktokModo" value={borrador ? 'borrador' : 'directo'} />
      <Toggle
        label="Enviar como borrador a mi bandeja de TikTok"
        hint={borrador ? 'Te llegará una notificación en TikTok para terminar la publicación desde el teléfono.' : undefined}
        checked={borrador}
        onChange={setBorrador}
      />

      {borrador ? null : (
        <>
          <Field label="Quién puede verlo">
            <Select
              name="tiktokPrivacidad"
              required
              value={privacidad}
              onChange={(e) => setPrivacidad(e.target.value as PrivacidadTikTok | '')}
              className="max-w-[16rem]"
            >
              <option value="" disabled>
                Elige quién puede verlo
              </option>
              {privacidades.map((p) => (
                <option key={p} value={p} disabled={patrocinado && p === 'SELF_ONLY'}>
                  {ETIQUETA_PRIVACIDAD[p]}
                </option>
              ))}
            </Select>
          </Field>

          <div>
            <GroupLabel>Permitir</GroupLabel>
            <div className="flex flex-wrap gap-4 text-sm">
              <Casilla name="tiktokComentarios" label="Comentarios" bloqueada={creador?.comentariosDeshabilitados} />
              {soloFotos ? null : (
                <>
                  <Casilla name="tiktokDuo" label="Dúos" bloqueada={creador?.duoDeshabilitado} />
                  <Casilla name="tiktokPegar" label="Pegar (Stitch)" bloqueada={creador?.pegarDeshabilitado} />
                </>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Toggle
              label="Este contenido promociona una marca"
              checked={comercial}
              onChange={setComercial}
            />
            <input type="hidden" name="tiktokComercial" value={comercial ? tipoComercial : 'no'} />
            {comercial ? (
              <div className="ml-12 space-y-1 text-sm">
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="tiktokTipoComercial"
                    checked={tipoComercial === 'marca_propia'}
                    onChange={() => setTipoComercial('marca_propia')}
                  />
                  Mi marca
                  <span className="text-xs text-fg-faint">Se etiquetará como Contenido promocional</span>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="tiktokTipoComercial"
                    checked={tipoComercial === 'patrocinado'}
                    onChange={() => {
                      setTipoComercial('patrocinado')
                      // «Solo yo» y patrocinado no coexisten: se vacía para que el
                      // select required bloquee el envío en vez de solo avisar.
                      if (privacidad === 'SELF_ONLY') setPrivacidad('')
                    }}
                  />
                  Contenido patrocinado
                  <span className="text-xs text-fg-faint">Se etiquetará como Colaboración pagada</span>
                </label>
                {patrocinadoPrivado || (patrocinado && privacidad === '') ? (
                  <p className="text-xs text-negative">
                    Un contenido patrocinado no puede ser privado. Vuelve a elegir quién puede verlo.
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>

          <p className="text-[0.72rem] text-fg-faint">
            {patrocinado ? (
              <>
                Al publicar aceptas la{' '}
                <a href={BRANDED_CONTENT} target="_blank" rel="noreferrer" className="underline">
                  Branded Content Policy
                </a>{' '}
                y la{' '}
                <a href={MUSIC_USAGE} target="_blank" rel="noreferrer" className="underline">
                  Music Usage Confirmation
                </a>{' '}
                de TikTok.
              </>
            ) : (
              <>
                Al publicar aceptas la{' '}
                <a href={MUSIC_USAGE} target="_blank" rel="noreferrer" className="underline">
                  Music Usage Confirmation
                </a>{' '}
                de TikTok.
              </>
            )}{' '}
            Después de publicar, TikTok puede tardar unos minutos en mostrarlo en tu perfil.
          </p>
        </>
      )}
    </div>
  )
}

/** Apagada al nacer; gris y sin enviar si creator_info dice que la cuenta la tiene bloqueada. */
function Casilla({ name, label, bloqueada }: { name: string; label: string; bloqueada?: boolean }) {
  return (
    <label className={bloqueada ? 'flex items-center gap-2 opacity-40' : 'flex items-center gap-2'}>
      <input type="checkbox" name={name} disabled={bloqueada} />
      {label}
    </label>
  )
}
