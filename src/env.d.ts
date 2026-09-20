/// <reference types="astro/client" />

interface ImportMetaEnv {
  readonly PUBLIC_SUPABASE_URL: string;
  readonly PUBLIC_SUPABASE_ANON_KEY: string;
  readonly PUBLIC_SITE_URL?: string;
  readonly RESEND_API_KEY?: string;
  readonly MAIL_FROM?: string;
  readonly CREDENTIALS_SECRET?: string;
  readonly CRON_SECRET?: string;
  readonly SUPABASE_SERVICE_ROLE_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare namespace App {
  interface Locals {
    supabase: import('@supabase/supabase-js').SupabaseClient;
    user: import('@supabase/supabase-js').User | null;
    studio: import('./lib/access').StudioAccess | null;
  }
}
