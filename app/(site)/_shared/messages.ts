// Shared website copy for the public pages: marketing texts per service,
// pricing facts, legal page chrome. Service names, included/excluded lists
// and extras come from lib/i18n/messages/catalogue.ts.
import { defineMessages } from '@/lib/i18n/config';
import type { ServiceId } from '@/lib/types';

type ServiceCopy = {
  eyebrow: string;
  teaser: string;
  intro: string;
  audience: string[];
  highlights: string[];
};

const de = {
  services: {
    'home-cleaning': {
      eyebrow: 'Für jeden Alltag',
      teaser: 'Regelmäßig oder einmalig: Wir halten dein Zuhause frisch, gepflegt und angenehm.',
      intro:
        'Die klassische Reinigung für deine Wohnung – einmalig oder in festen Abständen. Wohnräume, Küche, Bad und Flur werden sorgfältig gereinigt, damit du dich um anderes kümmern kannst.',
      audience: [
        'Berufstätige, Familien und WGs, die im Alltag Zeit gewinnen möchten',
        'Alle, die eine regelmäßige Reinigung im festen Rhythmus suchen',
        'Haushalte, die vor Besuch oder nach einer vollen Woche einmalig Unterstützung möchten',
      ],
      highlights: ['Wohn- und Schlafräume', 'Küche, Bad und Böden', 'Individuelle Extras buchbar'],
    },
    'deep-cleaning': {
      eyebrow: 'Wenn es mehr braucht',
      teaser: 'Mehr Zeit für die Details. Für Räume, die eine gründliche Auffrischung verdienen.',
      intro:
        'Die Grundreinigung geht über die normale Reinigung hinaus: Wir nehmen uns Zeit für Details, die im Alltag liegen bleiben – von Sockelleisten bis zu Türgriffen und einer intensiven Reinigung von Küche und Bad.',
      audience: [
        'Wohnungen, die länger nicht gründlich gereinigt wurden',
        'Der Frühjahrsputz oder ein Neustart vor einer regelmäßigen Reinigung',
        'Haushalte nach Renovierung im Rahmen normaler Verschmutzung (keine Bauendreinigung)',
      ],
      highlights: ['Intensive Oberflächenpflege', 'Schwer zugängliche Stellen', 'Transparente Zeitempfehlung'],
    },
    'end-of-tenancy': {
      eyebrow: 'Entspannt umziehen',
      teaser: 'Sauber übergeben, ohne zusätzlichen Stress. Mit klarer Checkliste für Küche, Bad und alle Räume.',
      intro:
        'Beim Auszug oder vor dem Einzug: Wir reinigen die leere Wohnung gründlich – inklusive Küche, Schränken und Bad –, damit die Übergabe entspannt verläuft.',
      audience: [
        'Mieterinnen und Mieter vor der Wohnungsübergabe',
        'Alle, die vor dem Einzug in eine frisch gereinigte Wohnung starten möchten',
        'Vermieter, die eine Wohnung zwischen zwei Mietverhältnissen reinigen lassen',
      ],
      highlights: ['Küche und Sanitärbereiche', 'Böden, Türen und Fenster innen', 'Festpreis vor der Buchung'],
    },
    'business-cleaning': {
      eyebrow: 'Für Teams und Räume',
      teaser: 'Zuverlässige Reinigung für Arbeitsplätze, Gemeinschaftsbereiche und kleine Gewerbe.',
      intro:
        'Saubere Arbeitsplätze, gepflegte Teeküchen und Sanitärräume: Für Büros, Praxen, Ladengeschäfte und Treppenhäuser erstellen wir ein individuelles Angebot – abgestimmt auf Fläche, Intervall und Ihre Abläufe.',
      audience: [
        'Büros und Coworking-Flächen kleiner und mittlerer Teams',
        'Praxen, Studios und Ladengeschäfte',
        'Hausverwaltungen für Treppenhäuser und Gemeinschaftsflächen',
      ],
      highlights: ['Regelmäßige Intervalle', 'Flexible Arbeitszeiten', 'Persönliches Angebot'],
    },
  } as Record<ServiceId, ServiceCopy>,
  pricing: {
    loading: 'Preise werden geladen …',
    unavailableBefore: 'Die aktuellen Preise konnten gerade nicht geladen werden. Du findest sie jederzeit auf unserer',
    unavailableLink: 'Preisseite',
    hourlyRate: 'Stundensatz',
    minimumBooking: 'Mindestbuchung',
    inclVat: 'Alle Preise inkl. gesetzlicher MwSt.',
  },
  legal: {
    eyebrow: 'Rechtliches',
    placeholderTitle: 'Platzhalter – vor Livegang rechtlich prüfen lassen',
    placeholderText:
      'Diese Seite ist eine unverbindliche Vorlage. Alle Angaben in eckigen Klammern müssen ergänzt und der gesamte Text von einer fachkundigen Stelle (z. B. Rechtsanwältin/Rechtsanwalt) geprüft werden.',
    bindingTitle: '',
    bindingText: '',
    toc: 'Inhalt',
    updated: 'Stand',
    placeholder: 'Platzhalter',
    date: 'Datum',
  },
};

