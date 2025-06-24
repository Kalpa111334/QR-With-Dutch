import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  base: '/',
  server: {
    host: true,
    port: 8080,
  },
  preview: {
    port: 8080,
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    emptyOutDir: true,
    sourcemap: mode === 'development',
    minify: 'terser',
    target: 'esnext',
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'index.html'),
      },
      output: {
        manualChunks: (id) => {
          if (id.includes('node_modules')) {
            if (id.includes('react')) {
              return 'vendor-react';
            }
            if (id.includes('@radix-ui')) {
              return 'vendor-radix';
            }
            return 'vendor';
          }
        },
        chunkFileNames: 'js/[name]-[hash].js',
        entryFileNames: 'js/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]'
      }
    }
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@radix-ui/react-icons": "@radix-ui/react-icons/dist/index.js"
    }
  },
  optimizeDeps: {
    include: ['@radix-ui/react-icons'],
    force: true
  },
  plugins: [
    react({
      jsxRuntime: 'automatic'
    })
  ],
  define: {
    'process.env.NODE_ENV': JSON.stringify(mode),
    'import.meta.env.VITE_APP_ENVIRONMENT': JSON.stringify(mode)
  }
}));
