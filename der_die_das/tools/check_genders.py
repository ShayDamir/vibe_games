#!/usr/bin/env python3
"""Cross-check the genders in words.js against Duden (duden.de).

For each playable word in words.js, fetches the Duden page
https://www.duden.de/rechtschreibung/<Wort> and compares the article
printed in the <h1> (span.lemma__determiner) with the gender stored in
words.js. Dual-gender lemmas (e.g. `der oder das Laptop`) are OK when
words.js uses any of the printed articles, and are listed separately.
Words Duden does not know (HTTP 404) or requests that fail
(403/timeout/...) are reported and SKIPPED — they do not fail the run.
No slug guessing: only the exact word URL is tried.

Usage:
  python3 check_genders.py                     # check all words
  python3 check_genders.py --words Tag,Auto    # only these words
  python3 check_genders.py --limit 10          # only the first 10
  python3 check_genders.py --delay 2.0         # slower crawl (default 1.0s)
  python3 check_genders.py --no-cache          # ignore the result cache

Results are cached in tools/cache/duden_genders.json, so an interrupted
run resumes where it stopped (only not-found words are refetched, never
errors — pass --no-cache to force a full refetch).

Exit code: 1 if any MISMATCH was found, else 0.
"""
import argparse
import json
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

from wordslib import WORDS_JS, load_words

CACHE_FILE = Path(__file__).resolve().parent / 'cache' / 'duden_genders.json'
UA = ('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 '
      '(KHTML, like Gecko) Chrome/124.0 Safari/537.36')
# dual-gender lemmas print e.g. `der <i>oder</i> das` — grab the whole
# span and pull every article out of it
DETERMINER_RE = re.compile(r'lemma__determiner">(.*?)</span>', re.S)
ARTICLE_RE = re.compile(r'\b(der|die|das)\b')
RETRYABLE = (403, 429, 500, 502, 503, 504)


def fetch(url, timeout, retries, delay):
    """GET url. Returns (status, body) — status 0 on network error."""
    for attempt in range(retries + 1):
        req = urllib.request.Request(url, headers={'User-Agent': UA})
        try:
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return r.status, r.read().decode('utf-8', 'replace')
        except urllib.error.HTTPError as e:
            status, body = e.code, ''
            if e.code not in RETRYABLE or attempt == retries:
                return status, body
            wait = delay * (attempt + 2) * 2
            print('    HTTP %s — retrying in %.0fs' % (status, wait), flush=True)
            time.sleep(wait)
        except Exception as e:  # timeout, connection reset, ...
            if attempt == retries:
                return 0, str(e)
            time.sleep(delay * (attempt + 2))
    return 0, 'exhausted retries'


def duden_url(word):
    """Duden lemma URL. Slugs are ASCII transliterations
    (Schlüssel -> /rechtschreibung/Schluessel, Änderung -> Aenderung)."""
    slug = word
    for de, en in (('Ä', 'Ae'), ('Ö', 'Oe'), ('Ü', 'Ue'),
                   ('ä', 'ae'), ('ö', 'oe'), ('ü', 'ue'), ('ß', 'ss')):
        slug = slug.replace(de, en)
    return 'https://www.duden.de/rechtschreibung/' + urllib.parse.quote(slug)


def check_word(url, timeout, retries, delay):
    """Return (status, detail). status is one of
    ok / mismatch / notfound / error — detail is the list of Duden
    articles for ok/mismatch (dual-gender lemmas carry more than one)
    and a short error message for error."""
    status, body = fetch(url, timeout, retries, delay)
    if status == 404:
        return 'notfound', None
    if status == 0:
        return 'error', body or 'network error'
    if status != 200:
        return 'error', 'HTTP %s' % status
    m = DETERMINER_RE.search(body)
    articles = ARTICLE_RE.findall(m.group(1)) if m else []
    if not articles:
        return 'error', 'no article found on page'
    return 'ok', articles


def load_cache():
    if CACHE_FILE.exists():
        try:
            return json.loads(CACHE_FILE.read_text(encoding='utf-8'))
        except (ValueError, OSError):
            pass
    return {}


def save_cache(cache):
    CACHE_FILE.parent.mkdir(parents=True, exist_ok=True)
    CACHE_FILE.write_text(json.dumps(cache, indent=1, ensure_ascii=False),
                          encoding='utf-8')


