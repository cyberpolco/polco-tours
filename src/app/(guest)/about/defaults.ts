import type { CmsLocale } from '@modules/cms';

// Coded EN/FR defaults for every /about section (DR-256). The page renders
// these until staff configures a real CmsTextBlock/CmsAboutEntry row, and
// /staff/cms's About tab prefills its editors from them so an unconfigured
// install shows what the guest actually sees rather than blank fields --
// same convention DR-207 established for Terms and DR-225 retro-fitted to
// the Footer legal editor.
//
// Body copy is plain text, not HTML: the guest page renders it through
// React (paragraph split on a blank line), so the artifact's <b> emphasis
// is deliberately dropped rather than smuggled in as dangerouslySetInnerHTML.

export const ABOUT_TEXT_KEYS = [
  'about',
  'about.stats',
  'about.story',
  'about.md',
  'about.md.person',
  'about.vm',
  'about.vision',
  'about.mission',
  'about.values',
] as const;
export type AboutTextKey = (typeof ABOUT_TEXT_KEYS)[number];

export interface AboutTextDefault {
  eyebrow: string | null;
  title: string;
  body: string;
}

export interface AboutStatDefault {
  heading: string;
  numericValue: number;
  prefix: string | null;
  suffix: string | null;
  animate: boolean;
}

export interface AboutTimelineDefault {
  marker: string;
  heading: string;
  body: string;
}

export interface AboutValueDefault {
  heading: string;
  body: string;
}

