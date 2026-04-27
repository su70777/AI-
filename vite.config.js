import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const devHost = env.VITE_DEV_HOST || "0.0.0.0";
  const devPort = Number(env.VITE_DEV_PORT || 5173);
  const previewHost = env.VITE_PREVIEW_HOST || "0.0.0.0";
  const previewPort = Number(env.VITE_PREVIEW_PORT || 4173);
  const apiProxyTarget = env.VITE_API_PROXY_TARGET || "http://127.0.0.1:3001";

  return {
    base: env.VITE_BASE_PATH || "/",
    server: {
      host: devHost,
      port: devPort,
      proxy: {
        "/api": {
          target: apiProxyTarget,
          changeOrigin: true,
        },
        "/uploads": {
          target: apiProxyTarget,
          changeOrigin: true,
        },
      },
    },
    preview: {
      host: previewHost,
      port: previewPort,
    },
  };
});
