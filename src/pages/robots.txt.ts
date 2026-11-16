import type { APIRoute } from 'astro';

export const prerender = true;

const body = (sitemapURL: URL) => `User-agent: *
Allow: /
Disallow: /team
Disallow: /auth
Disallow: /p/

User-agent: Googlebot
Allow: /
Disallow: /team
Disallow: /auth
Disallow: /p/

User-agent: Bingbot
Allow: /
Disallow: /team
Disallow: /auth
Disallow: /p/

User-agent: GPTBot
Allow: /
Disallow: /team
Disallow: /auth
Disallow: /p/

User-agent: ChatGPT-User
Allow: /
Disallow: /team
Disallow: /auth
Disallow: /p/

User-agent: Google-Extended
Allow: /
Disallow: /team
Disallow: /auth
Disallow: /p/

User-agent: PerplexityBot
Allow: /
Disallow: /team
Disallow: /auth
Disallow: /p/

User-agent: Applebot
Allow: /
Disallow: /team
Disallow: /auth
Disallow: /p/

Host: www.onezcodes.com

Sitemap: ${sitemapURL.href}
`;

export const GET: APIRoute = ({ site }) => {
  const sitemapURL = new URL('sitemap-index.xml', site);
  return new Response(body(sitemapURL), {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
};
