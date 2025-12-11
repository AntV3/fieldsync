/**
 * Photo Compression Utility
 * Compresses photos for offline storage in IndexedDB
 */

import imageCompression from 'browser-image-compression'

/**
 * Compression options
 */
const DEFAULT_OPTIONS = {
  maxSizeMB: 0.2, // 200KB max
  maxWidthOrHeight: 800, // 800px max dimension
  useWebWorker: true,
  fileType: 'image/jpeg',
  initialQuality: 0.7, // 70% quality
}

/**
 * Compress a photo file
 * @param {File} file - Original photo file
 * @param {Object} options - Compression options (optional)
 * @returns {Promise<{compressed: Blob, base64: string, originalSize: number, compressedSize: number}>}
 */
export async function compressPhoto(file, options = {}) {
  try {
    const compressionOptions = {
      ...DEFAULT_OPTIONS,
      ...options,
    }

    console.log(`📸 Compressing photo: ${file.name} (${(file.size / 1024).toFixed(1)}KB)`)

    // Compress the image
    const compressedBlob = await imageCompression(file, compressionOptions)

    console.log(`✅ Compressed to: ${(compressedBlob.size / 1024).toFixed(1)}KB`)

    // Convert to base64 for IndexedDB storage
    const base64 = await blobToBase64(compressedBlob)

    return {
      compressed: compressedBlob,
      base64,
      originalSize: file.size,
      compressedSize: compressedBlob.size,
      compressionRatio: ((1 - compressedBlob.size / file.size) * 100).toFixed(1) + '%',
    }
  } catch (error) {
    console.error('Photo compression error:', error)
    throw new Error(`Failed to compress photo: ${error.message}`)
  }
}

/**
 * Compress multiple photos
 * @param {File[]} files - Array of photo files
 * @param {Function} onProgress - Progress callback (index, total)
 * @returns {Promise<Array>}
 */
export async function compressPhotos(files, onProgress = null) {
  const results = []

  for (let i = 0; i < files.length; i++) {
    const file = files[i]

    if (onProgress) {
      onProgress(i + 1, files.length, file.name)
    }

    try {
      const result = await compressPhoto(file)
      results.push({
        success: true,
        fileName: file.name,
        ...result,
      })
    } catch (error) {
      results.push({
        success: false,
        fileName: file.name,
        error: error.message,
      })
    }
  }

  return results
}

/**
 * Convert Blob to base64 string
 */
function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()

    reader.onloadend = () => {
      resolve(reader.result)
    }

    reader.onerror = (error) => {
      reject(error)
    }

    reader.readAsDataURL(blob)
  })
}

/**
 * Convert base64 to Blob
 */
export function base64ToBlob(base64, contentType = 'image/jpeg') {
  const byteCharacters = atob(base64.split(',')[1])
  const byteArrays = []

  for (let offset = 0; offset < byteCharacters.length; offset += 512) {
    const slice = byteCharacters.slice(offset, offset + 512)
    const byteNumbers = new Array(slice.length)

    for (let i = 0; i < slice.length; i++) {
      byteNumbers[i] = slice.charCodeAt(i)
    }

    const byteArray = new Uint8Array(byteNumbers)
    byteArrays.push(byteArray)
  }

  return new Blob(byteArrays, { type: contentType })
}

/**
 * Get photo preview from base64
 */
export function getPhotoPreview(base64) {
  return base64
}

/**
 * Validate if file is an image
 */
export function isValidImage(file) {
  const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/heic']
  return file && validTypes.includes(file.type.toLowerCase())
}

/**
 * Get human-readable file size
 */
export function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes'

  const k = 1024
  const sizes = ['Bytes', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))

  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i]
}

/**
 * Compress a data URI photo (for camera captures)
 */
export async function compressDataUri(dataUri, options = {}) {
  try {
    // Convert data URI to Blob
    const response = await fetch(dataUri)
    const blob = await response.blob()

    // Create a File object from the blob
    const file = new File([blob], 'photo.jpg', { type: 'image/jpeg' })

    // Compress it
    return compressPhoto(file, options)
  } catch (error) {
    console.error('Data URI compression error:', error)
    throw new Error(`Failed to compress data URI: ${error.message}`)
  }
}

/**
 * Estimate how many photos can fit in IndexedDB
 * (Assuming ~50MB available storage)
 */
export function estimatePhotoCapacity(avgPhotoSize = 200 * 1024) {
  const availableStorage = 50 * 1024 * 1024 // 50MB
  const reservedSpace = 10 * 1024 * 1024 // Reserve 10MB for other data
  const usableSpace = availableStorage - reservedSpace

  return Math.floor(usableSpace / avgPhotoSize)
}

/**
 * Check if there's enough storage for photos
 */
export async function hasStorageCapacity(requiredBytes) {
  if ('storage' in navigator && 'estimate' in navigator.storage) {
    try {
      const estimate = await navigator.storage.estimate()
      const available = estimate.quota - estimate.usage

      return available > requiredBytes
    } catch (error) {
      console.warn('Could not estimate storage:', error)
      return true // Assume OK if we can't check
    }
  }

  return true // Assume OK if Storage API not available
}
