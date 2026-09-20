# Onez Codes

Static site for [Onez Codes](https://www.onezcodes.com) — tech solutions and software house. Built with Astro, almost no client JavaScript.

## Commands

```sh
npm install
npm run dev      # http://localhost:4321
npm run build
npm run preview
```

Copy lives in `src/data/site.ts` (name, email, services, projects). The contact form posts to `/api/contact` and emails the studio via Resend (`RESEND_API_KEY` in `.env`).
