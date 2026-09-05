'use server';

import { cookies, headers } from 'next/headers';
import { contactService } from '@modules/contact';

export interface ContactFormState {
  status: 'idle' | 'success' | 'error';
  error?: string;
}

export const CONTACT_FORM_INITIAL_STATE: ContactFormState = { status: 'idle' };

// Same IP-resolution convention as ratings'/booking's own guest actions.
export async function submitContactFormAction(_prev: ContactFormState, formData: FormData): Promise<ContactFormState> {
  const ip = (await headers()).get('x-forwarded-for')?.split(',')[0]?.trim();
  const locale = (await cookies()).get('locale')?.value === 'fr' ? 'FR' : 'EN';

  const phoneRaw = formData.get('phone');
  const result = await contactService.submitContactMessage(
    {
      name: formData.get('name'),
      email: formData.get('email'),
      phone: typeof phoneRaw === 'string' && phoneRaw.trim() ? phoneRaw : undefined,
      topic: formData.get('topic'),
      message: formData.get('message'),
      honeypot: formData.get('company_website') ?? '',
    },
    { ip, locale },
  );

  return result.ok ? { status: 'success' } : { status: 'error', error: result.error };
}
