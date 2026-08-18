import { getTranslations } from 'next-intl/server';
import { requireStaffContext } from '@lib/staff-guard';
import { settingsService, type CouponView } from '@modules/settings';
import { couponUnavailableReason, type CouponUnavailableReason } from '@lib/coupons';
import { Badge, type BadgeTone } from '@/components/ui/Badge';
import { BackLink } from '@/components/ui/BackLink';
import { FormField } from '@/components/ui/FormField';
import { PageHeader } from '@/components/ui/PageHeader';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { Table, TableHeaderRow, Td, Th, Tr } from '@/components/ui/Table';
import { createCouponAction, deleteCouponAction, updateCouponAction } from './actions';

const STATUS_TONE: Record<'ACTIVE' | CouponUnavailableReason, BadgeTone> = {
  ACTIVE: 'success',
  EXPIRED: 'neutral',
  EXHAUSTED: 'neutral',
  NOT_FOUND: 'neutral', // never actually reached here -- couponUnavailableReason never returns this for a real row
};

function DeleteButton({
  action,
  removingLabel,
  removeConfirm,
  removeLabel,
}: {
  action: () => Promise<void>;
  removingLabel: string;
  removeConfirm: string;
  removeLabel: string;
}) {
  return (
    <form action={action}>
      <SubmitButton variant="secondary" size="compact" pendingLabel={removingLabel} confirmMessage={removeConfirm}>
        {removeLabel}
      </SubmitButton>
    </form>
  );
}

// A dependency-free, JS-free inline edit toggle -- same <details>/<summary>
// convention as finance/rates/page.tsx's own local EditDisclosure (can't be
// imported from there directly, a page.tsx file may only export `default`
// plus Next's own well-known names).
function EditDisclosure({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <details className="mt-1">
      <summary className="cursor-pointer text-xs font-medium text-navy underline">{label}</summary>
      <div className="mt-2">{children}</div>
    </details>
  );
}

// Settings module (DR-104) -- percentage-discount codes, same platform-wide/
// "route passes, service rejects" SUPERADMIN-write shape as TaxRate/
// PlatformRate above it in the sidebar. code is system-generated
// (settingsService.createCoupon) -- there is deliberately no code field on
// the create OR edit form. DR-144 (explicit user request): Delete replaces
// the original DR-104 Deactivate action -- a real removal, cascading away
// that coupon's redemption history too (see schema.prisma) -- and an Edit
// disclosure lets discountBp/maxRedemptions/expiresAt be changed in place.
export default async function CouponsPage() {
  const ctx = await requireStaffContext('platform_settings.read');
  const canWrite = ctx.roles.includes('SUPERADMIN');
  const coupons = await settingsService.listCoupons(ctx);
  const t = await getTranslations('StaffCoupons');

  function statusLabel(c: CouponView): string {
    const reason = couponUnavailableReason(c, c.redemptionCount, new Date());
    switch (reason) {
      case 'EXPIRED':
        return t('statusExpired');
      case 'EXHAUSTED':
        return t('statusExhausted');
      default:
        return t('statusActive');
    }
  }

  return (
    <div className="space-y-6">
      <BackLink href="/staff/settings/finance">{t('backToFinance')}</BackLink>
      <PageHeader eyebrow={t('eyebrow')} title={t('title')} />
      <p className="text-xs text-mist">{t('intro')}</p>
      {coupons.length === 0 ? (
        <p className="text-mist">{t('noneYet')}</p>
      ) : (
        <Table>
          <thead>
            <TableHeaderRow>
              <Th>{t('code')}</Th>
              <Th>{t('discountCol')}</Th>
              <Th>{t('capUsed')}</Th>
              <Th>{t('expiresCol')}</Th>
              <Th>{t('statusCol')}</Th>
              <Th />
            </TableHeaderRow>
          </thead>
          <tbody>
            {coupons.map((c) => {
              const reason = couponUnavailableReason(c, c.redemptionCount, new Date());
              return (
                <Tr key={c.id}>
                  <Td className="font-mono">{c.code}</Td>
                  <Td>{(c.discountBp / 100).toFixed(2)}%</Td>
                  <Td>
                    {c.maxRedemptions === null ? t('unlimited') : `${c.maxRedemptions}`} / {c.redemptionCount}
                  </Td>
                  <Td>{c.expiresAt ? c.expiresAt.toLocaleDateString() : '—'}</Td>
                  <Td>
                    <Badge tone={STATUS_TONE[reason ?? 'ACTIVE']}>{statusLabel(c)}</Badge>
                  </Td>
                  <Td>
                    {canWrite && (
                      <>
                        <DeleteButton
                          action={deleteCouponAction.bind(null, c.id)}
                          removingLabel={t('deleting')}
                          removeConfirm={t('deleteConfirm')}
                          removeLabel={t('delete')}
                        />
                        <EditDisclosure label={t('edit')}>
                          <form action={updateCouponAction.bind(null, c.id)} className="flex flex-wrap items-end gap-2">
                            <input
                              name="discountPercent"
                              type="number"
                              step="0.01"
                              min="0.01"
                              max="50"
                              defaultValue={(c.discountBp / 100).toFixed(2)}
                              required
                              className="w-24 rounded-survey border border-rule px-2 py-2 text-sm"
                            />
                            <input
                              name="maxRedemptions"
                              type="number"
                              min="1"
                              step="1"
                              defaultValue={c.maxRedemptions ?? ''}
                              placeholder={t('maxRedemptionsPlaceholder')}
                              className="w-28 rounded-survey border border-rule px-2 py-2 text-sm"
                            />
                            <input
                              name="expiresAt"
                              type="date"
                              defaultValue={c.expiresAt ? c.expiresAt.toISOString().slice(0, 10) : ''}
                              className="rounded-survey border border-rule px-2 py-2 text-sm"
                            />
                            <SubmitButton size="compact" pendingLabel={t('savingChanges')}>
                              {t('saveChanges')}
                            </SubmitButton>
                          </form>
                        </EditDisclosure>
                      </>
                    )}
                  </Td>
                </Tr>
              );
            })}
          </tbody>
        </Table>
      )}
      {canWrite && (
        <form action={createCouponAction} className="flex flex-wrap items-end gap-3">
          <FormField label={t('discountPercentLabel')} htmlFor="discountPercent">
            <input
              name="discountPercent"
              type="number"
              step="0.01"
              min="0.01"
              max="50"
              required
              className="w-24 rounded-survey border border-rule px-2 py-2 text-sm"
            />
          </FormField>
          <FormField label={t('maxRedemptionsLabel')} htmlFor="maxRedemptions" optional>
            <input
              name="maxRedemptions"
              type="number"
              min="1"
              step="1"
              placeholder={t('maxRedemptionsPlaceholder')}
              className="w-28 rounded-survey border border-rule px-2 py-2 text-sm"
            />
          </FormField>
          <FormField label={t('expiresAtLabel')} htmlFor="expiresAt" optional>
            <input name="expiresAt" type="date" className="rounded-survey border border-rule px-2 py-2 text-sm" />
          </FormField>
          <SubmitButton size="compact" pendingLabel={t('adding')}>
            {t('add')}
          </SubmitButton>
        </form>
      )}
    </div>
  );
}
