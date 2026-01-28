# Word List Generator Instructions

## Overview

This generator creates two types of word lists:
- **Answer lists** (`words-N.json`): Curated common words, NO plurals
- **Allowed lists** (`allowed-N.json`): ALL valid words INCLUDING plurals

This matches Wordle's strategy: answers are curated, but guesses can include plurals.

---

## Quick Start

### Step 1: Download the source word list

**Option A - Using curl:**
```bash
curl -O https://github.com/dolph/dictionary/raw/master/enable1.txt
```

**Option B - Manual download:**
1. Go to: https://github.com/dolph/dictionary/raw/master/enable1.txt
2. Save as `enable1.txt` in your project folder

### Step 2: Run the generator

```bash
python3 generate_wordlists.py
```

### Step 3: Done!

The script will create 8 JSON files in the same folder:
```
words-4.json (curated)    →  allowed-4.json (comprehensive)
words-5.json (curated)    →  allowed-5.json (comprehensive)
words-6.json (curated)    →  allowed-6.json (comprehensive)
words-7.json (curated)    →  allowed-7.json (comprehensive)
```

---

## What Gets Generated

### Answer Lists (words-N.json)
✅ Common, familiar words  
✅ No regular plurals (no -S, -ES endings)  
✅ No obscure words with multiple rare letters  
✅ ~2000 words per length  

**Example answers:** about, could, great, house, think

### Allowed Lists (allowed-N.json)
✅ ALL valid English words of that length  
✅ Includes plurals (words, houses, thinks)  
✅ Includes uncommon words  
✅ Several thousand+ words per length  

**Key difference:** "WORDS" can be guessed but won't be an answer

---

## Expected Output Sizes

| Length | Answer List | Allowed List |
|--------|-------------|--------------|
| 4-letter | ~1,500 | ~4,000+ |
| 5-letter | ~2,000 | ~9,000+ |
| 6-letter | ~2,000 | ~16,000+ |
| 7-letter | ~2,000 | ~24,000+ |

---

## Troubleshooting

**Error: enable1.txt not found**
```bash
# Make sure you're in the project folder
ls enable1.txt

# If missing, download it:
curl -O https://github.com/dolph/dictionary/raw/master/enable1.txt
```

**Permission denied**
```bash
chmod +x generate_wordlists.py
python3 generate_wordlists.py
```

**Python not found**
- Install Python 3: https://www.python.org/downloads/
- Or use: `python generate_wordlists.py` (without the 3)

---

## Using Custom Word Lists

If you have a different source file:

1. Edit `generate_wordlists.py`
2. Change line: `source_words = load_source_words('enable1.txt')`
3. To: `source_words = load_source_words('your-file.txt')`
4. Run the script

Common alternatives:
- SCOWL word lists: http://wordlist.aspell.net/
- /usr/share/dict/words (Linux/Mac built-in)
- Any text file with one word per line

---

## Strategy Explanation

**Why curated answers?**
- Makes gameplay fair and enjoyable
- Avoids obscure words as answers
- Players won't be frustrated by answers like "XYLEM" or "PHPBB"

**Why comprehensive allowed?**
- Players can try any valid word
- Includes plurals (common guesses)
- More flexible guessing strategy
- Matches how real Wordle works

This two-tier system gives the best of both worlds! 🎯
