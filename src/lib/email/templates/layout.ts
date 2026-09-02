import { getSiteUrl, COVERAGE_LABEL } from '@/lib/site'
/**
 * Layout HTML de base pour tous les emails Artisano.
 * Style inline minimal pour compatibilité maximale (Outlook, Gmail, etc.).
 */
export function emailLayout(opts: {
  title: string
  body: string
  ctaLabel?: string
  ctaUrl?: string
  footerNote?: string
}): string {
  const { title, body, ctaLabel, ctaUrl, footerNote } = opts
  const base = getSiteUrl()

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escape(title)}</title>
</head>
<body style="margin:0;padding:0;background:#FAFAF8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1a1a1a;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#FAFAF8;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="560" cellspacing="0" cellpadding="0" border="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.04);">
          <!-- Header -->
          <tr>
            <td style="padding:24px 32px;border-bottom:1px solid #f0f0ee;">
              <a href="${base}" style="text-decoration:none;color:#1a1a1a;font-weight:800;font-size:20px;letter-spacing:-0.5px;">
                artisano<span style="color:#E8700A;">.</span>
              </a>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:32px;">
              <h1 style="margin:0 0 16px;font-size:22px;font-weight:800;color:#1a1a1a;line-height:1.3;">${escape(title)}</h1>
              <div style="font-size:15px;line-height:1.6;color:#3a3a3a;">${body}</div>
              ${ctaLabel && ctaUrl ? `
              <div style="margin-top:24px;text-align:center;">
                <a href="${ctaUrl}" style="display:inline-block;padding:14px 32px;background:#E8700A;color:#ffffff;font-weight:700;font-size:15px;text-decoration:none;border-radius:999px;">
                  ${escape(ctaLabel)}
                </a>
              </div>` : ''}
            </td>
          </tr>
          ${footerNote ? `
          <tr>
            <td style="padding:0 32px 24px;font-size:13px;color:#8A8680;line-height:1.5;">
              ${footerNote}
            </td>
          </tr>` : ''}
          <!-- Footer -->
          <tr>
            <td style="padding:20px 32px;background:#f9f9f7;border-top:1px solid #f0f0ee;font-size:12px;color:#8A8680;line-height:1.6;">
              <p style="margin:0 0 8px;">Tu reçois cet email parce que tu utilises Artisano.</p>
              <p style="margin:0;">
                <a href="${base}/mon-profil" style="color:#8A8680;text-decoration:underline;">Préférences</a>
                &nbsp;·&nbsp;
                <a href="${base}/confidentialite" style="color:#8A8680;text-decoration:underline;">Confidentialité</a>
              </p>
            </td>
          </tr>
        </table>
        <p style="margin:16px 0 0;font-size:11px;color:#8A8680;text-align:center;">
          © ${new Date().getFullYear()} Artisano — ${COVERAGE_LABEL}
        </p>
      </td>
    </tr>
  </table>
</body>
</html>`
}

/**
 * Échappe les caractères HTML pour empêcher les injections dans les emails.
 */
export function escape(str: string | null | undefined): string {
  if (!str) return ''
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
