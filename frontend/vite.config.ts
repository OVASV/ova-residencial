import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// El frontend habla con el backend vía proxy: /api -> http://localhost:3010
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5180,
    proxy: {
      "/api": {
        target: "http://localhost:3010",
        changeOrigin: true,
      },
      "/uploads": {
        target: "http://localhost:3010",
        changeOrigin: true,
      },
    },
  },
});
