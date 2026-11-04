/**
 * Shared Schedule-of-Values resolver for an area.
 *
 * Mirrors `drawRequestOps.areaScheduledValueCents` but returns dollars, so
 * dollar-denominated consumers (AIA G702/G703 export, Sage project-setup CSV,
 * SageExportPanel preview) share one source of truth.
 *
 * Priority:
 *   1. explicit `scheduled_value` (dollars, written by the SOV setup step)
 *   2. `square_footage × price_per_sqft`
 *   3. `weight` percent × project `contract_value`
 *
 * `area.sov_value` is not a real column and must not be read — it is the
 * historical name of this bug.
 */
export function areaScheduledValueDollars(area, contractValue = 0) {
  const explicit = Number(area?.scheduled_value)
  if (Number.isFinite(explicit) && explicit > 0) return explicit

  const sqft = Number(area?.square_footage) || 0
  const pricePerSqft = Number(area?.price_per_sqft) || 0
  if (sqft > 0 && pricePerSqft > 0) return sqft * pricePerSqft

  const weight = parseFloat(area?.weight) || 0
  const contract = Number(contractValue) || 0
  if (weight > 0 && contract > 0) return (weight / 100) * contract

  return 0
}
