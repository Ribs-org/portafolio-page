import type { Publisher } from './publisher'
import { facebookPublisher } from './facebook'
import { instagramPublisher } from './instagram'

/** Adding a network in later phases is a file plus a line here, same as CONNECTORS. */
export const PUBLISHERS: Publisher[] = [instagramPublisher, facebookPublisher]

export * from './publisher'
