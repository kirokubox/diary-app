import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(() => {
  return {
    base: "/diary-app/",
    plugins: [react()],
    // Service Workerが初回インストール時に確実にアプリ本体をキャッシュできるよう、
    // エントリJS/CSSだけ安定したファイル名にする
    build: {
      rollupOptions: {
        output: {
          entryFileNames: "assets/app.js",
          chunkFileNames: "assets/[name].js",
          assetFileNames: (assetInfo) =>
            assetInfo.name?.endsWith(".css") ? "assets/app.css" : "assets/[name][extname]",
        },
      },
    },
    // PORT が指定されたときだけそのポートで開発サーバーを立てる（未指定なら従来どおり5173）
    server: process.env.PORT ? { port: Number(process.env.PORT) } : undefined,
  };
});
