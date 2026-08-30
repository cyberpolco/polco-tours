import { MailIcon, PhoneIcon } from './contact-icons';

const EMAIL_SRC = '[\\w.+-]+@[\\w-]+\\.[\\w.-]+';
const PHONE_SRC = '\\+\\d[\\d\\s-]{6,}\\d';
const TOKEN_SRC = `(${EMAIL_SRC})|(${PHONE_SRC})`;

// Office/general-inquiries bodies are one staff-entered free-text block
// (see (guest)/contact/page.tsx's own comment on why -- no structured
// address/email/phone fields exist, kept that way for flexibility rather
// than any remaining legal gating, OI-02/03 resolved DR-199). A real email
// or phone number typed into that free text would otherwise render as inert
// plain text. This scans each line for an email- or phone-shaped token and
// turns just that token into a real mailto:/tel: link (with a small
// matching icon), leaving every other character -- the address line
// included -- untouched.
export function ContactBody({ text }: { text: string }) {
  return (
    <div className="space-y-1.5 text-sm text-mist">
      {text.split('\n').map((line, lineIndex) => {
        const nodes: React.ReactNode[] = [];
        let lastIndex = 0;
        let icon: React.ReactNode = null;
        const re = new RegExp(TOKEN_SRC, 'g');
        let match: RegExpExecArray | null;
        while ((match = re.exec(line)) !== null) {
          if (match.index > lastIndex) nodes.push(line.slice(lastIndex, match.index));
          const [full, email, phone] = match;
          if (email) {
            icon = icon ?? <MailIcon className="h-4 w-4 text-forest" />;
            nodes.push(
              <a key={`${lineIndex}-${match.index}`} href={`mailto:${email}`} className="font-medium text-forest hover:underline">
                {email}
              </a>,
            );
          } else if (phone) {
            icon = icon ?? <PhoneIcon className="h-4 w-4 text-forest" />;
            nodes.push(
              <a
                key={`${lineIndex}-${match.index}`}
                href={`tel:${phone.replace(/[\s-]/g, '')}`}
                className="font-medium text-forest hover:underline"
              >
                {phone}
              </a>,
            );
          }
          lastIndex = match.index + full.length;
        }
        if (lastIndex < line.length) nodes.push(line.slice(lastIndex));

        return (
          <div key={lineIndex} className="flex items-start gap-2">
            <span className="mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center">{icon}</span>
            <span>{nodes}</span>
          </div>
        );
      })}
    </div>
  );
}
