// APPROXIMATE centroids (lat/lng) of Berlin postcode areas – used only to
// give cleaners a rough "ca. 3 km" distance for open jobs. No external maps
// API; precision is on the order of 1–2 km. Keys: full 5-digit postcodes for
// well-known areas, 3-digit prefixes (e.g. "101") as fallback, 2-digit groups
// ("10"–"14") as the last resort.
const CENTROIDS = {
  // Mitte / Prenzlauer Berg / Friedrichshain-Kreuzberg
  10115: [52.532, 13.385], // Mitte (Invalidenstr.)
  10117: [52.517, 13.389], // Mitte (Unter den Linden)
  10119: [52.531, 13.405], // Rosenthaler Vorstadt
  10178: [52.521, 13.41], // Alexanderplatz
  10179: [52.512, 13.418], // Fischerinsel
  10243: [52.513, 13.445], // Friedrichshain (Warschauer Str.)
  10245: [52.5, 13.46], // Friedrichshain (Boxhagener)
  10247: [52.516, 13.465], // Friedrichshain (Frankfurter Allee)
  10249: [52.526, 13.44], // Friedrichshain (Landsberger)
  10405: [52.534, 13.425], // Prenzlauer Berg (Kollwitz)
  10407: [52.535, 13.445], // Prenzlauer Berg (Greifswalder)
  10435: [52.54, 13.408], // Prenzlauer Berg (Schönhauser)
  10437: [52.548, 13.413], // Prenzlauer Berg (Helmholtz)
  10439: [52.555, 13.42], // Prenzlauer Berg Nord
  10551: [52.527, 13.34], // Moabit
  10555: [52.52, 13.33], // Hansaviertel
  10557: [52.521, 13.36], // Regierungsviertel
  10559: [52.53, 13.35], // Moabit Ost
  10585: [52.515, 13.305], // Charlottenburg (Richard-Wagner)
  10587: [52.52, 13.32], // Charlottenburg (TU)
  10623: [52.507, 13.325], // Charlottenburg (Zoo)
  10627: [52.507, 13.3], // Charlottenburg (Kantstr.)
  10629: [52.5, 13.31], // Charlottenburg (Kurfürstendamm)
  10707: [52.496, 13.31], // Wilmersdorf
  10719: [52.5, 13.33], // Wilmersdorf (Uhlandstr.)
  10777: [52.496, 13.345], // Schöneberg (Nollendorf)
  10781: [52.49, 13.35], // Schöneberg (Winterfeldt)
  10785: [52.503, 13.365], // Tiergarten Süd / Potsdamer Platz
  10823: [52.483, 13.35], // Schöneberg (Akazienstr.)
  10827: [52.48, 13.355], // Schöneberg Süd
  10961: [52.49, 13.39], // Kreuzberg (Bergmannkiez)
  10963: [52.5, 13.38], // Kreuzberg (Anhalter)
  10965: [52.485, 13.4], // Kreuzberg (Tempelhofer Feld Nord)
  10967: [52.49, 13.415], // Kreuzberg (Graefekiez)
  10969: [52.505, 13.4], // Kreuzberg (Moritzplatz)
  10997: [52.5, 13.43], // Kreuzberg (Wrangelkiez)
  10999: [52.497, 13.42], // Kreuzberg (Kottbusser Tor)
  // Neukölln / Tempelhof / Steglitz / Zehlendorf (12xxx) + Treptow-Köpenick
  12043: [52.48, 13.44], // Neukölln (Rathaus)
  12047: [52.49, 13.43], // Neukölln (Reuterkiez)
  12049: [52.475, 13.42], // Neukölln (Schillerkiez)
  12053: [52.47, 13.44], // Neukölln (Körnerpark)
  12099: [52.46, 13.4], // Tempelhof
  12103: [52.47, 13.385], // Tempelhof Nord
  12157: [52.47, 13.34], // Steglitz (Friedenau)
  12161: [52.475, 13.33], // Friedenau
  12163: [52.455, 13.32], // Steglitz
  12165: [52.45, 13.31], // Steglitz Süd
  12203: [52.44, 13.31], // Lichterfelde
  12247: [52.43, 13.35], // Lankwitz
  12277: [52.41, 13.38], // Marienfelde
  12305: [52.4, 13.4], // Lichtenrade
  12347: [52.44, 13.44], // Britz
  12355: [52.42, 13.48], // Rudow
  12435: [52.49, 13.47], // Treptow (Alt-Treptow)
  12459: [52.46, 13.52], // Oberschöneweide
  12489: [52.43, 13.53], // Adlershof
  12555: [52.44, 13.58], // Köpenick
  12587: [52.45, 13.62], // Friedrichshagen
  12619: [52.52, 13.57], // Hellersdorf
  12679: [52.55, 13.55], // Marzahn
  // Lichtenberg / Pankow / Reinickendorf / Spandau (13xxx)
  13051: [52.57, 13.47], // Hohenschönhausen
  13086: [52.56, 13.44], // Weißensee
  13125: [52.63, 13.5], // Buch
  13156: [52.58, 13.41], // Niederschönhausen
  13187: [52.57, 13.4], // Pankow
  13189: [52.56, 13.42], // Pankow Süd
  13347: [52.55, 13.36], // Wedding (Leopoldplatz)
  13353: [52.545, 13.345], // Wedding (Sprengelkiez)
  13355: [52.54, 13.39], // Gesundbrunnen
  13357: [52.55, 13.38], // Gesundbrunnen Nord
  13359: [52.555, 13.37], // Soldiner Kiez
  13403: [52.58, 13.33], // Reinickendorf
  13437: [52.6, 13.33], // Wittenau
  13469: [52.6, 13.37], // Waidmannslust
  13503: [52.62, 13.24], // Heiligensee
  13583: [52.54, 13.2], // Spandau (Altstadt)
  13593: [52.53, 13.17], // Staaken
  13627: [52.54, 13.3], // Siemensstadt
  // Charlottenburg-Wilmersdorf West / Zehlendorf (14xxx)
  14050: [52.51, 13.27], // Westend
  14057: [52.505, 13.29], // Charlottenburg (Lietzensee)
  14109: [52.42, 13.16], // Wannsee
  14163: [52.43, 13.24], // Zehlendorf
  14165: [52.43, 13.26], // Zehlendorf Süd
  14169: [52.44, 13.25], // Zehlendorf Mitte
  14193: [52.47, 13.27], // Grunewald
  14195: [52.45, 13.29], // Dahlem
  14197: [52.47, 13.3], // Wilmersdorf (Breitenbachplatz)
  14199: [52.48, 13.29], // Schmargendorf
  // Fallbacks by prefix
  101: [52.52, 13.4],
  102: [52.512, 13.45],
  104: [52.54, 13.42],
  105: [52.525, 13.34],
  106: [52.507, 13.31],
  107: [52.498, 13.32],
  108: [52.483, 13.352],
  109: [52.495, 13.4],
  120: [52.475, 13.43],
  121: [52.47, 13.35],
  122: [52.43, 13.33],
  123: [52.42, 13.44],
  124: [52.46, 13.5],
  125: [52.44, 13.6],
  126: [52.53, 13.56],
  130: [52.57, 13.47],
  131: [52.6, 13.45],
  133: [52.55, 13.37],
  134: [52.59, 13.33],
  135: [52.56, 13.2],
  136: [52.54, 13.28],
  140: [52.51, 13.28],
  141: [52.43, 13.2],
  14: [52.46, 13.27],
  13: [52.57, 13.35],
  12: [52.45, 13.45],
  11: [52.52, 13.4],
  10: [52.51, 13.38],
};

