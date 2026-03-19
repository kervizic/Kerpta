import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { visualizer } from "rollup-plugin-visualizer";

export default defineConfig({
  plugins: [
    react(),
    visualizer({
      filename: "dist/bundle-stats.html",
      gzipSize: true,
      brotliSize: true,
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          // Separer React en son propre chunk (cache longue duree)
          "vendor-react": ["react", "react-dom"],
          // Router + Query ensemble
          "vendor-tanstack": ["@tanstack/react-router", "@tanstack/react-query"],
          // Formulaires
          "vendor-forms": ["react-hook-form", "@hookform/resolvers", "zod"],
          // Icones (souvent le plus gros)
          "vendor-icons": ["lucide-react"],
          // Utilitaires
          "vendor-utils": ["zustand"],
          // DatePicker (react-day-picker + date-fns locale)
          "vendor-datepicker": ["react-day-picker", "date-fns"],
        },
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:8000",
        changeOrigin: true,
      },
    },
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: "./src/test/setup.ts",
  },
});
