/**
 * useTradeProfile
 * Returns the trade profile config for the current company.
 * Falls back to 'demolition' for existing companies without a trade set.
 *
 * Usage:
 *   const { profile, trade, companyType, fieldSupervisorLabel, hasModule } = useTradeProfile(company)
 */

import { useMemo } from 'react'
import { getTradeProfile, TRADE_PROFILES } from '../lib/constants'

export function useTradeProfile(company) {
  return useMemo(() => {
    const trade = company?.trade || 'demolition'
    const companyType = company?.company_type || 'subcontractor'

    const profile = getTradeProfile(trade)

    // Company can override the field supervisor label
    const fieldSupervisorLabel =
      company?.field_supervisor_label?.trim() || profile.fieldSupervisorLabel

    // Company can override material categories via branding settings
    const materialCategories =
      company?.branding?.material_categories || profile.materialCategories

    // Company can override work types via branding settings
    const workTypes =
      company?.branding?.custom_work_types || profile.workTypes

    const modules = new Set(profile.modules)

    /**
     * Check whether a given field module is enabled for this trade.
     * Module keys: 'crew', 'tm', 'disposal', 'daily_report', 'injury', 'docs', 'progress'
     */
    const hasModule = (moduleKey) => modules.has(moduleKey)

    /**
     * Whether material/waste tracking (the "disposal loads" feature) is relevant
     * for this trade. GC mode always enables it; certain trades like painting skip it.
     */
    const hasDisposalTracking = hasModule('disposal') || companyType === 'general_contractor'

    return {
      trade,
      companyType,
      profile,
      fieldSupervisorLabel,
      materialCategories,
      workTypes,
      hasModule,
      hasDisposalTracking,
      isGC: companyType === 'general_contractor'
    }
  }, [company?.trade, company?.company_type, company?.field_supervisor_label, company?.branding])
}

export default useTradeProfile
