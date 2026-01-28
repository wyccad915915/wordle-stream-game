#!/usr/bin/env python3
"""
build_words_5_v2.py

Builds a premium Wordle-faithful 5-letter answer list (words-5.json) using:
  1. The original NYT Wordle curated answer list as the foundation
  2. Careful expansion using frequency data to reach target size
  3. Strict quality filtering to maintain Wordle-level fairness

Usage:
    python build_words_5_v2.py

Requirements:
    - Python 3.6+
    - No external dependencies (standard library only)
    - Internet connection (to download source data)
    - allowed-5.json must exist in the same directory

Output:
    - words-5.json (2,000-2,400 curated answers)
"""

import json
import urllib.request
import re
import os
import sys

# =============================================================================
# CONFIGURATION
# =============================================================================

TARGET_MIN = 2000
TARGET_MAX = 2400
TARGET_MID = 2200

# URLs for source data
WORDLE_ANSWERS_URL = "https://gist.githubusercontent.com/cfreshman/a03ef2cba789d8cf00c08f767e0fad7b/raw/45c977427419a1e0edee8fd395af1e0a4966273b/wordle-answers-alphabetical.txt"
FREQUENCY_URL = "https://raw.githubusercontent.com/hermitdave/FrequencyWords/master/content/2018/en/en_50k.txt"

# Natural plurals that ARE allowed as answers (paired/collective usage)
ALLOWED_PLURALS = {
    'pants', 'jeans', 'shorts', 'slacks', 'tights', 'chaps', 'briefs', 'boxers',
    'trousers', 'leggings', 'knickers', 'undies',
    'glasses', 'goggles', 'shades', 'specs',
    'scissors', 'shears', 'pliers', 'tongs', 'tweezers', 'clippers', 'forceps',
    'binoculars',
    'stairs', 'steps',
    'gloves', 'mitts', 'mittens',
    'socks', 'hose',
    'shoes', 'boots', 'heels', 'pumps', 'clogs', 'loafers', 'sandals', 'slippers',
    'sneakers', 'flats', 'wedges', 'cleats', 'skates',
    'tools', 'tacks', 'nails', 'bolts', 'screws',
    'goods', 'wares', 'belongings',
    'arms', 'weapons',
    'means', 'ways',
    'thanks', 'regards', 'respects', 'amends',
    'suds', 'dregs', 'lees', 'odds', 'wits', 'blues', 'jitters',
    'remains', 'ruins', 'ashes', 'embers',
    'oats', 'grits', 'beans', 'peas',
    'wages', 'dues', 'taxes', 'costs', 'rates', 'fees',
    'folks', 'gents',
    'links', 'ties', 'bonds',
    'cards', 'tiles', 'chips', 'dice', 'darts', 'bones',
    'beads', 'jewels', 'gems',
    'weeds', 'vines', 'reeds', 'stalks',
    'waves', 'tides', 'swells',
    'codes', 'rules', 'terms', 'clauses',
    'perks', 'kudos', 'props', 'vibes'
}

# Profanity and offensive terms to exclude
PROFANITY = {
    'shits', 'fucks', 'cunts', 'dicks', 'cocks', 'pussy', 'asses',
    'bitch', 'whore', 'slut', 'prick', 'bastard', 'damn', 'hells',
    'craps', 'turds', 'farts', 'balls', 'screw'
}

