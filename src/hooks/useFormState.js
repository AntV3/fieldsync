import { useState, useCallback } from 'react'

/**
 * useFormState - Manages form submission state with loading, error, and success handling
 * Replaces the common pattern of separate useState calls for loading/error/success
 *
 * @param {Object} options
 * @param {Function} options.onSuccess - Callback when submission succeeds
 * @param {Function} options.onError - Callback when submission fails
 * @param {Function} options.onShowToast - Toast notification function
 * @returns {Object} Form state and handlers
 */
export function useFormState({ onSuccess, onError, onShowToast } = {}) {
  const [state, setState] = useState({
    isSubmitting: false,
    isSuccess: false,
    error: null,
    data: null
  })

  const reset = useCallback(() => {
    setState({
      isSubmitting: false,
      isSuccess: false,
      error: null,
      data: null
    })
  }, [])

  const setSubmitting = useCallback((isSubmitting) => {
    setState(prev => ({ ...prev, isSubmitting, error: null }))
  }, [])

  const setSuccess = useCallback((data = null) => {
    setState({
      isSubmitting: false,
      isSuccess: true,
      error: null,
      data
    })
  }, [])

  const setError = useCallback((error) => {
    setState(prev => ({
      ...prev,
      isSubmitting: false,
      isSuccess: false,
      error: error?.message || error || 'An error occurred'
    }))
  }, [])

  /**
   * Wraps an async submission function with loading/error/success handling
   * @param {Function} submitFn - Async function to execute
   * @param {Object} options - Override options
   */
  const handleSubmit = useCallback(async (submitFn, options = {}) => {
    const {
      successMessage,
      errorMessage,
      resetOnSuccess = false
    } = options

    try {
      setSubmitting(true)
      const result = await submitFn()
      setSuccess(result)

      if (successMessage && onShowToast) {
        onShowToast(successMessage, 'success')
      }

      if (onSuccess) {
        onSuccess(result)
      }

      if (resetOnSuccess) {
        setTimeout(reset, 100)
      }

      return { success: true, data: result }
    } catch (err) {
      const message = errorMessage || err?.message || 'An error occurred'
      setError(message)

      if (onShowToast) {
        onShowToast(message, 'error')
      }

      if (onError) {
        onError(err)
      }

      return { success: false, error: err }
    }
  }, [onSuccess, onError, onShowToast, setSubmitting, setSuccess, setError, reset])

  return {
    ...state,
    reset,
    setSubmitting,
    setSuccess,
    setError,
    handleSubmit
  }
}

export default useFormState
