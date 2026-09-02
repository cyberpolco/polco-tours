---
name: regional-compliance
description: Namibia/DRC/Zambia/Zimbabwe/Botswana tourism regulatory context — operator & fleet compliance, visa rules, DRC security zones (BR-07), guest health/logistics. Load when working on the fleet, visa, catalog (destinations), or immigration modules, or on booking eligibility/security-zone features.
---

Why the app is shaped the way it is — and the real-world rules any feature
touching operators, vehicles, guides, visas, or destinations must respect.
**All figures are effective-dated and change often; never hardcode them —
verify against NTB/MEFT (Namibia), ICCN/Ministry of Tourism (DRC), and the
relevant Zambia/Zimbabwe authorities/embassies. Treat this as orientation,
not legal ground truth.**

**Five regimes, one platform** (Botswana added DR-218). Namibia, the DRC,
Zambia, Zimbabwe, and Botswana have very different tourism governance. This
is the reason for per-country tax, per-country operator compliance (BR-12),
country-scoped visa applications (`VisaApplication.country`), EN/FR
bilingual content, and packages priced in one of four currencies with **no
FX conversion anywhere** — `Currency` is a fixed enum (`USD`/`EUR`/`NAD`/
`CDF`, `prisma/schema.prisma`) with no `BWP` value, same as Zambia/Zimbabwe
already having no `ZMW`/`ZWG` value; a Botswana package/booking prices in
USD or EUR like a Zambian or Zimbabwean one does, not a new currency (BR-02,
`src/lib/money.ts`).

**Country Regulations (`immigration` module) is the structured source of
truth going forward** for visa requirements, required documents, processing
times, entry conditions, immigration fees, embassy details, health
requirements, travel advisories, and special restrictions, one row per
country — staff-editable at `/staff/country-regulations`
(`SUPERADMIN`-only write). The bullets below are general-knowledge starting
points, not verified against each country's actual immigration authority —
correct them in the UI, not by hand-editing this file or `seed.ts`.

- **Namibia — operator & fleet compliance (feeds `fleet`/`documents`).**
  Operators register with the **Namibia Tourism Board (NTB)** (Act 21/2000):
  NTB licence + **BIPA** Certificate to Commence Business + **NamRA** tax
  registration + public/passenger liability insurance. Vehicles need
  roadworthiness certificates, company name on both sides, fire extinguisher
  + first-aid kit, and an **NTB inspection disc**; drivers carrying paying
  passengers need a **Professional Driving Permit (PDP)**. Foreign guides
  need a work permit. → These map directly to the compliance `Document`
  kinds the fleet module tracks (registration, insurance, inspection,
  licence) and their `expiresAt`.
- **Namibia — visas (feeds `visa`).** The regime changed in 2025: 33
  previously visa-exempt nationalities (incl. US/UK/EU/Canada/Australia) now
  need an e-visa / visa-on-arrival. Rules shifted **twice** in 2025 — model
  visa requirements as effective-dated data, never a hardcoded nationality list.
- **DRC — no central tourism board (feeds `fleet`/`visa`/BR-12).** Operators
  navigate several bodies: **DARA** business licence + **DGI** tax
  registration + **ICCN** authorization for any park operation + a Ministry
  of Tourism Competence Certificate; foreign operators must work through a
  licensed local **DMC**; immigration is **DGM**. Parks (Virunga,
  Kahuzi-Biéga, Salonga…) are ICCN-managed; gorilla permits run through ICCN
  / the Virunga Foundation.
- **DRC — security zones (BR-07, a hard product rule).** Eastern DRC is under
  active conflict. Zone posture (2025): Kinshasa & western DRC generally
  accessible; Congo River basin accessible with experienced operators;
  **North Kivu (incl. Virunga) high-risk / specialist only**; **South Kivu
  elevated**; **Ituri — do not operate**; **Kasai — elevated**. Any booking
  into a flagged province must carry a current security assessment and show
  a mandatory advisory to the traveler; the platform may block sales per
  admin policy. **Not yet implemented in code** — departures have no
  location/region field yet; this is where BR-07 gets enforced once they do.
- **Guest health/logistics (for briefings, not yet modeled).** Malaria risk in
  northern Namibia (Etosha/Caprivi/Kavango) and much of the DRC; yellow-fever
  proof if arriving from an endemic country; gorilla trekking has strict rules
  (accredited local guide, ~8/group, 7 m distance, no flash, sick visitors may
  not trek).
- **Botswana — operator & fleet compliance (feeds `fleet`/`documents`, DR-218).**
  Every tourism enterprise (incl. tour operators) must register with the
  **Department of Tourism** and hold a Tourism Registration certificate,
  decided by the Tourism Industry Licensing Committee (TILC, ~30 days);
  tour operators additionally need a **Tour Operation Permit**, only issued
  once Department-of-Tourism-approved, and must supply vehicle registration
  + roadworthiness certificates for any Botswana-registered vehicle. National
  parks/wildlife areas (Chobe, Okavango Delta, Central Kalahari, Moremi) are
  managed by the **Department of Wildlife and National Parks (DWNP)** —
  separate park-entry permits apply, distinct from the tourism-enterprise
  licence itself. **General-knowledge starting point, not verified against
  the Department of Tourism directly — confirm before treating as
  authoritative**, same posture as every other bullet here.
- **Botswana — visas (feeds `visa`, DR-218).** Visa-exempt for tourist stays
  up to 90 days for most Commonwealth/EU/US/SADC nationalities; others use
  Botswana's e-Visa system (online, or Form 1 at an embassy/immigration
  office). A KAZA UniVisa issued by Zambia or Zimbabwe also covers day trips
  into Botswana via the Kazungula crossing (see those two countries'
  bullets in `prisma/seed.ts`'s `countryRegulations`). Model as
  effective-dated data, same as every other country here — never a
  hardcoded nationality list.
- **Botswana — no BR-07-style security zone.** Unlike eastern DRC, Botswana
  has no active-conflict region requiring a security-zone product rule —
  it's a stable, low-risk tourism destination end to end. The only
  logistics caveat worth modeling is remote-wilderness wildlife safety in
  the Okavango Delta/Chobe/Central Kalahari (free-roaming elephant/hippo/big
  cats — guide/lodge safety briefings, not a booking-eligibility concern).

**Implication for engineering:** compliance data is documents-with-expiry, not
free text; visa and immigration flows are country-scoped; destination risk is
a first-class booking concern once departures carry a region. If you're
building anything in `fleet`, `visa`, `catalog` (destinations), or booking
eligibility, prefer configurable/effective-dated data over constants.
