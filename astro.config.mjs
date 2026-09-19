// @ts-check
import { defineConfig } from 'astro/config';
import node from '@astrojs/node';
import vercel from '@astrojs/vercel';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://www.onezcodes.com',
  output: 'server',
  adapter: process.env.VERCEL ? vercel() : node({ mode: 'standalone' }),
  trailingSlash: 'never',
  compressHTML: true,
  prefetch: {
    prefetchAll: true,
  },
  integrations: [
    sitemap({
      lastmod: new Date(),
      filter: (page) => {
        const skip = ['/robots.txt', '/llms.txt', '/site.webmanifest', '/404', '/team', '/auth'];
        return !skip.some((path) => page.includes(path));
      },
      serialize(item) {
        const path = new URL(item.url).pathname.replace(/\/+$/, '') || '/';
        const priority =
          path === '/' ? 1 : path === '/work' || path === '/services' ? 0.9 : path === '/contact' ? 0.8 : 0.5;
        item.priority = priority;
        item.changefreq = path === '/' ? 'weekly' : 'monthly';
        return item;
      },
      namespaces: {
        news: false,
        xhtml: false,
        image: false,
        video: false,
      },
    }),
  ],
});
