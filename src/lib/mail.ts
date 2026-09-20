import { site } from '../data/site';
import { siteUrl } from './supabase';

const gold = '#FFB800';
const ink = '#171614';
const canvas = '#FAFAF8';
const surface = '#FFFFFF';
const muted = '#6B6660';
const line = '#E8E4DC';
const font = `'Outfit', 'Segoe UI', 'Helvetica Neue', Arial, sans-serif`;

export function mailConfigured() {
  return Boolean(import.meta.env.RESEND_API_KEY);
}

function fromAddress() {
  return import.meta.env.MAIL_FROM?.trim() || 'Onez Codes <onboarding@resend.dev>';
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function wrapHtml(inner: string) {
  const origin = site.url.replace(/\/+$/, '');
  const logo = `${origin}/apple-touch-icon.png`;

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="color-scheme" content="light" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600&display=swap" rel="stylesheet" />
  </head>
  <body style="margin:0;padding:0;background:${canvas};">
    <span style="display:none !important;visibility:hidden;opacity:0;height:0;width:0;overflow:hidden;mso-hide:all;">
      ${site.name} · ${site.tagline}
    </span>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:${canvas};">
      <tr>
        <td align="center" style="padding:40px 20px;">
          <table role="presentation" width="560" cellspacing="0" cellpadding="0" style="width:100%;max-width:560px;font-family:${font};color:${ink};">
            <tr>
              <td style="padding:0 4px 20px;">
                <table role="presentation" cellspacing="0" cellpadding="0">
                  <tr>
                    <td style="vertical-align:middle;padding-right:12px;">
                      <img src="${logo}" width="36" height="36" alt="" style="display:block;border:0;border-radius:8px;" />
                    </td>
                    <td style="vertical-align:middle;">
                      <p style="margin:0;font-size:15px;font-weight:600;letter-spacing:0.01em;line-height:1.15;color:${ink};">${site.name}</p>
                      <p style="margin:3px 0 0;font-size:11px;letter-spacing:0.04em;text-transform:uppercase;color:${muted};">${site.tagline}</p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="height:3px;line-height:3px;font-size:0;background:${gold};">&nbsp;</td>
            </tr>
            <tr>
              <td style="background:${surface};border:1px solid ${line};border-top:0;padding:36px 32px 32px;">
                ${inner}
              </td>
            </tr>
            <tr>
              <td style="padding:22px 4px 0;color:${muted};font-size:12px;line-height:1.55;">
                <p style="margin:0 0 6px;">${site.name} · Studio</p>
                <p style="margin:0;">
                  <a href="${origin}" style="color:${muted};text-decoration:none;border-bottom:1px solid ${gold};">${origin.replace(/^https:\/\//, '')}</a>
                  · ${site.email}
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function letter(opts: {
  kicker: string;
  heading: string;
  body: string;
  cta: string;
  href: string;
  note: string;
}) {
  return `
    <p style="margin:0 0 14px;font-size:11px;font-weight:500;letter-spacing:0.14em;text-transform:uppercase;color:${gold};">${opts.kicker}</p>
    <h1 style="margin:0 0 16px;font-size:28px;font-weight:600;letter-spacing:-0.03em;line-height:1.15;color:${ink};">${opts.heading}</h1>
    <p style="margin:0 0 28px;font-size:16px;line-height:1.6;color:${ink};">${opts.body}</p>
    <table role="presentation" cellspacing="0" cellpadding="0" style="margin:0 0 28px;">
      <tr>
        <td style="background:${gold};border:1px solid ${gold};">
          <a href="${opts.href}" style="display:inline-block;padding:13px 22px;font-size:15px;font-weight:600;letter-spacing:0.01em;color:${ink};text-decoration:none;">${opts.cta}</a>
        </td>
      </tr>
    </table>
    <p style="margin:0;padding-top:20px;border-top:1px solid ${line};font-size:13px;line-height:1.55;color:${muted};">${opts.note}</p>
  `;
}

export async function sendMail(opts: { to: string; subject: string; text: string; html: string }) {
  const key = import.meta.env.RESEND_API_KEY;
  if (!key) return { error: 'setup' as const };

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: fromAddress(),
      to: [opts.to],
      subject: opts.subject,
      text: opts.text,
      html: wrapHtml(opts.html),
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    console.error('invite email failed', response.status, detail);
    return { error: 'send' as const };
  }

  return { error: null };
}

export function teamLoginUrl(request: Request) {
  return `${siteUrl(request)}/team/login`;
}

export function teamInvite(loginUrl: string) {
  const subject = `You're invited to the ${site.name} team app`;
  const text = `You've been added to the ${site.name} studio team.\n\nSign in with Google or GitHub using this same email:\n${loginUrl}\n\nIf you were not expecting this, ignore the message.`;
  const html = letter({
    kicker: 'Studio',
    heading: "You're on the team",
    body: `You've been added to the ${site.name} studio app. Sign in with Google or GitHub using this email address.`,
    cta: 'Sign in',
    href: loginUrl,
    note: `If the button does not work, open ${loginUrl}. If you were not expecting this, you can ignore it.`,
  });
  return { subject, text, html };
}

export function projectInvite(projectName: string, roles: string[], loginUrl: string) {
  const roleList = roles.join(', ');
  const subject = `You've been added to ${projectName}`;
  const text = `You've been added to ${projectName} on the ${site.name} team app as: ${roleList}.\n\nSign in:\n${loginUrl}`;
  const html = letter({
    kicker: 'Project',
    heading: escapeHtml(projectName),
    body: `You've been added to this job as <strong>${escapeHtml(roleList)}</strong>. Sign in with Google or GitHub using this email.`,
    cta: 'Open the team app',
    href: loginUrl,
    note: `If the button does not work, open ${loginUrl}.`,
  });
  return { subject, text, html };
}

export async function sendTeamInvite(to: string, request: Request) {
  const copy = teamInvite(teamLoginUrl(request));
  return sendMail({ to, ...copy });
}

export async function sendProjectInvite(to: string, projectName: string, roles: string[], request: Request) {
  const copy = projectInvite(projectName, roles, teamLoginUrl(request));
  return sendMail({ to, ...copy });
}

export function vaultInvite(title: string, loginUrl: string) {
  const subject = `You've been given access to ${title}`;
  const text = `You've been given access to studio credentials “${title}” on the ${site.name} team app.\n\nSign in:\n${loginUrl}`;
  const html = letter({
    kicker: 'Credentials',
    heading: 'Shared access',
    body: `You've been given access to <strong>${escapeHtml(title)}</strong> in the studio vault.`,
    cta: 'Open credentials',
    href: loginUrl,
    note: `Sign in with Google or GitHub using this email. If the button does not work, open ${loginUrl}.`,
  });
  return { subject, text, html };
}

export async function sendVaultInvite(to: string, title: string, request: Request) {
  const copy = vaultInvite(title, `${siteUrl(request)}/team/credentials`);
  return sendMail({ to, ...copy });
}

function duePhrase(dueOn: string | null) {
  if (!dueOn) return '';
  const date = new Date(`${dueOn}T12:00:00`);
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function taskAssignedMail(
  projectName: string,
  title: string,
  dueOn: string | null,
  href: string,
) {
  const due = duePhrase(dueOn);
  const subject = `Yours on ${projectName}: ${title}`;
  const text = due
    ? `This is yours on ${projectName}. ${title}. Due ${due}.\n\n${href}`
    : `This is yours on ${projectName}. ${title}.\n\n${href}`;
  const html = letter({
    kicker: 'Work',
    heading: escapeHtml(title),
    body: due
      ? `This is yours on <strong>${escapeHtml(projectName)}</strong>. Due ${escapeHtml(due)}.`
      : `This is yours on <strong>${escapeHtml(projectName)}</strong>.`,
    cta: 'Open work',
    href,
    note: `If the button does not work, open ${href}.`,
  });
  return { subject, text, html };
}

export function taskDueMail(
  projectName: string,
  title: string,
  dueOn: string,
  late: boolean,
  href: string,
) {
  const due = duePhrase(dueOn);
  const subject = late ? `Late: ${title}` : `Due today: ${title}`;
  const text = late
    ? `${title} was due ${due} on ${projectName}.\n\n${href}`
    : `${title} is due today on ${projectName}.\n\n${href}`;
  const html = letter({
    kicker: 'Work',
    heading: late ? 'Late' : 'Due today',
    body: late
      ? `<strong>${escapeHtml(title)}</strong> was due ${escapeHtml(due)} on <strong>${escapeHtml(projectName)}</strong>.`
      : `<strong>${escapeHtml(title)}</strong> is due today on <strong>${escapeHtml(projectName)}</strong>.`,
    cta: 'Open work',
    href,
    note: `If the button does not work, open ${href}.`,
  });
  return { subject, text, html };
}

export async function notifyVaultGrants(emails: string[], title: string, request: Request) {
  let sent = 0;
  for (const to of emails) {
    const mail = await sendVaultInvite(to, title, request);
    if (!mail.error) sent += 1;
  }
  return sent;
}

export function taskWorkUrl(request: Request, projectId: string) {
  return `${siteUrl(request)}/team/projects/${projectId}?tab=schedule`;
}

export async function sendTaskAssigned(
  to: string,
  projectName: string,
  title: string,
  dueOn: string | null,
  href: string,
) {
  if (!to.trim()) return { error: 'invalid' as const };
  const copy = taskAssignedMail(projectName, title, dueOn, href);
  return sendMail({ to: to.trim().toLowerCase(), ...copy });
}

export async function sendTaskDue(
  to: string,
  projectName: string,
  title: string,
  dueOn: string,
  late: boolean,
  href: string,
) {
  if (!to.trim()) return { error: 'invalid' as const };
  const copy = taskDueMail(projectName, title, dueOn, late, href);
  return sendMail({ to: to.trim().toLowerCase(), ...copy });
}
