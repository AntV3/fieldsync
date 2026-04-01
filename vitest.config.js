import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@components': path.resolve(__dirname, './src/components'),
      '@lib': path.resolve(__dirname, './src/lib'),
      '@hooks': path.resolve(__dirname, './src/hooks'),
      '@styles': path.resolve(__dirname, './src/styles'),
    }
  },
  test: {
    // Use jsdom to simulate browser environment
    environment: 'jsdom',

    // Setup files run before each test file
    setupFiles: ['./src/test/setup.js'],

    // Global test APIs (describe, it, expect) without imports
    globals: true,

    // Show verbose output
    reporter: 'verbose',

    // Coverage settings (optional, run with --coverage)
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      exclude: ['node_modules/', 'src/test/']
    }
  }
})
