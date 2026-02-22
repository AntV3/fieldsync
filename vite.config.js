import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173
  },
  build: {
    // Generate source maps for better debugging
    sourcemap: true,
    // Raise threshold since pdf/xlsx are intentionally large vendor chunks
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        // Use function form to handle recharts circular dependency warning:
        // Recharts re-exports from its index create circular chunk refs when split.
        // Keeping recharts in its own named chunk resolves this.
        manualChunks(id) {
          // React core - rarely changes, can be cached long-term
          if (id.includes('node_modules/react/') || id.includes('node_modules/react-dom/')) {
            return 'react'
          }
          // Supabase client - separate chunk for API layer
          if (id.includes('node_modules/@supabase/')) {
            return 'supabase'
          }
          // PDF generation - only loaded when user exports PDFs
          if (id.includes('node_modules/jspdf') || id.includes('node_modules/jspdf-autotable')) {
            return 'pdf'
          }
          // Excel parsing - only loaded during Excel import
          if (id.includes('node_modules/xlsx')) {
            return 'xlsx'
          }
          // Recharts - kept as single chunk to avoid circular re-export warnings
          if (id.includes('node_modules/recharts')) {
            return 'recharts'
          }
          // Icons - separate chunk
          if (id.includes('node_modules/lucide-react')) {
            return 'icons'
          }
        }
      },
      // Exclude unused jspdf optional dependencies from bundle
      // html2canvas and dompurify are only needed for HTML-to-PDF conversion
      // which we don't use (our PDFs are generated programmatically)
      external: ['html2canvas', 'dompurify']
    }
  },
  // Optimize dependency pre-bundling
  optimizeDeps: {
    // Exclude unused optional dependencies from pre-bundling
    exclude: ['html2canvas', 'dompurify']
  }
})
