#!/usr/bin/env python3
"""Validate words.js: structure + that gender rules are assigned correctly.

Checks (errors fail the run, warnings do not):

  structure
    * w / g / en present and non-empty, g is der|die|das,
      level (if any) is one of a1..c2,
      genders (if any) contains the word's g (dual-gender lemmas)
    * part entries (part: true) are non-playable compound building blocks:
      they carry only w and en, nothing else
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

  semantic groups (semantic_groups.py, tie-break rules)
    * a word assigned to a semantic rule must belong to its group
    * a word in a semantic group must not be rule-less
    * when ending rule and semantic group agree on gender, the ending rule
      must be assigned; when only one fits the word's gender, that one wins
    * a true exception (neither rule fits) must be marked exception and its
      note should mention both rules (warning if not)

  compound nouns (compound: true, head: '<Head>')
    * the head must exist in words.js, and the word must take the head's
      gender (compound nouns follow their head word)
    * a non-exception compound word may only carry a rule that fits its
      gender: its own ending/semantic match or the head's rule — and if
      one of those fits, it must carry it

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

from wordslib import (LEVELS, RULES_JS, WORDS_JS, load_rules, match_rule,
                      load_semantic_groups, semantic_rule_for)

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
            'mnemo': field(obj, 'mnemo'),
            'genders': field(obj, 'genders'),
            'compound': has_flag(obj, 'compound'),
            'head': field(obj, 'head'),
            'part': has_flag(obj, 'part'),
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
    groups = load_semantic_groups()
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
    by_entry = {}
    for line, e in entries:
        names.setdefault((e['w'] or '?').lower(), []).append(line)
        if e['w']:
            by_entry.setdefault(e['w'].lower(), e)

    for name, lines in names.items():
        if len(lines) > 1:
            errors.append("line %s: duplicate word '%s' (also %s)" % (
                lines[0], name, ', '.join(map(str, lines[1:]))))

    for line, e in entries:
        label = e['w'] or '?<missing>'
        if e['part']:
            # a part is a non-playable compound building block: only w and en
            if not e['w'] or not e['en']:
                errors.append('line %d: part entry missing w/en: %r' % (line, label))
            if e['g'] or e['rule'] or e['level'] or e['exception'] or e['compound']:
                errors.append("line %d: part '%s' must not carry g/rule/level/"
                              "exception/compound" % (line, label))
            continue
        if not e['w'] or not e['g'] or not e['en']:
            errors.append('line %d: missing w/g/en fields: %r' % (line, label))
            continue
        if e['g'] not in GENDERS:
            errors.append("line %d: '%s' has bad gender '%s'" % (line, label, e['g']))
        if e['genders'] is not None and e['g'] not in re.findall(r'(der|die|das)', e['genders']):
            errors.append("line %d: '%s' gender '%s' is not among its genders '%s'"
                          % (line, label, e['g'], e['genders']))
        if e['level'] is not None and e['level'] not in LEVELS:
            errors.append("line %d: '%s' has bad level '%s'" % (line, label, e['level']))
        if e['exception'] and not e['note']:
            warnings.append("line %d: exception '%s' has no note" % (line, label))
        if e['exception'] and not e['rule']:
            warnings.append("line %d: '%s' is an exception but has no rule" % (line, label))

        best = match_rule(e['w'], rules)
        sem = semantic_rule_for(e['w'], rules, groups)
        head_entry = by_entry.get((e['head'] or '').lower()) if e['compound'] else None
        # an exception head propagates no rule (its rule id names the rule
        # it breaks) — same as wordslib.desired_state
        head_rule = (by_id.get(head_entry['rule'])
                     if head_entry and head_entry.get('rule')
                     and not head_entry.get('exception') else None)
        inherited = head_rule is not None and e['rule'] == head_rule['id']
        if e['rule'] is not None:
            if e['rule'] not in by_id:
                errors.append("line %d: '%s' references unknown rule '%s'" % (line, label, e['rule']))
                continue
            rule = by_id[e['rule']]
            if not inherited:
                # a rule inherited from a compound's head word is checked by
                # the compound checks below, not against the word's own ending
                if rule['endings']:
                    if best is None:
                        errors.append("line %d: '%s' does not end in any ending of rule '%s'"
                                      % (line, label, e['rule']))
                    elif best['id'] != e['rule']:
                        errors.append("line %d: '%s' rule is '%s' but longest-ending match is '%s'"
                                      % (line, label, e['rule'], best['id']))
                else:
                    # semantic rule: the word must be a group member, and the
                    # ending/semantic tie-break must hold
                    if sem is None or sem['id'] != e['rule']:
                        errors.append("line %d: '%s' references semantic rule '%s' but is "
                                      "not in its group (semantic_groups.py)"
                                      % (line, label, e['rule']))
                    elif best is not None and best['id'] != e['rule']:
                        if rule.get('preferred'):
                            pass  # a preferred semantic rule (adjectival nouns)
                            # overrides an agreeing ending rule
                        elif best['gender'] == rule['gender']:
                            errors.append("line %d: '%s' — ending rule '%s' and semantic rule '%s' "
                                          "agree on the gender; use the ending rule"
                                          % (line, label, best['id'], e['rule']))
                        elif best['gender'] == e['g']:
                            errors.append("line %d: '%s' — ending rule '%s' fits the word; "
                                          "use it instead of semantic rule '%s'"
                                          % (line, label, best['id'], e['rule']))
            if e['exception']:
                if rule['gender'] == e['g']:
                    errors.append("line %d: '%s' is an exception but its gender '%s' "
                                  "matches rule '%s' — not an exception at all"
                                  % (line, label, e['g'], e['rule']))
                elif sem is not None and sem['id'] != e['rule'] and sem['gender'] == e['g']:
                    errors.append("line %d: '%s' — semantic rule '%s' fits the word; "
                                  "not an exception, assign it" % (line, label, sem['id']))
                elif (sem is not None and sem['id'] != e['rule']
                        and sem['gender'] != e['g'] and e['note']
                        and sem['formula'] not in e['note']):
                    warnings.append("line %d: true exception '%s' — the note should mention "
                                    "both rules (%s and %s)"
                                    % (line, label, rule['formula'], sem['formula']))
            elif rule['gender'] != e['g']:
                errors.append("line %d: '%s' gender '%s' contradicts rule '%s' (%s) "
                              "— is it an exception?" % (line, label, e['g'], e['rule'], rule['gender']))
        else:
            # a compound word's rule comes from its head (checked below); it
            # may legitimately carry no own ending/semantic rule when the head
            # propagates none — so skip the "must carry" checks for compounds
            if e['compound']:
                pass
            elif best is not None:
                errors.append("line %d: '%s' has no rule but ends in '%s' → '%s' "
                              "(assign the rule or mark it as an exception)"
                              % (line, label, matched_ending(e['w'], best), best['id']))
            elif sem is not None:
                errors.append("line %d: '%s' belongs to semantic group '%s' — assign the "
                              "rule (or mark it as an exception)" % (line, label, sem['id']))

        if e['compound']:
            if not e['head']:
                errors.append("line %d: '%s' is compound but has no head" % (line, label))
            elif e['head'].lower() not in by_entry:
                errors.append("line %d: '%s' head '%s' is not in words.js"
                              % (line, label, e['head']))
            elif by_entry[e['head'].lower()].get('part'):
                errors.append("line %d: '%s' head '%s' is a part — the head of a "
                              "compound must be a playable noun" % (line, label, e['head']))
            else:
                head = by_entry[e['head'].lower()]
                if e['g'] != head['g']:
                    errors.append("line %d: '%s' (%s) must take the gender of its head %s %s"
                                  % (line, label, e['g'], head['g'], e['head']))
                elif not e['exception']:
                    cands = [x for x in (best, sem, head_rule)
                             if x is not None and x['gender'] == e['g']]
                    if cands:
                        ids = sorted({c['id'] for c in cands})
                        if e['rule'] is not None and e['rule'] not in ids:
                            errors.append("line %d: '%s' rule '%s' is neither its own match "
                                          "nor its head's rule (fits: %s)"
                                          % (line, label, e['rule'], ', '.join(ids)))
                        elif e['rule'] is None:
                            errors.append("line %d: '%s' — %s fits (own match or head %s); "
                                          "assign it" % (line, label, ids[0], e['head']))

    syn_ok, syn_msg = js_syntax_check(words_path)
    if syn_ok is False:
        errors.append('JS syntax: %s' % syn_msg.splitlines()[0] if syn_msg else 'JS syntax: invalid')

    n_parts = sum(1 for _, e in entries if e.get('part'))
    print('%s: %d words (+%d parts) | rules.js: %d rules' % (
        words_path.name, len(entries) - n_parts, n_parts, len(rules)))
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
