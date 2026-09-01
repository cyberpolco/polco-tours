'use client';

import { Button } from '@/components/ui/Button';

interface Props {
  prefillText: string;
  label: string;
}

// DR-211 (explicit user request): "Request documents" used to be its own
// server-action form, sending a fixed canned notification through a
// different channel (notify()'s WhatsApp -> SMS -> email fallback) than
// "Message tour lead" (forced Resend email, DR-209) -- two buttons doing
// the same underlying thing (ask the tour lead for something) through
// different paths. This collapses it into a one-click shortcut that opens
// the Message panel and pre-fills the textarea with a canned request,
// which the facilitator can send as-is or edit -- one code path, one
// channel, still a single click for the common case. The only bit of
// client JS on an otherwise server-action-only page, deliberately scoped
// to this one DOM-population concern rather than the send itself (the
// actual submit stays a plain server-action form).
export function PrefillMessageButton({ prefillText, label }: Props) {
  return (
    <Button
      type="button"
      variant="secondary"
      size="compact"
      className="w-full"
      onClick={(event) => {
        const panel = event.currentTarget.closest('[data-visa-actions-panel]');
        const details = panel?.querySelector<HTMLDetailsElement>('details[data-message-panel]');
        const textarea = panel?.querySelector<HTMLTextAreaElement>('textarea[name="message"]');
        if (details) details.open = true;
        if (textarea) {
          textarea.value = prefillText;
          textarea.focus();
        }
      }}
    >
      {label}
    </Button>
  );
}
