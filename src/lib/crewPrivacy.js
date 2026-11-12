/**
 * Last 4 digits of a worker's SSN, collected on crew sign-in sheets.
 *
 * Never shown on screen. Whether they print on sign-in sheet PDFs is a
 * per-company setting (companies.settings.crew_pdf_show_ssn_last4), on
 * unless an administrator turns it off.
 */
export const SSN_PDF_SETTING = 'crew_pdf_show_ssn_last4'

/** True unless the company turned printing off. */
export function showSsnOnPdfs(settings) {
  return settings?.[SSN_PDF_SETTING] !== false
}

/** Text for a PDF cell: the digits when allowed, otherwise a mask. */
export function ssnForPdf(ssnLast4, show) {
  if (!ssnLast4) return '—'
  return show ? String(ssnLast4) : '••••'
}

/** Text for a screen: never the digits. */
export function ssnOnScreen(ssnLast4) {
  return ssnLast4 ? 'SSN on file' : null
}
