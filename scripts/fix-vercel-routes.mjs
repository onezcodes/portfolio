// After `astro build` on Vercel: fix asset caching in the Build Output API routes.
//
// @astrojs/vercel adds `/_astro/* -> cache-control: immutable` AFTER the filesystem handler,
// so it only applies to requests that MISS the static files, i.e. 404s. Cloudflare then
// caches those 404s for a year, and a stylesheet requested during a deploy stays broken.
// Here: real hashed assets get the immutable header; missing ones get an uncacheable 404.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const file = '.vercel/output/config.json';
if (!existsSync(file)) {
  console.log('fix-vercel-routes: no Vercel output, skipping');
  process.exit(0);
}
const config = JSON.parse(readFileSync(file, 'utf8'));
const isAstroCache = (route) => route.src === '^/_astro/(.*)$' && route.continue && route.headers?.['cache-control'];
const routes = config.routes.filter((route) => !isAstroCache(route));
const fsIndex = routes.findIndex((route) => route.handle === 'filesystem');
if (fsIndex < 0) throw new Error('fix-vercel-routes: no filesystem handler');
routes.splice(
  fsIndex,
  0,
  { src: '^/_astro/(.*)$', headers: { 'cache-control': 'public, max-age=31536000, immutable' }, continue: true },
);
routes.splice(
  fsIndex + 2,
  0,
  // Anything under /_astro/ that is not a real file: plain 404 that no CDN may keep.
  { src: '^/_astro/(.*)$', status: 404, headers: { 'cache-control': 'no-store, max-age=0' } },
);
config.routes = routes;
writeFileSync(file, `${JSON.stringify(config, null, 2)}\n`);
console.log('fix-vercel-routes: asset caching fixed');
