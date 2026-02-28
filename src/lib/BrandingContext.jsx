/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react'
import { supabase, isSupabaseConfigured } from './supabase'
import { observe } from './observability'

const BrandingContext = createContext()

// Default branding
const DEFAULT_BRANDING = {
  logo_url: null,
  favicon_url: null,
  login_background_url: null,
  primary_color: '#3B82F6',
  secondary_color: '#1E40AF',
  custom_app_name: 'FieldSync',
  hide_fieldsync_branding: false,
  email_from_name: 'FieldSync',
  email_from_address: null,
  custom_domain: null,
  domain_verified: false
}

export function BrandingProvider({ children, companyId }) {
  const [branding, setBranding] = useState(DEFAULT_BRANDING)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (companyId) {
      loadBranding(companyId)
    } else {
      // Check if we're on a custom domain
      loadBrandingByDomain()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId])

  // Apply branding as CSS variables when branding changes
  useEffect(() => {
    applyBrandingToDOM(branding)
  }, [branding])

  const loadBranding = async (companyId) => {
    try {
      setLoading(true)

      if (!isSupabaseConfigured) {
        // Demo mode - use default branding
        setBranding(DEFAULT_BRANDING)
        setLoading(false)
        return
      }

      const { data, error } = await supabase
        .from('company_branding')
        .select('*')
        .eq('company_id', companyId)
        .single()

      if (error) {
        // If no branding exists, create default one
        if (error.code === 'PGRST116') {
          await createDefaultBranding(companyId)
        } else {
          observe.error('database', { message: error?.message, operation: 'loadBranding' })
        }
        setBranding(DEFAULT_BRANDING)
      } else {
        setBranding({ ...DEFAULT_BRANDING, ...data })
      }
    } catch (error) {
      observe.error('database', { message: error?.message, operation: 'loadBranding' })
      setBranding(DEFAULT_BRANDING)
    } finally {
      setLoading(false)
    }
  }

  const loadBrandingByDomain = async () => {
    try {
      setLoading(true)
      const currentDomain = window.location.hostname

      // Skip for localhost
      if (currentDomain === 'localhost' || currentDomain === '127.0.0.1') {
        setBranding(DEFAULT_BRANDING)
        setLoading(false)
        return
      }

      if (!isSupabaseConfigured) {
        setBranding(DEFAULT_BRANDING)
        setLoading(false)
        return
      }

      const { data, error } = await supabase
        .rpc('get_branding_by_domain', { domain_name: currentDomain })

      if (error || !data || data.length === 0) {
        setBranding(DEFAULT_BRANDING)
      } else {
        setBranding({ ...DEFAULT_BRANDING, ...data[0] })
      }
    } catch (error) {
      observe.error('database', { message: error?.message, operation: 'loadBrandingByDomain' })
      setBranding(DEFAULT_BRANDING)
    } finally {
      setLoading(false)
    }
  }

  const createDefaultBranding = async (companyId) => {
    try {
      const { data: _data, error } = await supabase
        .from('company_branding')
        .insert({
          company_id: companyId,
          ...DEFAULT_BRANDING
        })
        .select()
        .single()

      if (error) {
        observe.error('database', { message: error?.message, operation: 'createDefaultBranding' })
      }
    } catch (error) {
      observe.error('database', { message: error?.message, operation: 'createDefaultBranding' })
    }
  }

  const updateBranding = useCallback(async (updates) => {
    try {
      if (!isSupabaseConfigured) {
        // Demo mode - just update state
        setBranding(prev => ({ ...prev, ...updates }))
        return { success: true }
      }

      if (!companyId) {
        return { success: false, error: 'No company ID' }
      }

      // Clean the updates object - remove id, company_id and any undefined values
      const cleanedUpdates = {}
      const allowedFields = [
        'logo_url', 'favicon_url', 'login_background_url',
        'primary_color', 'secondary_color', 'custom_app_name',
        'hide_fieldsync_branding', 'email_from_name', 'email_from_address',
        'custom_domain', 'domain_verified'
      ]

      for (const field of allowedFields) {
        if (updates[field] !== undefined) {
          cleanedUpdates[field] = updates[field]
        }
      }

      // First check if branding record exists
      const { data: _existing, error: checkError } = await supabase
        .from('company_branding')
        .select('id')
        .eq('company_id', companyId)
        .single()

      if (checkError && checkError.code === 'PGRST116') {
        // No record exists, create one
        const { data, error } = await supabase
          .from('company_branding')
          .insert({
            company_id: companyId,
            ...cleanedUpdates
          })
          .select()
          .single()

        if (error) {
          observe.error('database', { message: error?.message, operation: 'createBranding' })
          return { success: false, error: error.message }
        }

        setBranding({ ...DEFAULT_BRANDING, ...data })
        return { success: true, data }
      }

      // Record exists, update it
      const { data, error } = await supabase
        .from('company_branding')
        .update(cleanedUpdates)
        .eq('company_id', companyId)
        .select()
        .single()

      if (error) {
        observe.error('database', { message: error?.message, operation: 'updateBranding' })
        return { success: false, error: error.message }
      }

      setBranding({ ...DEFAULT_BRANDING, ...data })
      return { success: true, data }
    } catch (error) {
      observe.error('database', { message: error?.message, operation: 'updateBranding' })
      return { success: false, error: error.message }
    }
  }, [companyId])

  const applyBrandingToDOM = (branding) => {
    const root = document.documentElement

    // Apply CSS variables
    root.style.setProperty('--primary-color', branding.primary_color)
    root.style.setProperty('--secondary-color', branding.secondary_color)

    // Update favicon if provided
    if (branding.favicon_url) {
      let favicon = document.querySelector("link[rel*='icon']")
      if (!favicon) {
        favicon = document.createElement('link')
        favicon.rel = 'icon'
        document.head.appendChild(favicon)
      }
      favicon.href = branding.favicon_url
    }

    // Update page title
    document.title = branding.custom_app_name || 'FieldSync'
  }

  const uploadBrandingImage = useCallback(async (file, type) => {
    try {
      if (!isSupabaseConfigured) {
        // Demo mode - create object URL
        const url = URL.createObjectURL(file)
        return { success: true, url }
      }

      const fileExt = file.name.split('.').pop()
      const fileName = `${companyId}/${type}-${Date.now()}.${fileExt}`
      const filePath = `branding/${fileName}`

      const { data: _data, error } = await supabase.storage
        .from('public')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: true
        })

      if (error) {
        observe.error('storage', { message: error?.message, operation: 'uploadBrandingImage' })
        return { success: false, error: error.message }
      }

      const { data: { publicUrl } } = supabase.storage
        .from('public')
        .getPublicUrl(filePath)

      return { success: true, url: publicUrl }
    } catch (error) {
      observe.error('storage', { message: error?.message, operation: 'uploadBrandingImage' })
      return { success: false, error: error.message }
    }
  }, [companyId])

  const refreshBranding = useCallback(() => {
    if (companyId) {
      loadBranding(companyId)
    } else {
      loadBrandingByDomain()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId])

  const value = useMemo(() => ({
    branding,
    loading,
    updateBranding,
    uploadBrandingImage,
    refreshBranding
  }), [branding, loading, updateBranding, uploadBrandingImage, refreshBranding])

  return (
    <BrandingContext.Provider value={value}>
      {children}
    </BrandingContext.Provider>
  )
}

export function useBranding() {
  const context = useContext(BrandingContext)
  if (!context) {
    throw new Error('useBranding must be used within a BrandingProvider')
  }
  return context
}
