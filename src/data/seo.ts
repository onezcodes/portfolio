import { site, services, projects } from './site';

export const origin = site.url.replace(/\/$/, '');

export const pages = {
  home: {
    title: 'Onez Codes | Software House for Web Apps & Custom Software',
    description:
      'Onez Codes is a software house for web apps, custom software, iOS, Android, and product UX. Senior work, a small team, worldwide — then we stay on after launch.',
  },
  work: {
    title: 'Work',
    description:
      'Selected software from Onez Codes: Final Third Zone and SayDiagram are live; Lumiere, Stride, OnezVPN, and InOut are coming soon. Web, iOS, and Android products.',
  },
  services: {
    title: 'Services',
    description:
      'Web applications, iOS and Android apps, custom software, product & UX, and ongoing support from Onez Codes. Senior engineering, small surface area, available worldwide.',
  },
  contact: {
    title: 'Contact',
    description:
      'Start a software project with Onez Codes. Email onezcodes@gmail.com with the product, the platform, the constraint, and the date that matters.',
  },
  notFound: {
    title: 'Page not found',
    description: 'That page is not on Onez Codes. Try work, services, or get in touch.',
  },
} as const;

const crumbs: Record<string, { name: string; path: string }[]> = {
  '/': [{ name: 'Home', path: '/' }],
  '/work': [
    { name: 'Home', path: '/' },
    { name: 'Work', path: '/work' },
  ],
  '/services': [
    { name: 'Home', path: '/' },
    { name: 'Services', path: '/services' },
  ],
  '/contact': [
    { name: 'Home', path: '/' },
    { name: 'Contact', path: '/contact' },
  ],
};

export function canonicalUrl(pathname: string): string {
  const path = pathname.split('?')[0].split('#')[0];
  const normalized = path === '/' ? '/' : path.replace(/\/+$/, '');
  return normalized === '/' ? `${origin}/` : `${origin}${normalized}`;
}

export function absoluteUrl(path: string): string {
  if (path.startsWith('http')) return path;
  return canonicalUrl(path);
}

const orgId = `${origin}/#organization`;
const websiteId = `${origin}/#website`;
const logoId = `${origin}/#logo`;
const ogId = `${origin}/#og`;

function organization() {
  return {
    '@type': 'Organization',
    '@id': orgId,
    name: site.name,
    legalName: site.name,
    alternateName: [site.shortName, 'OnezCodes'],
    url: `${origin}/`,
    email: site.email,
    description: site.description,
    slogan: site.tagline,
    areaServed: { '@type': 'Place', name: 'Worldwide' },
    knowsAbout: [
      'Web application development',
      'Custom software',
      'Product design',
      'UX design',
      'iOS apps',
      'Android apps',
      'Next.js',
      'Laravel',
      'SwiftUI',
      'React Native',
      'PostgreSQL',
    ],
    logo: { '@id': logoId },
    image: { '@id': ogId },
    sameAs: site.social.map((item) => item.href),
    contactPoint: {
      '@type': 'ContactPoint',
      contactType: 'sales',
      email: site.email,
      url: `${origin}/contact`,
      availableLanguage: ['English'],
      areaServed: 'Worldwide',
    },
    hasOfferCatalog: {
      '@type': 'OfferCatalog',
      name: 'Software house services',
      itemListElement: services.map((service) => ({
        '@type': 'Offer',
        itemOffered: {
          '@type': 'Service',
          name: service.title,
          description: service.summary,
          url: `${origin}/services#${service.slug}`,
          provider: { '@id': orgId },
        },
      })),
    },
  };
}

function website() {
  return {
    '@type': 'WebSite',
    '@id': websiteId,
    url: `${origin}/`,
    name: site.name,
    alternateName: site.shortName,
    description: site.description,
    inLanguage: 'en',
    publisher: { '@id': orgId },
  };
}

function images() {
  return [
    {
      '@type': 'ImageObject',
      '@id': logoId,
      url: `${origin}/logo.png`,
      contentUrl: `${origin}/logo.png`,
      caption: `${site.name} logo`,
      width: 512,
      height: 512,
      encodingFormat: 'image/png',
    },
    {
      '@type': 'ImageObject',
      '@id': ogId,
      url: `${origin}/og.png`,
      contentUrl: `${origin}/og.png`,
      caption: `${site.name} — ${site.tagline}`,
      width: 1200,
      height: 630,
      encodingFormat: 'image/png',
    },
  ];
}

function breadcrumb(path: string) {
  const items = crumbs[path] ?? [{ name: 'Home', path: '/' }];
  return {
    '@type': 'BreadcrumbList',
    '@id': `${canonicalUrl(path)}#breadcrumb`,
    itemListElement: items.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.name,
      item: canonicalUrl(item.path),
    })),
  };
}

function pageType(path: string): string {
  if (path === '/contact') return 'ContactPage';
  if (path === '/work') return 'CollectionPage';
  if (path === '/services') return 'CollectionPage';
  return 'WebPage';
}

function serviceList() {
  return {
    '@type': 'ItemList',
    '@id': `${origin}/services#list`,
    name: 'Onez Codes services',
    numberOfItems: services.length,
    itemListElement: services.map((service, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: service.title,
      url: `${origin}/services#${service.slug}`,
      item: {
        '@type': 'Service',
        name: service.title,
        description: service.description,
        url: `${origin}/services#${service.slug}`,
        provider: { '@id': orgId },
        areaServed: 'Worldwide',
        serviceType: service.title,
      },
    })),
  };
}

function workList() {
  return {
    '@type': 'ItemList',
    '@id': `${origin}/work#list`,
    name: 'Selected work',
    numberOfItems: projects.length,
    itemListElement: projects.map((project, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: project.title,
      url: project.href ?? `${origin}/work`,
      item: {
        '@type': 'CreativeWork',
        name: project.title,
        description: project.outcome,
        creator: { '@id': orgId },
        ...(project.href ? { url: project.href } : {}),
        keywords: project.stack.join(', '),
        genre: project.sector,
        creativeWorkStatus: project.comingSoon ? 'Incomplete' : 'Published',
      },
    })),
  };
}

export function jsonLdGraph(opts: { path: string; title: string; description: string }) {
  const url = canonicalUrl(opts.path);
  const webpage = {
    '@type': pageType(opts.path),
    '@id': `${url}#webpage`,
    url,
    name: opts.title,
    description: opts.description,
    inLanguage: 'en',
    isPartOf: { '@id': websiteId },
    about: { '@id': orgId },
    primaryImageOfPage: { '@id': ogId },
    breadcrumb: { '@id': `${url}#breadcrumb` },
  };

  const graph: Record<string, unknown>[] = [
    organization(),
    website(),
    ...images(),
    webpage,
    breadcrumb(opts.path),
  ];

  if (opts.path === '/' || opts.path === '/services') graph.push(serviceList());
  if (opts.path === '/' || opts.path === '/work') graph.push(workList());

  return { '@context': 'https://schema.org', '@graph': graph };
}
