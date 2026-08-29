"""Shared helpers for the der_die_das word tooling.

Parses rules.js and words.js without a JS runtime — both files follow a
fixed, machine-friendly layout, so a small regex parser is enough.
"""
import re
from pathlib import Path

GAME_DIR = Path(__file__).resolve().parent.parent
WORDS_JS = GAME_DIR / 'words.js'
RULES_JS = GAME_DIR / 'rules.js'
SOURCE_DIR = (GAME_DIR / '../../words').resolve()

LEVELS = ['a1', 'a2', 'b1', 'b2', 'c1', 'c2']


def load_rules(path=RULES_JS):
    """Return the rules of rules.js as a list of dicts:
    { id, gender, formula, endings: [..] }."""
    text = Path(path).read_text(encoding='utf-8')
    m = re.search(r'window\.GENDER_RULES\s*=\s*\[(.*?)\n\];', text, re.S)
    if not m:
        raise ValueError('window.GENDER_RULES not found in %s' % path)
    rules = []
    for obj in re.findall(r'\{([^{}]*)\}', m.group(1)):
        rid = re.search(r"id:\s*'([^']+)'", obj)
        gender = re.search(r"gender:\s*'([^']+)'", obj)
        formula = re.search(r"formula:\s*'([^']+)'", obj)
        endings_m = re.search(r"endings:\s*(\[[^\]]*\]|null)", obj)
        if endings_m and endings_m.group(1) != 'null':
            endings = re.findall(r"'([^']+)'", endings_m.group(1))
        else:
            endings = []
        if not (rid and gender):
            raise ValueError('malformed rule object in %s: %r' % (path, obj[:60]))
        rules.append({
            'id': rid.group(1),
            'gender': gender.group(1),
            'formula': formula.group(1) if formula else '',
            'endings': endings,
        })
    return rules


def match_rule(word, rules):
    """Longest-ending rule match for a word. Like the game's splitByEnding,
    except a word that equals an ending still matches (the game just does
    not highlight it). Rules without endings never match.
    Returns the rule dict or None."""
    low = word.lower()
    best, best_len = None, 0
    for r in rules:
        for e in r['endings']:
            el = e.lower()
            if low.endswith(el) and len(el) > best_len:
                best, best_len = r, len(el)
    return best


def existing_words(path=WORDS_JS):
    """Names (lowercased) of all words already in words.js."""
    text = Path(path).read_text(encoding='utf-8')
    return [w.lower() for w in re.findall(r"\{\s*w:\s*'([^']+)'", text)]


def js_str(s):
    """Escape a string for a single-quoted JS literal in words.js."""
    return s.replace('\\', '\\\\').replace("'", "\\'")