export type SiteMessages = typeof de;

const en: SiteMessages = {
  services: {
    'home-cleaning': {
      eyebrow: 'For everyday life',
      teaser: 'Regular or one-off: we keep your home fresh, well kept and pleasant.',
      intro:
        'The classic clean for your flat – one-off or at regular intervals. Living areas, kitchen, bathroom and hallway are cleaned carefully, so you can take care of other things.',
      audience: [
        'Working people, families and flat shares who want more time in their day',
        'Anyone looking for regular cleaning on a fixed schedule',
        'Households that want a one-off helping hand before visitors or after a busy week',
      ],
      highlights: ['Living rooms and bedrooms', 'Kitchen, bathroom and floors', 'Optional extras available'],
    },
    'deep-cleaning': {
      eyebrow: 'When it needs more',
      teaser: 'More time for the details. For rooms that deserve a thorough refresh.',
      intro:
        'A deep clean goes beyond regular cleaning: we take time for the details that get missed day to day – from skirting boards to door handles and an intensive clean of kitchen and bathroom.',
      audience: [
        'Homes that have not been cleaned thoroughly for a while',
        'Spring cleaning or a fresh start before regular cleaning',
        'Homes after renovation with normal levels of dirt (not post-construction cleaning)',
      ],
      highlights: ['Intensive surface care', 'Hard-to-reach areas', 'Transparent time recommendation'],
    },
    'end-of-tenancy': {
      eyebrow: 'Move without the stress',
      teaser: 'Hand over a clean flat without extra stress. With a clear checklist for kitchen, bathroom and every room.',
      intro:
        'When moving out or before moving in: we clean the empty flat thoroughly – including kitchen, cupboards and bathroom – so the handover goes smoothly.',
      audience: [
        'Tenants before handing back their flat',
        'Anyone who wants to move into a freshly cleaned home',
        'Landlords who want a flat cleaned between two tenancies',
      ],
      highlights: ['Kitchen and bathrooms', 'Floors, doors and interior windows', 'Fixed price before you book'],
    },
    'business-cleaning': {
      eyebrow: 'For teams and premises',
      teaser: 'Reliable cleaning for workplaces, shared areas and small businesses.',
      intro:
        'Clean workstations, tidy kitchenettes and washrooms: for offices, practices, shops and stairwells we prepare a tailored quotation – based on your floor space, cleaning interval and routines.',
      audience: [
        'Offices and co-working spaces for small and medium-sized teams',
        'Practices, studios and shops',
        'Property managers for stairwells and shared areas',
      ],
      highlights: ['Regular intervals', 'Flexible working hours', 'Personal quotation'],
    },
  },
  pricing: {
    loading: 'Loading prices …',
    unavailableBefore: 'The current prices could not be loaded right now. You can always find them on our',
    unavailableLink: 'prices page',
    hourlyRate: 'Hourly rate',
    minimumBooking: 'Minimum booking',
    inclVat: 'All prices include statutory VAT.',
  },
  legal: {
    eyebrow: 'Legal',
    placeholderTitle: 'Placeholder – have this reviewed by a lawyer before launch',
    placeholderText:
      'This page is a non-binding template. All details in square brackets must be completed and the entire text must be reviewed by a qualified professional (e.g. a lawyer).',
    bindingTitle: 'Translation for your convenience',
    bindingText: 'This English version is provided for information only. The German version is the legally binding one.',
    toc: 'Contents',
    updated: 'Last updated',
    placeholder: 'Placeholder',
    date: 'date',
  },
};

