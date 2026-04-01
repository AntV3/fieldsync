import {
  supabase,
  isSupabaseConfigured,
  getClient,
  sanitizeFormData,
  sanitize,
  PUNCH_LIST_ALLOWED_FIELDS
} from './client'

export const companyOps = {
  // ============================================
  // Companies
  // ============================================

  async getCompanyByCode(code) {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from('companies')
        .select('*')
        .ilike('code', code.trim())
        .single()
      if (error) {
        console.error('[Company Lookup] Error:', {
          message: error.message,
          code: error.code,
          details: error.details,
          hint: error.hint
        })
        return null
      }
      return data
    }
    return null
  },

  async getCompany(id) {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from('companies')
        .select('*')
        .eq('id', id)
        .single()
      if (error) throw error
      return data
    }
    return null
  },

  // Get all companies a user has ACTIVE access to
  async getUserCompanies(userId) {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from('user_companies')
        .select(`
          id,
          access_level,
          company_id,
          status,
          companies (
            id,
            name,
            code
          )
        `)
        .eq('user_id', userId)
        .eq('status', 'active')
        .order('created_at', { ascending: true })

      if (error) {
        console.error('Error fetching user companies:', error)
        return []
      }

      // Flatten the response
      return data.map(uc => ({
        id: uc.companies.id,
        name: uc.companies.name,
        code: uc.companies.code,
        access_level: uc.access_level
      }))
    }
    return []
  },

  // Get count of pending memberships for a user
  async getUserPendingMemberships(userId) {
    if (isSupabaseConfigured) {
      const { count, error } = await supabase
        .from('user_companies')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('status', 'pending')

      if (error) {
        console.error('Error fetching pending memberships:', error)
        return 0
      }
      return count || 0
    }
    return 0
  },

  // Get all memberships for a company (for admin view)
  async getCompanyMemberships(companyId) {
    if (isSupabaseConfigured) {
      // Try with company_role column first
      let { data, error } = await supabase
        .from('user_companies')
        .select(`
          id,
          access_level,
          company_role,
          status,
          created_at,
          approved_at,
          approved_by,
          removed_at,
          removed_by,
          users!user_companies_user_id_fkey (
            id,
            name,
            email
          )
        `)
        .eq('company_id', companyId)
        .order('created_at', { ascending: false })

      // If query fails (e.g., company_role column doesn't exist), retry without it
      if (error) {
        console.warn('Membership query failed, retrying without company_role:', error.message)
        const retry = await supabase
          .from('user_companies')
          .select(`
            id,
            access_level,
            status,
            created_at,
            approved_at,
            approved_by,
            removed_at,
            removed_by,
            users!user_companies_user_id_fkey (
              id,
              name,
              email
            )
          `)
          .eq('company_id', companyId)
          .order('created_at', { ascending: false })

        if (retry.error) {
          console.error('Error fetching company memberships:', retry.error)
          return []
        }
        data = retry.data
      }
      return data || []
    }
    return []
  },

  // Approve a pending membership
  async approveMembership(membershipId, approvedBy) {
    if (isSupabaseConfigured) {
      const { error } = await supabase
        .from('user_companies')
        .update({
          status: 'active',
          approved_at: new Date().toISOString(),
          approved_by: approvedBy
        })
        .eq('id', membershipId)

      if (error) throw error
    }
  },

  // Approve a pending membership with access level assignment (uses RPC for security)
  async approveMembershipWithRole(membershipId, approvedBy, accessLevel = 'member') {
    if (isSupabaseConfigured) {
      // Map frontend access_level to role used in RLS policies
      // RLS checks role IN ('admin', 'owner') so these must stay in sync
      const roleForRLS = accessLevel === 'administrator' ? 'admin' : 'member'

      // Try RPC function first (preferred - has server-side validation)
      const { error: rpcError } = await supabase.rpc('approve_membership_with_role', {
        membership_id: membershipId,
        approved_by_user: approvedBy,
        new_role: roleForRLS
      })

      if (rpcError) {
        // Fallback to direct update if RPC function is not available
        console.warn('RPC approve failed, using direct update:', rpcError.message)
        const { error: updateError } = await supabase
          .from('user_companies')
          .update({
            status: 'active',
            role: roleForRLS,
            access_level: accessLevel,
            approved_at: new Date().toISOString(),
            approved_by: approvedBy
          })
          .eq('id', membershipId)
          .eq('status', 'pending')

        if (updateError) throw updateError
      } else {
        // RPC succeeded (updates status, role, approved_at, approved_by)
        // Also set access_level which the RPC doesn't handle
        const { error: alError } = await supabase
          .from('user_companies')
          .update({ access_level: accessLevel })
          .eq('id', membershipId)

        if (alError) {
          console.warn('Could not set access_level after RPC approval:', alError.message)
        }
      }
    }
  },

  // Reject a pending membership (hard delete)
  async rejectMembership(membershipId) {
    if (isSupabaseConfigured) {
      const { error } = await supabase
        .from('user_companies')
        .delete()
        .eq('id', membershipId)

      if (error) throw error
    }
  },

  // Remove an active member (soft delete)
  async removeMember(membershipId, removedBy) {
    if (isSupabaseConfigured) {
      const { error } = await supabase
        .from('user_companies')
        .update({
          status: 'removed',
          removed_at: new Date().toISOString(),
          removed_by: removedBy
        })
        .eq('id', membershipId)

      if (error) throw error
    }
  },

  // ============================================
  // Invitations
  // ============================================

  async createInvitation(companyId, createdBy, {
    accessLevel = 'member',
    companyRole = null,
    invitedEmail = null,
    maxUses = 1,
    expiresInHours = 72
  } = {}) {
    if (!isSupabaseConfigured) return null

    const roleForRLS = accessLevel === 'administrator' ? 'admin' : 'member'
    const expiresAt = new Date(Date.now() + expiresInHours * 60 * 60 * 1000).toISOString()

    // Generate 16-char alphanumeric token
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
    const bytes = crypto.getRandomValues(new Uint8Array(16))
    const token = Array.from(bytes).map(b => chars[b % chars.length]).join('')

    const { data, error } = await supabase
      .from('company_invitations')
      .insert({
        company_id: companyId,
        invite_token: token,
        created_by: createdBy,
        invited_role: roleForRLS,
        invited_access_level: accessLevel,
        invited_company_role: companyRole || null,
        invited_email: invitedEmail?.toLowerCase()?.trim() || null,
        max_uses: maxUses,
        expires_at: expiresAt
      })
      .select()
      .single()

    if (error) throw error
    return data
  },

  async getCompanyInvitations(companyId) {
    if (!isSupabaseConfigured) return []

    const { data, error } = await supabase
      .from('company_invitations')
      .select(`
        *,
        creator:users!company_invitations_created_by_fkey(name, email)
      `)
      .eq('company_id', companyId)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Error fetching invitations:', error)
      return []
    }
    return data || []
  },

  async getInvitationByToken(token) {
    if (!isSupabaseConfigured) return null

    const { data, error } = await supabase
      .from('company_invitations')
      .select('*, companies(id, name)')
      .eq('invite_token', token)
      .eq('status', 'active')
      .single()

    if (error) return null

    // Validate expiration and usage client-side too
    if (data.expires_at && new Date(data.expires_at) < new Date()) return null
    if (data.max_uses && data.use_count >= data.max_uses) return null

    return data
  },

  async acceptInvitation(token, userId) {
    if (!isSupabaseConfigured) return { success: false, error: 'Not configured' }

    const { data, error } = await supabase.rpc('accept_invitation', {
      p_invite_token: token,
      p_user_id: userId
    })

    if (error) throw error
    return data
  },

  async revokeInvitation(invitationId) {
    if (!isSupabaseConfigured) return

    const { error } = await supabase
      .from('company_invitations')
      .update({ status: 'revoked', updated_at: new Date().toISOString() })
      .eq('id', invitationId)

    if (error) throw error
  },

  // ============================================
  // Project Team Management
  // ============================================

  // Get all team members assigned to a project
  async getProjectTeam(projectId) {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from('project_users')
        .select(`
          id,
          project_role,
          assigned_at,
          notes,
          users!project_users_user_id_fkey (
            id,
            name,
            email
          )
        `)
        .eq('project_id', projectId)
        .order('assigned_at', { ascending: true })

      if (error) {
        console.error('Error fetching project team:', error)
        return []
      }
      return data || []
    }
    return []
  },

  // Get all company members (for adding to project)
  async getCompanyMembers(companyId) {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from('user_companies')
        .select(`
          id,
          access_level,
          users!user_companies_user_id_fkey (
            id,
            name,
            email
          )
        `)
        .eq('company_id', companyId)
        .eq('status', 'active')
        .order('created_at', { ascending: true })

      if (error) {
        console.error('Error fetching company members:', error)
        return []
      }
      return data || []
    }
    return []
  },

  // Add a user to a project with a role
  async addProjectMember(projectId, userId, projectRole, assignedBy) {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from('project_users')
        .insert({
          project_id: projectId,
          user_id: userId,
          project_role: projectRole,
          assigned_by: assignedBy
        })
        .select()
        .single()

      if (error) throw error
      return data
    }
    return null
  },

  // Update a project member's role
  async updateProjectMemberRole(projectId, userId, newRole) {
    if (isSupabaseConfigured) {
      const { error } = await supabase
        .from('project_users')
        .update({ project_role: newRole })
        .eq('project_id', projectId)
        .eq('user_id', userId)

      if (error) throw error
    }
  },

  // Remove a user from a project
  async removeProjectMember(projectId, userId) {
    if (isSupabaseConfigured) {
      const { error } = await supabase
        .from('project_users')
        .delete()
        .eq('project_id', projectId)
        .eq('user_id', userId)

      if (error) throw error
    }
  },

  // Update a member's access level (also syncs role column for RLS policies)
  async updateMemberAccessLevel(membershipId, newAccessLevel) {
    if (isSupabaseConfigured) {
      // Keep role column in sync with access_level for RLS policies
      const roleForRLS = newAccessLevel === 'administrator' ? 'admin' : 'member'
      const { error } = await supabase
        .from('user_companies')
        .update({ access_level: newAccessLevel, role: roleForRLS })
        .eq('id', membershipId)

      if (error) throw error
    }
  },

  // Update a member's company role (job title)
  async updateMemberCompanyRole(membershipId, newCompanyRole) {
    if (isSupabaseConfigured) {
      const { error } = await supabase
        .from('user_companies')
        .update({ company_role: newCompanyRole })
        .eq('id', membershipId)

      if (error) throw error
    }
  },

  // Repair legacy user - creates missing user_companies record
  // Called when user has company_id but no active memberships
  // Uses RPC function to bypass RLS restrictions
  async repairLegacyUser(userId, companyId, role = 'member') {
    if (!isSupabaseConfigured || !userId || !companyId) return false

    try {
      // Use RPC function which has SECURITY DEFINER to bypass RLS
      const { data, error } = await supabase.rpc('repair_legacy_user', {
        p_user_id: userId,
        p_company_id: companyId,
        p_role: role
      })

      if (error) {
        console.error('RPC repair_legacy_user failed:', error)
        return false
      }

      return data === true
    } catch (error) {
      console.error('Error repairing legacy user:', error)
      return false
    }
  },

  // Check if user is a legacy user (has company_id but no memberships)
  async isLegacyUser(userId) {
    if (!isSupabaseConfigured) return false

    try {
      // Get user's company_id
      const { data: user } = await supabase
        .from('users')
        .select('company_id, role')
        .eq('id', userId)
        .single()

      if (!user?.company_id) return false

      // Check if any user_companies records exist
      const { count } = await supabase
        .from('user_companies')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)

      // Legacy user if has company_id but no memberships
      return count === 0
    } catch (error) {
      console.error('Error checking legacy user:', error)
      return false
    }
  },

  // ============================================
  // Punch List
  // ============================================

  async getPunchListItems(projectId) {
    if (!isSupabaseConfigured) return []
    const client = getClient()
    const { data, error } = await client
      .from('punch_list_items')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })
    if (error) throw error
    return data || []
  },

  async createPunchListItem(item) {
    if (!isSupabaseConfigured) return null
    const client = getClient()
    // Sanitize text fields, then set photo_url separately with URL sanitizer
    const sanitized = sanitizeFormData({
      project_id: item.project_id,
      company_id: item.company_id,
      description: item.description,
      area_id: item.area_id || null,
      assigned_to: item.assigned_to || null,
      priority: item.priority,
      notes: item.notes || null,
      status: 'open'
    })
    sanitized.photo_url = item.photo_url ? sanitize.url(item.photo_url) : null
    const { data, error } = await client
      .from('punch_list_items')
      .insert(sanitized)
      .select()
      .single()
    if (error) throw error
    return data
  },

  async updatePunchListItem(itemId, updates) {
    if (!isSupabaseConfigured) return null
    // Whitelist allowed fields to prevent overwriting project_id, company_id, etc.
    const safeUpdates = {}
    let photoUrl = undefined
    for (const key of Object.keys(updates)) {
      if (!PUNCH_LIST_ALLOWED_FIELDS.has(key)) continue
      if (key === 'photo_url') {
        // Sanitize URL separately to avoid double-sanitization via sanitizeFormData
        photoUrl = updates[key] ? sanitize.url(updates[key]) : updates[key]
      } else {
        safeUpdates[key] = updates[key]
      }
    }
    const sanitized = sanitizeFormData({ ...safeUpdates, updated_at: new Date().toISOString() })
    if (photoUrl !== undefined) sanitized.photo_url = photoUrl
    const client = getClient()
    const { data, error } = await client
      .from('punch_list_items')
      .update(sanitized)
      .eq('id', itemId)
      .select()
      .single()
    if (error) throw error
    return data
  },

  async updatePunchListStatus(itemId, newStatus) {
    if (!isSupabaseConfigured) return null
    const VALID_STATUSES = ['open', 'in_progress', 'complete']
    if (!VALID_STATUSES.includes(newStatus)) throw new Error('Invalid punch list status')
    const client = getClient()
    const updates = {
      status: newStatus,
      updated_at: new Date().toISOString()
    }
    if (newStatus === 'complete') {
      updates.completed_at = new Date().toISOString()
    } else {
      updates.completed_at = null
    }
    const { error } = await client
      .from('punch_list_items')
      .update(updates)
      .eq('id', itemId)
    if (error) throw error
  },

  async deletePunchListItem(itemId, projectId) {
    if (!isSupabaseConfigured) return null
    if (!projectId) throw new Error('projectId is required for tenant-scoped delete')
    const client = getClient()
    const { error } = await client
      .from('punch_list_items')
      .delete()
      .eq('id', itemId)
      .eq('project_id', projectId)
    if (error) throw error
  }
}
