import { createContext, useContext, useState, useEffect } from 'react'
import { supabase, isSupabaseConfigured } from './supabase'

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
          console.error('Error loading branding:', error)
        }
        setBranding(DEFAULT_BRANDING)
      } else {
        setBranding({ ...DEFAULT_BRANDING, ...data })
      }
    } catch (error) {
      console.error('Error in loadBranding:', error)
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
      console.error('Error loading branding by domain:', error)
      setBranding(DEFAULT_BRANDING)
    } finally {
      setLoading(false)
    }
  }

  const createDefaultBranding = async (companyId) => {
    try {
      const { data, error } = await supabase
        .from('company_branding')
        .insert({
          company_id: companyId,
          ...DEFAULT_BRANDING
        })
        .select()
        .single()

      if (error) {
        console.error('Error creating default branding:', error)
      }
    } catch (error) {
      console.error('Error in createDefaultBranding:', error)
    }
  }

  const updateBranding = async (updates) => {
    try {
      if (!isSupabaseConfigured) {
        // Demo mode - just update state
        setBranding(prev => ({ ...prev, ...updates }))
        return { success: true }
      }

      if (!companyId) {
        return { success: false, error: 'No company ID' }
      }

      const { data, error } = await supabase
        .from('company_branding')
        .update(updates)
        .eq('company_id', companyId)
        .select()
        .single()

      if (error) {
        console.error('Error updating branding:', error)
        return { success: false, error: error.message }
      }

      setBranding({ ...DEFAULT_BRANDING, ...data })
      return { success: true, data }
    } catch (error) {
      console.error('Error in updateBranding:', error)
      return { success: false, error: error.message }
    }
  }

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

  const uploadBrandingImage = async (file, type) => {
    try {
      if (!isSupabaseConfigured) {
        // Demo mode - create object URL
        const url = URL.createObjectURL(file)
        return { success: true, url }
      }

      const fileExt = file.name.split('.').pop()
      const fileName = `${companyId}/${type}-${Date.now()}.${fileExt}`
      const filePath = `branding/${fileName}`

      const { data, error } = await supabase.storage
        .from('public')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: true
        })

      if (error) {
        console.error('Error uploading image:', error)
        return { success: false, error: error.message }
      }

      const { data: { publicUrl } } = supabase.storage
        .from('public')
        .getPublicUrl(filePath)

      return { success: true, url: publicUrl }
    } catch (error) {
      console.error('Error in uploadBrandingImage:', error)
      return { success: false, error: error.message }
    }
  }

  const value = {
    branding,
    loading,
    updateBranding,
    uploadBrandingImage,
    refreshBranding: () => companyId ? loadBranding(companyId) : loadBrandingByDomain()
  }

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
