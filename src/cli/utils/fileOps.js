/**
 * File operations utility for the multi-agent CLI system
 * Provides helpers for reading, writing, and analyzing files
 */

import fs from 'fs/promises'
import path from 'path'
import { existsSync } from 'fs'

/**
 * Read a file's contents
 * @param {string} filePath
 * @returns {Promise<string|null>}
 */
export async function readFile(filePath) {
  try {
    const absolutePath = path.resolve(filePath)
    const content = await fs.readFile(absolutePath, 'utf-8')
    return content
  } catch (error) {
    if (error.code === 'ENOENT') {
      return null
    }
    throw error
  }
}

/**
 * Write content to a file
 * @param {string} filePath
 * @param {string} content
 * @returns {Promise<boolean>}
 */
export async function writeFile(filePath, content) {
  try {
    const absolutePath = path.resolve(filePath)
    const dir = path.dirname(absolutePath)

    // Ensure directory exists
    await fs.mkdir(dir, { recursive: true })

    await fs.writeFile(absolutePath, content, 'utf-8')
    return true
  } catch (error) {
    console.error(`Error writing file: ${error.message}`)
    return false
  }
}

/**
 * Check if a file exists
 * @param {string} filePath
 * @returns {boolean}
 */
export function fileExists(filePath) {
  return existsSync(path.resolve(filePath))
}

/**
 * Get file info
 * @param {string} filePath
 * @returns {Promise<Object|null>}
 */
export async function getFileInfo(filePath) {
  try {
    const absolutePath = path.resolve(filePath)
    const stats = await fs.stat(absolutePath)

    return {
      path: absolutePath,
      name: path.basename(absolutePath),
      extension: path.extname(absolutePath),
      size: stats.size,
      isDirectory: stats.isDirectory(),
      isFile: stats.isFile(),
      modified: stats.mtime,
      created: stats.birthtime
    }
  } catch (error) {
    return null
  }
}

/**
 * List files in a directory
 * @param {string} dirPath
 * @param {Object} options
 * @returns {Promise<string[]>}
 */
export async function listFiles(dirPath, options = {}) {
  const { recursive = false, extensions = null, ignore = ['node_modules', '.git'] } = options

  try {
    const absolutePath = path.resolve(dirPath)
    const entries = await fs.readdir(absolutePath, { withFileTypes: true })

    let files = []

    for (const entry of entries) {
      const fullPath = path.join(absolutePath, entry.name)

      // Skip ignored directories
      if (ignore.includes(entry.name)) {
        continue
      }

      if (entry.isDirectory() && recursive) {
        const subFiles = await listFiles(fullPath, options)
        files = files.concat(subFiles)
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name)
        if (!extensions || extensions.includes(ext)) {
          files.push(fullPath)
        }
      }
    }

    return files
  } catch (error) {
    console.error(`Error listing files: ${error.message}`)
    return []
  }
}

/**
 * Find files matching a pattern
 * @param {string} dir
 * @param {string|RegExp} pattern
 * @returns {Promise<string[]>}
 */
export async function findFiles(dir, pattern) {
  const allFiles = await listFiles(dir, { recursive: true })

  const regex = typeof pattern === 'string' ? new RegExp(pattern) : pattern

  return allFiles.filter(file => regex.test(file))
}

/**
 * Get the project root directory
 * @returns {string}
 */
export function getProjectRoot() {
  // Start from current directory and walk up looking for package.json
  let current = process.cwd()

  while (current !== path.dirname(current)) {
    if (existsSync(path.join(current, 'package.json'))) {
      return current
    }
    current = path.dirname(current)
  }

  return process.cwd()
}

/**
 * Analyze a JavaScript/JSX file for components and functions
 * @param {string} content
 * @returns {Object}
 */
export function analyzeJsFile(content) {
  const analysis = {
    imports: [],
    exports: [],
    functions: [],
    components: [],
    hooks: []
  }

  // Find imports
  const importRegex = /import\s+(?:{([^}]+)}|\*\s+as\s+(\w+)|(\w+))\s+from\s+['"]([^'"]+)['"]/g
  let match
  while ((match = importRegex.exec(content)) !== null) {
    analysis.imports.push({
      names: match[1] || match[2] || match[3],
      source: match[4]
    })
  }

  // Find exports
  const exportRegex = /export\s+(?:default\s+)?(?:function|const|class)\s+(\w+)/g
  while ((match = exportRegex.exec(content)) !== null) {
    analysis.exports.push(match[1])
  }

  // Find function definitions
  const functionRegex = /(?:function|const|let)\s+(\w+)\s*(?:=\s*(?:async\s*)?\([^)]*\)\s*=>|\([^)]*\)\s*{)/g
  while ((match = functionRegex.exec(content)) !== null) {
    const name = match[1]
    if (/^[A-Z]/.test(name)) {
      analysis.components.push(name)
    } else if (name.startsWith('use')) {
      analysis.hooks.push(name)
    } else {
      analysis.functions.push(name)
    }
  }

  return analysis
}

/**
 * Get relative path from project root
 * @param {string} absolutePath
 * @returns {string}
 */
export function getRelativePath(absolutePath) {
  const root = getProjectRoot()
  return path.relative(root, absolutePath)
}

/**
 * Create a backup of a file
 * @param {string} filePath
 * @returns {Promise<string|null>} Backup file path or null if failed
 */
export async function backupFile(filePath) {
  try {
    const content = await readFile(filePath)
    if (!content) return null

    const backupPath = `${filePath}.backup.${Date.now()}`
    await writeFile(backupPath, content)
    return backupPath
  } catch (error) {
    console.error(`Error backing up file: ${error.message}`)
    return null
  }
}

export default {
  readFile,
  writeFile,
  fileExists,
  getFileInfo,
  listFiles,
  findFiles,
  getProjectRoot,
  analyzeJsFile,
  getRelativePath,
  backupFile
}
