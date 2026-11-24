// Translated service & extras catalogue. IDs match server/src/data/catalogue.js.
// Use these labels instead of the German labels returned by the API
// (e.g. estimate.extras[].label) – look them up by id.
import { defineMessages } from '../config';
import type { ServiceId } from '../../types';

export const EXTRA_IDS = [
  'interior-windows',
  'door-handles',
  'inside-fridge',
  'inside-oven',
  'inside-cabinets',
  'baseboards',
  'window-blinds',
  'balcony',
  'laundry',
  'ironing',
  'dishes',
  'glass-partitions',
  'microwave',
  'coffee-machine',
  'carpet-vacuum',
] as const;
export type ExtraId = (typeof EXTRA_IDS)[number];

type ServiceText = { name: string; short: string; included: string[]; excluded: string[] };
type ExtraText = { label: string; description: string };

const de = {
  services: {
    'home-cleaning': {
      name: 'Wohnungsreinigung',
      short: 'Regelmäßig oder einmalig – für ein frisches, gepflegtes Zuhause.',
      included: [
        'Wohn- und Schlafräume: Böden saugen/wischen, Oberflächen abstauben',
        'Bad und WC: Toilette, Waschbecken, Armaturen, Dusche/Wanne, Spiegel, Boden',
        'Küche: Spüle, Arbeitsflächen, Fronten, Kochfeld, Geräte außen, Boden',
        'Flur: Böden saugen/wischen, Oberflächen abstauben',
      ],
      excluded: [
        'Außenfenster in Höhe oder unsichere Bereiche',
        'Leiter- oder Dacharbeiten',
        'Schweres Heben und Verrücken großer Möbel',
        'Schimmel-, Schädlings- oder Gefahrstoffbeseitigung',
        'Spezielle Fleckenentfernung, Reparaturen',
      ],
    },
    'deep-cleaning': {
      name: 'Grundreinigung',
      short: 'Mehr Zeit für Details – für Räume, die eine gründliche Auffrischung brauchen.',
      included: [
        'Alle Leistungen der Wohnungsreinigung',
        'Sockelleisten, Türen, Griffe, Schalter',
        'Intensive Reinigung von Küche und Bad',
      ],
      excluded: ['Schimmel-, Schädlings- oder Gefahrstoffbeseitigung', 'Außenfenster in Höhe'],
    },
    'end-of-tenancy': {
      name: 'Umzugsreinigung',
      short: 'Sauber übergeben – mit Checkliste für Küche, Bad und alle Räume.',
      included: [
        'Küche inkl. Schränke innen, Backofen, Kühlschrank (abgetaut und leer)',
        'Bad: Fliesen, Fugen soweit möglich, Armaturen, Spiegel',
        'Räume: Sockelleisten, Türen, Schalter, Heizkörper, leere Schränke',
        'Innenfenster nach Absprache',
      ],
      excluded: [
        'Renovierungs- und Malerarbeiten',
        'Entsorgung von Möbeln und Sperrmüll',
        'Schimmel- oder Schadensbeseitigung',
      ],
    },
    'business-cleaning': {
      name: 'Büro- und Gewerbereinigung',
      short: 'Zuverlässige Reinigung für Arbeitsplätze und Gemeinschaftsbereiche – mit individuellem Angebot.',
      included: [
        'Arbeitsplätze (nur freie Flächen), Böden, Eingänge, Flure',
        'Teeküchen und Sanitärräume',
        'Kontaktflächen, Abfall nach Hausordnung',
      ],
      excluded: ['Fenster, Teppich und Sonderreinigung nur per separatem Angebot'],
    },
  } as Record<ServiceId, ServiceText>,
  extras: {
    'interior-windows': { label: 'Innenfenster', description: 'Glasflächen, erreichbare Rahmen und Fensterbänke' },
    'door-handles': { label: 'Türgriffe', description: 'Vereinbarte Griffe abwischen und desinfizieren' },
    'inside-fridge': { label: 'Kühlschrank innen', description: 'Muss geleert sein; Gefrierfach abgetaut' },
    'inside-oven': { label: 'Backofen innen', description: 'Standardverschmutzung, keine Gefahrstoffe' },
    'inside-cabinets': { label: 'Schränke innen', description: 'Nur leere oder freigeräumte Schränke' },
    baseboards: { label: 'Sockelleisten', description: 'Erreichbare Sockelleisten abwischen' },
    'window-blinds': { label: 'Jalousien', description: 'Geeignete Jalousien abstauben/abwischen' },
    balcony: { label: 'Balkon', description: 'Zugänglichen Balkonboden fegen und reinigen' },
    laundry: { label: 'Wäsche', description: 'Waschen, Trocknen, Falten nach Absprache' },
    ironing: { label: 'Bügeln', description: 'Nach Zeit abgerechnet' },
    dishes: { label: 'Geschirr', description: 'Abwasch oder Spülmaschine einräumen' },
    'glass-partitions': { label: 'Glastrennwände', description: 'Nur erreichbares Innenglas' },
    microwave: { label: 'Mikrowelle', description: 'Innen und außen' },
    'coffee-machine': { label: 'Kaffeemaschine', description: 'Außen und abnehmbare Teile laut Anleitung' },
    'carpet-vacuum': { label: 'Teppich saugen', description: 'Standard-Saugen; Tiefenreinigung separat' },
  } as Record<ExtraId, ExtraText>,
};

