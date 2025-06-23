import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { VitePWA } from 'vite-plugin-pwa';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  base: '/',
  server: {
    host: true,
    port: 8080,
  },
  build: {
    outDir: 'dist',
    sourcemap: mode === 'production' ? false : true,
    minify: mode === 'production' ? 'terser' : false,
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          'ui-vendor': ['@radix-ui/react-slot', '@radix-ui/react-toast'],
        },
        chunkFileNames: 'assets/[name]-[hash].js',
        entryFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]'
      }
    }
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@radix-ui/react-icons": "@radix-ui/react-icons/dist/index.js"
    },
    conditions: ['import', 'module', 'browser', 'default']
  },
  optimizeDeps: {
    include: ['@radix-ui/react-icons'],
    force: true
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'robots.txt', 'icons/*.png'],
      manifest: {
        name: 'QR Dutch Attendance',
        short_name: 'QR Attendance',
        description: 'QR-Based Attendance Management System',
        theme_color: '#ffffff',
        icons: [
          {
            src: '/icons/icon-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,json}'],
        navigateFallback: 'index.html',
        navigateFallbackAllowlist: [/^(?!\/__).*/]
      }
    })
  ],
  define: {
    'process.env.NODE_ENV': JSON.stringify(mode),
    'import.meta.env.VITE_APP_ENVIRONMENT': JSON.stringify(mode)
  }
}));
