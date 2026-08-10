import type { MetadataRoute } from 'next'

/**
 * Private profiles are additionally excluded here, but the real protection is that
 * their slug is unguessable and never linked from anywhere.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', allow: '/', disallow: ['/admin', '/api'] },
  }
}
