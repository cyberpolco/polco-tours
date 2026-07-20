import { Button } from '@/components/ui/Button';
import { FormField } from '@/components/ui/FormField';

// A plain GET form -- same query-param-driven convention as /quiz. DR-052
// consolidated onto the single, already-public bookingReference (dropped
// the separate confirmationCode secret this used to pair with) -- this is
// explicitly the lower-security "come back later" path, not the active
// in-flight session (see DR-016 plan); rate-limiting on the lookup itself
// is the real remaining defense, same as any real-world "manage my
// booking" page.
export default function FindBookingPage() {
  return (
    <div className="max-w-sm">
      <p className="eyebrow text-mist">Find my booking</p>
      <h1 className="mt-1 text-2xl font-bold text-navy">Look up a booking</h1>
      <p className="mt-2 text-sm text-mist">
        Enter your booking reference, plus the tour lead&apos;s last name.
      </p>

      <form method="get" action="/find-booking/result" className="mt-6 space-y-4">
        <FormField label="Booking reference" htmlFor="bookingReference">
          <input name="bookingReference" required className="w-full rounded-survey border border-rule px-3 py-2 uppercase" />
        </FormField>
        <FormField label="Tour lead's last name" htmlFor="lastName">
          <input name="lastName" required className="w-full rounded-survey border border-rule px-3 py-2" />
        </FormField>
        <Button type="submit">Find my booking</Button>
      </form>
    </div>
  );
}
