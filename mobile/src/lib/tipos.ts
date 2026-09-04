export type PostProgramado = {
  id: string
  texto: string
  cuando: string
  redes: { red: string; estado: string; error?: string | null }[]
  portada?: string | null
  miniatura?: string | null
}

export type Overview = {
  desde: string
  hasta: string
  truncado: boolean
  kpis: {
    viewsGanadas: number | null
    visitasAlSitio: number | null
    arrastre: number | null
    seguidores: number | null
  }
  hoy: PostProgramado[]
  proximos: PostProgramado[]
}

export type PostMetrica = {
  red: string
  externalId: string
  permalink: string | null
  texto: string | null
  publicadoEl: string
  etiqueta: string
  atributos: Record<string, string | number | boolean> | null
  archivado: boolean
  miniatura: string | null
  metricas: {
    views: number | null
    viewsGanadas: number | null
    likes: number | null
    comentarios: number | null
    compartidos: number | null
    alcance: number | null
    visitasAlSitio: number | null
    clicks: number | null
    ctr: number | null
    arrastre: number | null
  }
}

export type Posts = { desde: string; hasta: string; truncado: boolean; posts: PostMetrica[] }

export type Cuentas = {
  desde: string
  hasta: string
  cuentas: {
    red: string
    seguidores: number | null
    seguidoresGanados: number | null
    visitasAlPerfil: number | null
    alcance: number | null
    dia: string | null
  }[]
  serie: { fecha: string; visitasAlPerfil: number | null; alcance: number | null }[]
}

export type Calendario = { posts: PostProgramado[] }

export const NOMBRE_RED: Record<string, string> = {
  instagram: 'Instagram',
  facebook: 'Facebook',
  youtube: 'YouTube',
  threads: 'Threads',
  x: 'X',
  tiktok: 'TikTok',
}
