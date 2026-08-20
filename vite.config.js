import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        app: fileURLToPath(new URL("./index.html", import.meta.url)),
        pushPoc: fileURLToPath(new URL("./push-poc.html", import.meta.url)),
      },
    },
  },
  server: {
    watch: {
      ignored: ["**/public/fonts/**", "**/*-Photoroom.png"],
    },
    proxy: {
      "/api": "http://localhost:3001",
    },
  },
});