export const ABOUT_TEXT_DEFAULTS: Record<CmsLocale, Record<AboutTextKey, AboutTextDefault>> = {
  en: {
    about: {
      eyebrow: 'Who we are',
      title: 'About us',
      body:
        'Mufasa Safaris & Tours is a Namibian travel company built on more than 15 years of guiding experience across Southern and Central Africa. We run on one platform — Polco Tours, built by Cyber PolCo — so a single system handles both sides of a trip: the packages you browse, and everything behind them, from guides, drivers and vehicles to hotels and visa paperwork.\n\n' +
        "You can browse real departures or answer a few quick questions to be matched to one, then book as a guest — no account, no password — and manage everything with a reference code. We work with trusted local partners across the region. We're still early days, and the platform grows week by week.",
    },
    'about.stats': {
      eyebrow: 'At a glance',
      title: 'At a glance',
      body: 'Bilingual EN & FR · Registered with the Namibia Tourism Board · NTB No. TFA01163',
    },
    'about.story': {
      eyebrow: 'Our history',
      title: 'Our story',
      body: 'From a first tour on the ground to an operator working across five countries.',
    },
    'about.md': {
      eyebrow: 'Leadership',
      title: 'Managing Director',
      body: 'Faustin Munanga Kupasula led his first tour as a guide in 2007, and has spent the years since sharing the beauty and cultural richness of Southern and Central Africa with travellers from around the world — French, English, Spanish, German, Italian, Chinese and Japanese speakers alike. As Managing Director he leads Mufasa Safaris & Tours — which ran its first tour as an operator in 2021 — has guided roughly 300 tours and personally supervised groups of up to 100 travellers, pairing hands-on local knowledge with a modern, transparent booking platform.',
    },
    'about.md.person': {
      eyebrow: 'Managing Director & Founder',
      title: 'Faustin Munanga Kupasula',
      body: "I started as a guide on the ground in 2007. We build every trip the way I'd want to travel myself — grounded, personal, and honest.",
    },
    'about.vm': {
      eyebrow: 'Purpose',
      title: 'Vision & Mission',
      body: 'What we are building towards, and how we go about it.',
    },
    'about.vision': {
      eyebrow: null,
      title: 'Our Vision',
      body: "To open Africa's beauty and cultural richness to the world — one authentic journey at a time.",
    },
    'about.mission': {
      eyebrow: null,
      title: 'Our Mission',
      body: 'To craft responsible, tailor-made journeys that reflect each traveller — pairing deep local expertise with a modern, transparent platform, while minimising our impact, supporting local economies, and preserving cultural heritage.',
    },
    'about.values': {
      eyebrow: 'What we stand for',
      title: 'Our values',
      body: 'The three commitments every trip we run is measured against.',
    },
  },
  fr: {
    about: {
      eyebrow: 'Qui nous sommes',
      title: 'À propos',
      body:
        "Mufasa Safaris & Tours est une entreprise de voyage namibienne forte de plus de 15 ans d'expérience de guidage à travers l'Afrique australe et centrale. Nous fonctionnons sur une seule plateforme — Polco Tours, développée par Cyber PolCo — un système unique qui gère les deux faces d'un voyage : les circuits que vous parcourez, et tout ce qui les rend possibles : guides, chauffeurs, véhicules, hôtels et formalités de visa.\n\n" +
        "Vous pouvez parcourir de vrais départs ou répondre à quelques questions pour être mis en relation avec l'un d'eux, puis réserver en tant qu'invité — sans compte ni mot de passe — et tout gérer avec un code de référence. Nous travaillons avec des partenaires locaux de confiance dans toute la région. Nous en sommes encore aux débuts, et la plateforme grandit chaque semaine.",
    },
    'about.stats': {
      eyebrow: 'En bref',
      title: 'En bref',
      body: 'Bilingue FR & EN · Enregistrée auprès du Namibia Tourism Board · N° NTB TFA01163',
    },
    'about.story': {
      eyebrow: 'Notre histoire',
      title: 'Notre histoire',
      body: "D'un premier circuit sur le terrain à un opérateur présent dans cinq pays.",
    },
    'about.md': {
      eyebrow: 'Direction',
      title: 'Directeur Général',
      body: "Faustin Munanga Kupasula a guidé son premier circuit en 2007, et a depuis passé des années à faire découvrir la beauté et la richesse culturelle de l'Afrique australe et centrale à des voyageurs du monde entier — de langue française, anglaise, espagnole, allemande, italienne, chinoise et japonaise. En tant que Directeur Général, il dirige Mufasa Safaris & Tours — qui a réalisé son premier circuit en tant qu'opérateur en 2021 — a guidé quelque 300 circuits et personnellement encadré des groupes allant jusqu'à 100 voyageurs, en alliant une connaissance locale de terrain à une plateforme de réservation moderne et transparente.",
    },
    'about.md.person': {
      eyebrow: 'Directeur Général & Fondateur',
      title: 'Faustin Munanga Kupasula',
      body: "J'ai commencé comme guide sur le terrain en 2007. Nous concevons chaque voyage comme j'aimerais voyager moi-même — authentique, personnel et honnête.",
    },
    'about.vm': {
      eyebrow: "Notre raison d'être",
      title: 'Vision & Mission',
      body: 'Ce vers quoi nous avançons, et la manière dont nous y allons.',
    },
    'about.vision': {
      eyebrow: null,
      title: 'Notre vision',
      body: "Ouvrir au monde la beauté et la richesse culturelle de l'Afrique — un voyage authentique à la fois.",
    },
    'about.mission': {
      eyebrow: null,
      title: 'Notre mission',
      body: 'Concevoir des voyages responsables et sur mesure qui reflètent chaque voyageur — en alliant une expertise locale approfondie à une plateforme moderne et transparente, tout en réduisant notre impact, en soutenant les économies locales et en préservant le patrimoine culturel.',
    },
    'about.values': {
      eyebrow: 'Ce qui nous définit',
      title: 'Nos valeurs',
      body: "Les trois engagements à l'aune desquels chaque voyage est mesuré.",
    },
  },
};

