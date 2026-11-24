// District landing pages (SEO). `plz` = first postcode of the district.
export interface District {
  slug: string;
  name: string;
  plz: string;
  /** Short unique intro (German); en/pl use a generic text */
  intro: string;
}

export const DISTRICTS: District[] = [
  { slug: 'mitte', name: 'Mitte', plz: '10115', intro: 'Zwischen Alexanderplatz, Hackescher Markt und Regierungsviertel wohnen viele Berufstätige mit wenig freier Zeit. Wir kommen in Altbauwohnungen und Neubauten in Mitte, gerne auch kurzfristig nach Feierabend.' },
  { slug: 'kreuzberg', name: 'Kreuzberg', plz: '10961', intro: 'Hohe Altbaudecken, Dielenböden und viel Leben auf der Straße: In Kreuzberg setzt sich schnell Staub fest. Unsere Reinigungskräfte kennen die Kieze rund um Bergmannstraße, Kottbusser Tor und Wrangelkiez.' },
  { slug: 'friedrichshain', name: 'Friedrichshain', plz: '10243', intro: 'Ob WG am Boxhagener Platz oder Neubau an der Spree: Wir reinigen Wohnungen in Friedrichshain flexibel, auch für Grundreinigungen vor dem Auszug.' },
  { slug: 'prenzlauer-berg', name: 'Prenzlauer Berg', plz: '10405', intro: 'Familienwohnungen mit Kinderzimmern, Balkon und Altbaucharme: Im Prenzlauer Berg unterstützen wir Familien mit regelmäßiger Reinigung, damit mehr Zeit für das Wesentliche bleibt.' },
  { slug: 'neukoelln', name: 'Neukölln', plz: '12043', intro: 'Von der Sonnenallee bis zum Schillerkiez: In Neukölln reinigen wir Wohnungen aller Größen zu festen, transparenten Stundenpreisen, ohne versteckte Kosten.' },
  { slug: 'charlottenburg', name: 'Charlottenburg', plz: '10585', intro: 'Große Altbauwohnungen rund um Kantstraße und Savignyplatz brauchen Zeit und Sorgfalt. In Charlottenburg planen wir die Dauer passend zur Wohnungsgröße.' },
  { slug: 'schoeneberg', name: 'Schöneberg', plz: '10823', intro: 'Rund um den Winterfeldtplatz und die Akazienstraße reinigen wir Wohnungen in Schöneberg, vom Single-Apartment bis zur Familienwohnung.' },
  { slug: 'wilmersdorf', name: 'Wilmersdorf', plz: '10707', intro: 'Ruhige Straßen, großzügige Wohnungen: In Wilmersdorf sind wir beliebt für Grundreinigungen und die regelmäßige Unterhaltsreinigung.' },
  { slug: 'moabit', name: 'Moabit', plz: '10551', intro: 'Zwischen Spree, Hauptbahnhof und Arminiusmarkthalle wächst Moabit stetig. Wir reinigen Alt- und Neubauwohnungen und kommen auch zur Endreinigung beim Umzug.' },
  { slug: 'wedding', name: 'Wedding', plz: '13347', intro: 'Wedding ist lebendig und zentral. Wir bringen Ordnung in Wohnungen rund um Leopoldplatz, Nordufer und Gesundbrunnen, auch für die Umzugsreinigung.' },
  { slug: 'tempelhof', name: 'Tempelhof', plz: '12099', intro: 'Rund um das Tempelhofer Feld und den Kaiserin-Augusta-Platz reinigen wir Wohnungen und Einfamilienhäuser in Tempelhof zuverlässig und pünktlich.' },
  { slug: 'steglitz', name: 'Steglitz', plz: '12157', intro: 'Im grünen Steglitz sind größere Wohnungen und Häuser üblich. Wir planen die Reinigungszeit nach Fläche und Zustand und rechnen am Ende transparent ab.' },
];

export const findDistrict = (slug: string) => DISTRICTS.find((d) => d.slug === slug);
