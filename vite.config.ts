import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  // Relative asset paths so the same build works at a domain root or under /interface-foundry/ (GitHub Pages).
  base: "./",
  plugins: [react(), tailwindcss()],
});
