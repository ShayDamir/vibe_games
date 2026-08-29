#!/usr/bin/env python3
"""Ingest German word lists (../../words/a1.txt, ...) into words.js.

Parses "german – english" list lines out of the level files. An entry is
kept only when it is a noun with a clear article:  der/die/das + one word
(plural in a comma part and "der X / die Y" compounds are handled, anything
else — phrases, example sentences, adverbs — is skipped).

For every new word the script:
  * assigns the CEFR level from the file name (a1.txt -> 'a1', ...),
  * determines the gender rule on the fly from rules.js endings
    (longest ending wins); a gender mismatch becomes an exception entry
    with a generated note — review the "!" lines of the dry run,
  * skips words already present in words.js or seen earlier.

Usage:
  python3 ingest_words.py                     # dry run over all level files
  python3 ingest_words.py ../../words/a1.txt  # dry run, one file
  python3 ingest_words.py --write             # append the new words to words.js
"""
import argparse
import re
import sys
from pathlib import Path

import wordslib
from wordslib import LEVELS, SOURCE_DIR, WORDS_JS, js_str, load_rules, match_rule, existing_words

# "german – english" (en dash, em dash or spaced hyphen as separator)
SEP_RE = re.compile(r'^\s*(.+?)\s+[–—-]\s+(.+?)\s*$')
# "der|die|das + one word, optional ', plural' part"
ARTICLE_RE = re.compile(
    r'^(der|die|das)\s+([A-Za-zÄÖÜäöüß-]+?)(?:\s*,\s*\S+)?\s*$', re.IGNORECASE)


def parse_german_side(german):
    """Split 'der Freund / die Freundin' style compounds.
    Returns [(gender, word), ...] or None if a part is not a plain noun."""
    parts = [p.strip() for p in german.split('/')]
    out = []
    for p in parts:
        m = ARTICLE_RE.match(p)
        if not m:
            return None
        out.append((m.group(1).lower(), m.group(2)))
    return out


def parse_line(line):
    """Return a list of {w, g, en} entries from one source line, or None."""
    m = SEP_RE.match(line)
    if not m:
        return None
    german, english = m.group(1), m.group(2)
    parsed = parse_german_side(german)
    if not parsed:
        return None
    en_parts = [e.strip() for e in english.split('/')]
    # pair english variants only when it clearly lines up
    if len(en_parts) == len(parsed) and all(len(p) <= 20 for p in en_parts):
        ens = en_parts
    else:
        ens = [english] * len(parsed)
    return [{'w': w, 'g': g, 'en': en} for (g, w), en in zip(parsed, ens)]


def build_block(entries):
    """Render entries grouped by level, matching the words.js style."""
    max_w = max(len(e['w']) for e in entries) + 1
    max_en = max(len(e['en']) for e in entries) + 1
    lines = []
    for level in LEVELS:
        group = [e for e in entries if e['level'] == level]
        if not group:
            continue
        lines.append('')
        lines.append('  /* ------------------- LEVEL %s (ingested) ------------------- */' % level.upper())
        for e in group:
            line = "  { w: '%s'," % js_str(e['w'])
            line += ' ' * (max_w - len(e['w']) + 1)
            line += "g: '%s', en: '%s', level: '%s'" % (e['g'], js_str(e['en']), e['level'])
            if e.get('rule'):
                line += ',' + ' ' * (max_en - len(e['en']) + 1)
                line += "rule: '%s'" % e['rule']
                if e.get('exception'):
                    line += ", exception: true,\n    note: '%s' }," % js_str(e['note'])
                else:
                    line += " },"
            else:
                line += " },"
            lines.append(line)
    block = '\n'.join(lines)
    return block.rstrip()[:-1]  # drop the trailing comma of the final entry


def write_to_words_js(entries, path=WORDS_JS):
    text = Path(path).read_text(encoding='utf-8')
    idx = text.rfind('];')
    if idx == -1:
        raise ValueError('closing ]; not found in %s' % path)
    brace = text.rfind('}', 0, idx)
    new = text[:brace + 1] + ',\n' + build_block(entries) + text[brace + 1:]
    Path(path).write_text(new, encoding='utf-8')


def main():
    ap = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('files', nargs='*',
                    help='source .txt files (default: every <level>.txt in the source dir)')
    ap.add_argument('--source-dir', default=str(SOURCE_DIR),
                    help='directory with <level>.txt files (default: %(default)s)')
    ap.add_argument('--words-js', default=str(WORDS_JS),
                    help='words.js to dedupe against / append to (default: %(default)s)')
    ap.add_argument('--write', action='store_true',
                    help='append the new words to words.js (default: dry run)')
    args = ap.parse_args()

    source_dir = Path(args.source_dir)
    if args.files:
        files = [Path(f) for f in args.files]
    else:
        files = [source_dir / (lvl + '.txt') for lvl in LEVELS
                 if (source_dir / (lvl + '.txt')).exists()]
    if not files:
        sys.exit('no source files found in %s' % source_dir)

    rules = load_rules()
    seen = set(existing_words(args.words_js))
    all_entries, all_exceptions = [], []

    for f in files:
        level = f.stem.lower()
        if level not in LEVELS:
            sys.exit('%s: level "%s" is not one of %s' % (f, level, ', '.join(LEVELS)))
        n_lines = n_new = n_dup = n_skip = 0
        counts = {'rule': 0, 'exception': 0, 'no-rule': 0}
        for raw in f.read_text(encoding='utf-8').splitlines():
            if not raw.strip():
                continue
            n_lines += 1
            entries = parse_line(raw)
            if not entries:
                n_skip += 1
                continue
            for e in entries:
                key = e['w'].lower()
                if key in seen:
                    n_dup += 1
                    continue
                seen.add(key)
                e['level'] = level
                rule = match_rule(e['w'], rules)
                if rule is None:
                    counts['no-rule'] += 1
                elif rule['gender'] == e['g']:
                    e['rule'] = rule['id']
                    counts['rule'] += 1
                else:
                    e['rule'] = rule['id']
                    e['exception'] = True
                    e['note'] = ('Classic trap: %s — but it is %s %s. '
                                 'Memorize it with the article!'
                                 % (rule['formula'], e['g'], e['w']))
                    counts['exception'] += 1
                    all_exceptions.append(e)
                all_entries.append(e)
                n_new += 1
        print('== %s (level %s) ==' % (f.name, level))
        print('   lines: %d -> new: %d (rule %d | exception %d | no-rule %d) | dup: %d | skipped: %d'
              % (n_lines, n_new, counts['rule'], counts['exception'],
                 counts['no-rule'], n_dup, n_skip))
        for e in all_exceptions:
            if e['level'] == level:
                print('   ! %s %s (%s)  <- %s' % (e['g'], e['w'], e['en'], e['rule']))

    print('\nTOTAL: %d new words%s' % (
        len(all_entries),
        ' written to %s' % args.words_js if args.write
        else ' found (dry run — re-run with --write to append to %s)' % args.words_js))

    if args.write and all_entries:
        write_to_words_js(all_entries, args.words_js)


if __name__ == '__main__':
    main()
