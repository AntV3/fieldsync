/**
 * DailyReport compiler: the field's default behaviour, and the office entering
 * a report for the field (companyId / submittedBy / enteredByOffice).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const mocks = vi.hoisted(() => ({
  db: {
    getDailyReport: vi.fn(),
    compileDailyReport: vi.fn(),
    uploadPhoto: vi.fn(),
    saveDailyReport: vi.fn(),
    saveCustomFieldData: vi.fn(),
    submitDailyReport: vi.fn()
  }
}))

vi.mock('../lib/supabase', () => ({
  db: mocks.db,
  isSupabaseConfigured: true
}))

vi.mock('../lib/imageUtils', () => ({
  compressImage: vi.fn(async (file) => file)
}))

vi.mock('../components/ui/CustomFieldSection', () => ({ default: () => null }))

import DailyReport from '../components/DailyReport'

const project = { id: 'proj-1', name: 'Sunrise Apartments', company_id: 'project-company' }

let onShowToast
let onClose

function renderReport(props = {}) {
  onShowToast = vi.fn()
  onClose = vi.fn()
  return render(
    <DailyReport project={project} onShowToast={onShowToast} onClose={onClose} {...props} />
  )
}

async function addPhotos(container, count) {
  const input = container.querySelector('input[type="file"]')
  const files = Array.from({ length: count }, (_, i) =>
    new File(['x'], `photo-${i + 1}.jpg`, { type: 'image/jpeg' })
  )
  fireEvent.change(input, { target: { files } })
  for (const f of files) {
    await screen.findByAltText(f.name)
  }
}

async function submit() {
  fireEvent.click((await screen.findByText('Submit Report')).closest('button'))
}

function toastMessages() {
  return onShowToast.mock.calls.map(c => c[0])
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.db.getDailyReport.mockResolvedValue(null)
  mocks.db.compileDailyReport.mockResolvedValue({ crew_count: 0, crew_list: [], completed_tasks: [], tm_tickets_count: 0, photos_count: 0 })
  mocks.db.uploadPhoto.mockImplementation(async (companyId, projectId, folder, file) => `${companyId}/${projectId}/${folder}/${file.name}`)
  mocks.db.saveDailyReport.mockResolvedValue({ id: 'report-1' })
  mocks.db.saveCustomFieldData.mockResolvedValue({ success: true })
  mocks.db.submitDailyReport.mockResolvedValue({ id: 'report-1', status: 'submitted' })

  // jsdom has no blob URLs
  URL.createObjectURL = vi.fn(() => 'blob:preview')
  URL.revokeObjectURL = vi.fn()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('DailyReport from the field (no office props)', () => {
  it('submits as Field and tells the foreman it goes to the office', async () => {
    renderReport()
    expect(await screen.findByText('This will be sent to the office')).toBeInTheDocument()
    expect(screen.queryByText(/Entered by office/)).not.toBeInTheDocument()

    await submit()

    await waitFor(() => expect(mocks.db.submitDailyReport).toHaveBeenCalledWith('proj-1', 'Field'))
    expect(toastMessages()).toEqual(['Daily report submitted!'])
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('uploads photos under the project company and saves their paths', async () => {
    const { container } = renderReport()
    await screen.findByText('Submit Report')
    await addPhotos(container, 2)

    await submit()

    await waitFor(() => expect(mocks.db.submitDailyReport).toHaveBeenCalled())
    expect(mocks.db.uploadPhoto).toHaveBeenCalledTimes(2)
    for (const call of mocks.db.uploadPhoto.mock.calls) {
      expect(call[0]).toBe('project-company')
      expect(call[1]).toBe('proj-1')
      expect(call[2]).toMatch(/^dr-/)
    }
    const saved = mocks.db.saveDailyReport.mock.calls[0][1]
    expect(saved.photos).toHaveLength(2)
    expect(toastMessages()).toEqual(['Daily report submitted!'])
  })

  it('stops and says so when every photo fails to upload', async () => {
    mocks.db.uploadPhoto.mockRejectedValue(new Error('storage offline'))
    const { container } = renderReport()
    await screen.findByText('Submit Report')
    await addPhotos(container, 2)

    await submit()

    await waitFor(() => expect(toastMessages()).toContain('Photo upload failed: storage offline'))
    expect(mocks.db.saveDailyReport).not.toHaveBeenCalled()
    expect(mocks.db.submitDailyReport).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('reports a partial upload failure after submitting', async () => {
    mocks.db.uploadPhoto
      .mockImplementationOnce(async () => 'project-company/proj-1/dr-1/photo-1.jpg')
      .mockRejectedValueOnce(new Error('timeout'))
    const { container } = renderReport()
    await screen.findByText('Submit Report')
    await addPhotos(container, 2)

    await submit()

    await waitFor(() => expect(mocks.db.submitDailyReport).toHaveBeenCalledWith('proj-1', 'Field'))
    expect(mocks.db.saveDailyReport.mock.calls[0][1].photos).toEqual(['project-company/proj-1/dr-1/photo-1.jpg'])
    expect(toastMessages()).toEqual(['Report submitted, but 1 photo failed to upload'])
  })
})

describe('DailyReport entered by the office', () => {
  const officeProps = { companyId: 'office-company', submittedBy: 'Dana Lee', enteredByOffice: true }

  it('records the office user as the submitter', async () => {
    renderReport(officeProps)

    await submit()

    await waitFor(() => expect(mocks.db.submitDailyReport).toHaveBeenCalledWith('proj-1', 'Dana Lee'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('says the report is saved to the project and marks it as entered by office', async () => {
    renderReport(officeProps)

    expect(await screen.findByText('This will be saved to the project')).toBeInTheDocument()
    expect(screen.getByText('Entered by office as Dana Lee')).toBeInTheDocument()
    expect(screen.queryByText('This will be sent to the office')).not.toBeInTheDocument()
  })

  it('uploads photos under the companyId prop', async () => {
    const { container } = renderReport(officeProps)
    await screen.findByText('Submit Report')
    await addPhotos(container, 1)

    await submit()

    await waitFor(() => expect(mocks.db.submitDailyReport).toHaveBeenCalled())
    expect(mocks.db.uploadPhoto).toHaveBeenCalledTimes(1)
    expect(mocks.db.uploadPhoto).toHaveBeenCalledWith('office-company', 'proj-1', expect.stringMatching(/^dr-/), expect.any(File))
    expect(mocks.db.saveDailyReport.mock.calls[0][1].photos).toHaveLength(1)
  })

  it('uploads with the companyId prop when the project row has no company_id', async () => {
    const { container } = renderReport({ ...officeProps, project: { id: 'proj-1', name: 'Sunrise Apartments' } })
    await screen.findByText('Submit Report')
    await addPhotos(container, 1)

    await submit()

    await waitFor(() => expect(mocks.db.submitDailyReport).toHaveBeenCalled())
    expect(mocks.db.uploadPhoto.mock.calls[0][0]).toBe('office-company')
    expect(toastMessages()).toEqual(['Daily report submitted!'])
  })

  it('falls back to Office, not Field, when no name is passed', async () => {
    renderReport({ companyId: 'office-company', submittedBy: '', enteredByOffice: true })
    expect(await screen.findByText('Entered by office')).toBeInTheDocument()

    await submit()

    await waitFor(() => expect(mocks.db.submitDailyReport).toHaveBeenCalledWith('proj-1', 'Office'))
  })

  it('tells the user when photos could not be uploaded for lack of a company', async () => {
    const { container } = renderReport({
      submittedBy: 'Dana Lee',
      enteredByOffice: true,
      project: { id: 'proj-1', name: 'Sunrise Apartments' }
    })
    await screen.findByText('Submit Report')
    await addPhotos(container, 2)

    await submit()

    await waitFor(() => expect(mocks.db.submitDailyReport).toHaveBeenCalledWith('proj-1', 'Dana Lee'))
    expect(mocks.db.uploadPhoto).not.toHaveBeenCalled()
    expect(mocks.db.saveDailyReport.mock.calls[0][1].photos).toBeUndefined()
    expect(toastMessages()).toEqual(['Report submitted, but 2 photos failed to upload'])
  })
})
