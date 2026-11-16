import { describe, it, expect } from 'vitest'
import { FIELD_PROJECT_COLUMNS } from '../lib/db/projectOps'

// Every name in FIELD_PROJECT_COLUMNS ends up in a PostgREST SELECT. One
// column that does not exist in `public.projects` bounces the whole SELECT
// with 42703, and the field-session project fetch falls back to a stub
// project with no contract value, no labor rates and no job info. The
// SELECT used to be `*`; it was tightened by the data-protection stack on
// 2026-11-13 so a field session no longer receives `pin` / `pin_hash`.
//
// This test pins the list so a future edit has to update it explicitly,
// and a column that isn't backed by a migration gets caught before ship.

const columns = () => FIELD_PROJECT_COLUMNS.split(',').map(c => c.trim())

describe('FIELD_PROJECT_COLUMNS', () => {
  it('never exposes the project PIN or its hash to a field session', () => {
    const list = columns()
    expect(list).not.toContain('pin')
    expect(list).not.toContain('pin_hash')
  })

  it('does not include default_dump_site_id (no such column on projects)', () => {
    // Regression lock: b5ca382 shipped this name in the SELECT list.
    // PostgREST then rejected every field-session project fetch with
    // 42703 and the foreman landed on a stub project.
    expect(columns()).not.toContain('default_dump_site_id')
  })

  it('matches the frozen allow-list of columns backed by the schema', () => {
    // Adding a column here must be matched by a migration that creates
    // the column on `public.projects`. Removing a column here must be
    // matched by a check that no consumer of validateProjectPin relies
    // on it.
    expect(columns()).toEqual([
      'id',
      'company_id',
      'name',
      'location',
      'status',
      'created_at',
      'updated_at',
      'job_number',
      'address',
      'general_contractor',
      'contract_value',
      'laborer_rate',
      'operator_rate',
      'foreman_rate',
      'archived_at',
      'total_spent',
      'created_by',
      'work_type',
      'job_type',
      'client_contact',
      'client_phone',
      'start_date',
      'end_date',
      'planned_man_days',
      'storage_cleaned',
      'client_position',
      'client_email',
      'contractor_contact',
      'contractor_position',
      'contractor_phone',
      'contractor_email'
    ])
  })
})
