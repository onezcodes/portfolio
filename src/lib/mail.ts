import { site } from '../data/site';
import { siteUrl } from './supabase';

export function mailConfigured() {
  return Boolean(import.meta.env.RESEND_API_KEY);
}

function fromAddress() {
  return import.meta.env.MAIL_FROM?.trim() || 'Onez Codes <onboarding@resend.dev>';
}

function wrapHtml(body: string) {
  return `<!doctype html>
<html>
  <body style="margin:0;background:#FAFAF8;font-family:Georgia,serif;color:#111;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#FAFAF8;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="560" cellspacing="0" cellpadding="0" style="max-width:560px;background:#fff;border:1px solid #E6E2D8;padding:32px;">
            <tr>
              <td>
                <p style="margin:0 0 8px;font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:#C4A35A;">${site.name}</p>
                ${body}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
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
  const html = `
    <h1 style="margin:0 0 12px;font-size:28px;font-weight:600;">You're on the team</h1>
    <p style="margin:0 0 16px;line-height:1.5;">You've been added to the ${site.name} studio app. Sign in with Google or GitHub using this email address.</p>
    <p style="margin:0 0 24px;"><a href="${loginUrl}" style="display:inline-block;background:#ffb800;color:#111;text-decoration:none;font-weight:600;padding:12px 18px;">Sign in</a></p>
    <p style="margin:0;color:#666;font-size:14px;line-height:1.5;">If the button does not work, open ${loginUrl}</p>
  `;
  return { subject, text, html };
}

export function projectInvite(projectName: string, roles: string[], loginUrl: string) {
  const roleList = roles.join(', ');
  const subject = `You've been added to ${projectName}`;
  const text = `You've been added to ${projectName} on the ${site.name} team app as: ${roleList}.\n\nSign in:\n${loginUrl}`;
  const html = `
    <h1 style="margin:0 0 12px;font-size:28px;font-weight:600;">${projectName}</h1>
    <p style="margin:0 0 16px;line-height:1.5;">You've been added to this job as <strong>${roleList}</strong>.</p>
    <p style="margin:0 0 24px;"><a href="${loginUrl}" style="display:inline-block;background:#ffb800;color:#111;text-decoration:none;font-weight:600;padding:12px 18px;">Open the team app</a></p>
    <p style="margin:0;color:#666;font-size:14px;line-height:1.5;">Sign in with Google or GitHub using this email. ${loginUrl}</p>
  `;
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
  const html = `
    <h1 style="margin:0 0 12px;font-size:28px;font-weight:600;">Shared credentials</h1>
    <p style="margin:0 0 16px;line-height:1.5;">You've been given access to <strong>${title}</strong>.</p>
    <p style="margin:0 0 24px;"><a href="${loginUrl}" style="display:inline-block;background:#ffb800;color:#111;text-decoration:none;font-weight:600;padding:12px 18px;">Open credentials</a></p>
    <p style="margin:0;color:#666;font-size:14px;line-height:1.5;">Sign in with Google or GitHub using this email. ${loginUrl}</p>
  `;
  return { subject, text, html };
}

export async function sendVaultInvite(to: string, title: string, request: Request) {
  const copy = vaultInvite(title, `${siteUrl(request)}/team/credentials`);
  return sendMail({ to, ...copy });
}

export async function notifyVaultGrants(emails: string[], title: string, request: Request) {
  let sent = 0;
  for (const to of emails) {
    const mail = await sendVaultInvite(to, title, request);
    if (!mail.error) sent += 1;
  }
  return sent;
}
