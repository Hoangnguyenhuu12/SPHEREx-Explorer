const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })
const full = new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' })
const day = new Intl.DateTimeFormat('en', { day: 'numeric', month: 'short', year: 'numeric' })

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 365 * 86_400_000],
  ['month', 30 * 86_400_000],
  ['week', 7 * 86_400_000],
  ['day', 86_400_000],
  ['hour', 3_600_000],
  ['minute', 60_000],
]

/** "3 days ago", "just now". Older than 30 days: a date. */
export function relativeTime(iso: string, now = Date.now()): string {
  const diff = new Date(iso).getTime() - now
  const abs = Math.abs(diff)
  if (abs < 60_000) return 'just now'
  if (abs > 30 * 86_400_000) return day.format(new Date(iso))
  for (const [unit, ms] of UNITS) {
    if (abs >= ms) return rtf.format(Math.round(diff / ms), unit)
  }
  return 'just now'
}

export function fullDate(iso: string): string {
  return full.format(new Date(iso))
}

export function shortDate(iso: string): string {
  return day.format(new Date(iso))
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`
}
