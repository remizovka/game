import { defineConfig } from "vite";
import { resolve } from "node:path";

export default defineConfig({
  root: "web",
  publicDir: "assets",
  server: {
    port: 5173,
  },
  build: {
    rollupOptions: {
      input: {
        lobby: resolve(__dirname, "web/index.html"),
        belka: resolve(__dirname, "web/belka.html"),
        mu: resolve(__dirname, "web/mu.html"),
        durak: resolve(__dirname, "web/durak.html"),
        account: resolve(__dirname, "web/account.html"),
      },
    },
  },
  resolve: {
    alias: {
      "@engine": resolve(__dirname, "src"),
    },
  },
});