export type CatalogueMessages = typeof de;

const en: CatalogueMessages = {
  services: {
    'home-cleaning': {
      name: 'Home cleaning',
      short: 'Regular or one-off – for a fresh, well-kept home.',
      included: [
        'Living rooms and bedrooms: vacuum/mop floors, dust surfaces',
        'Bathroom and toilet: toilet, sink, taps, shower/bath, mirrors, floor',
        'Kitchen: sink, worktops, fronts, hob, appliances outside, floor',
        'Hallway: vacuum/mop floors, dust surfaces',
      ],
      excluded: [
        'Exterior windows at height or unsafe areas',
        'Ladder or roof work',
        'Heavy lifting and moving large furniture',
        'Mould, pest or hazardous substance removal',
        'Specialist stain removal, repairs',
      ],
    },
    'deep-cleaning': {
      name: 'Deep cleaning',
      short: 'More time for the details – for rooms that need a thorough refresh.',
      included: [
        'Everything included in home cleaning',
        'Skirting boards, doors, handles, switches',
        'Intensive cleaning of kitchen and bathroom',
      ],
      excluded: ['Mould, pest or hazardous substance removal', 'Exterior windows at height'],
    },
    'end-of-tenancy': {
      name: 'End-of-tenancy cleaning',
      short: 'Hand over a clean flat – with a checklist for kitchen, bathroom and all rooms.',
      included: [
        'Kitchen incl. cupboards inside, oven, fridge (defrosted and empty)',
        'Bathroom: tiles, grout where possible, taps, mirrors',
        'Rooms: skirting boards, doors, switches, radiators, empty wardrobes',
        'Interior windows by arrangement',
      ],
      excluded: ['Renovation and painting', 'Disposal of furniture and bulky waste', 'Mould or damage repair'],
    },
    'business-cleaning': {
      name: 'Office & commercial cleaning',
      short: 'Reliable cleaning for workplaces and shared areas – with a tailored quotation.',
      included: [
        'Workstations (clear surfaces only), floors, entrances, corridors',
        'Kitchenettes and washrooms',
        'Touch points, waste according to house rules',
      ],
      excluded: ['Windows, carpets and special cleaning only by separate quotation'],
    },
  },
  extras: {
    'interior-windows': { label: 'Interior windows', description: 'Glass, reachable frames and sills' },
    'door-handles': { label: 'Door handles', description: 'Wipe and disinfect agreed handles' },
    'inside-fridge': { label: 'Inside the fridge', description: 'Must be empty; freezer defrosted' },
    'inside-oven': { label: 'Inside the oven', description: 'Normal soiling, no hazardous chemicals' },
    'inside-cabinets': { label: 'Inside cabinets', description: 'Only empty or cleared cupboards' },
    baseboards: { label: 'Skirting boards', description: 'Wipe reachable skirting boards' },
    'window-blinds': { label: 'Blinds', description: 'Dust/wipe suitable blinds' },
    balcony: { label: 'Balcony', description: 'Sweep and clean the accessible balcony floor' },
    laundry: { label: 'Laundry', description: 'Wash, dry and fold as agreed' },
    ironing: { label: 'Ironing', description: 'Charged by time' },
    dishes: { label: 'Dishes', description: 'Hand-washing or loading the dishwasher' },
    'glass-partitions': { label: 'Glass partitions', description: 'Reachable interior glass only' },
    microwave: { label: 'Microwave', description: 'Inside and outside' },
    'coffee-machine': { label: 'Coffee machine', description: 'Outside and removable parts as per manual' },
    'carpet-vacuum': { label: 'Carpet vacuuming', description: 'Standard vacuuming; deep cleaning separate' },
  },
};

