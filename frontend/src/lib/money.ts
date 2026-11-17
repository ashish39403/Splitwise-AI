/** Exact integer helpers for money entry, display and split previews. */

/** Format INR minor units without converting money through floating point. */
export function formatInr(minor: number): string {
  if (!Number.isSafeInteger(minor)) return '₹—'

  const sign = minor < 0 ? '-' : ''
  const digits = String(Math.abs(minor)).padStart(3, '0')
  const whole = digits.slice(0, -2)
  const fraction = digits.slice(-2)
  const lastThree = whole.slice(-3)
  const leading = whole.slice(0, -3)
  const groupedLeading = leading.replace(/\B(?=(\d{2})+(?!\d))/g, ',')
  const groupedWhole = groupedLeading ? `${groupedLeading},${lastThree}` : lastThree

  return `${sign}₹${groupedWhole}.${fraction}`
}

/** Render integer minor units as the "1234.56" string expected by money inputs. */
export function minorToInput(minor: number): string {
  if (!Number.isSafeInteger(minor) || minor < 0) return ''
  const digits = String(minor).padStart(3, '0')
  return `${digits.slice(0, -2)}.${digits.slice(-2)}`
}

/** Parse a rupee input string into integer paise; null when it is not valid. */
export function parseMinorInput(value: string): number | null {
  const match = value.trim().match(/^(\d+)(?:\.(\d{1,2}))?$/)
  if (!match) return null
  return Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'))
}

/** 100% expressed in ten-thousandths of a percent. */
const PERCENT_SCALE = 1_000_000

function percentageUnits(value: string): number | null {
  const match = value.trim().match(/^(\d{1,3})(?:\.(\d{1,4}))?$/)
  if (!match) return null
  const units = Number(match[1]) * 10_000 + Number((match[2] ?? '').padEnd(4, '0'))
  return units <= PERCENT_SCALE ? units : null
}

/**
 * Mirror Django's deterministic percentage split for the form preview:
 * floor each exact share, then hand leftover paise to the largest fractions
 * (ties broken by profile id). Returns null when the input is not a valid split.
 */
export function calculatePercentageShares(
  amountMinor: number,
  percentages: Record<string, string | undefined>,
): Map<string, number> | null {
  if (
    !Number.isSafeInteger(amountMinor) ||
    amountMinor <= 0 ||
    amountMinor > Number.MAX_SAFE_INTEGER / PERCENT_SCALE
  ) {
    return null
  }

  const entries = Object.entries(percentages)
  if (entries.length === 0) return null

  const units = new Map<string, number>()
  let total = 0
  for (const [id, raw] of entries) {
    const value = percentageUnits(raw ?? '')
    if (value === null) return null
    units.set(id, value)
    total += value
  }
  if (total !== 1_000_000) return null

  const rows = [...units.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([id, value]) => {
      const numerator = amountMinor * value
      const share = Math.floor(numerator / PERCENT_SCALE)
      return { id, share, fraction: numerator - share * PERCENT_SCALE }
    })

  const remainder = amountMinor - rows.reduce((sum, row) => sum + row.share, 0)
  const ranked = [...rows].sort(
    (a, b) => b.fraction - a.fraction || a.id.localeCompare(b.id),
  )
  for (let index = 0; index < remainder; index += 1) {
    ranked[index].share += 1
  }

  return new Map(rows.map((row) => [row.id, row.share]))
}
