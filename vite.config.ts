import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  plugins: [react()],
  server: {
    strictPort: true,
    proxy: {
      "/api/operations": {
        target: process.env.ADMIN_PROXY_TARGET || "http://localhost:8084",
        changeOrigin: false,
      },
    },
  },
});