const pl: SiteMessages = {
  services: {
    'home-cleaning': {
      eyebrow: 'Na co dzień',
      teaser: 'Regularnie lub jednorazowo: dbamy o to, by Twój dom był świeży, zadbany i przyjemny.',
      intro:
        'Klasyczne sprzątanie Twojego mieszkania – jednorazowo lub w stałych odstępach. Pokoje, kuchnia, łazienka i przedpokój są starannie sprzątane, a Ty możesz zająć się czymś innym.',
      audience: [
        'Osoby pracujące, rodziny i współlokatorzy, którzy chcą zyskać więcej czasu',
        'Wszyscy, którzy szukają regularnego sprzątania w stałym rytmie',
        'Gospodarstwa domowe, które chcą jednorazowej pomocy przed wizytą gości lub po intensywnym tygodniu',
      ],
      highlights: ['Pokoje dzienne i sypialnie', 'Kuchnia, łazienka i podłogi', 'Usługi dodatkowe do wyboru'],
    },
    'deep-cleaning': {
      eyebrow: 'Gdy potrzeba więcej',
      teaser: 'Więcej czasu na szczegóły. Dla pomieszczeń, które zasługują na gruntowne odświeżenie.',
      intro:
        'Gruntowne sprzątanie wykracza poza zwykłe sprzątanie: poświęcamy czas szczegółom, które na co dzień umykają – od listew przypodłogowych po klamki oraz intensywne sprzątanie kuchni i łazienki.',
      audience: [
        'Mieszkania, które od dawna nie były gruntownie sprzątane',
        'Wiosenne porządki lub nowy start przed regularnym sprzątaniem',
        'Mieszkania po remoncie przy normalnym zabrudzeniu (nie sprzątanie poremontowe)',
      ],
      highlights: ['Intensywna pielęgnacja powierzchni', 'Trudno dostępne miejsca', 'Przejrzysta rekomendacja czasu'],
    },
    'end-of-tenancy': {
      eyebrow: 'Przeprowadzka bez stresu',
      teaser: 'Oddaj mieszkanie czyste i bez dodatkowego stresu. Z jasną listą kontrolną dla kuchni, łazienki i wszystkich pomieszczeń.',
      intro:
        'Przy wyprowadzce lub przed wprowadzeniem się: gruntownie sprzątamy puste mieszkanie – łącznie z kuchnią, szafkami i łazienką – aby przekazanie przebiegło spokojnie.',
      audience: [
        'Najemcy przed przekazaniem mieszkania',
        'Wszyscy, którzy chcą wprowadzić się do świeżo posprzątanego mieszkania',
        'Wynajmujący, którzy chcą posprzątać mieszkanie między najmami',
      ],
      highlights: ['Kuchnia i łazienki', 'Podłogi, drzwi i okna od wewnątrz', 'Stała cena przed rezerwacją'],
    },
    'business-cleaning': {
      eyebrow: 'Dla zespołów i lokali',
      teaser: 'Rzetelne sprzątanie miejsc pracy, przestrzeni wspólnych i małych firm.',
      intro:
        'Czyste stanowiska pracy, zadbane aneksy kuchenne i łazienki: dla biur, gabinetów, sklepów i klatek schodowych przygotowujemy indywidualną ofertę – dopasowaną do powierzchni, częstotliwości i Państwa organizacji pracy.',
      audience: [
        'Biura i coworkingi małych i średnich zespołów',
        'Gabinety, studia i sklepy',
        'Zarządcy nieruchomości – klatki schodowe i części wspólne',
      ],
      highlights: ['Regularne terminy', 'Elastyczne godziny', 'Indywidualna oferta'],
    },
  },
  pricing: {
    loading: 'Ładowanie cen …',
    unavailableBefore: 'Nie udało się teraz wczytać aktualnych cen. Zawsze znajdziesz je na naszej',
    unavailableLink: 'stronie z cenami',
    hourlyRate: 'Stawka godzinowa',
    minimumBooking: 'Minimalna rezerwacja',
    inclVat: 'Wszystkie ceny zawierają VAT.',
  },
  legal: {
    eyebrow: 'Informacje prawne',
    placeholderTitle: 'Wersja robocza – przed uruchomieniem wymaga weryfikacji prawnej',
    placeholderText:
      'Ta strona jest niewiążącym szablonem. Wszystkie dane w nawiasach kwadratowych należy uzupełnić, a cały tekst musi zostać sprawdzony przez specjalistę (np. prawnika).',
    bindingTitle: 'Tłumaczenie informacyjne',
    bindingText: 'Ta polska wersja ma charakter wyłącznie informacyjny. Wiążąca prawnie jest wersja niemiecka.',
    toc: 'Spis treści',
    updated: 'Stan na',
    placeholder: 'Do uzupełnienia',
    date: 'data',
  },
};

const siteMessages = defineMessages({ de, en, pl });
export default siteMessages;
