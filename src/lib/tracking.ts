import { createHash } from 'node:crypto'
import { UAParser } from 'ua-parser-js'
import { env } from './env'
import { detectNetwork } from './networks'

const BOT_PATTERN =
  /bot|crawler|spider|crawling|slurp|facebookexternalhit|preview|fetcher|monitor|curl|wget|python-requests|axios|node-fetch|headless|lighthouse|pingdom|semrush|ahrefs|dataprovider|whatsapp|telegram|discordbot|embedly|quora link preview|vercelbot/i

export type VisitContext = {
  visitorHash: string
  country: string | null
  region: string | null
  city: string | null
  timezone: string | null
  latitude: number | null
  longitude: number | null
  deviceType: string | null
  os: string | null
  browser: string | null
  referrer: string | null
  referrerNetwork: string
  campaign: string | null
  utmSource: string | null
  utmMedium: string | null
  utmCampaign: string | null
  utmContent: string | null
  language: string | null
  isBot: boolean
}

function clean(value: string | null | undefined, max = 255): string | null {
  if (!value) return null
  const trimmed = decodeSafely(value).trim()
  if (!trimmed) return null
  return trimmed.slice(0, max)
}

function decodeSafely(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

function toNumber(value: string | null | undefined): number | null {
  if (!value) return null
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? parsed : null
}

function clientIp(headers: Headers): string {
  const forwarded = headers.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0]!.trim()
  return headers.get('x-real-ip') ?? 'unknown'
}

/**
 * The UTC date is part of the digest, so the same visitor gets a different hash
 * tomorrow. Unique visitors are therefore a per-day metric — the deliberate cost of
 * not setting a cookie.
 */
function hashVisitor(ip: string, userAgent: string): string {
  const salt = env('FINGERPRINT_SALT') ?? 'dev-salt-change-me'
  const day = new Date().toISOString().slice(0, 10)
  return createHash('sha256').update(`${ip}|${userAgent}|${salt}|${day}`).digest('hex')
}

function firstDefined(params: URLSearchParams, ...keys: string[]): string | null {
  for (const key of keys) {
    const value = params.get(key)
    if (value) return value
  }
  return null
}

export function buildVisitContext(headers: Headers, params: URLSearchParams): VisitContext {
  const userAgent = headers.get('user-agent') ?? ''
  const ua = UAParser(userAgent)

  const utmSource = clean(firstDefined(params, 'utm_source', 'source'), 100)
  const referrer = clean(headers.get('referer'), 500)

  // `?s=` is the short campaign tag meant to be typed by hand into a bio link.
  const campaign = clean(
    firstDefined(params, 's', 'src', 'ref', 'utm_content', 'utm_campaign'),
    100,
  )

  return {
    visitorHash: hashVisitor(clientIp(headers), userAgent),
    country: clean(headers.get('x-vercel-ip-country'), 8),
    region: clean(headers.get('x-vercel-ip-country-region'), 64),
    city: clean(headers.get('x-vercel-ip-city'), 128),
    timezone: clean(headers.get('x-vercel-ip-timezone'), 64),
    latitude: toNumber(headers.get('x-vercel-ip-latitude')),
    longitude: toNumber(headers.get('x-vercel-ip-longitude')),
    deviceType: ua.device.type ?? (userAgent ? 'desktop' : null),
    os: clean(ua.os.name, 64),
    browser: clean(ua.browser.name, 64),
    referrer,
    referrerNetwork: detectNetwork(referrer, utmSource),
    campaign,
    utmSource,
    utmMedium: clean(params.get('utm_medium'), 100),
    utmCampaign: clean(params.get('utm_campaign'), 100),
    utmContent: clean(params.get('utm_content'), 100),
    language: clean(headers.get('accept-language')?.split(',')[0], 16),
    isBot: BOT_PATTERN.test(userAgent) || userAgent.length === 0,
  }
}

export function searchParamsFrom(
  input: Record<string, string | string[] | undefined>,
): URLSearchParams {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(input)) {
    if (typeof value === 'string') params.set(key, value)
    else if (Array.isArray(value) && value[0]) params.set(key, value[0])
  }
  return params
}
