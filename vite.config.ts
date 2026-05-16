import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(() => {
  const repositoryName = process.env.GITHUB_REPOSITORY?.split("/")[1];

  return {
    base: process.env.GITHUB_ACTIONS && repositoryName ? `/${repositoryName}/` : "/",
    plugins: [react()],
  };
});
