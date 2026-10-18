// @ts-check
import { defineConfig } from 'astro/config';

// GitHub Pages project sites are served from https://<owner>.github.io/<repo>/.
// The deploy workflow passes the repository name so nothing is hard-coded here.
// Falls back to the current repository name for local builds.
const base = process.env.BASE_PATH ?? '/unofficial-zenaim-util';

export default defineConfig({
  site: process.env.SITE_URL,
  base,
  output: 'static',
  build: {
    // Emit `index.html` and `config.html` as flat files instead of
    // `index.html` and `config/index.html`.
    format: 'file',
  },
  devToolbar: { enabled: false },
});
