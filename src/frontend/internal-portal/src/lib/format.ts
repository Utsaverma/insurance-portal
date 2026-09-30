/** One formatter instance per shape, module-level: constructing Intl formatters
 *  per render is the expensive part. Everything is en-US / USD, in both portals. */
const USD = new Intl.NumberFormat('en-US', {
  style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2,
})

/** Money arrives as a string ("5850.00": the API serialises Decimal that way)
 *  or a number. An amount that is not set yet renders as an em dash. */
export const formatCurrency = (v: string | number | null | undefined): string => {
  if (v === null || v === undefined || v === '') return '—'
  const n = Number(v)
  return Number.isFinite(n) ? USD.format(n) : '—'
}

const DAY: Intl.DateTimeFormatOptions = { month: 'short', day: '2-digit', year: 'numeric' }
const DATE = new Intl.DateTimeFormat('en-US', DAY)
/** A bare YYYY-MM-DD parses as UTC midnight, which is the previous day anywhere
 *  west of Greenwich (all of the US). Calendar dates are formatted in UTC so an
 *  incident date shows the day that was entered. */
const CALENDAR_DATE = new Intl.DateTimeFormat('en-US', { ...DAY, timeZone: 'UTC' })
const DATE_TIME = new Intl.DateTimeFormat('en-US', { ...DAY, hour: 'numeric', minute: '2-digit' })

function formatWith(f: Intl.DateTimeFormat, v: string): string {
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? '—' : f.format(d)
}

/** ISO date (YYYY-MM-DD) or timestamp -> short date, e.g. "Sep 26, 2026". Tables
 *  were showing raw ISO while stat tiles showed toLocaleDateString(). */
export const formatDate = (v: string) =>
  formatWith(/^\d{4}-\d{2}-\d{2}$/.test(v) ? CALENDAR_DATE : DATE, v)

/** Timestamp -> date and local time, e.g. "Sep 26, 2026, 2:05 PM". */
export const formatDateTime = (v: string) => formatWith(DATE_TIME, v)
