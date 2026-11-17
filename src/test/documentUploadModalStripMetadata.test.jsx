import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'

// ---------------------------------------------------------------------------
// Mocks. DocumentUploadModal talks to the backend only through
// '../lib/supabase' (db.uploadDocument) and strips EXIF metadata through
// '../lib/imageUtils' (compressImage). Both are mocked so we can observe
// which files were handed to compressImage regardless of file size.
// ---------------------------------------------------------------------------

const mocks = vi.hoisted(() => ({
  db: {
    uploadDocument: vi.fn(async () => ({ id: 'doc-1' }))
  },
  compressImage: vi.fn(async (file) => file)
}))

vi.mock('../lib/supabase', () => ({
  db: mocks.db
}))

vi.mock('../lib/imageUtils', () => ({
  compressImage: mocks.compressImage
}))

import DocumentUploadModal from '../components/documents/DocumentUploadModal'

const baseProps = {
  projectId: 'proj-1',
  companyId: 'company-1',
  folderId: null,
  folderName: null,
  onClose: () => {},
  onUploadComplete: () => {},
  onShowToast: () => {}
}

async function selectFilesAndUpload(files) {
  const input = document.querySelector('input[type="file"]')
  await act(async () => {
    fireEvent.change(input, { target: { files } })
  })
  const uploadBtn = await screen.findByRole('button', { name: /Upload Document/i })
  await act(async () => {
    fireEvent.click(uploadBtn)
  })
  await waitFor(() => expect(mocks.db.uploadDocument).toHaveBeenCalled())
}

describe('DocumentUploadModal strips image metadata before upload', () => {
  beforeEach(() => {
    mocks.db.uploadDocument.mockClear()
    mocks.compressImage.mockClear()
  })
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('re-encodes a small JPEG so EXIF/GPS never reaches storage', async () => {
    render(<DocumentUploadModal {...baseProps} />)
    const small = new File([new Uint8Array(1000)], 'site.jpeg', { type: 'image/jpeg' })
    await selectFilesAndUpload([small])

    expect(mocks.compressImage).toHaveBeenCalledTimes(1)
    expect(mocks.compressImage.mock.calls[0][0]).toBe(small)
  })

  it('re-encodes a small PNG as well (screenshots, diagrams)', async () => {
    render(<DocumentUploadModal {...baseProps} />)
    const png = new File([new Uint8Array(2000)], 'diagram.png', { type: 'image/png' })
    await selectFilesAndUpload([png])

    expect(mocks.compressImage).toHaveBeenCalledTimes(1)
    expect(mocks.compressImage.mock.calls[0][0]).toBe(png)
  })

  it('does not run images through compressImage when the file is a PDF', async () => {
    render(<DocumentUploadModal {...baseProps} />)
    const pdf = new File([new Uint8Array(1000)], 'scope.pdf', { type: 'application/pdf' })
    await selectFilesAndUpload([pdf])

    expect(mocks.compressImage).not.toHaveBeenCalled()
    expect(mocks.db.uploadDocument).toHaveBeenCalledTimes(1)
  })
})
