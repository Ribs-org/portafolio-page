import type { Connector } from './connector'
import { facebookConnector } from './facebook'
import { instagramConnector } from './instagram'
import { tiktokConnector } from './tiktok'
import { youtubeConnector } from './youtube'

/** Adding a network is a file plus a line here. Nothing else knows they differ. */
export const CONNECTORS: Connector[] = [
  instagramConnector,
  tiktokConnector,
  youtubeConnector,
  facebookConnector,
]

export function connectorFor(network: string): Connector | undefined {
  return CONNECTORS.find((c) => c.network === network)
}

export type { Connector, FetchedPost, PostMetricValues } from './connector'
