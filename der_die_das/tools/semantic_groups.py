#!/usr/bin/env python3
"""Semantic word groups for the der_die_das tooling.

Maps a semantic rule id (the rules with `endings: null` in rules.js) to the
set of dictionary words that belong to the category. Keep this file the only
place where category membership lives — words.js references the rule id and
never repeats the category.

Flow: fill in a group here, then
    python3 assign_rules.py --write   # (re)assign rule ids in words.js
    python3 validate_words.py         # check the result

Tie-break when a word hits an ending rule AND a semantic group:
  * same gender   -> the ending rule wins (easier to memorize)
  * different     -> the rule matching the word's real gender wins
  * neither fits  -> true exception; the note must mention both rules
"""

SEMANTIC_GROUPS = {
    # seed members: words already assigned to these rules in words.js
    # Milch is in the group but marked as an exception (die) — easier to
    # memorize as "the drinks trap" than as a rule-less word
    'der_drinks': {'Kaffee', 'Tee', 'Wein', 'Bier', 'Saft', 'Milch'},
    'das_inf': {'Essen', 'Schwimmen', 'Tanzen', 'Sehen', 'Sterben', 'Verhalten', 'Leben', 'Befinden'},
    # English verbs used as nouns, above all -ing forms (Cybermobbing inherits
    # from its head Mobbing, like compound members of other groups)
    'das_ing': {'Meeting', 'Recycling', 'Training', 'Mobbing', 'Online-Banking'},
    # young persons & baby animals — only das Kind is in the dictionary for now
    'das_baby': {'Kind'},
    # female persons incl. family names without -in — many break the
    # -er -> der ending rule (Mutter, Schwester)
    'die_female_persons': {'Frau', 'Mutter', 'Schwester', 'Tochter'},

    # adjectival nouns: adjectives used as nouns decline like adjectives
    # (die Bekannte is feminine; the masculine counterpart is der Bekannte /
    # der Bekannter). Tagged die here — the feminine form is the default.
    'die_adjectival': {
        'Abgeordnete', 'Angeklagte', 'Angestellte', 'Bekannte',
        'Ehrenamtliche', 'Vorgesetzte',
        'Deutsche', 'Jugendliche', 'Erwachsene', 'Verwandte',
        'Arbeitslose', 'Kranke', 'Reiche',
    },

    # male persons — found by the -in test: the feminine '-in' form exists in
    # the dictionary (die) and the base is der and rule-less or an exception
    # (plain cut, or feminine mutations: Ärztin -> Arzt, Bäuerin -> Bauer)
    'der_male_persons': {
        'Aktivist', 'Anwalt', 'Arzt', 'Austauschstudent', 'Autor',
        'Bundespräsident', 'Chef', 'Chirurg', 'Diplomat', 'Doktorand',
        'Dozent', 'Facharzt', 'Freund', 'Friseur', 'Hausarzt', 'Ingenieur',
        'Journalist', 'Kandidat', 'Koch', 'Komponist', 'Konsument',
        'Nachbar', 'Patient', 'Polizist', 'Professor', 'Präsident',
        'Regisseur', 'Staatsanwalt', 'Student', 'Therapeut', 'Tourist',
        'Zahnarzt',
        # plain members (no -in test needed)
        'Herr', 'Mann',
    },

    # days and dates — the -tag words are compounds of the head noun der Tag,
    # so Tag carries the group and the day names Montag/Sonntag belong to it
    # directly (der_tag was really a compound rule, not an ending rule)
    'der_days': {'Tag', 'Montag', 'Sonntag'},
}
