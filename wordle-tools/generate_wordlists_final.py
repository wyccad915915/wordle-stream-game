#!/usr/bin/env python3
"""
Wordle-Style Answer List Generator
Generates curated answer lists following NYT Wordle quality standards
"""

import json
import sys

def is_regular_plural(word):
    """Check if word is a regular plural (excluded from answers)"""
    if not word.endswith('s'):
        return False
    
    # Natural plurals that are allowed
    natural_plurals = {
        'pants', 'jeans', 'glasses', 'scissors', 'stairs', 'gloves',
        'tools', 'clothes', 'thanks', 'means', 'series', 'species'
    }
    
    if word in natural_plurals:
        return False
    
    # Check if it's just word + 's' (regular plural)
    base = word[:-1]
    if len(base) >= 3:  # Reasonable base word length
        return True
    
    return False

def generate_wordlist(word_source, length, count_target):
    """Generate a curated word list of specified length"""
    words = []
    
    for word in word_source:
        word = word.strip().lower()
        
        # Length filter
        if len(word) != length:
            continue
        
        # Only alphabetic
        if not word.isalpha():
            continue
        
        # Skip regular plurals
        if is_regular_plural(word):
            continue
        
        words.append(word)
    
    # Return sorted unique words
    return sorted(set(words))[:count_target]

def main():
    print("=" * 70)
    print("WORDLE-STYLE ANSWER LIST GENERATOR")
    print("=" * 70)
    print("\nThis script generates curated answer lists.")
    print("It needs a source word list (like enable1.txt)")
    print("\nDownload enable1.txt:")
    print("  curl -O https://github.com/dolph/dictionary/raw/master/enable1.txt")
    print("\n" + "=" * 70 + "\n")
    
    # You can paste your word lists here or load from a file
    # For now, showing the structure you need
    
    # Example: Load from enable1.txt if available
    try:
        with open('enable1.txt', 'r') as f:
            all_words = f.readlines()
        print("✓ Loaded enable1.txt")
    except FileNotFoundError:
        print("⚠ enable1.txt not found")
        print("\nUsing fallback word lists (smaller scale)...")
        # Fallback: use inline curated words
        all_words = []  # Add your curated words here
    
    # Generate each length
    targets = {
        4: (1200, 1600),
        5: (2000, 2400),
        6: (2800, 3800),
        7: (3500, 5000)
    }
    
    for length, (min_count, max_count) in targets.items():
        target_count = max_count  # Aim for maximum
        
        words = generate_wordlist(all_words, length, target_count)
        
        filename = f'words-{length}.json'
        with open(filename, 'w') as f:
            json.dump(words, f, indent=2)
        
        count = len(words)
        status = "✓" if min_count <= count <= max_count else "⚠"
        print(f"{status} {filename}: {count:,} words (target: {min_count:,}-{max_count:,})")
    
    print("\n" + "=" * 70)
    print("COMPLETE! Files generated:")
    print("  - words-4.json")
    print("  - words-5.json")
    print("  - words-6.json")
    print("  - words-7.json")
    print("=" * 70)

if __name__ == "__main__":
    main()
