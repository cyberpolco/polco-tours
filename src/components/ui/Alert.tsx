// Every `?error=` / inline-prompt message across the guest flow used to be
// a bare <p className="text-amber"> regardless of severity -- a soft "fill
// this in" prompt read identically to a hard "booking not found" error.
// `info` and `error` give those two cases distinct visual weight even
// though both still live in the amber family (no separate danger token).
const TONE_CLASSES = {
  info: 'border-rule bg-bone text-ink',
  error: 'border-amber bg-amber/10 text-amber',
  success: 'border-forest bg-forest/5 text-forest',
} as const;

export function Alert({ tone, children }: { tone: keyof typeof TONE_CLASSES; children: React.ReactNode }) {
  return <p className={`rounded-survey border px-3 py-2 text-sm ${TONE_CLASSES[tone]}`}>{children}</p>;
}
