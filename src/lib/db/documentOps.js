/**
 * Documents domain – folders, CRUD, linking, approval, search & audit logging.
 */
import { getClient, observe, validate, escapePostgrestFilter } from './client'

export const documentOps = {
  // ---- FOLDERS ----

  /**
   * Create a new folder in a project
   */
  async createFolder(companyId, projectId, folderData) {
    const client = getClient()

    const { data, error } = await client
      .from('document_folders')
      .insert({
        company_id: companyId,
        project_id: projectId,
        name: folderData.name,
        description: folderData.description || null,
        icon: folderData.icon || 'folder',
        color: folderData.color || 'blue',
        sort_order: folderData.sort_order || 0,
        created_by: (await client.auth.getUser()).data.user?.id
      })
      .select()
      .single()

    if (error) throw error
    return data
  },

  /**
   * Get all folders for a project
   */
  async getProjectFolders(projectId) {
    const client = getClient()

    const { data, error } = await client
      .from('document_folders')
      .select('*')
      .eq('project_id', projectId)
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true })

    if (error) throw error

    // Get document counts for all folders in a single query instead of N individual count queries
    if (data.length > 0) {
      const { data: docs } = await client
        .from('documents')
        .select('folder_id')
        .eq('project_id', projectId)
        .is('archived_at', null)
        .eq('is_current', true)
        .not('folder_id', 'is', null)

      // Count documents per folder client-side
      const countMap = {}
      if (docs) {
        for (const doc of docs) {
          countMap[doc.folder_id] = (countMap[doc.folder_id] || 0) + 1
        }
      }
      data.forEach(folder => {
        folder.document_count = countMap[folder.id] || 0
      })
    }

    return data
  },

  /**
   * Update a folder
   */
  async updateFolder(folderId, updates) {
    const client = getClient()

    const { data, error } = await client
      .from('document_folders')
      .update({
        ...updates,
        updated_at: new Date().toISOString()
      })
      .eq('id', folderId)
      .select()
      .single()

    if (error) throw error
    return data
  },

  /**
   * Delete a folder (moves documents to unfiled)
   */
  async deleteFolder(folderId) {
    const client = getClient()

    // First, unassign all documents from this folder
    await client
      .from('documents')
      .update({ folder_id: null })
      .eq('folder_id', folderId)

    // Then delete the folder
    const { error } = await client
      .from('document_folders')
      .delete()
      .eq('id', folderId)

    if (error) throw error
    return true
  },

  /**
   * Reorder folders
   */
  async reorderFolders(projectId, folderOrder) {
    const client = getClient()

    // folderOrder is array of { id, sort_order }
    const updates = folderOrder.map(({ id, sort_order }) =>
      client
        .from('document_folders')
        .update({ sort_order, updated_at: new Date().toISOString() })
        .eq('id', id)
        .eq('project_id', projectId)
    )

    await Promise.all(updates)
    return true
  },

  /**
   * Get documents in a specific folder
   */
  async getFolderDocuments(folderId, options = {}) {
    const client = getClient()
    const { page = 0, limit = 25 } = options

    let query = client
      .from('documents')
      .select('id,name,file_name,file_size_bytes,mime_type,storage_path,category,visibility,approval_status,version,uploaded_at', { count: 'exact' })
      .eq('folder_id', folderId)
      .is('archived_at', null)
      .eq('is_current', true)
      .order('uploaded_at', { ascending: false })
      .range(page * limit, (page + 1) * limit - 1)

    const { data, error, count } = await query

    if (error) throw error

    return {
      documents: data || [],
      totalCount: count || 0,
      hasMore: (count || 0) > (page + 1) * limit
    }
  },

  /**
   * Move document to folder
   */
  async moveDocumentToFolder(documentId, folderId) {
    const client = getClient()

    const { data, error } = await client
      .from('documents')
      .update({ folder_id: folderId })
      .eq('id', documentId)
      .select()
      .single()

    if (error) throw error
    return data
  },

  /**
   * Get unfiled documents (no folder assigned)
   */
  async getUnfiledDocuments(projectId, options = {}) {
    const client = getClient()
    const { page = 0, limit = 25 } = options

    const { data, error, count } = await client
      .from('documents')
      .select('id,name,file_name,file_size_bytes,mime_type,storage_path,category,visibility,approval_status,version,uploaded_at', { count: 'exact' })
      .eq('project_id', projectId)
      .is('folder_id', null)
      .is('archived_at', null)
      .eq('is_current', true)
      .order('uploaded_at', { ascending: false })
      .range(page * limit, (page + 1) * limit - 1)

    if (error) throw error

    return {
      documents: data || [],
      totalCount: count || 0,
      hasMore: (count || 0) > (page + 1) * limit
    }
  },

  // ---- DOCUMENT CRUD ----

  /**
   * Upload a document to project storage
   */
  async uploadDocument(companyId, projectId, file, metadata = {}) {
    const client = getClient()
    const startTime = Date.now()

    // Check project storage limit (250 MB default)
    const STORAGE_LIMIT = 250 * 1024 * 1024 // 250 MB
    const { data: usageData } = await client
      .rpc('get_project_storage_bytes', { p_project_id: projectId })
      .maybeSingle()
    // Fallback: if RPC not available, use a lightweight sum query
    let currentUsage = usageData?.total_bytes ?? null
    if (currentUsage === null) {
      const { data: sizeRows } = await client
        .from('documents')
        .select('file_size_bytes')
        .eq('project_id', projectId)
        .is('archived_at', null)
      currentUsage = sizeRows?.reduce((sum, doc) => sum + (doc.file_size_bytes || 0), 0) || 0
    }
    if (currentUsage + file.size > STORAGE_LIMIT) {
      const usedMB = Math.round(currentUsage / 1024 / 1024)
      const limitMB = Math.round(STORAGE_LIMIT / 1024 / 1024)
      throw new Error(`Project storage limit reached (${usedMB}/${limitMB} MB). Contact support to upgrade.`)
    }

    // Generate secure filename
    const timestamp = Date.now()
    const randomBytes = new Uint8Array(6)
    crypto.getRandomValues(randomBytes)
    const randomId = Array.from(randomBytes, b => b.toString(36)).join('')
    const ext = file.name.split('.').pop()?.toLowerCase() || 'bin'
    const fileName = `${timestamp}-${randomId}.${ext}`
    const storagePath = `${companyId}/${projectId}/documents/${fileName}`

    try {
      // Get user ID and start upload in parallel for faster execution
      const [userResult, storageResult] = await Promise.all([
        client.auth.getUser(),
        client.storage
          .from('project-documents')
          .upload(storagePath, file, {
            cacheControl: '3600',
            upsert: false
          })
      ])

      if (storageResult.error) throw storageResult.error

      // Get public URL (synchronous, no network call)
      const { data: urlData } = client.storage
        .from('project-documents')
        .getPublicUrl(storagePath)

      const uploadedUrl = urlData.publicUrl

      // Determine approval status (contracts need approval)
      const approvalStatus = metadata.category === 'contracts' ? 'pending' : 'approved'

      // Create document record
      const { data: document, error: docError } = await client
        .from('documents')
        .insert({
          company_id: companyId,
          project_id: projectId,
          name: metadata.name || file.name.replace(/\.[^/.]+$/, ''),
          description: metadata.description || null,
          file_name: file.name,
          file_size_bytes: file.size,
          mime_type: file.type,
          storage_path: storagePath,
          folder_id: metadata.folderId || null,
          category: metadata.category || 'general',
          tags: metadata.tags || [],
          visibility: metadata.visibility || 'all',
          approval_status: approvalStatus,
          resource_type: metadata.resourceType || null,
          resource_id: metadata.resourceId || null,
          uploaded_by: userResult.data?.user?.id
        })
        .select()
        .single()

      if (docError) throw docError

      const duration = Date.now() - startTime
      observe.storage('document_upload', {
        company_id: companyId,
        project_id: projectId,
        file_size: file.size,
        mime_type: file.type,
        duration,
        success: true
      })

      return { ...document, url: uploadedUrl }
    } catch (error) {
      observe.error('storage', {
        message: error.message,
        operation: 'uploadDocument',
        company_id: companyId,
        project_id: projectId
      })
      throw error
    }
  },

  /**
   * Get documents for a project
   */
  async getProjectDocuments(projectId, { category = null, page = 0, limit = 25, includeArchived = false } = {}) {
    const client = getClient()

    let query = client
      .from('documents')
      .select('id,name,file_name,file_size_bytes,mime_type,storage_path,folder_id,category,visibility,approval_status,version,uploaded_at,uploaded_by', { count: 'exact' })
      .eq('project_id', projectId)
      .eq('is_current', true)
      .order('uploaded_at', { ascending: false })
      .range(page * limit, (page + 1) * limit - 1)

    if (!includeArchived) {
      query = query.is('archived_at', null)
    }

    if (category && category !== 'all') {
      query = query.eq('category', category)
    }

    const { data, error, count } = await query

    if (error) throw error

    return {
      documents: data || [],
      totalCount: count || 0,
      hasMore: (page + 1) * limit < (count || 0),
      page,
      limit
    }
  },

  /**
   * Get a single document by ID
   */
  async getDocument(documentId) {
    const client = getClient()

    const { data, error } = await client
      .from('documents')
      .select('*')
      .eq('id', documentId)
      .single()

    if (error) throw error
    return data
  },

  /**
   * Get all versions of a document
   */
  async getDocumentVersions(documentId) {
    const client = getClient()

    // First get the document to find parent or self
    const { data: doc, error: docError } = await client
      .from('documents')
      .select('id, parent_document_id')
      .eq('id', documentId)
      .single()

    if (docError) throw docError

    // Get all versions (parent + all children with same parent)
    const parentId = doc.parent_document_id || documentId
    if (!validate.uuid(parentId)) throw new Error('Invalid document ID')

    const { data, error } = await client
      .from('documents')
      .select('*')
      .or(`id.eq.${parentId},parent_document_id.eq.${parentId}`)
      .order('version', { ascending: false })

    if (error) throw error
    return data || []
  },

  /**
   * Upload a new version of an existing document
   */
  async uploadDocumentVersion(parentDocumentId, companyId, projectId, file, metadata = {}) {
    if (!validate.uuid(parentDocumentId)) throw new Error('Invalid document ID')
    const client = getClient()

    // Get the parent document to copy metadata and determine version
    const { data: parentDoc, error: parentError } = await client
      .from('documents')
      .select('*')
      .eq('id', parentDocumentId)
      .single()

    if (parentError) throw parentError

    // Get highest version number
    const { data: versions } = await client
      .from('documents')
      .select('version')
      .or(`id.eq.${parentDocumentId},parent_document_id.eq.${parentDocumentId}`)
      .order('version', { ascending: false })
      .limit(1)

    const newVersion = (versions?.[0]?.version || 1) + 1

    // Mark all previous versions as not current
    await client
      .from('documents')
      .update({ is_current: false })
      .or(`id.eq.${parentDocumentId},parent_document_id.eq.${parentDocumentId}`)

    // Upload the new version
    const result = await this.uploadDocument(companyId, projectId, file, {
      name: metadata.name || parentDoc.name,
      description: metadata.description || parentDoc.description,
      category: parentDoc.category,
      visibility: parentDoc.visibility,
      tags: parentDoc.tags,
      resourceType: parentDoc.resource_type,
      resourceId: parentDoc.resource_id
    })

    // Update the new document with version info
    const { data: updatedDoc, error: updateError } = await client
      .from('documents')
      .update({
        version: newVersion,
        is_current: true,
        parent_document_id: parentDocumentId
      })
      .eq('id', result.id)
      .select()
      .single()

    if (updateError) throw updateError

    // Log version creation
    await client.from('document_audit_log').insert({
      document_id: result.id,
      project_id: projectId,
      company_id: companyId,
      operation: 'version_created',
      details: { version: newVersion, parent_id: parentDocumentId },
      triggered_by: 'user',
      user_id: (await client.auth.getUser()).data?.user?.id
    })

    return { ...result, ...updatedDoc }
  },

  /**
   * Update document metadata
   */
  async updateDocument(documentId, updates) {
    const client = getClient()

    const { data, error } = await client
      .from('documents')
      .update({
        name: updates.name,
        description: updates.description,
        category: updates.category,
        visibility: updates.visibility,
        tags: updates.tags
      })
      .eq('id', documentId)
      .select()
      .single()

    if (error) throw error
    return data
  },

  /**
   * Archive (soft delete) a document
   */
  async archiveDocument(documentId) {
    const client = getClient()
    const userId = (await client.auth.getUser()).data?.user?.id

    const { data, error } = await client
      .from('documents')
      .update({
        archived_at: new Date().toISOString(),
        archived_by: userId
      })
      .eq('id', documentId)
      .select()
      .single()

    if (error) throw error

    // Log the deletion
    await client.from('document_audit_log').insert({
      document_id: documentId,
      project_id: data.project_id,
      company_id: data.company_id,
      operation: 'deleted',
      triggered_by: 'user',
      user_id: userId
    })

    return data
  },

  /**
   * Restore an archived document
   */
  async restoreDocument(documentId) {
    const client = getClient()
    const userId = (await client.auth.getUser()).data?.user?.id

    const { data, error } = await client
      .from('documents')
      .update({
        archived_at: null,
        archived_by: null
      })
      .eq('id', documentId)
      .select()
      .single()

    if (error) throw error

    // Log the restoration
    await client.from('document_audit_log').insert({
      document_id: documentId,
      project_id: data.project_id,
      company_id: data.company_id,
      operation: 'restored',
      triggered_by: 'user',
      user_id: userId
    })

    return data
  },

  /**
   * Permanently delete a document (admin only)
   */
  async deleteDocumentPermanently(documentId) {
    const client = getClient()

    // Get document to find storage path
    const { data: doc, error: docError } = await client
      .from('documents')
      .select('storage_path, company_id, project_id')
      .eq('id', documentId)
      .single()

    if (docError) throw docError

    // Delete from storage
    if (doc.storage_path) {
      await client.storage
        .from('project-documents')
        .remove([doc.storage_path])
    }

    // Delete from database
    const { error } = await client
      .from('documents')
      .delete()
      .eq('id', documentId)

    if (error) throw error
    return true
  },

  // ---- LINKING ----

  /**
   * Link a document to a resource (COR, T&M ticket, etc.)
   */
  async linkDocumentToResource(documentId, resourceType, resourceId) {
    const client = getClient()

    const { data, error } = await client
      .from('documents')
      .update({
        resource_type: resourceType,
        resource_id: resourceId
      })
      .eq('id', documentId)
      .select()
      .single()

    if (error) throw error

    // Log the link
    await client.from('document_audit_log').insert({
      document_id: documentId,
      project_id: data.project_id,
      company_id: data.company_id,
      operation: 'linked',
      details: { resource_type: resourceType, resource_id: resourceId },
      triggered_by: 'user',
      user_id: (await client.auth.getUser()).data?.user?.id
    })

    return data
  },

  /**
   * Unlink a document from a resource
   */
  async unlinkDocumentFromResource(documentId) {
    const client = getClient()

    const { data: doc } = await client
      .from('documents')
      .select('resource_type, resource_id, project_id, company_id')
      .eq('id', documentId)
      .single()

    const { data, error } = await client
      .from('documents')
      .update({
        resource_type: null,
        resource_id: null
      })
      .eq('id', documentId)
      .select()
      .single()

    if (error) throw error

    // Log the unlink
    await client.from('document_audit_log').insert({
      document_id: documentId,
      project_id: doc.project_id,
      company_id: doc.company_id,
      operation: 'unlinked',
      details: { resource_type: doc.resource_type, resource_id: doc.resource_id },
      triggered_by: 'user',
      user_id: (await client.auth.getUser()).data?.user?.id
    })

    return data
  },

  /**
   * Get documents linked to a specific resource
   */
  async getResourceDocuments(resourceType, resourceId) {
    const client = getClient()

    const { data, error } = await client
      .from('documents')
      .select('*')
      .eq('resource_type', resourceType)
      .eq('resource_id', resourceId)
      .is('archived_at', null)
      .order('uploaded_at', { ascending: false })

    if (error) throw error
    return data || []
  },

  // ---- APPROVAL ----

  /**
   * Approve a document (admin only)
   */
  async approveDocument(documentId) {
    const client = getClient()

    const { data, error } = await client.rpc('approve_document', {
      p_document_id: documentId
    })

    if (error) throw error
    return data
  },

  /**
   * Reject a document (admin only)
   */
  async rejectDocument(documentId, reason) {
    const client = getClient()

    const { data, error } = await client.rpc('reject_document', {
      p_document_id: documentId,
      p_reason: reason
    })

    if (error) throw error
    return data
  },

  /**
   * Get pending documents for approval
   */
  async getPendingDocuments(companyId) {
    const client = getClient()

    const { data, error } = await client
      .from('documents')
      .select('*, project:projects(name)')
      .eq('company_id', companyId)
      .eq('approval_status', 'pending')
      .is('archived_at', null)
      .order('uploaded_at', { ascending: false })

    if (error) throw error
    return data || []
  },

  // ---- SEARCH & LOGGING ----

  /**
   * Search documents by name/description
   */
  async searchDocuments(projectId, query) {
    const client = getClient()

    const { data, error } = await client
      .from('documents')
      .select('id,name,file_name,file_size_bytes,mime_type,storage_path,category,visibility,approval_status,version,uploaded_at')
      .eq('project_id', projectId)
      .eq('is_current', true)
      .is('archived_at', null)
      .or(`name.ilike.%${escapePostgrestFilter(query)}%,description.ilike.%${escapePostgrestFilter(query)}%`)
      .order('uploaded_at', { ascending: false })
      .limit(20)

    if (error) throw error
    return data || []
  },

  /**
   * Log document download/view
   */
  async logDocumentAccess(documentId, operation = 'downloaded') {
    const client = getClient()

    const { data: doc } = await client
      .from('documents')
      .select('project_id, company_id')
      .eq('id', documentId)
      .single()

    if (!doc) return

    await client.from('document_audit_log').insert({
      document_id: documentId,
      project_id: doc.project_id,
      company_id: doc.company_id,
      operation,
      triggered_by: 'user',
      user_id: (await client.auth.getUser()).data?.user?.id
    })
  }
}
