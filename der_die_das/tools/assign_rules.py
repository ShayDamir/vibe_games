#!/usr/bin/env python3
"""(Re)derive rule ids and compound marks in words.js.

For every word the desired state is computed with wordslib.desired_state
(ending rules by longest ending + semantic groups with their tie-break,
plus: compound nouns inherit the rule of their head word):

  * own ending match that fits the gender      -> that rule
  * own semantic group that fits the gender    -> that rule
  * head word's rule that fits the gender      -> inherited (compound noun)
  * a rule misses, nothing else fits           -> rule + exception: true + note
  * nothing fits                               -> no rule (NO RULE chip)

Compound nouns are marked with `compound: true, head: '<Head>'`. A word is
marked when it splits into two dictionary words, optionally with a Fugen-s
in between (Arbeit + s + platz); the head (second part) carries the
gender. Existing marks are kept; the head must exist in words.js
(validate_words.py enforces that).

The state is re-derived until it settles (a few passes), so a head word
that receives its rule in this very run is still inheritable by compound
words listed earlier in the file.

Dry run by default — prints every change it would make. --write applies
them with surgical line edits; untouched lines (and their alignment) are
preserved, and hand-written notes are kept.

Usage:
  python3 assign_rules.py            # dry run
  python3 assign_rules.py --write    # apply to words.js
"""
import argparse
import re
import sys
from pathlib import Path

from wordslib import (WORDS_JS, js_str, load_rules, load_words,
                      load_semantic_groups, find_compound, desired_state)

ENTRY_RE = re.compile(r'\{[^{}]*\}')
RULE_FIELD_RE = re.compile(r"(?:^|,)\s*rule:\s*'")


def current_state(inner):
    """(rule, exception, note, compound, head) of one entry body."""
    rule = re.search(r"rule:\s*'([^']+)'", inner)
    note = re.search(r"note:\s*'((?:[^'\\]|\\.)*)'", inner)
    head = re.search(r"head:\s*'([^']+)'", inner)
    return (rule.group(1) if rule else None,
            re.search(r"exception:\s*true", inner) is not None,
            note.group(1) if note else None,
            re.search(r"compound:\s*true", inner) is not None,
            head.group(1) if head else None)


def rebuild(inner, rule_id, note, head):
    """Entry body with the compound/head/rule/exception/note fields replaced."""
    m = RULE_FIELD_RE.search(inner)
    base = (inner[:m.start()] if m else inner)
    base = re.sub(r",\s*compound:\s*true", "", base)
    base = re.sub(r",\s*head:\s*'(?:[^'\\]|\\.)*'", "", base)
    base = base.rstrip().rstrip(',')
    extra = ''
    if head:
        extra += ", compound: true, head: '%s'" % js_str(head)
    if rule_id is not None:
        extra += ", rule: '%s'" % js_str(rule_id)
        if note is not None:
            extra += ", exception: true,\n    note: '%s'" % js_str(note)
    return base + extra


def main():
    ap = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--words-js', default=str(WORDS_JS),
                    help='words.js to (re)assign rules in (default: %(default)s)')
    ap.add_argument('--write', action='store_true',
                    help='apply the changes (default: dry run)')
    args = ap.parse_args()

    rules = load_rules()
    by_id = {r['id']: r for r in rules}
    groups = load_semantic_groups()
    words = load_words(args.words_js)
    by_name = {e['w'].lower(): e for e in words}
    names = set(by_name)
    text = Path(args.words_js).read_text(encoding='utf-8')

    entries = []
    for entry in ENTRY_RE.finditer(text):
        obj = entry.group(0)
        w = re.search(r"w:\s*'([^']+)'", obj)
        g = re.search(r"g:\s*'([^']+)'", obj)
        if not (w and g):
            continue
        entries.append((obj, w.group(1), g.group(1), obj[1:-1]))

    # evolving in-memory state: a head word that gets its rule in this run
    # must be inheritable by compound words processed earlier in the file,
    # so the passes iterate until the state settles (head chains are strictly
    # shorter, so this converges)
    state = {w.lower(): current_state(inner) for _o, w, _g, inner in entries}
    for _pass in range(32):
        changed = False
        for _obj, w, g, _inner in entries:
            cur = state[w.lower()]
            # compound marking: keep manual marks, otherwise dictionary split
            if cur[3] and cur[4]:
                head_name = cur[4]
            else:
                found = find_compound(w, names)
                # the head must be a playable noun — a part (e.g. 'bar' in
                # nach + bar) is not a valid head — and its gender must match
                # the word's own gender (a compound takes the head's gender,
                # so a mismatch means this split is spurious, e.g. *der Einwand*
                # splitting as ein + *die* Wand)
                head_name = (by_name[found]['w']
                             if found and not by_name[found].get('part')
                             and by_name[found].get('g') == g else None)
            head_entry = by_name.get((head_name or '').lower())
            if head_entry is not None:
                head_entry = dict(head_entry)
                hs = state[head_entry['w'].lower()]
                head_entry['rule'], head_entry['exception'] = hs[0], hs[1]
            want_rule, want_exc, want_note = desired_state(
                w, g, rules, groups, by_id, head_entry)
            want = (want_rule, want_exc, want_note,
                    head_name is not None, head_name)
            # keep hand-written notes when the rule/exception state already matches
            if cur[0] == want[0] and cur[1] == want[1] and cur[2]:
                want = (want[0], want[1], cur[2], want[3], want[4])
            if want != cur:
                changed = True
                state[w.lower()] = want
        if not changed:
            break

    changes, touched = 0, 0
    new_text = text
    for obj, w, g, inner in entries:
        cur = current_state(inner)
        want = state[w.lower()]
        if cur == want:
            continue
        changes += 1
        old, new = obj, '{' + rebuild(inner, want[0], want[2], want[4]) + ' }'
        label = ('ASSIGN' if cur[0] is None and want[0] is not None else
                 'REASSIGN' if cur[0] != want[0] else
                 'EXCEPTION' if want[1] != cur[1] else
                 'COMPOUND' if (cur[3], cur[4]) != (want[3], want[4]) else
                 'NOTE')
        print('%-9s %-16s rule: %-18s -> %-18s%s' % (
            label, g + ' ' + w,
            cur[0] or '—', want[0] or '—',
            '  compound: %s' % want[4] if (cur[3], cur[4]) != (want[3], want[4]) else ''))
        if want[2]:
            print('          note: %s' % want[2])
        if args.write:
            if old in new_text:
                new_text = new_text.replace(old, new, 1)
                touched += 1
            else:
                sys.exit("could not locate entry %r for writing" % w)

    print('\n%d word(s) would change in %s%s' % (
        changes, args.words_js, '' if args.write else ' (dry run — re-run with --write to apply)'))
    if args.write and touched:
        Path(args.words_js).write_text(new_text, encoding='utf-8')
        print('wrote %d entr%s to %s' % (
            touched, 'y' if touched == 1 else 'ies', args.words_js))


if __name__ == '__main__':
    main()
