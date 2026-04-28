import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';

import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  output: 'server',

  adapter: cloudflare({
    platformProxy: {
      enabled: !process.env.CI && process.env.NODE_ENV !== 'production',
    },
  }),

  vite: {
    plugins: [tailwindcss()],
  },
});