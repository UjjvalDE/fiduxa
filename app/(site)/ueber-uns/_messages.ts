import { defineMessages } from '@/lib/i18n/config';

const de = {
  metaTitle: 'Über uns',
  metaDescription: 'Fiduxa ist ein Reinigungsservice aus Berlin: verlässlich, rücksichtsvoll, klar und fair kalkuliert.',
  eyebrow: 'Über uns',
  titleBefore: 'Ein Reinigungsservice,',
  titleEm: 'dem man vertrauen kann.',
  lead: 'Fiduxa ist ein Reinigungsservice für Berlin – mit dem Anspruch, Reinigung so zu organisieren, wie man es sich selbst wünscht: unkompliziert, ehrlich und mit Blick fürs Detail.',
  ideaEyebrow: 'Unsere Idee',
  ideaTitleBefore: 'One trusted',
  ideaTitleEm: 'partner.',
  ideaParagraphs: [
    'Eine Reinigung zu buchen sollte nicht kompliziert sein. Trotzdem bleiben oft Fragen offen: Was ist eigentlich enthalten? Wie lange dauert es? Was kostet es am Ende?',
    'Darauf wollen wir klare Antworten geben. Du siehst vorab, wie wir die Dauer empfehlen, wählst einen freien Termin und kennst den Festpreis, bevor du buchst und bezahlst – ohne Warten auf ein Angebot.',
    'Ob Wohnung, Umzug oder Büro: Wir möchten der Partner sein, auf den sich Berliner Haushalte, Vermieter und Teams verlassen können.',
  ],
  valuesEyebrow: 'Wofür wir stehen',
  valuesTitleBefore: 'Fünf Versprechen,',
  valuesTitleEm: 'jeden Tag.',
  values: [
    ['Verlässlich', 'Wir sagen zu, was wir halten können – und halten, was wir zusagen. Was du buchst, ist klar festgehalten.'],
    ['Rücksichtsvoll', 'Wir arbeiten in deinem Zuhause oder deinen Räumen. Das verlangt Respekt vor deinen Dingen, deiner Zeit und deinem Alltag.'],
    ['Klar', 'Was enthalten ist, was nicht und wie wir die Dauer empfehlen, steht offen auf unserer Website – ohne Kleingedrucktes.'],
    ['Lokal', 'Wir konzentrieren uns auf Berlin. So bleiben Wege kurz und Absprachen persönlich.'],
    ['Fair kalkuliert', 'Ein einheitlicher Stundensatz und ein Festpreis vor der Buchung statt Pauschalen, die niemand versteht.'],
  ] as [string, string][],
  ctaEyebrow: 'Lern uns kennen',
  ctaTitleBefore: 'Am besten bei',
  ctaTitleEm: 'deiner ersten Reinigung.',
  ctaLabel: 'Termin buchen',
  ctaSecondary: 'Kontakt',
};

type Messages = typeof de;

const en: Messages = {
  metaTitle: 'About us',
  metaDescription: 'Fiduxa is a cleaning service from Berlin: reliable, considerate, clear and fairly priced.',
  eyebrow: 'About us',
  titleBefore: 'A cleaning service',
  titleEm: 'you can trust.',
  lead: 'Fiduxa is a cleaning service for Berlin – with the aim of organising cleaning the way you would want it yourself: straightforward, honest and with an eye for detail.',
  ideaEyebrow: 'Our idea',
  ideaTitleBefore: 'One trusted',
  ideaTitleEm: 'partner.',
  ideaParagraphs: [
    'Booking a cleaning should not be complicated. Yet questions often remain: What exactly is included? How long will it take? What will it cost in the end?',
    'We want to give clear answers. You see in advance how we recommend the duration, choose a free slot and know the fixed price before you book and pay – no waiting for a quotation.',
    'Whether it is a flat, a move or an office: we want to be the partner Berlin households, landlords and teams can rely on.',
  ],
  valuesEyebrow: 'What we stand for',
  valuesTitleBefore: 'Five promises,',
  valuesTitleEm: 'every day.',
  values: [
    ['Reliable', 'We only promise what we can deliver – and deliver what we promise. What you book is clearly recorded.'],
    ['Considerate', 'We work in your home or on your premises. That calls for respect for your things, your time and your routine.'],
    ['Clear', 'What is included, what is not and how we recommend the duration is openly explained on our website – no small print.'],
    ['Local', 'We focus on Berlin. That keeps journeys short and arrangements personal.'],
    ['Fairly priced', 'One hourly rate and a fixed price before you book, instead of flat rates nobody understands.'],
  ],
  ctaEyebrow: 'Get to know us',
  ctaTitleBefore: 'Best of all with',
  ctaTitleEm: 'your first cleaning.',
  ctaLabel: 'Book a cleaning',
  ctaSecondary: 'Contact',
};

const pl: Messages = {
  metaTitle: 'O nas',
  metaDescription: 'Fiduxa to serwis sprzątający z Berlina: niezawodny, taktowny, przejrzysty i uczciwie wyceniony.',
  eyebrow: 'O nas',
  titleBefore: 'Serwis sprzątający,',
  titleEm: 'któremu można zaufać.',
  lead: 'Fiduxa to serwis sprzątający dla Berlina – z ambicją, by organizować sprzątanie tak, jak sami byśmy tego chcieli: prosto, uczciwie i z dbałością o szczegóły.',
  ideaEyebrow: 'Nasza idea',
  ideaTitleBefore: 'One trusted',
  ideaTitleEm: 'partner.',
  ideaParagraphs: [
    'Rezerwacja sprzątania nie powinna być skomplikowana. Mimo to często pozostają pytania: Co właściwie jest w cenie? Ile to potrwa? Ile ostatecznie zapłacę?',
    'Chcemy dawać na nie jasne odpowiedzi. Z góry widzisz, jak polecamy czas trwania, wybierasz wolny termin i znasz stałą cenę, zanim zarezerwujesz i zapłacisz – bez czekania na ofertę.',
    'Mieszkanie, przeprowadzka czy biuro: chcemy być partnerem, na którym mogą polegać berlińskie gospodarstwa domowe, wynajmujący i zespoły.',
  ],
  valuesEyebrow: 'Za czym stoimy',
  valuesTitleBefore: 'Pięć obietnic,',
  valuesTitleEm: 'każdego dnia.',
  values: [
    ['Niezawodnie', 'Obiecujemy tylko to, czego możemy dotrzymać – i dotrzymujemy tego, co obiecujemy. To, co rezerwujesz, jest jasno zapisane.'],
    ['Z szacunkiem', 'Pracujemy w Twoim domu lub Twoich pomieszczeniach. To wymaga szacunku dla Twoich rzeczy, Twojego czasu i codzienności.'],
    ['Przejrzyście', 'Co jest w cenie, czego nie ma i jak polecamy czas trwania – wszystko jest otwarcie opisane na naszej stronie, bez drobnego druku.'],
    ['Lokalnie', 'Skupiamy się na Berlinie. Dzięki temu dojazdy są krótkie, a ustalenia osobiste.'],
    ['Uczciwa wycena', 'Jedna stawka godzinowa i stała cena przed rezerwacją zamiast ryczałtów, których nikt nie rozumie.'],
  ],
  ctaEyebrow: 'Poznaj nas',
  ctaTitleBefore: 'Najlepiej przy',
  ctaTitleEm: 'Twoim pierwszym sprzątaniu.',
  ctaLabel: 'Zarezerwuj termin',
  ctaSecondary: 'Kontakt',
};

const aboutMessages = defineMessages({ de, en, pl });
export default aboutMessages;
