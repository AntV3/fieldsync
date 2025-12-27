/**
 * Image utilities for compression and optimization
 */

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

            // Log compression results
            const savings = ((1 - blob.size / file.size) * 100).toFixed(1)
            console.log(`Image compressed: ${file.name} - ${(file.size / 1024).toFixed(0)}KB → ${(blob.size / 1024).toFixed(0)}KB (${savings}% smaller)`)

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
