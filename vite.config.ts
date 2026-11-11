import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig } from "vite";
import type { Plugin } from "vite";
import react from "@vitejs/plugin-react";

function stampServiceWorkerVersion(): Plugin {
  let outDir = "dist";
  return {
    name: "stamp-service-worker-version",
    apply: "build",
    configResolved(config) {
      outDir = config.build.outDir;
    },
    writeBundle(options, bundle) {
      const swPath = resolve(options.dir ?? outDir, "sw.js");
      const source = readFileSync(swPath, "utf8");
      const version = new Date().toISOString().replace(/[-:.TZ]/g, "");
      const assets = Object.values(bundle).map((item) => `${configBase}${item.fileName}`).filter((name) => /\.(?:js|css)$/.test(name));
      writeFileSync(swPath, source.replaceAll("__BUILD_VERSION__", version).replace("/* __BUILD_ASSETS__ */ []", JSON.stringify(assets)));
    },
  };
}

const configBase = "/diary-app/";

export default defineConfig(() => {
  return {
    base: configBase,
    plugins: [react(), stampServiceWorkerVersion()],
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
