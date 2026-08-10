import Image from 'next/image'
import { ArrowUpRight, CalendarCheck } from 'lucide-react'
import type { Link, Profile } from '@/db'
import { accentCompanion, cn, displayHost, hexToRgbChannels } from '@/lib/utils'
import { Icon } from './icon'

/**
 * The view needs only presentational fields, so the admin's unsaved draft can be
 * rendered by the same component that serves the live page.
 */
export type ViewLink = Pick<
  Link,
  'id' | 'kind' | 'label' | 'sublabel' | 'url' | 'icon' | 'imageUrl'
>

export type ViewProfile = Pick<
  Profile,
  'displayName' | 'headline' | 'bio' | 'avatarUrl' | 'accentColor'
>

type Props = {
  profile: ViewProfile
  links: ViewLink[]
  /** Set in the admin preview, where nothing should be tracked. */
  preview?: boolean
}

/** `data-link-id` is what ClickTracker listens for. */
function trackingProps(link: ViewLink, position: number, preview?: boolean) {
  if (preview) return {}
  return { 'data-link-id': link.id, 'data-position': position }
}

function Destination({ url }: { url: string }) {
  return (
    <span className="destination block overflow-hidden font-mono text-[0.7rem] tracking-tight text-fg-faint">
      {displayHost(url)}
    </span>
  )
}

function SocialRow({ items, preview }: { items: ViewLink[]; preview?: boolean }) {
  if (items.length === 0) return null
  return (
    <nav className="rise mt-6 flex flex-wrap justify-center gap-2" style={{ ['--i' as string]: 0 }}>
      {items.map((link, i) => (
        <a
          key={link.id}
          href={link.url}
          target="_blank"
          rel="noopener noreferrer"
          title={link.label}
          aria-label={link.label}
          className="surface surface-hover grid h-11 w-11 place-items-center rounded-2xl text-fg-muted hover:text-fg"
          {...trackingProps(link, i, preview)}
        >
          <Icon name={link.icon ?? link.label} className="h-[18px] w-[18px]" />
        </a>
      ))}
    </nav>
  )
}

function BookingCard({ link, index, preview }: { link: ViewLink; index: number; preview?: boolean }) {
  return (
    <a
      href={link.url}
      target="_blank"
      rel="noopener noreferrer"
      className="rise surface-hover group relative block overflow-hidden rounded-3xl border p-5"
      style={{
        ['--i' as string]: index,
        background:
          'linear-gradient(135deg, rgb(var(--accent) / 0.22), rgb(var(--accent-soft) / 0.1))',
        borderColor: 'rgb(var(--accent) / 0.35)',
      }}
      {...trackingProps(link, index, preview)}
    >
      <div className="flex items-center gap-4">
        <span
          className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl"
          style={{ background: 'rgb(var(--accent) / 0.28)' }}
        >
          <CalendarCheck className="h-5 w-5" style={{ color: 'rgb(var(--accent))' }} aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-display text-[1.05rem] font-semibold tracking-[-0.01em]">
            {link.label}
          </span>
          {link.sublabel ? (
            <span className="mt-0.5 block text-[0.85rem] text-fg-muted">{link.sublabel}</span>
          ) : null}
          <Destination url={link.url} />
        </span>
        <ArrowUpRight
          className="h-5 w-5 shrink-0 text-fg-muted transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
          aria-hidden
        />
      </div>
    </a>
  )
}

function FeaturedCard({ link, index, preview }: { link: ViewLink; index: number; preview?: boolean }) {
  return (
    <a
      href={link.url}
      target="_blank"
      rel="noopener noreferrer"
      className="rise surface surface-hover group block overflow-hidden rounded-3xl"
      style={{ ['--i' as string]: index }}
      {...trackingProps(link, index, preview)}
    >
      {link.imageUrl ? (
        <span className="relative block aspect-[16/9] w-full overflow-hidden bg-ink-800">
          <Image
            src={link.imageUrl}
            alt=""
            fill
            sizes="(max-width: 480px) 100vw, 480px"
            className="object-cover transition-transform duration-500 group-hover:scale-[1.03]"
          />
        </span>
      ) : null}
      <span className="flex items-center gap-3 p-4">
        <span className="min-w-0 flex-1">
          <span className="block font-display text-[1.05rem] font-semibold tracking-[-0.01em]">
            {link.label}
          </span>
          {link.sublabel ? (
            <span className="mt-0.5 block text-[0.85rem] text-fg-muted">{link.sublabel}</span>
          ) : null}
          <Destination url={link.url} />
        </span>
        <ArrowUpRight
          className="h-5 w-5 shrink-0 text-fg-muted transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
          aria-hidden
        />
      </span>
    </a>
  )
}