// `animate: false` on the founding year -- counting up through 202, 1841,
// 2013 to land on 2019 reads as a glitch, not a flourish.
export const ABOUT_STAT_DEFAULTS: Record<CmsLocale, AboutStatDefault[]> = {
  en: [
    { heading: 'Established', numericValue: 2019, prefix: null, suffix: null, animate: false },
    { heading: 'Years of experience', numericValue: 15, prefix: null, suffix: '+', animate: true },
    { heading: 'Countries', numericValue: 5, prefix: null, suffix: null, animate: true },
    { heading: 'Largest group supervised', numericValue: 100, prefix: null, suffix: null, animate: true },
    { heading: 'Tours guided', numericValue: 300, prefix: '~', suffix: null, animate: true },
  ],
  fr: [
    { heading: 'Fondée', numericValue: 2019, prefix: null, suffix: null, animate: false },
    { heading: "Ans d'expérience", numericValue: 15, prefix: null, suffix: '+', animate: true },
    { heading: 'Pays', numericValue: 5, prefix: null, suffix: null, animate: true },
    { heading: 'Plus grand groupe encadré', numericValue: 100, prefix: null, suffix: null, animate: true },
    { heading: 'Circuits guidés', numericValue: 300, prefix: '~', suffix: null, animate: true },
  ],
};

export const ABOUT_TIMELINE_DEFAULTS: Record<CmsLocale, AboutTimelineDefault[]> = {
  en: [
    {
      marker: '2007',
      heading: 'It starts on the ground',
      body: 'Faustin Munanga Kupasula leads his first tour as a guide — the beginning of a journey across Southern and Central Africa.',
    },
    {
      marker: '2019',
      heading: 'Founded in Windhoek',
      body: 'Mufasa Safaris & Tours CC is established, built on years of hands-on local guiding.',
    },
    {
      marker: '2021',
      heading: 'First tour as an operator',
      body: 'Mufasa runs its first tour as a fully-fledged operator — packages, logistics and guiding under one roof.',
    },
    {
      marker: '2026',
      heading: 'One platform',
      body: 'We partner with Cyber PolCo to run booking and operations on the Polco Tours system.',
    },
    {
      marker: 'Today',
      heading: 'Five countries',
      body: 'Operating across Namibia, Botswana, Zimbabwe, Zambia and the DRC — with more of the continent to come.',
    },
  ],
  fr: [
    {
      marker: '2007',
      heading: 'Tout commence sur le terrain',
      body: "Faustin Munanga Kupasula guide son premier circuit — le début d'un parcours à travers l'Afrique australe et centrale.",
    },
    {
      marker: '2019',
      heading: 'Fondée à Windhoek',
      body: "Mufasa Safaris & Tours CC voit le jour, forte d'années de guidage local sur le terrain.",
    },
    {
      marker: '2021',
      heading: "Premier circuit en tant qu'opérateur",
      body: "Mufasa réalise son premier circuit en tant qu'opérateur à part entière — circuits, logistique et guidage réunis.",
    },
    {
      marker: '2026',
      heading: 'Une plateforme',
      body: 'Nous nous associons à Cyber PolCo pour gérer réservation et opérations sur le système Polco Tours.',
    },
    {
      marker: "Aujourd'hui",
      heading: 'Cinq pays',
      body: 'Présents en Namibie, au Botswana, au Zimbabwe, en Zambie et en RDC — avec le reste du continent à venir.',
    },
  ],
};

export const ABOUT_VALUE_DEFAULTS: Record<CmsLocale, AboutValueDefault[]> = {
  en: [
    {
      heading: 'Responsible tourism',
      body: 'We minimise our impact, support local economies, and preserve the cultural heritage of the places we visit.',
    },
    {
      heading: 'Local expertise',
      body: 'More than 15 years on the ground, guiding travellers through the region we call home.',
    },
    {
      heading: 'Honest & transparent',
      body: 'Real availability, clear pricing, and a straight story about where we are — no overselling.',
    },
  ],
  fr: [
    {
      heading: 'Tourisme responsable',
      body: 'Nous réduisons notre impact, soutenons les économies locales et préservons le patrimoine culturel des lieux que nous visitons.',
    },
    {
      heading: 'Expertise locale',
      body: 'Plus de 15 ans sur le terrain, à guider les voyageurs dans la région qui est la nôtre.',
    },
    {
      heading: 'Honnêteté & transparence',
      body: 'Des disponibilités réelles, des prix clairs et un discours honnête sur où nous en sommes — sans survente.',
    },
  ],
};
