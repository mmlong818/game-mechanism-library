import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: process.env.VITE_BASE_PATH || "/game-mechanism-library/",
  plugins: [react()],
  build: { target: "es2022", sourcemap: false },
});
