/**
 * Supabase table row types.
 *
 * Hand-written to match the tables in supabase/migrations. Fields that are
 * nullable in the database are typed `| null`; fields that older rows may
 * not have are optional. These types cover the service/data layer — React
 * components are still plain JSX and consume these shapes untyped for now.
 */

// ============================================
// Core entities
// ============================================

export interface ProjectRow {
  id: string
  company_id: string
  name: string
  status: 'active' | 'archived' | 'complete' | string
  contract_value: number
  job_number?: string | null
  work_type?: string | null
  job_type?: string | null
  general_contractor?: string | null
  start_date?: string | null // YYYY-MM-DD
  end_date?: string | null // YYYY-MM-DD
  planned_man_days?: number | null
  created_at: string
  updated_at?: string | null
}

export interface AreaRow {
  id: string
  project_id: string
  name: string
  /** Relative weight used for % progress when no scheduled value is set */
  weight: number | null
  /** Field status driven from the field app — 'done' means the area is complete */
  status?: 'not_started' | 'working' | 'done' | string
  /** SOV dollar value; when present, earned value is value-based */
  scheduled_value?: number | null
  group_name?: string | null
  created_at?: string
  updated_at?: string | null
}

export interface ChangeOrderRow {
  id: string
  project_id: string
  /** Total in cents (see change_orders.cor_total in migration 20241201000060) */
  cor_total: number | null
  status: 'draft' | 'pending_approval' | 'approved' | 'rejected' | 'billed' | 'closed' | string
  created_at?: string
  updated_at?: string | null
}

/** Detailed COR (change order request) used by the Sage export */
export interface ChangeOrderRequestRow {
  id: string
  project_id: string
  cor_number?: string | null
  title?: string | null
  status?: string | null
  /** Total in cents */
  cor_total?: number | null
  approved_at?: string | null
  cost_code_id?: string | null
}

export interface ChangeOrderLineItemRow {
  description?: string | null
  /** Line total in cents */
  total?: number | string | null
}

// ============================================
// Time & material
// ============================================

export interface TMTicketRow {
  id: string
  project_id: string
  work_date?: string | null // YYYY-MM-DD
  notes?: string | null
  status: 'pending' | 'approved' | 'rejected' | string
  cost_code_id?: string | null
  created_at?: string
}

export interface TMWorkerRow {
  name: string | null
  classification: string | null
  hours: number | string | null
  overtime_hours: number | string | null
  rate: number | string | null
}

export interface TMItemRow {
  description: string | null
  quantity: number | string | null
  materials_equipment?: MaterialsEquipmentRow | null
}

export interface MaterialsEquipmentRow {
  name: string | null
  cost_per_unit: number | null
}

// ============================================
// Field data
// ============================================

export interface CrewCheckinRow {
  project_id: string
  worker_count: number | null
  check_in_date: string // YYYY-MM-DD
  created_at?: string
}

export interface CostCodeRow {
  id: string
  company_id: string
  code: string
  description: string | null
  category: 'labor' | 'material' | 'equipment' | 'subcontractor' | 'other' | string | null
  parent_code?: string | null
  is_active?: boolean
}

// ============================================
// Auth-adjacent tables (users, companies, memberships)
// ============================================

export interface UserRow {
  id: string
  email: string
  name?: string | null
  role?: string | null
  company_id?: string | null
  access_level?: 'office' | 'field' | 'admin' | string | null
  created_at?: string
}

export interface CompanyRow {
  id: string
  name: string
  created_at?: string
  [key: string]: unknown
}

export interface UserCompanyRow {
  user_id: string
  company_id: string
  role?: string | null
  status?: 'active' | 'pending' | string | null
  companies?: Pick<CompanyRow, 'id' | 'name'> | null
}
