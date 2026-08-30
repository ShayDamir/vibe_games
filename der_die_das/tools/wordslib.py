"""Shared helpers for the der_die_das word tooling.

Parses rules.js and words.js without a JS runtime — both files follow a
fixed, machine-friendly layout, so a small regex parser is enough.
"""
import re
from pathlib import Path

GAME_DIR = Path(__file__).resolve().parent.parent
WORDS_JS = GAME_DIR / 'words.js'
RULES_JS = GAME_DIR / 'rules.js'
SEMANTIC_GROUPS_PY = Path(__file__).resolve().parent / 'semantic_groups.py'
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
        preferred = re.search(r"preferred:\s*true", obj)
        rules.append({
            'id': rid.group(1),
            'gender': gender.group(1),
            'formula': formula.group(1) if formula else '',
            'endings': endings,
            'preferred': bool(preferred),
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


def load_semantic_groups(path=SEMANTIC_GROUPS_PY):
    """Return {rule_id: set of lowercased words} from semantic_groups.py."""
    import importlib.util
    spec = importlib.util.spec_from_file_location('semantic_groups', path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return {k: {w.lower() for w in v} for k, v in getattr(mod, 'SEMANTIC_GROUPS', {}).items()}


def semantic_rule_for(word, rules, groups):
    """The semantic rule (endings: null) whose group contains the word,
    or None. `groups` is the dict from load_semantic_groups()."""
    low = word.lower()
    for r in rules:
        if not r['endings'] and r['id'] in groups and low in groups[r['id']]:
            return r
    return None


def assign_rule(word, gender, rules, groups=None):
    """Decide which rule a word should reference, applying the
    semantic/ending tie-break:
      * both match, same gender   -> ending rule (easier to memorize)
      * both match, different     -> the rule matching the word's gender
      * neither matches           -> ending rule is returned; the caller
                                     marks the word exception: true and the
                                     note must mention BOTH rules
    Returns (rule, semantic_rule); rule may be None when nothing matches."""
    ending = match_rule(word, rules)
    semantic = semantic_rule_for(word, rules, groups) if groups is not None else None
    if ending is None:
        return semantic, semantic
    if semantic is None or semantic['id'] == ending['id']:
        return ending, semantic
    if semantic.get('preferred'):
        return semantic, semantic
    if semantic['gender'] == ending['gender']:
        return ending, semantic
    if ending['gender'] == gender:
        return ending, semantic
    if semantic['gender'] == gender:
        return semantic, semantic
    return ending, semantic


def desired_state(word, gender, rules, groups, by_id, head_entry):
    """The (rule_id, exception, note) a word should carry.

    Priority:
      1. the head word's rule, when it fits the gender (compound nouns
         take the gender of their head word — the head rule always wins
         over the word's own ending rule)
      2. own ending match that fits the gender
      3. own semantic group that fits the gender
      4. exception against the ending rule — the note names both rules
         when a semantic group also fails, and the head when it is a
         compound
      5. no rule (the game shows the NO RULE chip)

    A head that is itself an exception propagates no rule (its rule id
    names the rule it BREAKS), and a compound noun is then rule-less too —
    it never falls back to its own (conflicting) ending rule, because its
    gender comes from the head, not from its own ending. `head_entry` is
    the head word's entry (dict with at least g, w, rule, exception) for
    compound nouns, else None.

    For compound nouns only the head rule (1) or a *fitting* own ending /
    semantic match may be carried; a conflicting own-match is never turned
    into an exception."""
    r, sem = assign_rule(word, gender, rules, groups)
    head_rule = (by_id.get(head_entry['rule'])
                 if head_entry and head_entry.get('rule')
                 and not head_entry.get('exception') else None)

    if head_rule is not None and head_rule['gender'] == gender:
        return head_rule['id'], False, None
    if head_entry is not None:
        # compound noun: gender comes from the head, never from a conflicting
        # own ending. Allowed to keep a fitting own match, else rule-less.
        if r is not None and r['gender'] == gender:
            return r['id'], False, None
        if sem is not None and sem['gender'] == gender:
            return sem['id'], False, None
        return None, False, None
    if r is not None and r['gender'] == gender:
        return r['id'], False, None
    if r is not None and r['gender'] != gender:
        if sem is not None and sem['id'] != r['id'] and sem['gender'] != gender:
            note = ('True exception: %s and %s both fail — it is %s %s. '
                    'Memorize it with the article!'
                    % (r['formula'], sem['formula'], gender, word))
        elif head_entry is not None:
            note = ('Classic trap: %s — but it is %s %s (compound of %s %s). '
                    'Memorize it with the article!'
                    % (r['formula'], gender, word, head_entry['g'], head_entry['w']))
        else:
            note = ('Classic trap: %s — but it is %s %s. Memorize it with the article!'
                    % (r['formula'], gender, word))
        return r['id'], True, note
    if r is None and sem is not None and sem['gender'] != gender:
        note = ('Classic trap: %s — but it is %s %s. Memorize it with the article!'
                % (sem['formula'], gender, word))
        return sem['id'], True, note
    return None, False, None


def existing_words(path=WORDS_JS):
    """Names (lowercased) of all words already in words.js."""
    text = Path(path).read_text(encoding='utf-8')
    return [w.lower() for w in re.findall(r"\{\s*w:\s*'([^']+)'", text)]


def load_words(path=WORDS_JS):
    """All entries of words.js as a list of dicts:
    { w, g, en, rule, level, exception, note, compound, head } (missing
    fields are None / False)."""
    text = Path(path).read_text(encoding='utf-8')

    def unescape(s):
        return s.replace("\\'", "'").replace('\\\\', '\\')

    def field(obj, name):
        m = re.search(r"(?:^|[\s,])%s:\s*'((?:[^'\\]|\\.)*)'" % name, obj)
        return unescape(m.group(1)) if m else None

    def has_flag(obj, name):
        return re.search(r"(?:^|[\s,])%s:\s*true" % name, obj) is not None

    comments = [m.span() for m in re.finditer(r'/\*.*?\*/', text, re.S)]

    def in_comment(pos):
        return any(s <= pos < e for s, e in comments)

    words = []
    for m in re.finditer(r'\{([^{}]*)\}', text):
        if in_comment(m.start()):
            continue
        obj = m.group(1)
        w = field(obj, 'w')
        if not w:
            continue
        words.append({
            'w': w,
            'g': field(obj, 'g'),
            'en': field(obj, 'en'),
            'rule': field(obj, 'rule'),
            'level': field(obj, 'level'),
            'exception': has_flag(obj, 'exception'),
            'note': field(obj, 'note'),
            'mnemo': field(obj, 'mnemo'),
            'compound': has_flag(obj, 'compound'),
            'head': field(obj, 'head'),
            'part': has_flag(obj, 'part'),
        })
    return words


def find_compound(word, names):
    """Dictionary split for a word: compound nouns are built from parts that
    are (lowercased) words themselves, optionally with a linking letter in
    between — Fugen-s (Arbeit + s + platz), Fugen-n (Familie + n + fest),
    Fugen-en (Student + en + wohnung) or Fugen-es (Bund + es + tag). Returns
    the HEAD part (the second, lowercased — it carries the compound's gender)
    or None. Each part needs >= 2 chars. `names` is a set of lowercased
    dictionary words."""
    low = word.lower()
    for i in range(2, len(low) - 1):
        a, b = low[:i], low[i:]
        if a in names and b in names:
            return b
    for i in range(2, len(low) - 2):
        if low[i] == 's' and low[:i] in names and low[i + 1:] in names:
            return low[i + 1:]
    for i in range(2, len(low) - 2):
        if low[i] == 'n' and low[:i] in names and low[i + 1:] in names:
            return low[i + 1:]
    for i in range(2, len(low) - 3):
        if low[i:i + 2] == 'en' and low[:i] in names and low[i + 2:] in names:
            return low[i + 2:]
    for i in range(2, len(low) - 3):
        if low[i:i + 2] == 'es' and low[:i] in names and low[i + 2:] in names:
            return low[i + 2:]
    return None


def js_str(s):
    """Escape a string for a single-quoted JS literal in words.js."""
    return s.replace('\\', '\\\\').replace("'", "\\'")
