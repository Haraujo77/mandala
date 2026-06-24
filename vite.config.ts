import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Relative base so the built site works under a GitHub Pages project path
// (e.g. https://<user>.github.io/mandala/) without hardcoding the repo name.
export default defineConfig({
  base: "./",
  plugins: [react()],
});