function StandardCard({ link, index, preview }: { link: ViewLink; index: number; preview?: boolean }) {
  return (
    <a
      href={link.url}
      target="_blank"
      rel="noopener noreferrer"
      className="rise surface surface-hover group flex items-center gap-3.5 rounded-2xl p-3.5"
      style={{ ['--i' as string]: index }}
      {...trackingProps(link, index, preview)}
    >
      <span className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-xl bg-white/[0.06] text-fg-muted">
        {link.imageUrl ? (
          <Image src={link.imageUrl} alt="" width={40} height={40} className="h-full w-full object-cover" />
        ) : (
          <Icon name={link.icon ?? 'link'} className="h-[18px] w-[18px]" />
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium tracking-[-0.005em]">{link.label}</span>
        {link.sublabel ? (
          <span className="mt-0.5 block truncate text-[0.82rem] text-fg-muted">{link.sublabel}</span>
        ) : null}
        <Destination url={link.url} />
      </span>
      <ArrowUpRight
        className="h-[18px] w-[18px] shrink-0 text-fg-faint transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
        aria-hidden
      />
    </a>
  )
}

export function ProfileView({ profile, links, preview }: Props) {
  const socials = links.filter((l) => l.kind === 'social')
  const rest = links.filter((l) => l.kind !== 'social')

  const accent = hexToRgbChannels(profile.accentColor)

  return (
    <div
      className={cn('relative min-h-dvh', preview && 'min-h-0')}
      style={
        {
          '--accent': accent,
          '--accent-soft': accentCompanion(profile.accentColor),
        } as React.CSSProperties
      }
    >
      <div className={cn('aurora', preview && 'aurora-contained')} aria-hidden>
        <span />
      </div>

      <main className="mx-auto w-full max-w-[30rem] px-5 pb-20 pt-14 sm:pt-20">
        <header className="text-center">
          <div className="relative mx-auto h-28 w-28">
            <span
              aria-hidden
              className="ring-spin absolute -inset-[5px] rounded-full opacity-80 blur-[2px]"
              style={{
                background:
                  'conic-gradient(from 90deg, transparent 0%, rgb(var(--accent)) 22%, rgb(var(--accent-soft)) 42%, transparent 62%)',
              }}
            />
            <div className="absolute inset-0 overflow-hidden rounded-full border border-white/10 bg-ink-800">
              {profile.avatarUrl ? (
                <Image
                  src={profile.avatarUrl}
                  alt={profile.displayName}
                  width={112}
                  height={112}
                  priority
                  className="h-full w-full object-cover"
                />
              ) : (
                <span className="grid h-full w-full place-items-center font-display text-3xl text-fg-faint">
                  {profile.displayName.slice(0, 1).toUpperCase()}
                </span>
              )}
            </div>
          </div>

          {profile.headline ? (
            <p
              className="mt-5 font-mono text-[0.68rem] uppercase tracking-[0.22em]"
              style={{ color: 'rgb(var(--accent))' }}
            >
              {profile.headline}
            </p>
          ) : null}

          <h1 className="mt-2 font-display text-[1.9rem] font-semibold leading-tight tracking-[-0.025em]">
            {profile.displayName}
          </h1>

          {profile.bio ? (
            <p className="mx-auto mt-3 max-w-[26rem] text-[0.95rem] leading-relaxed text-fg-muted">
              {profile.bio}
            </p>
          ) : null}
        </header>

        <SocialRow items={socials} preview={preview} />

        <div className="mt-8 flex flex-col gap-3">
          {rest.map((link, i) => {
            const index = i + 1
            if (link.kind === 'booking')
              return <BookingCard key={link.id} link={link} index={index} preview={preview} />
            if (link.kind === 'featured')
              return <FeaturedCard key={link.id} link={link} index={index} preview={preview} />
            return <StandardCard key={link.id} link={link} index={index} preview={preview} />
          })}
        </div>

        {rest.length === 0 && socials.length === 0 ? (
          <p className="mt-10 text-center text-sm text-fg-faint">TodavÃ­a no hay links acÃ¡.</p>
        ) : null}
      </main>
    </div>
  )
}
