'use client';

import { useActionState } from 'react';
import { useTranslations } from 'next-intl';
import { Card } from '@/components/ui/Card';
import { Alert } from '@/components/ui/Alert';
import { FormField } from '@/components/ui/FormField';
import { Select } from '@/components/ui/Select';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { CONTACT_TOPICS } from '@modules/contact';
import { submitContactFormAction, type ContactFormState } from './actions';

// DR-255: the guest contact form itself. Deliberately no redirect on
// success (unlike the booking/rating wizards) -- this replaces itself with
// a success panel in place, so there's no client-side navigation for the
// DR-124 missing-loading.tsx gotcha to affect.
// Defined here, not exported from ./actions -- a 'use server' file may only
// export async functions, and exporting a plain object from one makes Next
// throw `A "use server" file can only export async functions, found object.`
// at runtime. Neither typecheck nor lint catches it; it surfaces only when
// the form is actually submitted (it broke the guest contact form in
// production, caught by CI's Playwright job).
const CONTACT_FORM_INITIAL_STATE: ContactFormState = { status: 'idle' };

export function ContactForm() {
  const [state, formAction] = useActionState(submitContactFormAction, CONTACT_FORM_INITIAL_STATE);
  const t = useTranslations('ContactForm');

  if (state.status === 'success') {
    return (
      <Card as="div" className="flex flex-col gap-2">
        <p className="font-semibold text-forest">{t('successTitle')}</p>
        <p className="text-sm text-mist">{t('successBody')}</p>
        <p className="text-sm text-mist">{t('successFaqNudge')}</p>
      </Card>
    );
  }

  return (
    <Card as="div" className="flex flex-col gap-4">
      <p className="text-sm text-mist">
        {t('faqNudge')}{' '}
        <a href="/faq" className="font-semibold text-forest underline underline-offset-2">
          {t('faqLink')}
        </a>
      </p>

      <form action={formAction} className="flex flex-col gap-4">
        {state.status === 'error' && state.error && <Alert tone="error">{state.error}</Alert>}

        {/* Honeypot: off-screen, never shown/focusable for a real visitor.
            Not display:none/type=hidden -- some bots specifically skip
            those but still fill a visually-hidden field. */}
        <div aria-hidden="true" style={{ position: 'absolute', left: '-9999px', width: '1px', height: '1px', overflow: 'hidden' }}>
          <input type="text" name="company_website" tabIndex={-1} autoComplete="off" />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label={t('nameLabel')} htmlFor="contact-name">
            <input id="contact-name" name="name" required maxLength={120} className="w-full rounded-card border border-rule bg-bone px-3 py-2 text-sm text-ink" />
          </FormField>
          <FormField label={t('emailLabel')} htmlFor="contact-email">
            <input
              id="contact-email"
              name="email"
              type="email"
              required
              maxLength={254}
              className="w-full rounded-card border border-rule bg-bone px-3 py-2 text-sm text-ink"
            />
          </FormField>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label={t('phoneLabel')} htmlFor="contact-phone" optional>
            <input id="contact-phone" name="phone" maxLength={30} className="w-full rounded-card border border-rule bg-bone px-3 py-2 text-sm text-ink" />
          </FormField>
          <FormField label={t('topicLabel')} htmlFor="contact-topic">
            <Select id="contact-topic" name="topic" required defaultValue="">
              <option value="" disabled>
                {t('topicPlaceholder')}
              </option>
              {CONTACT_TOPICS.map((topic) => (
                <option key={topic} value={topic}>
                  {t(`topic.${topic}`)}
                </option>
              ))}
            </Select>
          </FormField>
        </div>

        <FormField label={t('messageLabel')} htmlFor="contact-message">
          <textarea
            id="contact-message"
            name="message"
            required
            minLength={10}
            maxLength={4000}
            rows={5}
            className="w-full rounded-card border border-rule bg-bone px-3 py-2 text-sm text-ink"
          />
        </FormField>

        <div>
          <SubmitButton pendingLabel={t('sending')}>{t('submit')}</SubmitButton>
        </div>
      </form>
    </Card>
  );
}
