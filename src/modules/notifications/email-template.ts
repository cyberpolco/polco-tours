// notifications module — shared branded HTML email shell (DR-205). Every
// TEMPLATES[event] HTML branch in domain.ts renders through this instead of
// returning a bare sentence, so the Horizon design tokens/brand logo/layout
// live in exactly one place. Inline styles throughout -- email clients strip
// <style> blocks inconsistently, so nothing here relies on one.
//
// Deliberately NOT the site's own webfonts (Big Shoulders Stencil
// Display/Archivo/Special Elite): those are self-hosted `next/font/local`/
// Google Fonts assets, and most email clients strip @font-face rules or
// block the network fetch outright -- a generic bold sans stack carries the
// brand via the Horizon color system + layout instead of pretending a
// webfont will render.
import { BRAND_LOGO_DATA_URI } from '@lib/brand-logo';

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
              <a href="${opts.cta.url}" style="display:inline-block;padding:12px 28px;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:700;color:#F6EFE4;text-decoration:none;">${opts.cta.label}</a>
            </td>
          </tr>
        </table>
      </td>
    </tr>`
    : '';

  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background-color:#EDE6DC;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#EDE6DC;">
      <tr>
        <td align="center" style="padding:24px 16px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;">
            <tr>
              <td style="background-color:#3B1F3A;border-radius:8px 8px 0 0;padding:24px;" align="center">
                <img src="${BRAND_LOGO_DATA_URI}" width="48" height="48" alt="" style="display:block;margin:0 auto 8px auto;border-radius:50%;" />
                <div style="font-family:Arial,Helvetica,sans-serif;font-size:12px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#F6EFE4;">${WORDMARK[opts.audience]}</div>
              </td>
            </tr>
            <tr>
              <td style="background-color:#F6EFE4;border-radius:0 0 8px 8px;padding:32px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                  <tr>
                    <td>
                      <div style="font-family:Arial,Helvetica,sans-serif;font-size:12px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#8C7D78;">${opts.eyebrow}</div>
                      <div style="font-family:Arial,Helvetica,sans-serif;font-size:22px;font-weight:800;color:#3B1F3A;padding:6px 0 16px 0;">${opts.heading}</div>
                      <div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#211A1D;">${opts.bodyHtml}</div>
                    </td>
                  </tr>
                  ${cta}
                  <tr>
                    <td style="padding:24px 0 0 0;border-top:1px solid #E3D6C8;margin-top:24px;">
                      <div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.6;color:#211A1D;padding-top:16px;">Warm regards,<br />${SIGNATURE[opts.audience]}</div>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;">
            <tr>
              <td align="center" style="padding:20px 16px 0 16px;">
                <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#8C7D78;">${FOOTER_CONTACT[opts.audience]}</p>
                <p style="margin:8px 0 0 0;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#8C7D78;">${AUTOMATED_NOTICE}</p>
                <p style="margin:8px 0 0 0;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#8C7D78;">Powered by ${POWERED_BY}</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}
