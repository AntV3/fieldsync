import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import LiveFieldFeed from '../components/dashboard/LiveFieldFeed'

describe('LiveFieldFeed', () => {
  it('does not leak the raw created_by UUID on crew check-in rows', () => {
    // crew_checkins.created_by is an auth user id (UUID); it must not be
    // rendered verbatim as the "who" name.
    const uuid = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
    const projectData = {
      crewCheckins: [
        {
          id: 'chk-1',
          check_in_date: '2026-01-02',
          created_at: '2026-01-02T15:00:00Z',
          created_by: uuid,
          workers: [{ name: 'A' }, { name: 'B' }]
        }
      ]
    }
    render(<LiveFieldFeed projectData={projectData} onSetActiveTab={() => {}} />)

    expect(screen.queryByText(uuid)).toBeNull()
    expect(screen.getByText('2 workers on site')).toBeInTheDocument()
    expect(screen.getByText(/checked in crew/)).toBeInTheDocument()
  })

  it('shows real injury_reports fields on safety rows (not always the fallback)', () => {
    // Prior code read ir.reported_by / ir.description / ir.injury_description,
    // none of which exist on the injury_reports table. The row silently
    // collapsed to "Field crew reported an incident — Safety incident".
    const projectData = {
      injuryReports: [
        {
          id: 'inj-1',
          created_at: '2026-01-02T18:00:00Z',
          incident_date: '2026-01-02',
          reported_by_name: 'Jane Foreman',
          employee_name: 'John Doe',
          incident_description: 'Slipped on wet decking near lift 3',
          injury_type: 'minor'
        }
      ]
    }
    render(<LiveFieldFeed projectData={projectData} onSetActiveTab={() => {}} />)

    expect(screen.getByText('Jane Foreman')).toBeInTheDocument()
    expect(screen.getByText(/Slipped on wet decking near lift 3/)).toBeInTheDocument()
    expect(screen.queryByText(/^Safety incident$/)).toBeNull()
  })
})
