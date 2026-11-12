import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  // 默认用相对路径构建：同一份 dist 放在域名根目录或任意子路径下都能用（地址用的是 hash 路由）。
  // 需要绝对路径时用 VITE_BASE_PATH 指定，例如 GitHub Pages 的工作流里设的 /game-mechanism-library/。
  base: process.env.VITE_BASE_PATH || "./",
  plugins: [react()],
  build: { target: "es2022", sourcemap: false },
});
