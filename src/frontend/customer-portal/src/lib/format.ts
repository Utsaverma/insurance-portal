/** One formatter instance, module-level: constructing Intl.NumberFormat per
 *  render is the expensive part. maximumFractionDigits: 0 — claim amounts are
 *  whole rupees and the decimals were rendering inconsistently between the two
 *  portals (Reports rounded, everything else did not). */
const INR = new Intl.NumberFormat('en-IN', {
  style: 'currency', currency: 'INR', maximumFractionDigits: 0,
})
export const formatINR = (v: number | string) => INR.format(Number(v))

/** ISO date (YYYY-MM-DD) or timestamp -> short local date. Tables were showing
 *  raw ISO while stat tiles showed toLocaleDateString(). */
export const formatDate = (v: string) =>
  new Date(v).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' })
