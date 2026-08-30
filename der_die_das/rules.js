/* ==========================================================================
   Der · Die · Das — gender rules
   --------------------------------------------------------------------------
    Extend this file to add new rules; the game engine picks everything up.
    Two kinds of rules per gender:
      * ending rules — endings: [...], the shop's first pick (2 unlocked
        from the start, the rest purchasable)
      * semantic group rules — endings: null, categories like "drinks → der"
        or "hotels → das" (always purchasable)
    When a word matches both an ending rule and a semantic group, the ending
    rule wins when the genders agree; otherwise the rule matching the word's
    real gender wins. (Enforced by tools/validate_words.py.)

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
  {
    id: 'der_ast',
    gender: 'der',
    endings: ['ast'],
    formula: '-ast → der',
    description: 'Words ending in -ast are masculine (der Ast, der Kontrast, der Ballast).',
    cost: 25,
    unlockedByDefault: false
  },
  {
    id: 'der_ich',
    gender: 'der',
    endings: ['ich'],
    formula: '-ich → der',
    description: 'Words ending in -ich are masculine (der Strich, der Teppich, der Pfirsich).',
    cost: 25,
    unlockedByDefault: false
  },
  {
    id: 'der_ig',
    gender: 'der',
    endings: ['ig'],
    formula: '-ig → der',
    description: 'Words ending in -ig are masculine (der Honig, der Essig, der Käfig).',
    cost: 25,
    unlockedByDefault: false
  },
  {
    id: 'der_or',
    gender: 'der',
    endings: ['or'],
    formula: '-or → der',
    description: 'The -or ending is usually masculine (der Motor, der Doktor, der Professor) — though a few standouts are neutral, like das Labor.',
    cost: 30,
    unlockedByDefault: false
  },
  {
    id: 'der_us',
    gender: 'der',
    endings: ['us'],
    formula: '-us → der',
    description: 'The -us ending is usually masculine (der Bus, der Algorithmus) — except the trap pair das Haus and die Maus.',
    cost: 30,
    unlockedByDefault: false
  },
  {
    id: 'der_male_animals',
    gender: 'der',
    endings: null,
    formula: 'male animals → der',
    description: 'Male animals are masculine; the female counterpart of the same animal is usually feminine.',
    cost: 30,
    unlockedByDefault: false
  },
  {
    id: 'der_cars',
    gender: 'der',
    endings: null,
    formula: 'car makes → der',
    description: 'Car makes are masculine — the same brand can be feminine when it names a ship, airplane or motorbike.',
    cost: 30,
    unlockedByDefault: false
  },
  {
    id: 'der_currency',
    gender: 'der',
    endings: null,
    formula: 'currencies & coins → der',
    description: 'Currencies and coins are masculine; a few older or foreign coins break the pattern.',
    cost: 30,
    unlockedByDefault: false
  },
  {
    id: 'der_days',
    gender: 'der',
    endings: null,
    formula: 'days, months & seasons → der',
    description: 'Days of the week, months and seasons are masculine — while a few time words (year, night, week) are not.',
    cost: 30,
    unlockedByDefault: false
  },
  {
    id: 'der_directions',
    gender: 'der',
    endings: null,
    formula: 'compass points → der',
    description: 'The four compass points — north, south, east, west — are masculine.',
    cost: 30,
    unlockedByDefault: false
  },
  {
    id: 'der_male_persons',
    gender: 'der',
    endings: null,
    formula: 'male persons → der',
    description: 'Male persons and male professions are masculine; the feminine counterpart usually takes -in.',
    cost: 30,
    unlockedByDefault: false
  },
  {
    id: 'der_mountains',
    gender: 'der',
    endings: null,
    formula: 'mountains & ranges → der',
    description: 'Mountains and mountain ranges are usually masculine; ranges built like ordinary compound nouns are often feminine or neuter.',
    cost: 30,
    unlockedByDefault: false
  },
  {
    id: 'der_rivers_foreign',
    gender: 'der',
    endings: null,
    formula: 'rivers abroad → der',
    description: 'Rivers outside German-speaking countries are usually masculine; rivers ending in -a or -e are often feminine.',
    cost: 30,
    unlockedByDefault: false
  },
  {
    id: 'der_space',
    gender: 'der',
    endings: null,
    formula: 'moon, planets & stars → der',
    description: 'The moon, planets and stars are masculine — a few famous bodies (sun, earth, venus) are feminine.',
    cost: 30,
    unlockedByDefault: false
  },
  {
    id: 'der_minerals',
    gender: 'der',
    endings: null,
    formula: 'rocks & minerals → der',
    description: 'Rocks and minerals are usually masculine; a few common ones (coal, chalk, ore) are not.',
    cost: 30,
    unlockedByDefault: false
  },
  {
    id: 'der_weather',
    gender: 'der',
    endings: null,
    formula: 'weather (masc.) → der',
    description: 'Storm, wind, snow and frost are masculine; cloud, ice and the weather itself are the notable exceptions.',
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
  {
    id: 'die_ei',
    gender: 'die',
    endings: ['ei'],
    formula: '-ei → die',
    description: 'Words ending in -ei are feminine (die Polizei, die Partei, die Datei, die Bäckerei).',
    cost: 25,
    unlockedByDefault: false
  },
  {
    id: 'die_taet',
    gender: 'die',
    endings: ['tät'],
    formula: '-tät → die',
    description: 'Abstract words in -tät are always feminine (die Universität, die Identität, die Solidarität).',
    cost: 30,
    unlockedByDefault: false
  },
  {
    id: 'die_e',
    gender: 'die',
    endings: ['e'],
    formula: '-e → die',
    description: 'Roughly 90% of nouns ending in -e are feminine (die Katze, die Lampe, die Reise, die Sprache).',
    cost: 25,
    unlockedByDefault: false
  },
  {
    id: 'die_anz',
    gender: 'die',
    endings: ['anz'],
    formula: '-anz → die',
    description: 'The -anz ending is feminine (die Distanz, die Substanz, die Toleranz).',
    cost: 30,
    unlockedByDefault: false
  },
  {
    id: 'die_enz',
    gender: 'die',
    endings: ['enz'],
    formula: '-enz → die',
    description: 'The -enz ending is feminine (die Intelligenz, die Tendenz, die Existenz).',
    cost: 30,
    unlockedByDefault: false
  },
  {
    id: 'die_ie',
    gender: 'die',
    endings: ['ie'],
    formula: '-ie → die',
    description: 'Words ending in -ie are feminine (die Familie, die Energie, die Industrie, die Bibliothek).',
    cost: 25,
    unlockedByDefault: false
  },
  {
    id: 'die_ik',
    gender: 'die',
    endings: ['ik'],
    formula: '-ik → die',
    description: 'The -ik ending is feminine (die Musik, die Politik, die Fabrik) — except das Plastik.',
    cost: 30,
    unlockedByDefault: false
  },
  {
    id: 'die_machines',
    gender: 'die',
    endings: null,
    formula: 'aircraft, motorbikes & ships → die',
    description: 'The names of airplanes, motorbikes and ships are feminine — while the generic vehicle words (train, car, boat) keep their base gender.',
    cost: 30,
    unlockedByDefault: false
  },
  {
    id: 'die_female_animals',
    gender: 'die',
    endings: null,
    formula: 'female animals → die',
    description: 'Female animals are feminine — the female counterpart of a masculine animal.',
    cost: 30,
    unlockedByDefault: false
  },
  {
    id: 'die_female_persons',
    gender: 'die',
    endings: null,
    formula: 'female persons → die',
    description: 'Female persons and professions are feminine — including ones without -in (woman, mother, sister).',
    cost: 30,
    unlockedByDefault: false
  },
  {
    id: 'die_adjectival',
    gender: 'die',
    endings: null,
    formula: 'adjectival nouns → die',
    description: 'Adjectives used as nouns decline like adjectives: die Bekannte (a female acquaintance) is feminine, the male counterpart is der Bekannte / der Bekannter (krank → die Kranke, der Kranke).',
    cost: 30,
    unlockedByDefault: false,
    preferred: true
  },
  {
    id: 'die_numerals',
    gender: 'die',
    endings: null,
    formula: 'numerals as nouns → die',
    description: 'Numeral words used as nouns are feminine (one, two, million, billion); a few (dozen, hundred, thousand) are neuter.',
    cost: 30,
    unlockedByDefault: false
  },
  {
    id: 'die_rivers_german',
    gender: 'die',
    endings: null,
    formula: 'rivers in DACH → die',
    description: 'Rivers within Germany, Austria and Switzerland are usually feminine; a few are masculine instead.',
    cost: 30,
    unlockedByDefault: false
  },
  {
    id: 'die_plants',
    gender: 'die',
    endings: null,
    formula: 'trees, fruits & flowers → die',
    description: 'Trees, fruits and flowers are usually feminine; a few common ones are masculine instead.',
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
    id: 'das_um',
    gender: 'das',
    endings: ['um'],
    formula: '-um → das',
    description: 'Latin/Greek words in -um are neutral (das Zentrum, das Museum, das Studium) — except der Baum, der Traum, der Konsum.',
    cost: 25,
    unlockedByDefault: false
  },
  {
    id: 'das_il',
    gender: 'das',
    endings: ['il'],
    formula: '-il → das',
    description: 'Foreign words in -il are neutral (das Profil, das Ventil, das Fossil) — but der Stil and die E-Mail stand out.',
    cost: 30,
    unlockedByDefault: false
  },
  {
    id: 'das_ma',
    gender: 'das',
    endings: ['ma'],
    formula: '-ma → das',
    description: 'Greek words in -ma are neutral (das Klima, das Thema, das Drama) — except die Firma.',
    cost: 30,
    unlockedByDefault: false
  },
  {
    id: 'das_inf',
    gender: 'das',
    endings: null,
    formula: 'infinitive → das',
    description: 'Verbs used as nouns become neutral: das Essen, das Schwimmen, das Tanzen, das Sehen.',
    cost: 30,
    unlockedByDefault: false
  },
  {
    id: 'das_colors',
    gender: 'das',
    endings: null,
    formula: 'colors → das',
    description: 'Colors used as nouns are neutral: das Blau, das Rot, das Grün.',
    cost: 30,
    unlockedByDefault: false
  },
  {
    id: 'das_languages',
    gender: 'das',
    endings: null,
    formula: 'languages → das',
    description: 'Languages and dialects used as nouns are neutral: das Deutsch, das Spanisch, das Englisch.',
    cost: 30,
    unlockedByDefault: false
  },
  {
    id: 'das_ing',
    gender: 'das',
    endings: null,
    formula: 'English -ing forms → das',
    description: 'English verbs used as nouns, above all -ing forms, are neutral: das Skating, das Shopping, das Meeting.',
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
    description: 'Words in -nis are usually neutral (das Ergebnis, das Erlebnis, das Geheimnis).',
    cost: 30,
    unlockedByDefault: false
  },
  {
    id: 'das_letters',
    gender: 'das',
    endings: null,
    formula: 'letters & notes → das',
    description: 'Alphabet letters and music notes are neuter when used as nouns.',
    cost: 30,
    unlockedByDefault: false
  },
  {
    id: 'das_places',
    gender: 'das',
    endings: null,
    formula: 'continents, cities & countries → das',
    description: 'Continents, cities, provinces and most countries are neuter; a handful of countries are feminine or masculine instead.',
    cost: 30,
    unlockedByDefault: false
  },
  {
    id: 'das_hotels',
    gender: 'das',
    endings: null,
    formula: 'hotels, cafés & restaurants → das',
    description: 'Hotels, cafés, restaurants and cinemas are usually neuter — named venues included.',
    cost: 30,
    unlockedByDefault: false
  },
  {
    id: 'das_metals',
    gender: 'das',
    endings: null,
    formula: 'metals & elements → das',
    description: 'Metals and chemical elements are usually neuter; a few (steel, propane) vary.',
    cost: 30,
    unlockedByDefault: false
  },
  {
    id: 'das_units',
    gender: 'das',
    endings: null,
    formula: 'scientific units → das',
    description: 'Scientific units are usually neuter (atom, volt, watt); a few (liter, meter) vary.',
    cost: 30,
    unlockedByDefault: false
  },
  {
    id: 'das_baby',
    gender: 'das',
    endings: null,
    formula: 'young persons & baby animals → das',
    description: 'Young persons and baby animals are neuter — baby, child, foal, lamb and the like.',
    cost: 30,
    unlockedByDefault: false
  }
];
