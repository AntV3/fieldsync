import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173
  },
  build: {
    // Source maps: only generate hidden source maps for error tracking services
    // Never expose source maps publicly in production (security risk)
    sourcemap: 'hidden',
    // Strip console.log and console.warn in production builds
    // console.error is kept for critical error visibility
    minify: 'esbuild',
    rollupOptions: {
      output: {
        // Improve code splitting by separating vendor chunks
        manualChunks: {
          // React core - rarely changes, can be cached long-term
          react: ['react', 'react-dom'],
          // Router - separate chunk for navigation layer
          router: ['react-router-dom'],
          // Supabase client - separate chunk for API layer
          supabase: ['@supabase/supabase-js'],
          // PDF generation - only loaded when user exports PDFs
          pdf: ['jspdf', 'jspdf-autotable'],
          // Excel parsing - only loaded during Excel import
          xlsx: ['xlsx'],
          // Icons - separate chunk to avoid bundling issues
          icons: ['lucide-react']
        }
      },
      // Exclude unused jspdf optional dependencies from bundle
      // html2canvas and dompurify are only needed for HTML-to-PDF conversion
      // which we don't use (our PDFs are generated programmatically)
      external: ['html2canvas', 'dompurify']
    }
  },
  esbuild: {
    // Drop console.log and console.warn in production (keep console.error for visibility)
    drop: process.env.NODE_ENV === 'production' ? ['debugger'] : [],
    pure: process.env.NODE_ENV === 'production' ? ['console.log', 'console.warn'] : [],
  },
  // Optimize dependency pre-bundling
  optimizeDeps: {
    // Exclude unused optional dependencies from pre-bundling
    exclude: ['html2canvas', 'dompurify']
  }
})
