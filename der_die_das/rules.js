/* ==========================================================================
   Der · Die · Das — gender rules
   --------------------------------------------------------------------------
   Extend this file to add new rules; the game engine picks everything up.
   4 rules per gender: 2 unlocked from the start, 2 purchasable in the shop.

   Fields:
   id              unique id, referenced by words in words.js
   gender          'der' | 'die' | 'das'
   endings         array of word endings that trigger the rule
                   (null for rules that are not based on an ending —
                   the ending is highlighted in-game and in shop examples)
   formula         short label, e.g. "-ung → die"
   description     1–2 sentences shown in popups
   cost            coins required in the shop (ignored when unlockedByDefault)
   unlockedByDefault   true = available from the very first round
   examples        optional override; when omitted, examples are taken
                   automatically from words.js (exceptions excluded)
   ========================================================================== */

window.GENDER_RULES = [

  /* ------------------------------ DER ------------------------------ */
  {
    id: 'der_er',
    gender: 'der',
    endings: ['er'],
    formula: '-er → der',
    description: 'Most words ending in -er are masculine: jobs, machines and doers (der Lehrer, der Computer, der Fahrer).',
    cost: 0,
    unlockedByDefault: true
  },
  {
    id: 'der_tag',
    gender: 'der',
    endings: ['tag'],
    formula: '-tag → der',
    description: 'Words built on -tag — days, dates and moments — are masculine (der Tag, der Montag, der Geburtstag).',
    cost: 0,
    unlockedByDefault: true
  },
  {
    id: 'der_ling',
    gender: 'der',
    endings: ['ling'],
    formula: '-ling → der',
    description: 'Words ending in -ling are masculine, often for young, small or living things (der Frühling, der Schmetterling).',
    cost: 25,
    unlockedByDefault: false
  },
  {
    id: 'der_drinks',
    gender: 'der',
    endings: null,
    formula: 'drinks & alcohol → der',
    description: 'Most drinks — especially coffee, tea and alcohol — are masculine (der Kaffee, der Tee, der Wein).',
    cost: 30,
    unlockedByDefault: false
  },
  {
    id: 'der_ant',
    gender: 'der',
    endings: ['ant'],
    formula: '-ant → der',
    description: 'Words ending in -ant are usually masculine, often for people (der Patient, der Praktikant, der Garant).',
    cost: 25,
    unlockedByDefault: false
  },
  {
    id: 'der_ismus',
    gender: 'der',
    endings: ['ismus'],
    formula: '-ismus → der',
    description: 'Abstract words in -ismus are masculine (der Tourismus, der Humanismus, der Kapitalismus).',
    cost: 30,
    unlockedByDefault: false
  },

  /* ------------------------------ DIE ------------------------------ */
  {
    id: 'die_ung',
    gender: 'die',
    endings: ['ung'],
    formula: '-ung → die',
    description: 'Almost every word ending in -ung is feminine, no matter what it describes (die Wohnung, die Lösung).',
    cost: 0,
    unlockedByDefault: true
  },
  {
    id: 'die_heit',
    gender: 'die',
    endings: ['heit', 'keit'],
    formula: '-heit / -keit → die',
    description: 'Abstract nouns ending in -heit or -keit are always feminine (die Freiheit, die Möglichkeit).',
    cost: 0,
    unlockedByDefault: true
  },
  {
    id: 'die_schaft',
    gender: 'die',
    endings: ['schaft'],
    formula: '-schaft → die',
    description: 'Words ending in -schaft — groups, states and relationships — are feminine (die Freundschaft, die Gesellschaft).',
    cost: 25,
    unlockedByDefault: false
  },
  {
    id: 'die_ion',
    gender: 'die',
    endings: ['ion'],
    formula: '-ion → die',
    description: 'Latin -ion words are almost always feminine (die Revolution, die Information, die Nation).',
    cost: 30,
    unlockedByDefault: false
  },
  {
    id: 'die_in',
    gender: 'die',
    endings: ['in'],
    formula: '-in → die',
    description: 'Feminine people and professions take -in — the feminine twist on the der word (die Lehrerin, die Ärztin, die Verkäuferin).',
    cost: 25,
    unlockedByDefault: false
  },
  {
    id: 'die_ur',
    gender: 'die',
    endings: ['ur'],
    formula: '-ur → die',
    description: 'Words ending in -ur are feminine (die Kultur, die Natur, die Temperatur).',
    cost: 30,
    unlockedByDefault: false
  },

  /* ------------------------------ DAS ------------------------------ */
  {
    id: 'das_chen',
    gender: 'das',
    endings: ['chen', 'lein'],
    formula: '-chen / -lein → das',
    description: 'Diminutives in -chen and -lein are always neutral — even when they describe people (das Mädchen, das Brötchen).',
    cost: 0,
    unlockedByDefault: true
  },
  {
    id: 'das_ment',
    gender: 'das',
    endings: ['ment'],
    formula: '-ment → das',
    description: 'Words ending in -ment are usually neutral (das Dokument, das Argument, das Apartment).',
    cost: 0,
    unlockedByDefault: true
  },
  {
    id: 'das_tum',
    gender: 'das',
    endings: ['tum'],
    formula: '-tum → das',
    description: 'Abstract words in -tum are neutral (das Eigentum, das Studium).',
    cost: 25,
    unlockedByDefault: false
  },
  {
    id: 'das_inf',
    gender: 'das',
    endings: null,
    formula: 'infinitive → das',
    description: 'Verbs used as nouns become neutral: das Essen, das Schwimmen, das Tanzen.',
    cost: 30,
    unlockedByDefault: false
  },
  {
    id: 'das_o',
    gender: 'das',
    endings: ['o'],
    formula: '-o → das',
    description: 'Foreign words in -o are usually neuter (das Foto, das Kino, das Radio).',
    cost: 25,
    unlockedByDefault: false
  },
  {
    id: 'das_nis',
    gender: 'das',
    endings: ['nis'],
    formula: '-nis → das',
    description: 'Words in -nis are usually neuter (das Ergebnis, das Erlebnis, das Geheimnis).',
    cost: 30,
    unlockedByDefault: false
  }
];
