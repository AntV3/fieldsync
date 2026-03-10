import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

export default defineConfig({
  plugins: [tailwindcss(), react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@components': path.resolve(__dirname, './src/components'),
      '@lib': path.resolve(__dirname, './src/lib'),
      '@hooks': path.resolve(__dirname, './src/hooks'),
      '@styles': path.resolve(__dirname, './src/styles'),
    }
  },
  server: {
    host: '0.0.0.0',
    port: 5173
  },
  build: {
    // Generate source maps for better debugging
    sourcemap: true,
    rollupOptions: {
      output: {
        // Improve code splitting by separating vendor chunks
        manualChunks: {
          // React core - rarely changes, can be cached long-term
          react: ['react', 'react-dom'],
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
  // Optimize dependency pre-bundling
  optimizeDeps: {
    // Exclude unused optional dependencies from pre-bundling
    exclude: ['html2canvas', 'dompurify']
  }
})
