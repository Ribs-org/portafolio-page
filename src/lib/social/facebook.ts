/** El `me/accounts?fields=id,name,access_token` payload. */
export type FacebookPageEntry = { id?: string; name?: string; access_token?: string }
export type FacebookPagesList = { data?: FacebookPageEntry[] }
export type FacebookPage = { id: string; name: string | null; accessToken: string | null }

/**
 * Why picking the page can fail loudly. `message` is always one of the fixed Spanish
 * sentences below — never upstream text — so the callback can show it as-is. The
 * candidates ride along separately for the server log: page names come from Meta, and
 * upstream text does not belong in anything the browser renders.
 */
export class FacebookPageError extends Error {
  constructor(
    message: string,
    public readonly candidates: FacebookPage[] = [],
  ) {
    super(message)
  }
}

export const NO_FACEBOOK_PAGE = 'Esta cuenta no administra ninguna página de Facebook.'
export const AMBIGUOUS_FACEBOOK_PAGE =
  'Hay varias páginas de Facebook disponibles. Define FACEBOOK_PAGE_ID con el id de la que quieres conectar.'
export const PINNED_FACEBOOK_PAGE_MISSING =
  'FACEBOOK_PAGE_ID no coincide con ninguna de las páginas disponibles.'

/** Ids are numeric and assigned by Meta, so echoing them into the page is safe. */
export function pinnedPageMissingMessage(candidates: FacebookPage[]): string {
  const ids = candidates.map((candidate) => candidate.id).join(', ')
  return `${PINNED_FACEBOOK_PAGE_MISSING} Encontradas: ${ids}.`
}

/**
 * Taking the first page is only safe when there is exactly one: the order Meta lists
 * pages in is not a promise, and silently connecting a different page than last time
 * makes the next sync archive the previous page's whole catalogue (same argument as
 * `pickInstagramAccount`). When the answer is ambiguous this throws instead of
 * guessing, and `pinnedId` (from FACEBOOK_PAGE_ID) is how the owner disambiguates.
 */
export function pickFacebookPage(
  pages: FacebookPagesList,
  pinnedId?: string,
): FacebookPage {
  const candidates: FacebookPage[] = []
  for (const page of pages.data ?? []) {
    if (page.id) {
      candidates.push({
        id: page.id,
        name: page.name ?? null,
        accessToken: page.access_token ?? null,
      })
    }
  }

  if (pinnedId) {
    const pinned = candidates.find((candidate) => candidate.id === pinnedId)
    if (pinned) return pinned
    if (candidates.length === 0) throw new FacebookPageError(NO_FACEBOOK_PAGE)
    throw new FacebookPageError(pinnedPageMissingMessage(candidates), candidates)
  }

  if (candidates.length === 0) throw new FacebookPageError(NO_FACEBOOK_PAGE)
  if (candidates.length === 1) return candidates[0]!
  throw new FacebookPageError(AMBIGUOUS_FACEBOOK_PAGE, candidates)
}
