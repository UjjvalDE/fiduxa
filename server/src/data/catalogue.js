// Service & extras catalogue (blueprint §6–7).
// Extra minutes are initial estimates – calibrate them using real jobs.
// Icons refer to Lucide icon names for the frontend.

export const SERVICES = [
  {
    id: "home-cleaning",
    slug: "wohnungsreinigung",
    name: "Wohnungsreinigung",
    nameEn: "Home cleaning",
    bookingMode: "request", // request → admin quotation
    frequencies: ["one-time", "weekly", "biweekly", "monthly"],
    included: [
      "Wohn- und Schlafräume: Böden saugen/wischen, Oberflächen abstauben",
      "Bad und WC: Toilette, Waschbecken, Armaturen, Dusche/Wanne, Spiegel, Boden",
      "Küche: Spüle, Arbeitsflächen, Fronten, Kochfeld, Geräte außen, Boden",
      "Flur: Böden saugen/wischen, Oberflächen abstauben",
    ],
    excluded: [
      "Außenfenster in Höhe oder unsichere Bereiche",
      "Leiter- oder Dacharbeiten",
      "Schweres Heben und Verrücken großer Möbel",
      "Schimmel-, Schädlings- oder Gefahrstoffbeseitigung",
      "Spezielle Fleckenentfernung, Reparaturen",
    ],
  },
  {
    id: "deep-cleaning",
    slug: "grundreinigung",
    name: "Grundreinigung",
    nameEn: "Deep cleaning",
    bookingMode: "request",
    frequencies: ["one-time"],
    included: [
      "Alle Leistungen der Wohnungsreinigung",
      "Sockelleisten, Türen, Griffe, Schalter",
      "Intensive Reinigung von Küche und Bad",
    ],
    excluded: [
      "Schimmel-, Schädlings- oder Gefahrstoffbeseitigung",
      "Außenfenster in Höhe",
    ],
  },
  {
    id: "end-of-tenancy",
    slug: "umzugsreinigung",
    name: "Umzugsreinigung",
    nameEn: "End-of-tenancy cleaning",
    bookingMode: "request",
    frequencies: ["one-time"],
    included: [
      "Küche inkl. Schränke innen, Backofen, Kühlschrank (abgetaut und leer)",
      "Bad: Fliesen, Fugen soweit möglich, Armaturen, Spiegel",
      "Räume: Sockelleisten, Türen, Schalter, Heizkörper, leere Schränke",
      "Innenfenster nach Absprache",
    ],
    excluded: [
      "Renovierungs- und Malerarbeiten",
      "Entsorgung von Möbeln und Sperrmüll",
      "Schimmel- oder Schadensbeseitigung",
    ],
  },
  {
    id: "business-cleaning",
    slug: "buero-reinigung",
    name: "Büro- und Gewerbereinigung",
    nameEn: "Business cleaning",
    bookingMode: "business-request", // uses POST /api/v1/business-requests
    frequencies: [],
    included: [
      "Arbeitsplätze (nur freie Flächen), Böden, Eingänge, Flure",
      "Teeküchen und Sanitärräume",
      "Kontaktflächen, Abfall nach Hausordnung",
    ],
    excluded: [
      "Fenster, Teppich und Sonderreinigung nur per separatem Angebot",
    ],
  },
];

export const EXTRAS = [
  { id: "interior-windows", label: "Innenfenster", labelEn: "Interior windows", description: "Glasflächen, erreichbare Rahmen und Fensterbänke", minutes: 30, priceCents: 0, icon: "app-window" },
  { id: "door-handles", label: "Türgriffe", labelEn: "Door handles", description: "Vereinbarte Griffe abwischen und desinfizieren", minutes: 10, priceCents: 0, icon: "door-open" },
  { id: "inside-fridge", label: "Kühlschrank innen", labelEn: "Inside fridge", description: "Muss geleert sein; Gefrierfach abgetaut", minutes: 25, priceCents: 0, icon: "refrigerator" },
  { id: "inside-oven", label: "Backofen innen", labelEn: "Inside oven", description: "Standardverschmutzung, keine Gefahrstoffe", minutes: 40, priceCents: 0, icon: "cooking-pot" },
  { id: "inside-cabinets", label: "Schränke innen", labelEn: "Inside cabinets", description: "Nur leere oder freigeräumte Schränke", minutes: 30, priceCents: 0, icon: "archive" },
  { id: "baseboards", label: "Sockelleisten", labelEn: "Baseboards", description: "Erreichbare Sockelleisten abwischen", minutes: 20, priceCents: 0, icon: "brush" },
  { id: "window-blinds", label: "Jalousien", labelEn: "Window blinds", description: "Geeignete Jalousien abstauben/abwischen", minutes: 20, priceCents: 0, icon: "blinds" },
  { id: "balcony", label: "Balkon", labelEn: "Balcony", description: "Zugänglichen Balkonboden fegen und reinigen", minutes: 20, priceCents: 0, icon: "sun" },
  { id: "laundry", label: "Wäsche", labelEn: "Laundry", description: "Waschen, Trocknen, Falten nach Absprache", minutes: 30, priceCents: 0, icon: "washing-machine" },
  { id: "ironing", label: "Bügeln", labelEn: "Ironing", description: "Nach Zeit abgerechnet", minutes: 30, priceCents: 0, icon: "shirt" },
  { id: "dishes", label: "Geschirr", labelEn: "Dishes", description: "Abwasch oder Spülmaschine einräumen", minutes: 20, priceCents: 0, icon: "utensils" },
  { id: "glass-partitions", label: "Glastrennwände", labelEn: "Interior glass partitions", description: "Nur erreichbares Innenglas", minutes: 20, priceCents: 0, icon: "panels-top-left" },
  { id: "microwave", label: "Mikrowelle", labelEn: "Microwave", description: "Innen und außen", minutes: 10, priceCents: 0, icon: "microwave" },
  { id: "coffee-machine", label: "Kaffeemaschine", labelEn: "Coffee machine", description: "Außen und abnehmbare Teile laut Anleitung", minutes: 10, priceCents: 0, icon: "coffee" },
  { id: "carpet-vacuum", label: "Teppich saugen", labelEn: "Carpet vacuum", description: "Standard-Saugen; Tiefenreinigung separat", minutes: 15, priceCents: 0, icon: "layers" },
];

// Legacy extra IDs used by earlier versions of the API
export const EXTRA_ALIASES = {
  windows: "interior-windows",
};

export const SERVICE_IDS = SERVICES.map((s) => s.id);
export const EXTRA_IDS = EXTRAS.map((e) => e.id);

export const findService = (id) => SERVICES.find((s) => s.id === id);
export const findExtra = (id) =>
  EXTRAS.find((e) => e.id === (EXTRA_ALIASES[id] ?? id));
