// Shared local storage helpers for demo/offline mode
// Extracted from supabase.js to avoid circular dependencies

const STORAGE_KEY = 'fieldsync_data'
const USER_KEY = 'fieldsync_user'

const DEFAULT_LOCAL_DATA = { projects: [], areas: [], users: [], assignments: [] }

export const getLocalData = () => {
  try {
    const data = localStorage.getItem(STORAGE_KEY)
    return data ? JSON.parse(data) : DEFAULT_LOCAL_DATA
  } catch {
    localStorage.removeItem(STORAGE_KEY)
    return DEFAULT_LOCAL_DATA
  }
}

export const setLocalData = (data) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
}

export const getLocalUser = () => {
  try {
    const user = localStorage.getItem(USER_KEY)
    return user ? JSON.parse(user) : null
  } catch {
    localStorage.removeItem(USER_KEY)
    return null
  }
}

export const setLocalUser = (user) => {
  if (user) {
    localStorage.setItem(USER_KEY, JSON.stringify(user))
  } else {
    localStorage.removeItem(USER_KEY)
  }
}
