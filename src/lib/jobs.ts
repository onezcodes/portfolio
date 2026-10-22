import type { SupabaseClient } from '@supabase/supabase-js';

export const JOB_STATUSES = ['draft', 'open', 'closed'] as const;
export const EMPLOYMENT_TYPES = ['full-time', 'contract', 'internship'] as const;

export type JobStatus = (typeof JOB_STATUSES)[number];
export type EmploymentType = (typeof EMPLOYMENT_TYPES)[number];

export type JobOpportunity = {
  id: string;
  title: string;
  slug: string;
  location: string;
  employment_type: EmploymentType;
  summary: string;
  body: string;
  status: JobStatus;
  apply_email: string;
  published_at: string | null;
  created_at: string;
  updated_at: string;
};

export type PublicJob = Pick<
  JobOpportunity,
  'title' | 'slug' | 'location' | 'employment_type' | 'summary' | 'body' | 'apply_email' | 'published_at'
>;

export type PublicJobCard = Pick<PublicJob, 'title' | 'slug' | 'location' | 'employment_type' | 'summary' | 'published_at'>;

const STATUS_LABELS: Record<JobStatus, string> = {
  draft: 'Draft',
  open: 'Open',
  closed: 'Closed',
};

const TYPE_LABELS: Record<EmploymentType, string> = {
  'full-time': 'Full-time',
  contract: 'Contract',
  internship: 'Internship',
};

const TYPE_SCHEMA: Record<EmploymentType, string> = {
  'full-time': 'FULL_TIME',
  contract: 'CONTRACTOR',
  internship: 'INTERN',
};

export function isJobStatus(value: string): value is JobStatus {
  return (JOB_STATUSES as readonly string[]).includes(value);
}

export function isEmploymentType(value: string): value is EmploymentType {
  return (EMPLOYMENT_TYPES as readonly string[]).includes(value);
}

export function statusLabel(status: string) {
  return isJobStatus(status) ? STATUS_LABELS[status] : status;
}

export function employmentLabel(type: string) {
  return isEmploymentType(type) ? TYPE_LABELS[type] : type;
}

export function employmentSchema(type: string) {
  return isEmploymentType(type) ? TYPE_SCHEMA[type] : 'OTHER';
}

export function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/g, '');
}

export function isSlugConflict(error: { code?: string } | null) {
  return error?.code === '23505';
}

export function jobFromForm(form: FormData, current?: { published_at: string | null }) {
  const title = String(form.get('title') ?? '').trim().slice(0, 120);
  if (!title) return null;
  const slug = slugify(String(form.get('slug') ?? '').trim() || title);
  if (!slug) return null;
  const status = String(form.get('status') ?? 'draft');
  if (!isJobStatus(status)) return null;
  const employment_type = String(form.get('employment_type') ?? 'full-time');
  if (!isEmploymentType(employment_type)) return null;
  const apply_email = String(form.get('apply_email') ?? '').trim().toLowerCase().slice(0, 200);
  if (apply_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(apply_email)) return null;
  const location = String(form.get('location') ?? '').trim().slice(0, 80) || 'Remote';
  const published_at = status === 'open' ? (current?.published_at ?? new Date().toISOString()) : (current?.published_at ?? null);
  return {
    title,
    slug,
    location,
    employment_type,
    summary: String(form.get('summary') ?? '').trim().slice(0, 280),
    body: String(form.get('body') ?? '').trim().slice(0, 8000),
    status,
    apply_email,
    published_at,
  };
}

export function jobParagraphs(body: string) {
  return body
    .split(/\n\s*\n/)
    .map((part) => part.trim())
    .filter(Boolean);
}

export function applyHref(job: { title: string; apply_email: string }, fallback: string) {
  const email = job.apply_email.trim() || fallback;
  return `mailto:${email}?subject=${encodeURIComponent(`Application: ${job.title}`)}`;
}

export function isRemoteLocation(location: string) {
  return /remote/i.test(location);
}

export async function listOpenJobs(client: SupabaseClient): Promise<PublicJobCard[]> {
  const { data, error } = await client
    .from('job_opportunities')
    .select('title, slug, location, employment_type, summary, published_at')
    .eq('status', 'open')
    .order('published_at', { ascending: false });
  if (error) {
    console.error(error.message);
    return [];
  }
  return (data ?? []) as PublicJobCard[];
}

export async function openJobBySlug(client: SupabaseClient, slug: string): Promise<PublicJob | null> {
  const clean = slugify(slug);
  if (!clean || clean !== slug) return null;
  const { data, error } = await client
    .from('job_opportunities')
    .select('title, slug, location, employment_type, summary, body, apply_email, published_at')
    .eq('status', 'open')
    .eq('slug', clean)
    .maybeSingle();
  if (error) {
    console.error(error.message);
    return null;
  }
  return (data as PublicJob | null) ?? null;
}
