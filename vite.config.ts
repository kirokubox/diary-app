import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(() => {
  return {
    base: "/diary-app/",
    plugins: [react()],
    // PORT が指定されたときだけそのポートで開発サーバーを立てる（未指定なら従来どおり5173）
    server: process.env.PORT ? { port: Number(process.env.PORT) } : undefined,
  };
});
