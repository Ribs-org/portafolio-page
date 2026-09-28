'use client'

import { useState } from 'react'
import { GroupLabel, Toggle } from '@/components/ui'
import type { CuentaDestino } from '@/lib/social/cuentas'

/**
 * Lo único que Instagram deja elegir por destino: si el reel sale como trial reel. Solo se
 * monta con exactamente un video elegido (lo decide el compositor), así que con fotos o
 * carrusel el interruptor ni existe y no manda nada. El campo lleva el id de la cuenta
 * como sufijo, igual que los de TikTok: puede haber dos bloques en el mismo formulario.
 */
export function InstagramOpciones({ cuenta }: { cuenta: CuentaDestino }) {
  const [trial, setTrial] = useState(false)
  return (
    <div className="space-y-3 rounded-xl bg-white/[0.04] p-4">
      <GroupLabel>Instagram · {cuenta.handle ?? 'sin nombre'}</GroupLabel>
      <Toggle
        name={`instagramTrial:${cuenta.id}`}
        label="Publicar como trial reel"
        hint="Solo lo ven quienes no te siguen. Tú decides desde Instagram cuándo compartirlo con todos."
        checked={trial}
        onChange={setTrial}
      />
    </div>
  )
}
