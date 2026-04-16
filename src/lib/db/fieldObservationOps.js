import { supabase, isSupabaseConfigured, observe, getClient } from './client'

export const fieldObservationOps = {
  async getFieldObservations(projectId, { startDate = null, endDate = null, limit = 500 } = {}) {
    if (!isSupabaseConfigured) return []
    const client = getClient()
    if (!client) return []

    const start = performance.now()
    try {
      let query = client
        .from('field_observations')
        .select('*')
        .eq('project_id', projectId)
        .order('observed_at', { ascending: false })
        .limit(limit)

      if (startDate) query = query.gte('observation_date', startDate)
      if (endDate) query = query.lte('observation_date', endDate)

      const { data, error } = await query
      observe.query('getFieldObservations', {
        duration: Math.round(performance.now() - start),
        rows: data?.length,
        project_id: projectId
      })
      if (error) throw error
      return data || []
    } catch (error) {
      observe.error('database', {
        message: error.message,
        operation: 'getFieldObservations',
        project_id: projectId
      })
      throw error
    }
  },

  async addFieldObservation(projectId, companyId, {
    description,
    location = null,
    photos = [],
    foremanName = null,
    userId = null,
    observedAt = null
  }) {
    if (!isSupabaseConfigured) return null
    const client = getClient()
    if (!client) throw new Error('Database client not available')

    const now = observedAt || new Date().toISOString()
    const observationDate = now.split('T')[0]

    const { data, error } = await client
      .from('field_observations')
      .insert({
        project_id: projectId,
        company_id: companyId,
        observed_at: now,
        observation_date: observationDate,
        description,
        location,
        photos: photos || [],
        foreman_name: foremanName,
        user_id: userId
      })
      .select()
      .single()

    if (error) {
      observe.error('database', {
        message: error.message,
        operation: 'addFieldObservation',
        project_id: projectId
      })
      throw error
    }
    return data
  },

  async updateFieldObservation(id, updates) {
    if (!isSupabaseConfigured) return null
    const client = getClient()
    if (!client) throw new Error('Database client not available')

    const { data, error } = await client
      .from('field_observations')
      .update(updates)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      observe.error('database', { message: error.message, operation: 'updateFieldObservation' })
      throw error
    }
    return data
  },

  async deleteFieldObservation(id) {
    if (!isSupabaseConfigured) return false
    const client = getClient()
    if (!client) throw new Error('Database client not available')

    const { error } = await client
      .from('field_observations')
      .delete()
      .eq('id', id)

    if (error) {
      observe.error('database', { message: error.message, operation: 'deleteFieldObservation' })
      throw error
    }
    return true
  },

  subscribeToFieldObservations(projectId, callback) {
    if (!isSupabaseConfigured) return null
    return supabase
      .channel(`field_observations:${projectId}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'field_observations', filter: `project_id=eq.${projectId}` },
        callback
      )
      .subscribe()
  }
}
