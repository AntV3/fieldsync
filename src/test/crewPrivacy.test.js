import { describe, it, expect } from 'vitest'
import { showSsnOnPdfs, ssnForPdf, ssnOnScreen, SSN_PDF_SETTING } from '../lib/crewPrivacy'

describe('crew SSN last 4', () => {
  it('is never shown on screen', () => {
    expect(ssnOnScreen('1234')).toBe('SSN on file')
    expect(ssnOnScreen('1234')).not.toMatch(/\d/)
    expect(ssnOnScreen('')).toBeNull()
  })

  it('prints on PDFs unless the company turned it off', () => {
    expect(showSsnOnPdfs(undefined)).toBe(true)
    expect(showSsnOnPdfs({})).toBe(true)
    expect(showSsnOnPdfs({ [SSN_PDF_SETTING]: true })).toBe(true)
    expect(showSsnOnPdfs({ [SSN_PDF_SETTING]: false })).toBe(false)
  })

  it('masks the digits on a PDF when printing is off', () => {
    expect(ssnForPdf('1234', true)).toBe('1234')
    expect(ssnForPdf('1234', false)).toBe('••••')
    expect(ssnForPdf(null, true)).toBe('—')
  })
})