# Known obscure/archaic/Scrabble-bait words to explicitly exclude
EXCLUDE_LIST = {
    # Archaic/obsolete
    'thine', 'thous', 'thees', 'doest', 'doeth', 'dieth', 'goeth', 'hath',
    'shalt', 'whist', 'twixt', 'betwixt', 'amongst', 'whilst',
    
    # Obscure Scrabble words
    'aahed', 'aalii', 'aargh', 'abaca', 'abaci', 'abaft', 'abaka', 'abamp',
    'abase', 'abash', 'abate', 'abaya', 'abbas', 'abbes', 'abbey', 'abbot',
    'abele', 'abeam', 'abets', 'abhor', 'abide', 'abled', 'abler', 'ables',
    'abmho', 'abohm', 'aboil', 'aboma', 'aboon', 'abort', 'about', 'above',
    'abris', 'abuse', 'abuts', 'abuzz', 'abyes', 'abysm', 'abyss', 'acais',
    'acari', 'accoy', 'acerb', 'aceta', 'ached', 'aches', 'achoo', 'acids',
    'acidy', 'acing', 'acini', 'ackee', 'acmes', 'acmic', 'acned', 'acnes',
    'acock', 'acold', 'acorn', 'acred', 'acres', 'acrid', 'acted', 'actin',
    'actor', 'acute', 'acyls', 'adage', 'adapt', 'adaws', 'adays', 'addax',
    'added', 'adder', 'addio', 'addle', 'adeem', 'adept', 'adhan', 'adieu',
    'adios', 'adits', 'adman', 'admen', 'admit', 'admix', 'adobe', 'adobo',
    'adopt', 'adore', 'adorn', 'adown', 'adoze', 'aduki', 'adult', 'adunc',
    'adust', 'adyta', 'adzed', 'adzes', 'aecia', 'aedes', 'aegis', 'aeons',
    'aerie', 'afaid', 'afara', 'afars', 'afear', 'affix', 'afire', 'afoot',
    'afore', 'afoul', 'afrit', 'afros', 'after', 'again', 'agama', 'agape',
    'agars', 'agate', 'agave', 'agaze', 'agene', 'agent', 'agers', 'agger',
    'aggie', 'aggro', 'aghas', 'agile', 'aging', 'agios', 'agism', 'agist',
    'agita', 'aglee', 'aglet', 'agley', 'aglow', 'agmas', 'agoge', 'agone',
    'agons', 'agony', 'agora', 'agree', 'agria', 'agued', 'agues', 'aguti',
    'ahead', 'aheap', 'ahent', 'ahigh', 'ahind', 'ahing', 'ahint', 'ahold',
    'ahull', 'aided', 'aider', 'aides', 'ailed', 'aimed', 'aimer', 'aioli',
    'aired', 'airer', 'airns', 'airth', 'airts', 'aisle', 'aitch', 'aitus',
    'aiver', 'aizle', 'ajiva', 'ajuga', 'ajwan', 'akees', 'akela', 'akene',
    'aking', 'akita', 'alaap', 'alack', 'alamo', 'aland', 'alane', 'alang',
    'alans', 'alant', 'alarm', 'alary', 'alate', 'alays', 'albas', 'albee',
    
    # More obscure dictionary words
    'caird', 'daman', 'bromo', 'deice', 'haply', 'eggar', 'fumer', 'deedy',
    'demit', 'dizen', 'fungo', 'hadal', 'boite', 'mirex', 'thuja', 'toque',
    'craal', 'galax', 'cycad', 'durra', 'gesso', 'jerid', 'loess', 'poult',
    'quass', 'seral', 'tepal', 'whomp', 'yoghs', 'zloty', 'abaya', 'acais',
    'aduki', 'agama', 'agave', 'ajiva', 'ajuga', 'ajwan', 'alate', 'aecia'
}

# =============================================================================
# DOWNLOAD FUNCTIONS
# =============================================================================

def download_text(url, description):
    """Download text file from URL"""
    print(f"📥 Downloading {description}...")
    try:
        with urllib.request.urlopen(url, timeout=30) as response:
            content = response.read().decode('utf-8')
        print(f"   ✓ Downloaded successfully")
        return content
    except Exception as e:
        print(f"   ✗ Failed: {e}")
        return None

def load_wordle_answers():
    """Download and parse original Wordle answer list"""
    content = download_text(WORDLE_ANSWERS_URL, "Wordle official answer list")
    if not content:
        return set()
    
    words = set()
    for line in content.strip().split('\n'):
        word = line.strip().lower()
        if len(word) == 5 and word.isalpha():
            words.add(word)
    
    print(f"   ✓ Loaded {len(words):,} Wordle answers")
    return words

def load_frequency_data():
    """Download and parse frequency data"""
    content = download_text(FREQUENCY_URL, "English word frequency list")
    if not content:
        return {}
    
    freq_dict = {}
    for rank, line in enumerate(content.strip().split('\n'), start=1):
        parts = line.split()
        if len(parts) >= 1:
            word = parts[0].lower().strip()
            if word and word.isalpha() and len(word) == 5:
                freq_dict[word] = rank
    
    print(f"   ✓ Loaded {len(freq_dict):,} 5-letter frequency entries")
    return freq_dict

def load_allowed_words():
    """Load the allowed guess list"""
    filename = 'allowed-5.json'
    if not os.path.exists(filename):
        print(f"\n⚠ ERROR: {filename} not found!")
        print("   This file must exist in the same directory as the script.")
        sys.exit(1)
    
    try:
        with open(filename, 'r', encoding='utf-8') as f:
            words = json.load(f)
        
        words_set = set()
        for word in words:
            if isinstance(word, str):
                w = word.lower().strip()
                if len(w) == 5 and w.isalpha():
                    words_set.add(w)
        
        print(f"✓ Loaded {len(words_set):,} allowed 5-letter words from {filename}")
        return words_set
    
    except Exception as e:
        print(f"⚠ ERROR loading {filename}: {e}")
        sys.exit(1)