const pl: CatalogueMessages = {
  services: {
    'home-cleaning': {
      name: 'Sprzątanie mieszkania',
      short: 'Regularnie lub jednorazowo – dla świeżego, zadbanego domu.',
      included: [
        'Pokoje i sypialnie: odkurzanie/mycie podłóg, ścieranie kurzu',
        'Łazienka i WC: toaleta, umywalka, armatura, prysznic/wanna, lustra, podłoga',
        'Kuchnia: zlew, blaty, fronty, płyta grzewcza, urządzenia z zewnątrz, podłoga',
        'Przedpokój: odkurzanie/mycie podłóg, ścieranie kurzu',
      ],
      excluded: [
        'Okna zewnętrzne na wysokości lub w niebezpiecznych miejscach',
        'Prace na drabinie lub dachu',
        'Dźwiganie i przesuwanie dużych mebli',
        'Usuwanie pleśni, szkodników lub substancji niebezpiecznych',
        'Specjalistyczne usuwanie plam, naprawy',
      ],
    },
    'deep-cleaning': {
      name: 'Gruntowne sprzątanie',
      short: 'Więcej czasu na szczegóły – dla pomieszczeń, które potrzebują gruntownego odświeżenia.',
      included: [
        'Wszystko, co obejmuje sprzątanie mieszkania',
        'Listwy przypodłogowe, drzwi, klamki, włączniki',
        'Intensywne sprzątanie kuchni i łazienki',
      ],
      excluded: ['Usuwanie pleśni, szkodników lub substancji niebezpiecznych', 'Okna zewnętrzne na wysokości'],
    },
    'end-of-tenancy': {
      name: 'Sprzątanie po przeprowadzce',
      short: 'Oddaj czyste mieszkanie – z listą kontrolną dla kuchni, łazienki i wszystkich pokoi.',
      included: [
        'Kuchnia wraz z szafkami w środku, piekarnikiem, lodówką (rozmrożoną i pustą)',
        'Łazienka: płytki, fugi w miarę możliwości, armatura, lustra',
        'Pokoje: listwy, drzwi, włączniki, grzejniki, puste szafy',
        'Okna od wewnątrz po uzgodnieniu',
      ],
      excluded: ['Prace remontowe i malarskie', 'Wywóz mebli i odpadów wielkogabarytowych', 'Usuwanie pleśni lub szkód'],
    },
    'business-cleaning': {
      name: 'Sprzątanie biur i lokali',
      short: 'Rzetelne sprzątanie miejsc pracy i przestrzeni wspólnych – z indywidualną ofertą.',
      included: [
        'Stanowiska pracy (tylko wolne powierzchnie), podłogi, wejścia, korytarze',
        'Aneksy kuchenne i łazienki',
        'Powierzchnie dotykowe, odpady zgodnie z regulaminem budynku',
      ],
      excluded: ['Okna, dywany i sprzątanie specjalne tylko w ramach osobnej oferty'],
    },
  },
  extras: {
    'interior-windows': { label: 'Okna od wewnątrz', description: 'Szyby, dostępne ramy i parapety' },
    'door-handles': { label: 'Klamki', description: 'Przetarcie i dezynfekcja uzgodnionych klamek' },
    'inside-fridge': { label: 'Lodówka w środku', description: 'Musi być pusta; zamrażarka rozmrożona' },
    'inside-oven': { label: 'Piekarnik w środku', description: 'Zwykłe zabrudzenia, bez substancji niebezpiecznych' },
    'inside-cabinets': { label: 'Szafki w środku', description: 'Tylko puste lub opróżnione szafki' },
    baseboards: { label: 'Listwy przypodłogowe', description: 'Przetarcie dostępnych listew' },
    'window-blinds': { label: 'Żaluzje', description: 'Odkurzanie/przecieranie odpowiednich żaluzji' },
    balcony: { label: 'Balkon', description: 'Zamiatanie i mycie dostępnej podłogi balkonu' },
    laundry: { label: 'Pranie', description: 'Pranie, suszenie, składanie po uzgodnieniu' },
    ironing: { label: 'Prasowanie', description: 'Rozliczane według czasu' },
    dishes: { label: 'Naczynia', description: 'Zmywanie lub załadunek zmywarki' },
    'glass-partitions': { label: 'Szklane ścianki', description: 'Tylko dostępne szkło wewnętrzne' },
    microwave: { label: 'Mikrofalówka', description: 'W środku i na zewnątrz' },
    'coffee-machine': { label: 'Ekspres do kawy', description: 'Z zewnątrz i zdejmowane części wg instrukcji' },
    'carpet-vacuum': { label: 'Odkurzanie dywanów', description: 'Standardowe odkurzanie; pranie osobno' },
  },
};

const catalogue = defineMessages({ de, en, pl });
export default catalogue;
