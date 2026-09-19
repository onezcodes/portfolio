import type { SupabaseClient } from '@supabase/supabase-js';
import { encryptSecret, vaultReady, websiteHref } from './credentials';
import type { Project } from './ledger';
import { isHttpUrl, storedImageFromForm, voucherHrefs } from './vouchers';

export type ExtraLink = { label: string; url: string };

export const PROJECT_URL_FIELDS = [
  { key: 'meeting_url', label: 'Meeting', placeholder: 'https://meet.google.com/…' },
  { key: 'website_url', label: 'Production', placeholder: 'https://' },
  { key: 'staging_url', label: 'Staging', placeholder: 'https://staging.' },
  { key: 'admin_url', label: 'Admin / CMS', placeholder: 'https://admin.' },
  { key: 'login_url', label: 'Login page', placeholder: 'https://…/login' },
  { key: 'repo_url', label: 'Repo', placeholder: 'https://github.com/…' },
  { key: 'slack_url', label: 'Slack', placeholder: 'https://…slack.com/…' },
] as const;

export type ProjectUrlKey = (typeof PROJECT_URL_FIELDS)[number]['key'];

export function extraLinksOf(raw: unknown): ExtraLink[] {
  if (!Array.isArray(raw)) return [];
  const links: ExtraLink[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    const label = String(row.label ?? '').trim().slice(0, 40);
    const url = parseProjectUrl(String(row.url ?? ''));
    if (!label || url === null || !url) continue;
    links.push({ label, url });
    if (links.length >= 8) break;
  }
  return links;
}

export function parseProjectUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return '';
  try {
    const href = trimmed.includes('://') ? trimmed : `https://${trimmed}`;
    const url = new URL(href);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return href;
  } catch {
    return null;
  }
}

export function extraLinksFromForm(form: FormData): ExtraLink[] | null {
  const labels = form.getAll('extra_label').map((value) => String(value).trim().slice(0, 40));
  const urls = form.getAll('extra_url').map((value) => String(value).trim());
  const links: ExtraLink[] = [];
  const count = Math.max(labels.length, urls.length);
  for (let index = 0; index < count; index += 1) {
    const label = labels[index] ?? '';
    const raw = urls[index] ?? '';
    if (!label && !raw) continue;
    const url = parseProjectUrl(raw);
    if (!label || url === null || !url) return null;
    links.push({ label, url });
  }
  return links.slice(0, 8);
}

export function hubFromForm(form: FormData) {
  const urls: Record<ProjectUrlKey, string> = {
    meeting_url: '',
    website_url: '',
    staging_url: '',
    admin_url: '',
    login_url: '',
    repo_url: '',
    slack_url: '',
  };
  for (const field of PROJECT_URL_FIELDS) {
    const parsed = parseProjectUrl(String(form.get(field.key) ?? ''));
    if (parsed === null) return null;
    urls[field.key] = parsed;
  }
  const extra_links = extraLinksFromForm(form);
  if (extra_links === null) return null;
  return {
    ...urls,
    extra_links,
    login_username: String(form.get('login_username') ?? '').trim(),
    login_email: String(form.get('login_email') ?? '').trim().toLowerCase(),
  };
}

export function loginPasswordFromForm(form: FormData, currentEnc: string) {
  const next = String(form.get('login_password') ?? '');
  if (!next.trim()) return { login_password_enc: currentEnc };
  if (!vaultReady()) return { error: 'vault-setup' as const };
  return { login_password_enc: encryptSecret(next) };
}

export async function logoFromForm(
  form: FormData,
  supabase: SupabaseClient,
  userId: string,
  currentLogo: string,
) {
  if (form.get('clear_logo') === '1') {
    if (currentLogo && !isHttpUrl(currentLogo)) {
      await supabase.storage.from('vouchers').remove([currentLogo]);
    }
    return { logo_url: '' };
  }
  const stored = await storedImageFromForm(form, supabase, userId, 'logo', 'logo_url');
  if ('error' in stored) return stored;
  if (stored.path === null) return { logo_url: currentLogo };
  if (currentLogo && !isHttpUrl(currentLogo) && currentLogo !== stored.path) {
    await supabase.storage.from('vouchers').remove([currentLogo]);
  }
  return { logo_url: stored.path };
}

export function projectLinks(project: Project) {
  const named = PROJECT_URL_FIELDS.flatMap((field) => {
    const url = project[field.key];
    if (!url) return [];
    return [{ label: field.label, url, href: websiteHref(url) }];
  });
  const extra = extraLinksOf(project.extra_links).map((link) => ({
    ...link,
    href: websiteHref(link.url),
  }));
  return [...named, ...extra];
}

export async function logoHrefs(supabase: SupabaseClient, projects: Pick<Project, 'logo_url'>[]) {
  return voucherHrefs(
    supabase,
    projects.map((project) => ({ voucher_url: project.logo_url })),
  );
}
