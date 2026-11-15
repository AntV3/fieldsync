import { describe, it, expect, vi, beforeEach } from 'vitest'

// companyOps.getCompanySettings / updateCompanySetting read and write
// `companies.settings` (JSONB) directly. The pure crewPrivacy tests cover
// the helpers; these tests pin the schema the code assumes so a missing
// `settings` column (which shipped without a migration once and caused
// crew SSNs to always print on PDFs) is caught by CI next time.
const { supabase } = vi.hoisted(() => ({
  supabase: { from: vi.fn() }
}))

vi.mock('../lib/db/client', () => ({
  supabase,
  isSupabaseConfigured: true,
  getClient: () => supabase,
  sanitizeFormData: (x) => x,
  sanitize: { url: (x) => x },
  PUNCH_LIST_ALLOWED_FIELDS: new Set()
}))

let companyOps
beforeEach(async () => {
  vi.resetModules()
  supabase.from.mockReset()
  ;({ companyOps } = await import('../lib/db/companyOps'))
})

describe('companyOps.getCompanySettings', () => {
  it('reads the settings JSON column on companies', async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: { settings: { crew_pdf_show_ssn_last4: false } }, error: null })
    const eq = vi.fn().mockReturnValue({ maybeSingle })
    const select = vi.fn().mockReturnValue({ eq })
    supabase.from.mockReturnValue({ select })

    const out = await companyOps.getCompanySettings('c1')

    expect(supabase.from).toHaveBeenCalledWith('companies')
    expect(select).toHaveBeenCalledWith('settings')
    expect(eq).toHaveBeenCalledWith('id', 'c1')
    expect(out).toEqual({ crew_pdf_show_ssn_last4: false })
  })

  it('returns {} when the column or row cannot be read (so callers fall back to defaults)', async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: { message: 'column "settings" does not exist' } })
    const eq = vi.fn().mockReturnValue({ maybeSingle })
    const select = vi.fn().mockReturnValue({ eq })
    supabase.from.mockReturnValue({ select })

    const out = await companyOps.getCompanySettings('c1')
    expect(out).toEqual({})
  })
})

describe('companyOps.updateCompanySetting', () => {
  it('merges a new key into the existing settings JSON and writes it back', async () => {
    // First call: read current settings
    const readSingle = vi.fn().mockResolvedValue({ data: { settings: { already: 'kept' } }, error: null })
    const readEq = vi.fn().mockReturnValue({ maybeSingle: readSingle })
    const readSelect = vi.fn().mockReturnValue({ eq: readEq })

    // Second call: update
    const writeEq = vi.fn().mockResolvedValue({ error: null })
    const update = vi.fn().mockReturnValue({ eq: writeEq })

    supabase.from
      .mockReturnValueOnce({ select: readSelect })
      .mockReturnValueOnce({ update })

    const result = await companyOps.updateCompanySetting('c1', 'crew_pdf_show_ssn_last4', false)

    expect(supabase.from).toHaveBeenNthCalledWith(1, 'companies')
    expect(supabase.from).toHaveBeenNthCalledWith(2, 'companies')
    expect(update).toHaveBeenCalledWith({ settings: { already: 'kept', crew_pdf_show_ssn_last4: false } })
    expect(writeEq).toHaveBeenCalledWith('id', 'c1')
    expect(result).toEqual({ already: 'kept', crew_pdf_show_ssn_last4: false })
  })

  it('surfaces the write error so the UI can show a toast', async () => {
    const readSingle = vi.fn().mockResolvedValue({ data: { settings: {} }, error: null })
    const readEq = vi.fn().mockReturnValue({ maybeSingle: readSingle })
    const readSelect = vi.fn().mockReturnValue({ eq: readEq })
    const writeEq = vi.fn().mockResolvedValue({ error: { message: 'column "settings" does not exist' } })
    const update = vi.fn().mockReturnValue({ eq: writeEq })
    supabase.from
      .mockReturnValueOnce({ select: readSelect })
      .mockReturnValueOnce({ update })

    await expect(
      companyOps.updateCompanySetting('c1', 'crew_pdf_show_ssn_last4', false)
    ).rejects.toMatchObject({ message: /settings/ })
  })
})