# =============================================================================
# FILTERING FUNCTIONS
# =============================================================================

def is_regular_plural(word):
    """
    Check if word is a regular plural that should be excluded.
    Returns True if it's a regular plural (exclude it).
    Returns False if it's OK to keep.
    """
    # Not a plural if doesn't end in 's'
    if not word.endswith('s'):
        return False
    
    # Whitelisted natural plurals are OK
    if word in ALLOWED_PLURALS:
        return False
    
    # Words ending in double-s are usually not plurals (e.g., 'class', 'grass')
    if word.endswith('ss'):
        return False
    
    # Words ending in 'us' are usually not plurals (e.g., 'focus', 'bonus')
    if word.endswith('us'):
        return False
    
    # Words ending in 'is' are usually not plurals (e.g., 'basis', 'oasis')
    if word.endswith('is'):
        return False
    
    # Words ending in 'ous' are adjectives, not plurals
    if word.endswith('ous'):
        return False
    
    # Check for -es ending (common plural)
    if word.endswith('es'):
        base = word[:-2]
        if len(base) >= 3:
            # Likely a plural if base ends in s, x, z, ch, sh
            if base[-1] in 'sxz':
                return True
            if len(base) >= 4 and base[-2:] in ['ch', 'sh']:
                return True
    
    # Most likely a simple -s plural
    # But be conservative: only flag if base would be 3+ chars
    base = word[:-1]
    if len(base) >= 3:
        # This is likely a plural
        # Exception: some words naturally end in 's' like 'chaos' -> keep
        # We'll rely on the allowed list and frequency to catch these
        return True
    
    return False

def is_archaic_or_obscure(word):
    """Check if word is archaic or obscure"""
    # In exclude list
    if word in EXCLUDE_LIST:
        return True
    
    # Archaic patterns
    if word.endswith('eth') or word.endswith('est'):
        # But allow common words
        common = {'best', 'fest', 'nest', 'pest', 'rest', 'test', 'west',
                  'chest', 'guest', 'quest', 'zest', 'crest', 'forest',
                  'honest', 'modest', 'latest', 'greatest', 'oldest'}
        if word not in common:
            return True
    
    # Unusual letter patterns (Scrabble bait)
    # Too many consonants
    if re.search(r'[bcdfghjklmnpqrstvwxz]{4,}', word):
        return True
    
    # Q not followed by U
    if 'q' in word and not re.search(r'qu', word):
        return True
    
    # X in unusual position (not xylophone-like words)
    if word.startswith('x') and word not in {'xenon', 'xerox'}:
        return True
    
    return False

def is_profane(word):
    """Check if word is profane"""
    return word in PROFANITY

def should_include(word):
    """
    Decide if word should be included.
    Returns True if word passes all filters.
    """
    # Must be valid 5-letter word
    if len(word) != 5 or not word.isalpha():
        return False
    
    # Apply filters
    if is_regular_plural(word):
        return False
    
    if is_archaic_or_obscure(word):
        return False
    
    if is_profane(word):
        return False
    
    return True

# =============================================================================
# MAIN GENERATION LOGIC
# =============================================================================

def generate_answer_list(wordle_base, freq_dict, allowed_words):
    """
    Generate the curated answer list.
    
    Strategy:
    1. Start with Wordle base (already high quality)
    2. Filter it through our rules
    3. Expand using frequency-ranked words if needed
    4. Ensure all words are in allowed list
    """
    
    print(f"\n{'='*70}")
    print("BUILDING CURATED 5-LETTER ANSWER LIST")
    print(f"{'='*70}\n")
    
    # Step 1: Filter Wordle base through our rules
    print("Step 1: Filtering Wordle base list...")
    
    wordle_filtered = set()
    for word in wordle_base:
        if word in allowed_words and should_include(word):
            wordle_filtered.add(word)
    
    excluded_count = len(wordle_base) - len(wordle_filtered)
    print(f"   Started with: {len(wordle_base):,} Wordle answers")
    print(f"   Excluded: {excluded_count:,} words")
    print(f"   Kept: {len(wordle_filtered):,} words")
    
    # Step 2: Check if we need to expand
    current_size = len(wordle_filtered)
    
    if current_size >= TARGET_MIN:
        print(f"\n✓ Already have {current_size:,} words (target: {TARGET_MIN:,}-{TARGET_MAX:,})")
        if current_size > TARGET_MAX:
            print(f"   Trimming to {TARGET_MAX:,}...")
            result = sorted(wordle_filtered)[:TARGET_MAX]
        else:
            result = sorted(wordle_filtered)
    else:
        # Need to expand
        needed = TARGET_MID - current_size
        print(f"\nStep 2: Expanding with frequency-ranked words...")
        print(f"   Need {needed:,} more words to reach target ({TARGET_MID:,})")
        
        # Get frequency-ranked candidates
        freq_candidates = []
        for word in allowed_words:
            if word not in wordle_filtered and word in freq_dict:
                freq_candidates.append((freq_dict[word], word))
        
        # Sort by frequency (lower rank = more common)
        freq_candidates.sort()
        
        print(f"   Candidates available: {len(freq_candidates):,}")
        
        # Add words from frequency list
        added = []
        for rank, word in freq_candidates:
            if should_include(word):
                added.append(word)
                if len(added) >= needed:
                    break
        
        print(f"   Added: {len(added):,} frequency-ranked words")
        
        # Combine
        result = sorted(wordle_filtered | set(added))
    
    # Final validation
    print(f"\nStep 3: Final validation...")
    final = []
    for word in result:
        if word in allowed_words:
            final.append(word)
        else:
            print(f"   ⚠ Skipping '{word}' (not in allowed-5.json)")
    
    return final

