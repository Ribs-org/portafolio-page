'use client'

import Image from 'next/image'
import { useEffect, useState } from 'react'
import { leerCreadorTikTok } from '@/app/admin/actions'
import { Field, GroupLabel, Select, Toggle } from '@/components/ui'
import type { CuentaDestino } from '@/lib/social/cuentas'
import { TIKTOK_CREADOR_ILEGIBLE, type CreadorTikTok } from '@/lib/social/publish/tiktok-creador'
import { ETIQUETA_PRIVACIDAD, PRIVACIDADES_TIKTOK, type PrivacidadTikTok } from '@/lib/social/publish/opciones'

const MUSIC_USAGE = 'https://www.tiktok.com/legal/page/global/music-usage-confirmation/en'
const BRANDED_CONTENT = 'https://www.tiktok.com/legal/page/global/bc-policy/en'

// Cacheada a nivel de módulo, por cuenta: marcar y desmarcar una cuenta de TikTok en el
// compositor (soloFotos cambia el árbol y remonta este componente) no debe repetir la
// consulta a creator_info por cada toggle. Con dos cuentas de TikTok marcadas, cada una
// tiene su propia promesa — comparten módulo pero no cuenta. Un error limpia la suya
// para que el siguiente montaje reintente en vez de quedar pegado al mismo fallo.
const creadorPromesas = new Map<string, ReturnType<typeof leerCreadorTikTok>>()

/**
 * Lo que TikTok obliga a preguntar antes de publicar directo, en el orden y con los
 * valores iniciales que su guía exige: privacidad sin elegir, interacciones apagadas,
 * comercial apagado. Cada campo lleva el nombre que `opcionesDesdeFormularioPorCuenta`
 * lee, con el identificador de la cuenta como sufijo — puede haber dos bloques en el
 * mismo formulario.
 *
 * `soloFotos` esconde dúo y pegar: TikTok no los ofrece en carruseles.
 */
export function TikTokOpciones({ cuenta, soloFotos }: { cuenta: CuentaDestino; soloFotos: boolean }) {
  const [creador, setCreador] = useState<CreadorTikTok | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [borrador, setBorrador] = useState(false)
  const [privacidad, setPrivacidad] = useState<PrivacidadTikTok | ''>('')
  const [comercial, setComercial] = useState(false)
  const [tipoComercial, setTipoComercial] = useState<'marca_propia' | 'patrocinado'>('marca_propia')

  useEffect(() => {
    let vivo = true
    let promesa = creadorPromesas.get(cuenta.id)
    if (!promesa) {
      promesa = leerCreadorTikTok(cuenta.id)
      creadorPromesas.set(cuenta.id, promesa)
    }
    promesa
      .then((r) => {
        if (!vivo) return
        if ('error' in r) {
          creadorPromesas.delete(cuenta.id)
          setAviso(r.error)
        } else {
          setCreador(r.creador)
        }
      })
      .catch(() => {
        creadorPromesas.delete(cuenta.id)
        if (vivo) setAviso(TIKTOK_CREADOR_ILEGIBLE)
      })
    return () => {
      vivo = false
    }
  }, [cuenta.id])

  // Sin creator_info se ofrecen las cuatro: el cron vuelve a consultar antes de subir y
  // falla con frase propia si la elegida ya no está permitida.
  const privacidades = creador?.privacidades ?? PRIVACIDADES_TIKTOK
  const patrocinado = comercial && tipoComercial === 'patrocinado'
  const patrocinadoPrivado = patrocinado && privacidad === 'SELF_ONLY'

  return (
    <div className="space-y-4 rounded-xl bg-white/[0.04] p-4">
      <div className="flex items-center gap-3">
        {creador?.avatarUrl ? (
          <Image src={creador.avatarUrl} alt="" width={32} height={32} unoptimized className="h-8 w-8 rounded-full" />
        ) : null}
        <div>
          <GroupLabel>TikTok · {cuenta.handle ?? 'sin nombre'}</GroupLabel>
          <p className="text-sm">
            {creador ? `Se publicará en la cuenta ${creador.nombre}` : aviso ?? 'Leyendo tu cuenta…'}
          </p>
        </div>
      </div>

      <input type="hidden" name={`tiktokModo:${cuenta.id}`} value={borrador ? 'borrador' : 'directo'} />
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
              name={`tiktokPrivacidad:${cuenta.id}`}
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

          {/*
            creator_info devuelve lo que el creador puede elegir, no lo que la app puede
            publicar: con la app sin aprobar ofrece las cuatro y TikTok rechaza todas menos
            la privada, quince minutos después y por correo. Avisarlo aquí es lo único que
            podemos hacer sin cerrarle la puerta al día en que aprueben.
          */}
          {privacidad !== '' && privacidad !== 'SELF_ONLY' ? (
            <p className="text-[0.72rem] text-fg-faint">
              Mientras TikTok no apruebe la app, solo «Solo yo» llega a publicarse: las demás
              fallan con «solo deja publicar en privado».
            </p>
          ) : null}

          <div>
            <GroupLabel>Permitir</GroupLabel>
            <div className="flex flex-wrap gap-4 text-sm">
              <Casilla
                name={`tiktokComentarios:${cuenta.id}`}
                label="Comentarios"
                bloqueada={creador?.comentariosDeshabilitados}
              />
              {soloFotos ? null : (
                <>
                  <Casilla name={`tiktokDuo:${cuenta.id}`} label="Dúos" bloqueada={creador?.duoDeshabilitado} />
                  <Casilla
                    name={`tiktokPegar:${cuenta.id}`}
                    label="Pegar (Stitch)"
                    bloqueada={creador?.pegarDeshabilitado}
                  />
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
            <input type="hidden" name={`tiktokComercial:${cuenta.id}`} value={comercial ? tipoComercial : 'no'} />
            {comercial ? (
              <div className="ml-12 space-y-1 text-sm">
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    // Con dos bloques de TikTok en el mismo formulario, sin sufijo los
                    // radios de ambas cuentas compartirían grupo: elegir «marca propia»
                    // en una desmarcaría a la otra en el navegador.
                    name={`tiktokTipoComercial:${cuenta.id}`}
                    checked={tipoComercial === 'marca_propia'}
                    onChange={() => setTipoComercial('marca_propia')}
                  />
                  Mi marca
                  <span className="text-xs text-fg-faint">Se etiquetará como Contenido promocional</span>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name={`tiktokTipoComercial:${cuenta.id}`}
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
