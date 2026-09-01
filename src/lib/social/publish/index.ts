import type { Publisher } from './publisher'
import { facebookPublisher } from './facebook'
import { instagramPublisher } from './instagram'
import { youtubePublisher } from './youtube'

/** Adding a network in later phases is a file plus a line here, same as CONNECTORS. */
export const PUBLISHERS: Publisher[] = [instagramPublisher, facebookPublisher, youtubePublisher]

export * from './publisher'
