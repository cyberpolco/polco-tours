import { Button } from '@/components/ui/Button';
import { FormField } from '@/components/ui/FormField';

// A plain GET form -- same query-param-driven convention as /quiz. The
// confirmation code was already typed by the guest themselves (not a
// system-generated bearer secret embedded invisibly), and this is
// explicitly the lower-security "come back later" path, not the active
// in-flight session (see DR-016 plan) -- rate-limiting on the lookup itself
// is the real defense, same as any real-world "manage my booking" page.
export default function FindBookingPage() {
  return (
    <div className="max-w-sm">
      <p className="eyebrow text-mist">Find my booking</p>
      <h1 className="mt-1 text-2xl font-bold text-navy">Look up a booking</h1>
      <p className="mt-2 text-sm text-mist">
        Enter the reference code you were given after booking, plus the tour lead&apos;s last name.
      </p>

      <form method="get" action="/find-booking/result" className="mt-6 space-y-4">
        <FormField label="Reference code" htmlFor="confirmationCode">
          <input name="confirmationCode" required className="w-full rounded-survey border border-rule px-3 py-2 uppercase" />
        </FormField>
        <FormField label="Tour lead's last name" htmlFor="lastName">
          <input name="lastName" required className="w-full rounded-survey border border-rule px-3 py-2" />
        </FormField>
        <Button type="submit">Find my booking</Button>
      </form>
    </div>
  );
}