def main():
    ap = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('words_js', nargs='?', default=str(WORDS_JS),
                    help='words.js to check (default: %(default)s)')
    ap.add_argument('--words',
                    help='comma-separated words to check (default: all)')
    ap.add_argument('--limit', type=int, default=0,
                    help='only check the first N words')
    ap.add_argument('--delay', type=float, default=1.0,
                    help='seconds between requests (default: %(default)s)')
    ap.add_argument('--timeout', type=float, default=15,
                    help='request timeout in seconds (default: %(default)s)')
    ap.add_argument('--retries', type=int, default=2,
                    help='retries per word on 403/5xx (default: %(default)s)')
    ap.add_argument('--no-cache', action='store_true',
                    help='ignore the result cache')
    args = ap.parse_args()

    words = [w for w in load_words(args.words_js) if not w['part'] and w['g']]
    if args.words:
        wanted = {x.strip().lower() for x in args.words.split(',') if x.strip()}
        words = [w for w in words if w['w'].lower() in wanted]
        missing = wanted - {w['w'].lower() for w in words}
        if missing:
            print("not in words.js: %s" % ', '.join(sorted(missing)))
    if args.limit:
        words = words[:args.limit]
    if not words:
        print('nothing to check')
        sys.exit(0)

    cache = {} if args.no_cache else load_cache()

    def fresh(w):
        r = cache.get(w['w'])
        return bool(r and r['status'] != 'error' and r.get('url') == duden_url(w['w']))

    todo = [w for w in words if not fresh(w)]
    print('words.js: %d playable words | %d to fetch, %d from cache' % (
        len(words), len(todo), len(words) - len(todo)))

    results = {}
    interrupted = False
    try:
        for i, w in enumerate(todo, 1):
            url = duden_url(w['w'])
            status, duden_g = check_word(url, args.timeout, args.retries, args.delay)
            if status == 'ok' and w['g'] not in duden_g:
                status = 'mismatch'
            results[w['w']] = {'status': status, 'gender': duden_g, 'url': url}
            cache[w['w']] = results[w['w']]
            save_cache(cache)
            mark = {'ok': 'ok        ', 'mismatch': 'MISMATCH ',
                    'notfound': 'not-found', 'error': 'ERROR    '}[status]
            extra = ''
            if status == 'mismatch':
                extra = 'words.js=%s duden=%s' % (w['g'], ', '.join(duden_g))
            elif status == 'ok' and len(duden_g) > 1:
                extra = 'duden: %s' % ', '.join(duden_g)
            elif status == 'error':
                extra = duden_g or ''
            print('  %s  %s  %s' % (mark, w['w'], extra), flush=True)
            if i < len(todo) and args.delay:
                time.sleep(args.delay)
    except KeyboardInterrupt:
        interrupted = True
        print('\ninterrupted — saving progress')
    save_cache(cache)

    counts = {'ok': 0, 'mismatch': 0, 'notfound': 0, 'error': 0}
    mismatches, notfound, errors = [], [], []
    for w in words:
        r = cache.get(w['w'])
        if not r:
            continue
        counts[r['status']] += 1
        if r['status'] == 'mismatch':
            mismatches.append((w, r))
        elif r['status'] == 'notfound':
            notfound.append(w)
        elif r['status'] == 'error':
            errors.append((w, r))

    print('\nchecked: %d | ok: %d | MISMATCH: %d | not found: %d | errors: %d' % (
        len(words), counts['ok'], counts['mismatch'],
        counts['notfound'], counts['error']))
    dual = [(w, r) for w in words
            for r in [cache.get(w['w'])]
            if r and r['status'] == 'ok' and isinstance(r['gender'], list) and len(r['gender']) > 1]
    if dual:
        print('\ndual-gender on Duden (both accepted, %d):' % len(dual))
        for w, r in dual:
            print('  %-24s duden: %s   (words.js uses %s)' % (
                w['w'], ', '.join(r['gender']), w['g']))
    if mismatches:
        print('\nMISMATCH — words.js disagrees with Duden:')
        for w, r in mismatches:
            g = r['gender']
            g = ', '.join(g) if isinstance(g, list) else g
            print('  %-24s words.js: %s   duden: %s   %s' % (
                w['w'], w['g'], g, r['url']))
    if notfound:
        print('\nnot on Duden (skipped, %d):' % len(notfound))
        print('  ' + ', '.join(w['w'] for w in notfound))
    if errors:
        print('\nfetch errors (skipped, %d):' % len(errors))
        for w, r in errors:
            print('  %-24s %s   %s' % (w['w'], r.get('gender') or '', r['url']))
    if interrupted:
        print('\ninterrupted — rerun to continue (progress is cached in %s)'
              % CACHE_FILE)
    sys.exit(1 if counts['mismatch'] else 0)


if __name__ == '__main__':
    main()
