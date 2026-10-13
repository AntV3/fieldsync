/**
 * Regression: SignaturePage's fully-signed slot1/slot2 cards must read
 * `signature_image` (the real column on the signatures table, per
 * supabase/migrations/20241201000320_signatures.sql:57) — not the
 * non-existent `signature_data`. If it reads `signature_data`, the <img>'s
 * src is always undefined and no stroke renders for anyone who revisits the
 * signing URL after submitting.
 *
 * This is a source-level assertion so a future rename won't silently break
 * the public signing page.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const signaturePagePath = resolve(here, '../components/SignaturePage.jsx')
const source = readFileSync(signaturePagePath, 'utf8')

describe('SignaturePage slot signature field', () => {
  it('reads slot1.signature_image, not slot1.signature_data', () => {
    expect(source).toMatch(/slot1\.signature_image/)
    expect(source).not.toMatch(/slot1\.signature_data/)
  })

  it('reads slot2.signature_image, not slot2.signature_data', () => {
    expect(source).toMatch(/slot2\.signature_image/)
    expect(source).not.toMatch(/slot2\.signature_data/)
  })
})
