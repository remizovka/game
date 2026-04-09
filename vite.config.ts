import { defineConfig } from "vite";
import { resolve } from "node:path";

export default defineConfig(() => {
  const repoName = process.env.GITHUB_REPOSITORY?.split("/")[1];
  const isGitHubPagesBuild = process.env.GITHUB_ACTIONS === "true" && !!repoName;

  return {
    base: isGitHubPagesBuild ? `/${repoName}/` : "/",
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
  };
});
