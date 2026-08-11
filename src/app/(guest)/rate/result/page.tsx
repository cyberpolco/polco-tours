import { headers } from 'next/headers';
import { getTranslations } from 'next-intl/server';
import { ratingsService } from '@modules/ratings';
import { ApiError } from '@lib/errors';
import { Alert } from '@/components/ui/Alert';
import { BackLink } from '@/components/ui/BackLink';
import { Card } from '@/components/ui/Card';
import { Reveal } from '@/components/ui/Reveal';
import { Select } from '@/components/ui/Select';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { FormField } from '@/components/ui/FormField';
import { submitRatingAction } from './actions';

interface Props {
  searchParams: Promise<{ bookingReference?: string; ratingCode?: string }>;
}

function StarSelect({ name, t }: { name: string; t: (key: string, values?: Record<string, number>) => string }) {
  return (
    <Select name={name} defaultValue="">
      <option value="">{t('skip')}</option>
      <option value="1">{t('starCount', { n: 1 })}</option>
      <option value="2">{t('starCount', { n: 2 })}</option>
      <option value="3">{t('starCount', { n: 3 })}</option>
      <option value="4">{t('starCount', { n: 4 })}</option>
      <option value="5">{t('starCount', { n: 5 })}</option>
    </Select>
  );
}

export default async function RateResultPage({ searchParams }: Props) {
  const { bookingReference, ratingCode } = await searchParams;
  const t = await getTranslations('RateResultPage');

  if (!bookingReference || !ratingCode) {
    return (
      <Reveal>
        <div className="max-w-sm">
          <Alert tone="info">{t('enterRefAndCode')}</Alert>
          <BackLink href="/rate" className="mt-4">
            {t('tryAgain')}
          </BackLink>
        </div>
      </Reveal>
    );
  }

  const ip = (await headers()).get('x-forwarded-for')?.split(',')[0]?.trim();
  const input = { bookingReference: bookingReference.trim().toUpperCase(), ratingCode: ratingCode.trim().toUpperCase() };

  let result;
  try {
    result = await ratingsService.lookupForRating(input, ip);
  } catch (err) {
    const message =
      err instanceof ApiError && err.status === 429
        ? t('tooManyAttempts')
        : err instanceof ApiError && err.status === 409
          ? t('notEligibleYet')
          : t('notFound');
    return (
      <Reveal>
        <div className="max-w-sm">
          <Alert tone="error">{message}</Alert>
          <BackLink href="/rate" className="mt-4">
            {t('tryAgain')}
          </BackLink>
        </div>
      </Reveal>
    );
  }

  const { drivers, guides } = result;

  return (
    <Reveal>
      <div className="max-w-md">
        <p className="eyebrow text-mist">{t('rateYourTrip')}</p>
        <h1 className="mt-1 text-2xl font-bold text-navy">{result.bookingReference}</h1>

        <form action={submitRatingAction} className="mt-6 space-y-6">
          <input type="hidden" name="bookingReference" value={input.bookingReference} />
          <input type="hidden" name="ratingCode" value={input.ratingCode} />

          <div>
            <p className="eyebrow text-mist">{t('overallExperience')}</p>
            <div className="mt-2 flex items-end gap-3">
              <FormField label={t('rating')} htmlFor="overallRating">
                <Select name="overallRating" required defaultValue="">
                  <option value="" disabled>
                    {t('select')}
                  </option>
                  <option value="1">{t('starCount', { n: 1 })}</option>
                  <option value="2">{t('starCount', { n: 2 })}</option>
                  <option value="3">{t('starCount', { n: 3 })}</option>
                  <option value="4">{t('starCount', { n: 4 })}</option>
                  <option value="5">{t('starCount', { n: 5 })}</option>
                </Select>
              </FormField>
            </div>
            <FormField label={t('comments')} htmlFor="overallComment" optional>
              <textarea name="overallComment" rows={3} maxLength={1000} className="w-full rounded-survey border border-rule px-3 py-2" />
            </FormField>
          </div>

          {drivers.length > 0 && (
            <div>
              <div className="survey-rule mb-4" />
              <p className="eyebrow text-mist">{t('driversLabel')}</p>
              <div className="mt-3 space-y-3">
                {drivers.map((d) => (
                  <Card key={d.driverProfileId} className="space-y-2">
                    <input type="hidden" name="driverIds" value={d.driverProfileId} />
                    <p className="text-sm text-ink">{d.name}</p>
                    <div className="flex items-center gap-3">
                      <StarSelect name={`rating_driver_${d.driverProfileId}`} t={t} />
                    </div>
                    <textarea
                      name={`comment_driver_${d.driverProfileId}`}
                      rows={2}
                      maxLength={1000}
                      placeholder={t('optionalComment')}
                      className="w-full rounded-survey border border-rule px-3 py-2"
                    />
                  </Card>
                ))}
              </div>
            </div>
          )}

          {guides.length > 0 && (
            <div>
              <div className="survey-rule mb-4" />
              <p className="eyebrow text-mist">{t('tourGuidesLabel')}</p>
              <div className="mt-3 space-y-3">
                {guides.map((g) => (
                  <Card key={g.guideUserId} className="space-y-2">
                    <input type="hidden" name="guideIds" value={g.guideUserId} />
                    <p className="text-sm text-ink">{g.name}</p>
                    <div className="flex items-center gap-3">
                      <StarSelect name={`rating_guide_${g.guideUserId}`} t={t} />
                    </div>
                    <textarea
                      name={`comment_guide_${g.guideUserId}`}
                      rows={2}
                      maxLength={1000}
                      placeholder={t('optionalComment')}
                      className="w-full rounded-survey border border-rule px-3 py-2"
                    />
                  </Card>
                ))}
              </div>
            </div>
          )}

          <SubmitButton pendingLabel={t('submitting')}>{t('submitFeedback')}</SubmitButton>
        </form>
      </div>
    </Reveal>
  );
}
