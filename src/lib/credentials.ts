import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

const SECRET_FIELDS = ['password', 'api_key', 'api_token', 'notes'] as const;
export type SecretField = (typeof SECRET_FIELDS)[number];

export type CredentialRecord = {
  id: string;
  title: string;
  website: string;
  username: string;
  login_email: string;
  password_enc: string;
  api_key_enc: string;
  api_token_enc: string;
  notes_enc: string;
  created_at: string;
  updated_at: string;
};

export type CredentialSecrets = {
  password: string;
  api_key: string;
  api_token: string;
  notes: string;
};

export function vaultReady() {
  return Boolean(import.meta.env.CREDENTIALS_SECRET);
}

function vaultKey() {
  const secret = import.meta.env.CREDENTIALS_SECRET;
  if (!secret) return null;
  return createHash('sha256').update(secret).digest();
}

export function encryptSecret(plain: string) {
  const value = plain.trim();
  if (!value) return '';
  const key = vaultKey();
  if (!key) throw new Error('vault-setup');
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64url')}.${tag.toString('base64url')}.${encrypted.toString('base64url')}`;
}

export function decryptSecret(payload: string) {
  if (!payload) return '';
  const key = vaultKey();
  if (!key) return '';
  const [ivB64, tagB64, dataB64] = payload.split('.');
  if (!ivB64 || !tagB64 || !dataB64) return '';
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivB64, 'base64url'));
    decipher.setAuthTag(Buffer.from(tagB64, 'base64url'));
    return Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64url')), decipher.final()]).toString('utf8');
  } catch {
    return '';
  }
}

export function decryptCredential(row: CredentialRecord): CredentialSecrets {
  return {
    password: decryptSecret(row.password_enc),
    api_key: decryptSecret(row.api_key_enc),
    api_token: decryptSecret(row.api_token_enc),
    notes: decryptSecret(row.notes_enc),
  };
}

export function credentialPayload(form: FormData, current?: CredentialRecord) {
  const title = String(form.get('title') ?? '').trim();
  if (!title) return null;
  const keep = (field: SecretField, existing = '') => {
    const next = String(form.get(field) ?? '');
    return next.trim() ? encryptSecret(next) : existing;
  };
  return {
    title,
    website: String(form.get('website') ?? '').trim(),
    username: String(form.get('username') ?? '').trim(),
    login_email: String(form.get('login_email') ?? '').trim().toLowerCase(),
    password_enc: keep('password', current?.password_enc),
    api_key_enc: keep('api_key', current?.api_key_enc),
    api_token_enc: keep('api_token', current?.api_token_enc),
    notes_enc: keep('notes', current?.notes_enc),
  };
}

export function websiteHref(website: string) {
  const value = website.trim();
  if (!value) return '';
  if (/^https?:\/\//i.test(value)) return value;
  return `https://${value}`;
}

export function isSecretField(value: string): value is SecretField {
  return (SECRET_FIELDS as readonly string[]).includes(value);
}

export function hasSecret(row: CredentialRecord, field: SecretField) {
  return Boolean(row[`${field}_enc`]);
}

export const CREDENTIAL_STALE_DAYS = 90;

export function isStaleCredential(updatedAt: string, days = CREDENTIAL_STALE_DAYS) {
  const then = new Date(updatedAt).getTime();
  if (Number.isNaN(then)) return false;
  return Date.now() - then > days * 24 * 60 * 60 * 1000;
}
