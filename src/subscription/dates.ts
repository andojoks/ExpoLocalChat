/** Format ISO / Date as dd/mm/yyyy (local calendar day). */
export function formatDateDmY(value: string | Date | null | undefined): string {
  if (!value) return '—'
  const d = typeof value === 'string' ? new Date(value) : value
  if (Number.isNaN(d.getTime())) return '—'
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const yyyy = d.getFullYear()
  return `${dd}/${mm}/${yyyy}`
}

/** Whole calendar days remaining until expiresAt (local). 0 if expired/missing. */
export function daysLeftUntil(expiresAt: string | Date | null | undefined): number | null {
  if (!expiresAt) return null
  const end = typeof expiresAt === 'string' ? new Date(expiresAt) : expiresAt
  if (Number.isNaN(end.getTime())) return null
  const now = new Date()
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const startOfEnd = new Date(end.getFullYear(), end.getMonth(), end.getDate())
  const diffMs = startOfEnd.getTime() - startOfToday.getTime()
  return Math.max(0, Math.round(diffMs / 86_400_000))
}

export function formatDaysLeft(expiresAt: string | Date | null | undefined): string {
  const days = daysLeftUntil(expiresAt)
  if (days === null) return '—'
  if (days === 0) return 'Expires today'
  if (days === 1) return '1 day left'
  return `${days} days left`
}