/** Approximate [lat, lng] for a Berlin postcode, or null when unknown */
export const postcodeCentroid = (postcode) => {
  const plz = String(postcode ?? "").trim();
  if (!/^\d{5}$/.test(plz)) return null;
  return CENTROIDS[plz] ?? CENTROIDS[plz.slice(0, 3)] ?? CENTROIDS[plz.slice(0, 2)] ?? null;
};

const toRad = (deg) => (deg * Math.PI) / 180;

/** Haversine distance in km (rounded to 0.5 km), or null if a postcode is unknown */
export const distanceKm = (plzA, plzB) => {
  const a = postcodeCentroid(plzA);
  const b = postcodeCentroid(plzB);
  if (!a || !b) return null;
  if (String(plzA).trim() === String(plzB).trim()) return 0.5;
  const R = 6371;
  const dLat = toRad(b[0] - a[0]);
  const dLng = toRad(b[1] - a[1]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.sin(dLng / 2) ** 2;
  const km = 2 * R * Math.asin(Math.sqrt(h));
  return Math.max(0.5, Math.round(km * 2) / 2);
};

/** First Berlin postcode (10xxx–14xxx) found in a free-text address */
export const postcodeFromAddress = (address) => {
  const m = /\b(1[0-4]\d{3})\b/.exec(String(address ?? ""));
  return m ? m[1] : null;
};

// A representative postcode per district name (as used in
// workerProfile.serviceAreas) – lets the assignment migration turn a list of
// districts into a travel radius around the cleaner's home postcode.
export const DISTRICT_POSTCODES = {
  Mitte: "10115", Friedrichshain: "10243", "Prenzlauer Berg": "10405", Moabit: "10551", Charlottenburg: "10585",
  Wilmersdorf: "10707", Schöneberg: "10777", Kreuzberg: "10961", Neukölln: "12043", Tempelhof: "12099",
  Friedenau: "12161", Lichterfelde: "12203", Wedding: "13347", Reinickendorf: "13405", Westend: "14050",
  Zehlendorf: "14163", Steglitz: "12163", Pankow: "13187", Lichtenberg: "10365", Treptow: "12435",
  Köpenick: "12555", Spandau: "13597", Marzahn: "12679", Hellersdorf: "12627", Weißensee: "13086",
};
