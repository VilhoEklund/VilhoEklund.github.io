import { defineConfig } from 'vite';

/**
 * Build configuration.
 *
 * - GitHub Pages project sites need `base = /<repository>/`. CI sets
 *   VITE_BASE_PATH accordingly (see .github/workflows). Custom domains use '/'.
 * - VITE_GAME_SERVER_URL is baked in at build time; never put secrets here.
 */
export default defineConfig(() => {
  const base = process.env.VITE_BASE_PATH ?? '/';
  return {
    base,
    build: {
      target: 'es2022',
      sourcemap: false,
      chunkSizeWarningLimit: 1500,
    },
    server: {
      port: 5173,
      strictPort: true,
    },
    preview: {
      port: 4173,
      strictPort: true,
    },
  };
});
