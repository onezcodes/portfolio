import type { ImageMetadata } from 'astro';
import ftzLogo from '../assets/ftz-logo.webp';
import ftzShot from '../assets/ftz-shot.webp';
import lumiereLogo from '../assets/lumiere-logo.webp';
import inoutLogo from '../assets/inout-logo.webp';
import onezvpnLogo from '../assets/onezvpn-logo.webp';
import saydiagramLogo from '../assets/saydiagram-logo.webp';
import saydiagramShot from '../assets/saydiagram-shot.webp';
import strideLogo from '../assets/stride-logo.webp';

export const site = {
  name: 'Onez Codes',
  shortName: 'OC',
  tagline: 'Tech Solutions · Software House',
  description:
    'Onez Codes is a software house for teams who want sharp products without the noise. Web, iOS, Android, and custom software — built clean.',
  url: 'https://www.onezcodes.com',
  email: 'onezcodes@gmail.com',
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
    slug: 'mobile-apps',
    title: 'iOS & Android',
    summary: 'Native and cross-platform apps that feel like one product, not two afterthoughts.',
    description:
      'We ship iOS and Android from the same house as the web. One product, two stores, a shared backend — not a separate vendor for each platform.',
    deliverables: [
      'iOS and Android apps',
      'Shared APIs and accounts',
      'Store submission and updates',
      'Care after launch',
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
  shot?: ImageMetadata;
  comingSoon?: boolean;
  logoWide?: boolean;
  logoSquare?: boolean;
  logoCompact?: boolean;
  logoLarge?: boolean;
};

export const projects: Project[] = [
  {
    title: 'Final Third Zone',
    sector: 'Media',
    outcome:
      'A bilingual football newsroom — Premier League coverage, match centres, shorts, and live streaming. iOS and Android apps are on the way.',
    stack: ['News platform', 'Live fixtures', 'iOS / Android'],
    featured: true,
    href: 'https://www.finalthirdzone.com/',
    logo: ftzLogo,
    shot: ftzShot,
  },
  {
    title: 'SayDiagram',
    sector: 'Developer tools',
    outcome:
      'A diagram workspace with live preview — import, edit, share a link, and export for the page or the slide, plus an editor in VS Code.',
    stack: ['Live preview', 'Share & export', 'VS Code'],
    featured: true,
    href: 'https://saydiagram.com',
    logo: saydiagramLogo,
    shot: saydiagramShot,
    logoSquare: true,
    logoCompact: true,
  },
  {
    title: 'Lumiere',
    sector: 'Lifestyle',
    outcome:
      'A marketplace for monthly readings — follow trusted readers, or ask a question of your own, on iOS and the web.',
    stack: ['Readings', 'Marketplace', 'iOS / web'],
    featured: false,
    comingSoon: true,
    logo: lumiereLogo,
  },
  {
    title: 'Stride',
    sector: 'Health',
    outcome:
      'A personal running coach that plans the week, tracks GPS sessions, and keeps recovery and nutrition in the same programme.',
    stack: ['Running plans', 'GPS sessions', 'Recovery'],
    featured: false,
    comingSoon: true,
    logo: strideLogo,
  },
  {
    title: 'OnezVPN',
    sector: 'Privacy',
    outcome:
      'A private VPN for iOS and Android — stay reachable on restricted networks, with Asia-first servers you can actually use.',
    stack: ['iOS', 'Android', 'Privacy'],
    featured: false,
    comingSoon: true,
    logo: onezvpnLogo,
  },
  {
    title: 'InOut',
    sector: 'Finance',
    outcome:
      'A money app for people who live across currencies — what you spend, what is due, and what you can save, on iOS and Android.',
    stack: ['Multi-currency', 'Budget', 'iOS / Android'],
    featured: false,
    comingSoon: true,
    logo: inoutLogo,
    logoSquare: true,
    logoLarge: true,
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

export const studio = {
  title: 'A small house for serious software',
  body: 'A handful of people, one point of contact. We ship web, iOS, and Android from the same house — then we stay on after launch. Clear scope, no theatre.',
} as const;

export const surfaces = ['Web', 'iOS', 'Android', 'A mix', 'Not sure yet'] as const;

export const timelines = ['ASAP', 'This month', 'This quarter', 'Flexible'] as const;

export const brief = [
  'What you are building',
  'Web, iOS, Android — or a mix',
  'The constraint — time or budget',
  'The date that matters',
] as const;