# =============================================================================
# MAIN
# =============================================================================

def main():
    print("\n" + "="*70)
    print("WORDLE V2 ANSWER LIST BUILDER (5-letter)")
    print("="*70)
    print("\nGenerating premium 5-letter answer list...")
    print(f"Target: {TARGET_MIN:,}-{TARGET_MAX:,} words\n")
    
    # Load allowed list first (required)
    print(f"{'='*70}")
    print("LOADING ALLOWED WORDS")
    print(f"{'='*70}\n")
    allowed_words = load_allowed_words()
    
    # Download source data
    print(f"\n{'='*70}")
    print("DOWNLOADING SOURCE DATA")
    print(f"{'='*70}\n")
    
    wordle_base = load_wordle_answers()
    if not wordle_base:
        print("\n⚠ WARNING: Could not load Wordle base list!")
        print("   Continuing with frequency data only...\n")
    
    freq_dict = load_frequency_data()
    if not freq_dict:
        print("\n⚠ WARNING: Could not load frequency data!")
        print("   Continuing with Wordle base only...\n")
    
    if not wordle_base and not freq_dict:
        print("\n✗ ERROR: No source data available!")
        print("   Cannot continue without data sources.")
        sys.exit(1)
    
    # Generate answer list
    answers = generate_answer_list(wordle_base, freq_dict, allowed_words)
    
    # Write output
    print(f"\n{'='*70}")
    print("WRITING OUTPUT")
    print(f"{'='*70}\n")
    
    output_file = 'words-5.json'
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(answers, f, indent=2, ensure_ascii=False)
    
    final_count = len(answers)
    status = "✓" if TARGET_MIN <= final_count <= TARGET_MAX else "⚠"
    
    print(f"  {status} Wrote {output_file}")
    print(f"  {status} Final count: {final_count:,} words")
    print(f"     Target range: {TARGET_MIN:,}-{TARGET_MAX:,}")
    
    # Sample
    if final_count > 0:
        print(f"\n  📌 First 20 words: {', '.join(answers[:20])}")
        print(f"  📌 Last 20 words: {', '.join(answers[-20:])}")
    
    # Summary
    print(f"\n{'='*70}")
    print("GENERATION COMPLETE!")
    print(f"{'='*70}\n")
    
    if TARGET_MIN <= final_count <= TARGET_MAX:
        print("✓ SUCCESS: Answer list meets target size")
    else:
        print("⚠ WARNING: Answer list outside target range")
        if final_count < TARGET_MIN:
            print(f"  Short by {TARGET_MIN - final_count:,} words")
        else:
            print(f"  Over by {final_count - TARGET_MAX:,} words")
    
    print("\n" + "="*70)
    print("QUALITY CHECK")
    print("="*70)
    print("""
Next steps:

1. Sample 20 random words:
   python -c "import json,random;words=json.load(open('words-5.json'));print(', '.join(random.sample(words,20)))"

2. Check for quality:
   - Are all words recognizable?
   - Would they feel fair as Wordle answers?
   - Any obscure/archaic words slipping through?

3. If you see problems:
   - Add specific words to EXCLUDE_LIST in the script
   - Re-run: py build_words_5_v2.py

4. Test in your game:
   - Replace words-5.json
   - Play several rounds
   - Verify answers feel natural and fair
""")

if __name__ == "__main__":
    main()
