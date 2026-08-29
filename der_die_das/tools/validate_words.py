#!/usr/bin/env python3
"""Validate words.js: structure + that gender rules are assigned correctly.

Checks (errors fail the run, warnings do not):

  structure
    * w / g / en present and non-empty, g is der|die|das,
      level (if any) is one of a1..c2
    * rule id (if any) exists in rules.js
    * no duplicate words (case-insensitive)

  rule assignment (same longest-ending logic the game uses)
    * an assigned rule really matches the word's ending, and it is the
      longest matching rule
    * non-exception words: gender equals the rule's gender
    * exceptions: gender differs from the rule's gender (otherwise it is
      no exception at all); a note is expected (warning if missing)
    * rule-less words must not end in any rule ending (then they should
      carry that rule, or be marked as an exception)

Also sanity-checks rules.js (unique ids, valid genders) and, if a JS
runtime (node or bun) is available, the JS syntax of words.js.

Usage:
  python3 validate_words.py             # validates the game's words.js
  python3 validate_words.py path.js     # validates any words.js-like file
"""
import argparse
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

from wordslib import LEVELS, RULES_JS, WORDS_JS, load_rules, match_rule

GENDERS = ('der', 'die', 'das')


def unescape(s):
    return s.replace("\\'", "'").replace('\\\\', '\\')


def field(obj, name):
    m = re.search(r"(?:^|[\s,])%s:\s*'((?:[^'\\]|\\.)*)'" % name, obj)
    return unescape(m.group(1)) if m else None


def has_flag(obj, name):
    return re.search(r"(?:^|[\s,])%s:\s*true" % name, obj) is not None


def parse_words(text):
    """Yield (line, {w, g, en, rule, level, exception, note}) per object."""
    comments = [m.span() for m in re.finditer(r'/\*.*?\*/', text, re.S)]

    def in_comment(pos):
        return any(s <= pos < e for s, e in comments)

    for m in re.finditer(r'\{([^{}]*)\}', text):
        if in_comment(m.start()):
            continue
        obj = m.group(1)
        yield text.count('\n', 0, m.start()) + 1, {
            'w': field(obj, 'w'),
            'g': field(obj, 'g'),
            'en': field(obj, 'en'),
            'rule': field(obj, 'rule'),
            'level': field(obj, 'level'),
            'exception': has_flag(obj, 'exception'),
            'note': field(obj, 'note'),
        }


def matched_ending(word, rule):
    low = word.lower()
    for e in sorted(rule['endings'], key=len, reverse=True):
        if low.endswith(e.lower()):
            return e
    return None


def js_syntax_check(path):
    """Return (ok: bool|None, message) — None = no runtime available."""
    if shutil.which('node'):
        r = subprocess.run(['node', '--check', str(path)],
                           capture_output=True, text=True)
        return r.returncode == 0, (r.stderr.strip() or 'ok')
    if shutil.which('bun'):
        with tempfile.TemporaryDirectory() as td:
            r = subprocess.run(['bun', 'build', str(path), '--outdir', td],
                               capture_output=True, text=True)
        return r.returncode == 0, (r.stderr.strip() or 'ok')
    return None, None


def main():
    ap = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('words_js', nargs='?', default=str(WORDS_JS),
                    help='words.js to validate (default: %(default)s)')
    ap.add_argument('--rules-js', default=str(RULES_JS),
                    help='rules.js to validate against (default: %(default)s)')
    args = ap.parse_args()

    words_path = Path(args.words_js)
    errors, warnings = [], []

    rules = load_rules(args.rules_js)
    by_id = {}
    for r in rules:
        if r['id'] in by_id:
            errors.append("rules.js: duplicate rule id '%s'" % r['id'])
        if r['gender'] not in GENDERS:
            errors.append("rules.js: rule '%s' has bad gender '%s'" % (r['id'], r['gender']))
        by_id[r['id']] = r

    text = words_path.read_text(encoding='utf-8')
    entries = list(parse_words(text))
    names = {}
    for line, e in entries:
        names.setdefault((e['w'] or '?').lower(), []).append(line)

    for name, lines in names.items():
        if len(lines) > 1:
            errors.append("line %s: duplicate word '%s' (also %s)" % (
                lines[0], name, ', '.join(map(str, lines[1:]))))

    for line, e in entries:
        label = e['w'] or '?<missing>'
        if not e['w'] or not e['g'] or not e['en']:
            errors.append('line %d: missing w/g/en fields: %r' % (line, label))
            continue
        if e['g'] not in GENDERS:
            errors.append("line %d: '%s' has bad gender '%s'" % (line, label, e['g']))
        if e['level'] is not None and e['level'] not in LEVELS:
            errors.append("line %d: '%s' has bad level '%s'" % (line, label, e['level']))
        if e['exception'] and not e['note']:
            warnings.append("line %d: exception '%s' has no note" % (line, label))
        if e['exception'] and not e['rule']:
            warnings.append("line %d: '%s' is an exception but has no rule" % (line, label))

        best = match_rule(e['w'], rules)
        if e['rule'] is not None:
            if e['rule'] not in by_id:
                errors.append("line %d: '%s' references unknown rule '%s'" % (line, label, e['rule']))
                continue
            rule = by_id[e['rule']]
            if rule['endings']:
                # semantic rules (endings: null, e.g. drinks, infinitives)
                # cannot be checked against the word's ending
                if best is None:
                    errors.append("line %d: '%s' does not end in any ending of rule '%s'"
                                  % (line, label, e['rule']))
                elif best['id'] != e['rule']:
                    errors.append("line %d: '%s' rule is '%s' but longest-ending match is '%s'"
                                  % (line, label, e['rule'], best['id']))
            if e['exception']:
                if rule['gender'] == e['g']:
                    errors.append("line %d: '%s' is an exception but its gender '%s' "
                                  "matches rule '%s' — not an exception at all"
                                  % (line, label, e['g'], e['rule']))
            elif rule['gender'] != e['g']:
                errors.append("line %d: '%s' gender '%s' contradicts rule '%s' (%s) "
                              "— is it an exception?" % (line, label, e['g'], e['rule'], rule['gender']))
        else:
            if best is not None:
                errors.append("line %d: '%s' has no rule but ends in '%s' → '%s' "
                              "(assign the rule or mark it as an exception)"
                              % (line, label, matched_ending(e['w'], best), best['id']))

    syn_ok, syn_msg = js_syntax_check(words_path)
    if syn_ok is False:
        errors.append('JS syntax: %s' % syn_msg.splitlines()[0] if syn_msg else 'JS syntax: invalid')

    print('%s: %d words | rules.js: %d rules' % (words_path.name, len(entries), len(rules)))
    if syn_ok is True:
        print('JS syntax: ok')
    elif syn_ok is False:
        print('JS syntax: FAILED')
    else:
        print('JS syntax: skipped (no node/bun on PATH)')

    for msg in errors:
        print('  ERROR  ' + msg)
    for msg in warnings:
        print('  WARNING  ' + msg)
    if errors or warnings:
        print('\n%d error(s), %d warning(s)' % (len(errors), len(warnings)))
    else:
        print('\nOK — no problems found')
    sys.exit(1 if errors else 0)


if __name__ == '__main__':
    main()
