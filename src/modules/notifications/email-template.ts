// notifications module — shared branded HTML email shell (DR-205). Every
// TEMPLATES[event] HTML branch in domain.ts renders through this instead of
// returning a bare sentence, so the Horizon design tokens/brand logo/layout
// live in exactly one place. Inline styles throughout -- email clients strip
// <style> blocks inconsistently, so nothing here relies on one for layout.
//
// Explicit user request: match the site's own three Horizon typefaces
// (Big Shoulders Stencil Display / Archivo / Special Elite, same roles as
// tailwind.config.ts's font-display/font-sans/font-mono) rather than a
// plain system stack. A <link> to Google Fonts' CSS2 endpoint in <head> is
// the email-safe way to reference them (no @font-face/network-fetch
// reliability issue for the *reference itself* -- the fonts really are
// Google-hosted, same source src/app/layout.tsx's next/font/google calls
// resolve to, and the one next/font/local file, big-shoulders-stencil-
// display.woff2, was originally fetched from this exact endpoint). This is
// still genuinely best-effort, not universal: Apple Mail (iOS/macOS) and
// most webmail clients that keep <head> intact render the real fonts;
// Outlook desktop's Word rendering engine and the Gmail app ignore
// stylesheet links entirely and silently use each declaration's fallback
// stack instead -- which is why every font-family below still lists a
// close web-safe fallback (Arial for Archivo, Courier New for Special
// Elite) rather than assuming the link always resolves.
import { BRAND_LOGO_DATA_URI } from '@lib/brand-logo';

const FONT_DISPLAY = "'Big Shoulders Stencil Display',Arial,Helvetica,sans-serif";
// Exported: domain.ts's summaryTable() needs the same body-copy font for
// its detail-row cells, same "one shared set of tokens" reasoning as the
// Horizon colors it already borrows in its own comment.
export const FONT_SANS = 'Archivo,Arial,Helvetica,sans-serif';
const FONT_MONO = "'Special Elite','Courier New',monospace";
const GOOGLE_FONTS_HREF =
  'https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600;700;800&family=Special+Elite&family=Big+Shoulders+Stencil+Display:wght@700;800&display=swap';

export interface BrandedEmailOptions {
  // Wordmark text only -- the logo image is the same real badge either way
  // (per CLAUDE.md, the staff dashboard already shows the same Mufasa
  // badge; only the surrounding brand *text* differs guest vs. staff).
  audience: 'guest' | 'staff';
  eyebrow: string;
  heading: string;
  bodyHtml: string; // inner paragraphs, already event-specific and escaped
  cta?: { label: string; url: string };
}

const WORDMARK: Record<BrandedEmailOptions['audience'], string> = {
  guest: 'Mufasa Safaris &amp; Tours',
  staff: 'POLCO TOURS',
};

const FOOTER_CONTACT: Record<BrandedEmailOptions['audience'], string> = {
  guest: 'info@mufasasafaris.com',
  staff: 'POLCO Tours internal system &mdash; info@mufasasafaris.com',
};

// DR-205 (explicit user request): every notification email closes with the
// same sign-off and carries the same "automated, do not reply" notice --
// fixed here (not a per-event opt-in param) so it's guaranteed identical
// across all 26 templates rather than depending on every TEMPLATES entry
// remembering to pass one.
const SIGNATURE: Record<BrandedEmailOptions['audience'], string> = {
  guest: 'The Mufasa Safaris &amp; Tours Team',
  staff: 'The POLCO Tours Team',
};

const AUTOMATED_NOTICE = 'This is an automated message &mdash; please do not reply to this email.';

// Explicit user request: every automated email footer credits the parent
// company, same "a Cyber PolCo Product" convention as the guest site's own
// footer legal line (CmsTextBlock key footer.legal, DR-204/214) -- fixed
// here rather than a per-event param, same reasoning as SIGNATURE/
// AUTOMATED_NOTICE above.
const POWERED_BY = '<a href="https://www.cyberpolco.com" style="color:#8C7D78;text-decoration:underline;">www.cyberpolco.com</a>';

export function renderBrandedEmail(opts: BrandedEmailOptions): string {
  const cta = opts.cta
    ? `
    <tr>
      <td style="padding:24px 0 0 0;" align="center">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td style="background-color:#D65B2E;border-radius:6px;" align="center">
              <a href="${opts.cta.url}" style="display:inline-block;padding:12px 28px;font-family:${FONT_SANS};font-size:14px;font-weight:700;color:#F6EFE4;text-decoration:none;">${opts.cta.label}</a>
            </td>
          </tr>
        </table>
      </td>
    </tr>`
    : '';

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
    <link href="${GOOGLE_FONTS_HREF}" rel="stylesheet" />
  </head>
  <body style="margin:0;padding:0;background-color:#EDE6DC;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#EDE6DC;">
      <tr>
        <td align="center" style="padding:24px 16px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;">
            <tr>
              <td style="background-color:#3B1F3A;border-radius:8px 8px 0 0;padding:24px;" align="center">
                <img src="${BRAND_LOGO_DATA_URI}" width="48" height="48" alt="" style="display:block;margin:0 auto 8px auto;border-radius:50%;" />
                <div style="font-family:${FONT_MONO};font-size:12px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#F6EFE4;">${WORDMARK[opts.audience]}</div>
              </td>
            </tr>
            <tr>
              <td style="background-color:#F6EFE4;border-radius:0 0 8px 8px;padding:32px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                  <tr>
                    <td>
                      <div style="font-family:${FONT_MONO};font-size:12px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#8C7D78;">${opts.eyebrow}</div>
                      <div style="font-family:${FONT_DISPLAY};font-size:24px;font-weight:800;color:#3B1F3A;padding:6px 0 16px 0;">${opts.heading}</div>
                      <div style="font-family:${FONT_SANS};font-size:15px;line-height:1.6;color:#211A1D;">${opts.bodyHtml}</div>
                    </td>
                  </tr>
                  ${cta}
                  <tr>
                    <td style="padding:24px 0 0 0;border-top:1px solid #E3D6C8;margin-top:24px;">
                      <div style="font-family:${FONT_SANS};font-size:14px;line-height:1.6;color:#211A1D;padding-top:16px;">Warm regards,<br />${SIGNATURE[opts.audience]}</div>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;">
            <tr>
              <td align="center" style="padding:20px 16px 0 16px;">
                <p style="margin:0;font-family:${FONT_SANS};font-size:12px;color:#8C7D78;">${FOOTER_CONTACT[opts.audience]}</p>
                <p style="margin:8px 0 0 0;font-family:${FONT_SANS};font-size:12px;color:#8C7D78;">${AUTOMATED_NOTICE}</p>
                <p style="margin:8px 0 0 0;font-family:${FONT_SANS};font-size:12px;color:#8C7D78;">Powered by ${POWERED_BY}</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}
