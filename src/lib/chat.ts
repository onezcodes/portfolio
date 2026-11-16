/**
 * Team chat notifications through an incoming webhook (Slack or Discord).
 * Only those hosts are allowed, so a stored URL can never make the server call
 * an arbitrary address.
 */
const ALLOWED_HOSTS = ['hooks.slack.com', 'discord.com', 'discordapp.com', 'ptb.discord.com', 'canary.discord.com'];

export function parseWebhookUrl(raw: string): string | null | '' {
  const value = raw.trim();
  if (!value) return '';
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:') return null;
    if (!ALLOWED_HOSTS.includes(url.hostname)) return null;
    if (url.hostname === 'hooks.slack.com' && !url.pathname.startsWith('/services/')) return null;
    if (url.hostname !== 'hooks.slack.com' && !url.pathname.startsWith('/api/webhooks/')) return null;
    return url.toString();
  } catch {
    return null;
  }
}

export function webhookKind(url: string) {
  return new URL(url).hostname === 'hooks.slack.com' ? 'Slack' : 'Discord';
}

export function maskWebhook(url: string) {
  if (!url) return '';
  const parsed = new URL(url);
  return `${parsed.hostname}/…${parsed.pathname.slice(-6)}`;
}

/** Post a line of text. Never throws; gives up after 3 seconds. */
export async function postToChat(url: string | null | undefined, text: string, link?: string) {
  const target = url ? parseWebhookUrl(url) : null;
  if (!target) return false;
  const message = link ? `${text}\n${link}` : text;
  const slack = new URL(target).hostname === 'hooks.slack.com';
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3000);
  try {
    const res = await fetch(target, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(slack ? { text: message } : { content: message.slice(0, 1900) }),
      signal: controller.signal,
      redirect: 'error',
    });
    return res.ok;
  } catch (error) {
    console.error('chat webhook failed', error instanceof Error ? error.message : error);
    return false;
  } finally {
    clearTimeout(timer);
  }
}
