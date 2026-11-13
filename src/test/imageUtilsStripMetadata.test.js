import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { compressImage } from '../lib/imageUtils'

// jsdom has no image decoding or canvas encoding: stand in for both and
// record the format the canvas was asked to encode to.
let encodedAs
beforeEach(() => {
  encodedAs = null
  vi.stubGlobal('Image', class {
    constructor() { this.width = 800; this.height = 600 }
    set src(_v) { setTimeout(() => this.onload?.(), 0) }
    get src() { return 'blob:x' }
  })
  URL.createObjectURL = vi.fn(() => 'blob:x')
  URL.revokeObjectURL = vi.fn()
  const realCreate = document.createElement.bind(document)
  vi.spyOn(document, 'createElement').mockImplementation((tag) => {
    if (tag !== 'canvas') return realCreate(tag)
    return {
      getContext: () => ({ drawImage: vi.fn() }),
      toBlob: (cb, type) => { encodedAs = type; cb(new Blob(['re-encoded'], { type })) }
    }
  })
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('compressImage strips photo metadata', () => {
  it('re-encodes a small JPEG instead of uploading the original bytes (EXIF/GPS)', async () => {
    const original = new File([new Uint8Array(1000)], 'site.jpeg', { type: 'image/jpeg' })
    const out = await compressImage(original)
    expect(out).not.toBe(original)
    expect(encodedAs).toBe('image/jpeg')
    expect(out.name).toBe('site.jpg')
  })

  it('keeps a PNG as PNG so transparency survives', async () => {
    const out = await compressImage(new File([new Uint8Array(10)], 'logo.png', { type: 'image/png' }))
    expect(encodedAs).toBe('image/png')
    expect(out.name).toBe('logo.png')
  })

  it('leaves GIFs and non-images untouched', async () => {
    const gif = new File(['g'], 'a.gif', { type: 'image/gif' })
    const pdf = new File(['p'], 'a.pdf', { type: 'application/pdf' })
    expect(await compressImage(gif)).toBe(gif)
    expect(await compressImage(pdf)).toBe(pdf)
    expect(encodedAs).toBeNull()
  })
})
