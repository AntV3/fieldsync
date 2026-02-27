/**
 * Image utilities for compression, optimization, and PDF generation
 */

/**
 * Convert hex color to RGB array for PDF generation
 * @param {string} hex - Hex color string (with or without #)
 * @returns {number[]} RGB array [r, g, b]
 */
export const hexToRgb = (hex) => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  return result
    ? [
        parseInt(result[1], 16),
        parseInt(result[2], 16),
        parseInt(result[3], 16)
      ]
    : [59, 130, 246] // Default to primary blue
}

/**
 * Load an image URL and convert to base64 for PDF embedding
 * Uses JPEG format for smaller file sizes (vs PNG)
 * @param {string} url - Image URL to load
 * @param {number} timeout - Timeout in milliseconds (default 5000)
 * @param {number} quality - JPEG quality 0-1 (default 0.85)
 * @returns {Promise<string|null>} Base64 data URL or null on failure
 */
export const loadImageAsBase64 = (url, timeout = 5000, quality = 0.85) => {
  return new Promise((resolve) => {
    if (!url) {
      resolve(null)
      return
    }

    const img = new Image()
    img.crossOrigin = 'anonymous'

    // Set timeout to prevent hanging
    const timeoutId = setTimeout(() => {
      img.src = ''
      resolve(null)
    }, timeout)

    img.onload = () => {
      clearTimeout(timeoutId)
      try {
        const canvas = document.createElement('canvas')
        canvas.width = img.width
        canvas.height = img.height
        const ctx = canvas.getContext('2d')
        ctx.drawImage(img, 0, 0)
        // Use JPEG for photos (smaller than PNG), fallback to PNG for transparency
        const dataUrl = canvas.toDataURL('image/jpeg', quality)
        resolve(dataUrl)
      } catch (e) {
        // Canvas tainted or other error
        resolve(null)
      }
    }

    img.onerror = () => {
      clearTimeout(timeoutId)
      resolve(null)
    }

    img.src = url
  })
}

/**
 * Load multiple images in parallel for faster PDF generation
 * @param {string[]} urls - Array of image URLs to load
 * @param {number} timeout - Timeout per image in milliseconds (default 5000)
 * @param {number} quality - JPEG quality 0-1 (default 0.85)
 * @returns {Promise<(string|null)[]>} Array of base64 data URLs (null for failed loads)
 */
export const loadImagesAsBase64 = async (urls, timeout = 5000, quality = 0.85) => {
  if (!urls || urls.length === 0) {
    return []
  }

  // Load all images in parallel
  const results = await Promise.all(
    urls.map(url => loadImageAsBase64(url, timeout, quality))
  )

  return results
}

/**
 * Compress an image file for faster uploads
 * @param {File} file - The image file to compress
 * @param {number} maxWidth - Maximum width in pixels (default 1920)
 * @param {number} quality - JPEG quality 0-1 (default 0.8)
 * @returns {Promise<File>} - Compressed image file
 */
export async function compressImage(file, maxWidth = 1920, quality = 0.8) {
  // Skip compression for non-image files
  if (!file.type.startsWith('image/')) {
    return file
  }

  // Skip compression for small files (under 500KB)
  if (file.size < 500 * 1024) {
    return file
  }

  return new Promise((resolve) => {
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    const img = new Image()

    img.onload = () => {
      let { width, height } = img

      // Calculate new dimensions, maintaining aspect ratio
      if (width > maxWidth) {
        height = Math.round((height * maxWidth) / width)
        width = maxWidth
      }

      // Also limit height for very tall images
      const maxHeight = 1920
      if (height > maxHeight) {
        width = Math.round((width * maxHeight) / height)
        height = maxHeight
      }

      canvas.width = width
      canvas.height = height

      // Use high-quality rendering
      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(img, 0, 0, width, height)

      // Convert to JPEG blob
      canvas.toBlob(
        (blob) => {
          if (blob) {
            // Create new file with original name but .jpg extension
            const baseName = file.name.replace(/\.[^/.]+$/, '')
            const compressedFile = new File([blob], `${baseName}.jpg`, {
              type: 'image/jpeg',
              lastModified: Date.now()
            })

            resolve(compressedFile)
          } else {
            // Fallback to original if compression fails
            console.warn('Image compression failed, using original')
            resolve(file)
          }
        },
        'image/jpeg',
        quality
      )

      // Clean up object URL
      URL.revokeObjectURL(img.src)
    }

    img.onerror = () => {
      console.warn('Failed to load image for compression, using original')
      URL.revokeObjectURL(img.src)
      resolve(file)
    }

    // Load the image
    img.src = URL.createObjectURL(file)
  })
}

/**
 * Compress multiple images in parallel
 * @param {File[]} files - Array of image files
 * @param {number} maxWidth - Maximum width in pixels
 * @param {number} quality - JPEG quality 0-1
 * @param {function} onProgress - Optional progress callback (completed, total)
 * @returns {Promise<File[]>} - Array of compressed files
 */
export async function compressImages(files, maxWidth = 1920, quality = 0.8, onProgress = null) {
  let completed = 0
  const total = files.length

  const results = await Promise.all(
    files.map(async (file) => {
      const compressed = await compressImage(file, maxWidth, quality)
      completed++
      if (onProgress) {
        onProgress(completed, total)
      }
      return compressed
    })
  )

  return results
}

/**
 * Get the device's current GPS location using the browser Geolocation API.
 * Returns null silently if permission denied or unavailable (non-blocking).
 * @param {number} timeout - Max wait time in ms (default 5000)
 * @returns {Promise<{latitude: number, longitude: number, accuracy: number}|null>}
 */
export function getGPSLocation(timeout = 5000) {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      resolve(null)
      return
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: Math.round(position.coords.accuracy)
        })
      },
      () => resolve(null),
      { enableHighAccuracy: true, timeout, maximumAge: 60000 }
    )
  })
}

/**
 * Get dimensions of an image file
 * @param {File} file - Image file
 * @returns {Promise<{width: number, height: number}>}
 */
export function getImageDimensions(file) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(img.src)
      resolve({ width: img.width, height: img.height })
    }
    img.onerror = () => {
      URL.revokeObjectURL(img.src)
      reject(new Error('Failed to load image'))
    }
    img.src = URL.createObjectURL(file)
  })
}
