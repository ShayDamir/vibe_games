/* ==========================================================================
   Der · Die · Das — German noun dictionary (B2 level)
   --------------------------------------------------------------------------
   Start set: 40 words. Keep adding — the engine picks everything up here.
    Target dictionary: ~1000 nouns; every word should reference a rule id
    from rules.js (or be flagged as an exception to one). Words with no
    rule at all are allowed too — at most 3 of them appear per round.

   Fields:
   w         German noun, without the article (as shown while flying)
   g         true gender: 'der' | 'die' | 'das'
   en        English translation (revealed after the word passes)
    rule      rule id from rules.js that explains the gender
              (optional — omit it for words no rule covers; max 3 of those
              per round, revealed with a "NO RULE" chip)
    level     CEFR level: 'a1' | 'a2' | 'b1' | 'b2' | 'c1' | 'c2'
              (optional — words without a level count as a1, i.e. they are
              in play from the start)
    exception true  = the word breaks its rule (revealed in red)
   note      optional custom note for the exception popup
   ========================================================================== */

window.GERMAN_WORDS = [

  /* ------------------------------ DER ------------------------------ */
  { w: 'Lehrer',        g: 'der', en: 'teacher',            rule: 'der_er' },
  { w: 'Fahrer',        g: 'der', en: 'driver',             rule: 'der_er' },
  { w: 'Computer',      g: 'der', en: 'computer',           rule: 'der_er' },
  { w: 'Fernseher',     g: 'der', en: 'television',         rule: 'der_er' },
  { w: 'Messer',        g: 'das', en: 'knife',              rule: 'der_er', exception: true,
    note: 'Classic trap: -er words are usually der — but it is das Messer. Memorize it with the article!' },
  { w: 'Wasser',        g: 'das', en: 'water',              rule: 'der_er', exception: true,
    note: 'Classic trap: -er words are usually der — but it is das Wasser. Memorize it with the article!' },
  { w: 'Tag',           g: 'der', en: 'day',                rule: 'der_tag' },
  { w: 'Montag',        g: 'der', en: 'Monday',             rule: 'der_tag' },
  { w: 'Sonntag',       g: 'der', en: 'Sunday',             rule: 'der_tag' },
  { w: 'Geburtstag',    g: 'der', en: 'birthday',           rule: 'der_tag' },
  { w: 'Frühling',      g: 'der', en: 'spring (season)',    rule: 'der_ling' },
  { w: 'Schmetterling', g: 'der', en: 'butterfly',          rule: 'der_ling' },
  { w: 'Kaffee',        g: 'der', en: 'coffee',             rule: 'der_drinks' },
  { w: 'Tee',           g: 'der', en: 'tea',                rule: 'der_drinks' },
  { w: 'Wein',          g: 'der', en: 'wine',               rule: 'der_drinks' },
  { w: 'Bier',          g: 'das', en: 'beer',               rule: 'der_drinks', exception: true,
    note: 'Most drinks are der, but the famous exception is das Bier.' },
  { w: 'Praktikant',    g: 'der', en: 'trainee, intern',    rule: 'der_ant' },
  { w: 'Garant',        g: 'der', en: 'guarantor',          rule: 'der_ant' },
  { w: 'Dilettant',     g: 'der', en: 'dilettante',         rule: 'der_ant' },
  { w: 'Tourismus',     g: 'der', en: 'tourism',            rule: 'der_ismus' },
  { w: 'Humanismus',    g: 'der', en: 'humanism',           rule: 'der_ismus' },
  { w: 'Kapitalismus',  g: 'der', en: 'capitalism',         rule: 'der_ismus' },
  { w: 'Journalismus',  g: 'der', en: 'journalism',         rule: 'der_ismus' },

  /* ------------------------------ DIE ------------------------------ */
  { w: 'Wohnung',       g: 'die', en: 'apartment',          rule: 'die_ung' },
  { w: 'Änderung',      g: 'die', en: 'change',             rule: 'die_ung' },
  { w: 'Situation',     g: 'die', en: 'situation',          rule: 'die_ion' },
  { w: 'Lösung',        g: 'die', en: 'solution',           rule: 'die_ung' },
  { w: 'Freiheit',      g: 'die', en: 'freedom',            rule: 'die_heit' },
  { w: 'Möglichkeit',   g: 'die', en: 'possibility',        rule: 'die_heit' },
  { w: 'Gesundheit',    g: 'die', en: 'health',             rule: 'die_heit' },
  { w: 'Schönheit',     g: 'die', en: 'beauty',             rule: 'die_heit' },
  { w: 'Freundschaft',  g: 'die', en: 'friendship',         rule: 'die_schaft' },
  { w: 'Gesellschaft',  g: 'die', en: 'society',            rule: 'die_schaft' },
  { w: 'Revolution',    g: 'die', en: 'revolution',         rule: 'die_ion' },
  { w: 'Information',   g: 'die', en: 'information',        rule: 'die_ion' },
  { w: 'Nation',        g: 'die', en: 'nation',             rule: 'die_ion' },
  { w: 'Lehrerin',      g: 'die', en: 'teacher (female)',   rule: 'die_in' },
  { w: 'Ärztin',        g: 'die', en: 'doctor (female)',    rule: 'die_in' },
  { w: 'Verkäuferin',   g: 'die', en: 'shop assistant (female)', rule: 'die_in' },
  { w: 'Studentin',     g: 'die', en: 'student (female)',   rule: 'die_in' },
  { w: 'Kultur',        g: 'die', en: 'culture',            rule: 'die_ur' },
  { w: 'Natur',         g: 'die', en: 'nature',             rule: 'die_ur' },
  { w: 'Temperatur',    g: 'die', en: 'temperature',        rule: 'die_ur' },
  { w: 'Figur',         g: 'die', en: 'figure',             rule: 'die_ur' },

  /* ------------------------------ DAS ------------------------------ */
  { w: 'Mädchen',       g: 'das', en: 'girl',               rule: 'das_chen' },
  { w: 'Brötchen',      g: 'das', en: 'bread roll',         rule: 'das_chen' },
  { w: 'Fräulein',      g: 'das', en: 'young woman (Miss)', rule: 'das_chen' },
  { w: 'Häuschen',      g: 'das', en: 'little house',       rule: 'das_chen' },
  { w: 'Dokument',      g: 'das', en: 'document',           rule: 'das_ment' },
  { w: 'Argument',      g: 'das', en: 'argument',           rule: 'das_ment' },
  { w: 'Apartment',     g: 'das', en: 'flat, apartment',    rule: 'das_ment' },
  { w: 'Eigentum',      g: 'das', en: 'property, ownership',rule: 'das_tum' },
  { w: 'Studium',       g: 'das', en: 'studies, degree' },
  { w: 'Essen',         g: 'das', en: 'food, meal',         rule: 'das_inf' },
  { w: 'Schwimmen',     g: 'das', en: 'swimming',           rule: 'das_inf' },
  { w: 'Tanzen',        g: 'das', en: 'dancing',            rule: 'das_inf' },
  { w: 'Foto',          g: 'das', en: 'photo',              rule: 'das_o' },
  { w: 'Kino',          g: 'das', en: 'cinema',             rule: 'das_o' },
  { w: 'Radio',         g: 'das', en: 'radio',              rule: 'das_o' },
  { w: 'Video',         g: 'das', en: 'video',              rule: 'das_o' },
  { w: 'Sofa',          g: 'das', en: 'sofa' },
  { w: 'Ergebnis',      g: 'das', en: 'result',               rule: 'das_nis' },
  { w: 'Erlebnis',      g: 'das', en: 'experience',           rule: 'das_nis' },
  { w: 'Geheimnis',     g: 'das', en: 'secret',               rule: 'das_nis' },

  /* ------------------- NO RULE (no ending explains it) ------------------- */
  { w: 'Haus',          g: 'das', en: 'house' },
  { w: 'Hund',          g: 'der', en: 'dog' },
  { w: 'Stadt',         g: 'die', en: 'city' },
  { w: 'Hand',          g: 'die', en: 'hand' }
];
