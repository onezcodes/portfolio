import type { ImageMetadata } from 'astro';
import ftzLogo from '../assets/ftz-logo.webp';
import lumiereLogo from '../assets/lumiere-logo.webp';
import saydiagramLogo from '../assets/saydiagram-logo.webp';
import strideLogo from '../assets/stride-logo.webp';

export const site = {
  name: 'Onez Codes',
  shortName: 'OC',
  tagline: 'Tech Solutions · Software House',
  description:
    'Onez Codes is a software house for teams who want sharp products without the noise. Web apps, custom software, and product design — built clean.',
  url: 'https://www.onezcodes.com',
  email: 'onezcodes@gmail.com',
  /** Set to a Formspree (or similar) endpoint to enable form posts. Empty uses mailto. */
  formAction: '',
  location: 'Available worldwide',
  /** Paste the Google Search Console content token when you have it. */
  googleSiteVerification: '',
  social: [
    { label: 'Instagram', href: 'https://www.instagram.com/onezcodes', handle: '@onezcodes' },
    { label: 'X', href: 'https://x.com/onezcodes', handle: '@onezcodes' },
  ],
} as const;

export type Service = {
  slug: string;
  title: string;
  summary: string;
  description: string;
  deliverables: string[];
};

export const services: Service[] = [
  {
    slug: 'web-apps',
    title: 'Web applications',
    summary: 'Product sites, dashboards, and customer portals that stay fast after launch.',
    description:
      'We build web software that loads quickly and holds up under real use. The stack stays boring on purpose: proven tools, clear structure, and pages that do one job well.',
    deliverables: [
      'Marketing sites and web apps',
      'Customer and admin dashboards',
      'Authentication and role-based access',
      'Performance and accessibility pass',
    ],
  },
  {
    slug: 'custom-software',
    title: 'Custom software',
    summary: 'Internal tools and platforms shaped around how your team actually works.',
    description:
      'Off-the-shelf software often fights the process. We map the work, then build the smallest system that removes the friction — replacing spreadsheets, email chains, and glue.',
    deliverables: [
      'Operations and workflow tools',
      'Integrations with existing systems',
      'Data models that match the business',
      'Handover docs and training',
    ],
  },
  {
    slug: 'product-ux',
    title: 'Product & UX',
    summary: 'Structure, interface, and copy that make the software obvious to use.',
    description:
      'Design sits with engineering, not before it. We define the flows, write the interface, and ship in the same cycle so the product does not drift from the prototype.',
    deliverables: [
      'Information architecture and flows',
      'Interface design for web and mobile',
      'Component systems and UI kits',
      'Content and microcopy',
    ],
  },
  {
    slug: 'ongoing-support',
    title: 'Ongoing support',
    summary: 'Care, iteration, and delivery after launch — not a handoff into the void.',
    description:
      'Software is not finished at go-live. We stay on for fixes, small features, and the unglamorous work that keeps a product trustworthy.',
    deliverables: [
      'Retainer or sprint-based care',
      'Monitoring and incident response',
      'Iterative feature work',
      'Dependency and security updates',
    ],
  },
];

export type Project = {
  title: string;
  sector: string;
  outcome: string;
  stack: string[];
  featured: boolean;
  href?: string;
  logo?: ImageMetadata;
  comingSoon?: boolean;
  logoWide?: boolean;
};

export const projects: Project[] = [
  {
    title: 'Final Third Zone',
    sector: 'Media',
    outcome:
      'A bilingual football newsroom for Myanmar readers — Premier League coverage, match centres, shorts, and live streaming.',
    stack: ['News platform', 'Myanmar / English', 'Live fixtures'],
    featured: true,
    href: 'https://www.finalthirdzone.com/',
    logo: ftzLogo,
  },
  {
    title: 'SayDiagram',
    sector: 'Developer tools',
    outcome:
      'A Mermaid diagram platform — import, edit with live preview, share links, and export SVG, PNG, or PDF, plus a VS Code extension.',
    stack: ['Next.js', 'Mermaid', 'VS Code'],
    featured: true,
    href: 'https://saydiagram.com',
    logo: saydiagramLogo,
    logoWide: true,
  },
  {
    title: 'Lumiere',
    sector: 'Lifestyle',
    outcome:
      'A marketplace to read your sign each month, follow trusted readers, and ask a question of your own — iOS and web.',
    stack: ['SwiftUI', 'Laravel', 'Tarot'],
    featured: true,
    comingSoon: true,
    logo: lumiereLogo,
  },
  {
    title: 'Stride',
    sector: 'Health',
    outcome:
      'An AI fitness coach for running plans, GPS-tracked sessions, recovery, and nutrition — React Native and Laravel.',
    stack: ['React Native', 'Laravel', 'AI coach'],
    featured: true,
    comingSoon: true,
    logo: strideLogo,
  },
];

export const nav = [
  { href: '/work', label: 'Work' },
  { href: '/services', label: 'Services' },
  { href: '/contact', label: 'Contact' },
] as const;

export const process = [
  {
    title: 'Brief',
    body: 'Send the product, the constraint, and the date that matters. A few sentences are enough.',
  },
  {
    title: 'Scope',
    body: 'We reply with whether we are a fit, the first slice, and what the next two weeks look like.',
  },
  {
    title: 'Build',
    body: 'Senior work, small surface area, shipped in the open. No theatre, no extra layers.',
  },
  {
    title: 'Care',
    body: 'Fixes, iteration, and the unglamorous work after launch — not a handoff into the void.',
  },
] as const;

export const stack = ['Next.js', 'Laravel', 'SwiftUI', 'React Native', 'PostgreSQL'] as const;

export const audience = [
  {
    title: 'Product teams',
    body: 'You need a house that can ship web and mobile, not a crowd that needs managing.',
  },
  {
    title: 'Operators',
    body: 'The work is stuck in spreadsheets, email, and glue. You want one system that matches how you actually operate.',
  },
  {
    title: 'Founders',
    body: 'You want iOS, Android, and web from one studio — and someone still there after launch.',
  },
] as const;

export const brief = [
  'What you are building',
  'The constraint — time, stack, or budget',
  'The date that matters',
] as const;
