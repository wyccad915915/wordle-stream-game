// ============================================
// WORDLE CLONE - V3 with Dynamic Rows, Ghost Letters, and Streak
// ============================================

// ============================================
// GLOBAL STATE & CONFIGURATION
// ============================================

// Animation timing (ms) - adjust these for reveal suspense effect
const REVEAL_DELAY_PER_TILE = 250;  // Delay between each tile flip
const REVEAL_FINAL_DELAY = 300;     // Delay after last tile before continuing

let currentWordLength = 5;
let words = [];
let allowedWords = [];
let allowedWordsSet = new Set();
let targetWord = '';

// Game state - now with dynamic rows and cursor
let gameState = {
    guesses: [],
    currentRow: 0,
    currentRowLetters: Array(5).fill(''),  // Initialize with 5 empty strings (default word length)
    currentCellIndex: 0,    // Cursor position in current row
    gameOver: false,
    won: false,
    rowCount: 6            // Dynamic row count (was const MAX_GUESSES)
};

// Submission lock to prevent overlapping submits
let isRevealing = false;

// Stats
let stats = {
    gamesPlayed: 0,
    gamesWon: 0,
    currentStreak: 0,
    maxStreak: 0,
    distribution: Array(12).fill(0)  // Extended for up to 12 rows
};

// Settings
let settings = {
    warnRuledOut: true,
    ghostGreens: true
};

// Global loading state
let wordsLoaded = false;
let pendingLoadPromise = null;
let listenersBound = false;
let keyboardBound = false;
let isLoading = false;

// Helper functions
function isStringAlphaLen(word, len) {
    return typeof word === 'string' && 
           word.length === len && 
           /^[A-Za-z]+$/.test(word);
}

function toUpper(s) {
    return String(s).toUpperCase();
}

// ============================================
// HELPER: MODAL & LOCK MANAGEMENT
// ============================================

function isAnyModalOpen() {
    const modals = ['confirm-dialog', 'stats-modal', 'settings-modal', 'endgame-modal', 'reset-confirm-modal'];
    return modals.some(id => document.getElementById(id)?.classList.contains('show'));
}

function isInputBlocked() {
    // Block input if game over, animating, loading, or any modal is open
    return gameState.gameOver || isRevealing || isLoading || isAnyModalOpen();
}

// ============================================
// HELPER: STATE SANITIZATION
// ============================================

function sanitizeGameState(state) {
    // Ensure word length is valid
    const wordLength = Math.max(4, Math.min(7, parseInt(state.wordLength) || 5));
    state.wordLength = wordLength;
    
    // Sanitize currentRowLetters
    if (!Array.isArray(state.currentRowLetters) || state.currentRowLetters.length !== wordLength) {
        state.currentRowLetters = Array(wordLength).fill('');
        state.currentCellIndex = 0;
    }
    
    // Clamp currentCellIndex
    state.currentCellIndex = Math.max(0, Math.min(state.currentCellIndex || 0, wordLength - 1));
    
    // Normalize and filter guesses
    state.guesses = (state.guesses || [])
        .map(g => String(g || '').toUpperCase())
        .filter(g => g.length === wordLength && /^[A-Z]+$/.test(g));
    
    // Ensure currentRow doesn't exceed guesses
    state.currentRow = Math.max(0, Math.min(state.currentRow || 0, state.guesses.length));
    
    // Sanitize rowCount
    const minRows = Math.max(3, state.currentRow + 1, state.guesses.length);
    state.rowCount = Math.max(minRows, Math.min(12, state.rowCount || 6));
    
    // Validate targetWord
    if (state.targetWord && state.targetWord.length !== wordLength) {
        state.targetWord = '';
    }
    if (state.targetWord) state.targetWord = String(state.targetWord).toUpperCase();
    
    // Ensure booleans
    state.gameOver = Boolean(state.gameOver);
    state.won = Boolean(state.won);
    
    return state;
}

// Track active confirm dialog to prevent multiple overlapping dialogs
let activeConfirm = null; // { resolve, cleanup }

// ============================================
// INITIALIZATION
// ============================================

document.addEventListener('DOMContentLoaded', async () => {
    await loadGameState();
    await loadWordLists();
    ensureTargetWordAfterLoad();
    loadStats();
    loadSettings();
    loadTheme();
    setupEventListeners();
    setupKeyboard();
    updateBoard();
    updateRowControls();
    updateStreakDisplay();
});

// ============================================
// WORD LIST LOADING
// ============================================

async function loadWordLists() {
    // Deduplicate concurrent loads
    if (pendingLoadPromise) return pendingLoadPromise;
    
    pendingLoadPromise = (async () => {
        try {
            const wordsResponse = await fetch(`words-${currentWordLength}.json`);
            const allowedResponse = await fetch(`allowed-${currentWordLength}.json`);
            
            if (!wordsResponse.ok || !allowedResponse.ok) {
                throw new Error(`Failed to load word lists (status: ${wordsResponse.status}/${allowedResponse.status})`);
            }
            
            const wordsData = await wordsResponse.json();
            const allowedData = await allowedResponse.json();
            
            // Sanitize and validate
            words = (wordsData || [])
                .filter(w => isStringAlphaLen(w, currentWordLength))
                .map(toUpper);
            
            allowedWords = (allowedData || [])
                .filter(w => isStringAlphaLen(w, currentWordLength))
                .map(toUpper);
            
            // Build allowedWordsSet (always include answer words)
            allowedWordsSet = new Set([...allowedWords, ...words]);
            
            if (words.length === 0) {
                throw new Error('Empty word list');
            }
            
            wordsLoaded = true;
            
        } catch (error) {
            console.error('Word list load error:', error);
            words = [];
            allowedWords = [];
            allowedWordsSet = new Set();
            wordsLoaded = false;
            showMessage(`Word list failed to load for ${currentWordLength} letters. Please refresh.`, 3000);
        } finally {
            pendingLoadPromise = null;
        }
    })();
    
    return pendingLoadPromise;
}

function ensureTargetWord() {
    // Can't pick word if list not loaded
    if (!wordsLoaded || !words || words.length === 0) {
        targetWord = '';
        return;
    }
    
    // Validate existing target
    if (targetWord && 
        typeof targetWord === 'string' &&
        targetWord.length === currentWordLength && 
        /^[A-Z]+$/.test(targetWord)) {
        return; // Keep valid target
    }
    
    // Pick new target word
    const randomWord = words[Math.floor(Math.random() * words.length)];
    targetWord = toUpper(randomWord);
    
    // Final validation
    if (targetWord.length !== currentWordLength) {
        console.error('Invalid target word length:', targetWord);
        targetWord = '';
        return;
    }
    
    saveGameState();
}

function ensureTargetWordAfterLoad() {
    if (!targetWord || targetWord.length !== currentWordLength || !/^[A-Z]+$/.test(targetWord)) {
        ensureTargetWord();
    }
}

// ============================================
// INPUT HANDLING (Classic Wordle Mode)
// ============================================

function handleLetterInput(letter) {
    if (isInputBlocked()) return;
    if (gameState.gameOver) return;
    
    const upperLetter = letter.toUpperCase();
    if (!/^[A-Z]$/.test(upperLetter)) return;
    
    // Classic mode: fill next empty cell left-to-right
    const idx = gameState.currentRowLetters.findIndex(ch => !ch);
    if (idx === -1) return; // row full
    gameState.currentRowLetters[idx] = upperLetter;
    gameState.currentCellIndex = Math.min(getNextTypingIndex(), currentWordLength - 1);
    updateBoard();
    saveGameState();
}

function handleBackspace() {
    if (isInputBlocked()) return;
    if (gameState.gameOver) return;
    
    // Classic mode: remove last filled letter
    let last = -1;
    for (let i = currentWordLength - 1; i >= 0; i--) {
        if (gameState.currentRowLetters[i]) {
            last = i;
            break;
        }
    }
    if (last === -1) return;
    gameState.currentRowLetters[last] = '';
    gameState.currentCellIndex = Math.max(0, last);
    updateBoard();
    saveGameState();
}

function handleDelete() {
    // Delete key disabled - use backspace for classic Wordle behavior
}

function handleArrowLeft() {
    // Arrow navigation disabled - classic Wordle mode only
}

function handleArrowRight() {
    // Arrow navigation disabled - classic Wordle mode only
}

function getNextTypingIndex() {
    // Returns first empty cell index in currentRowLetters, else last index
    const i = gameState.currentRowLetters.findIndex(ch => !ch);
    return i === -1 ? (currentWordLength - 1) : i;
}

function getGreenLetterMap() {
    // Returns Array(currentWordLength) where index i is confirmed green letter or ''
    const greens = Array(currentWordLength).fill('');
    
    // For each submitted guess, compute result and capture greens
    for (const guess of gameState.guesses) {
        const result = checkGuess(guess);
        for (let i = 0; i < currentWordLength; i++) {
            if (result[i] === 'correct') {
                greens[i] = guess[i]; // store the green letter for that position
            }
        }
    }
    return greens;
}

function getGreenLetterMapFromResults(guessResults) {
    // Use pre-computed results instead of re-calling checkGuess
    const greens = Array(currentWordLength).fill('');
    
    for (let i = 0; i < gameState.guesses.length; i++) {
        const guess = gameState.guesses[i];
        const result = guessResults[i];
        
        for (let j = 0; j < currentWordLength; j++) {
            if (result[j] === 'correct') {
                greens[j] = guess[j];
            }
        }
    }
    
    return greens;
}

// ============================================
// BOARD RENDERING
// ============================================

function updateBoard() {
    const board = document.getElementById('game-board');
    if (!board) return; // Guard against missing element
    
    board.innerHTML = '';
    
    // Pre-compute all guess results (avoid recomputing in loops)
    const guessResults = gameState.guesses.map(guess => checkGuess(guess));
    
    // Get ghost letter map if enabled (pass pre-computed results)
    const greens = settings.ghostGreens ? getGreenLetterMapFromResults(guessResults) : null;
    
    // Use dynamic row count
    for (let row = 0; row < gameState.rowCount; row++) {
        const rowDiv = document.createElement('div');
        rowDiv.className = 'row';
        
        const isSubmittedRow = row < gameState.guesses.length;
        const isCurrentRow = row === gameState.currentRow;
        const rowResult = isSubmittedRow ? guessResults[row] : null;
        
        for (let col = 0; col < currentWordLength; col++) {
            const tile = document.createElement('div');
            tile.className = 'tile';
            
            // Determine tile content
            let letter = '';
            if (isSubmittedRow) {
                // Submitted guess
                letter = gameState.guesses[row][col] || '';
                tile.classList.add('submitted');
                tile.classList.add(rowResult[col]);
            } else if (isCurrentRow) {
                // Current active row
                letter = gameState.currentRowLetters[col] || '';
            }
            
            // Render with ghost letters (only on current row)
            const ghost = (greens && isCurrentRow && greens[col]) ? greens[col] : '';
            if (!letter && ghost) {
                tile.innerHTML = `<span class="ghost">${ghost}</span>`;
            } else {
                tile.textContent = letter;
            }
            
            rowDiv.appendChild(tile);
        }
        
        board.appendChild(rowDiv);
    }
    
    // Update keyboard colors based on current guesses
    updateKeyboard();
}

function checkGuess(guess) {
    if (!targetWord || targetWord.length !== currentWordLength) {
        return Array(currentWordLength).fill('absent');
    }
    
    const result = Array(currentWordLength).fill('absent');
    const targetLetters = targetWord.split('');
    const guessLetters = guess.split('');
    
    // First pass: mark correct positions
    for (let i = 0; i < currentWordLength; i++) {
        if (guessLetters[i] === targetLetters[i]) {
            result[i] = 'correct';
            targetLetters[i] = null;
            guessLetters[i] = null;
        }
    }
    
    // Second pass: mark present letters
    for (let i = 0; i < currentWordLength; i++) {
        if (guessLetters[i] !== null) {
            const index = targetLetters.indexOf(guessLetters[i]);
            if (index !== -1) {
                result[i] = 'present';
                targetLetters[index] = null;
            }
        }
    }
    
    return result;
}

// ============================================
// GUESS SUBMISSION
// ============================================

async function submitGuess(forced = false) {
    // CRITICAL: Block if revealing (even before isInputBlocked)
    if (isRevealing) return;
    
    // Unified input blocking check
    if (isInputBlocked()) return;
    
    // Check word list loaded
    if (!wordsLoaded) {
        showMessage('Loading word list...', 1500);
        await loadWordLists();
        if (!wordsLoaded) {
            showMessage('Word list failed. Please refresh the page.', 3000);
            return;
        }
        ensureTargetWordAfterLoad();
    }
    
    if (!targetWord || targetWord.length !== currentWordLength) {
        showMessage('Word not loaded yet. Please wait a moment.', 1500);
        return;
    }
    
    // Check all cells are filled (no empty strings)
    const allFilled = gameState.currentRowLetters.every(letter => 
        letter && /^[A-Z]$/i.test(letter)
    );
    
    if (!allFilled) {
        showMessage('Not enough letters', 1500);
        shakeRow();
        return;
    }
    
    const currentWord = gameState.currentRowLetters.join('');
    
    // Check if word is in dictionary (fast Set lookup)
    if (!allowedWordsSet.has(currentWord)) {
        showMessage('Not in word list', 2000);
        shakeRow();
        return;
    }
    
    // Sleepy safety: check for ruled-out letters (only if not forced)
    if (!forced && settings.warnRuledOut) {
        const ruledOutLetters = getRuledOutLettersInGuess(currentWord);
        if (ruledOutLetters.length > 0) {
            const letterList = ruledOutLetters.join(', ');
            try {
                const confirmed = await showConfirmDialog(
                    `This guess contains letters you've already ruled out: ${letterList}. Submit anyway?`
                );
                if (!confirmed) return; // User cancelled - stay in same row
            } catch (error) {
                console.error('Confirm dialog error:', error);
                return; // Treat error as cancelled
            }
        }
    }
    
    // Lock submissions during reveal (with try/finally to ensure unlock)
    isRevealing = true;
    
    try {
        // Add guess to history
        gameState.guesses.push(currentWord);
        saveGameState(); // persist immediately before animation
        
        // Reveal animation (await completion)
        await animateReveal(currentWord);
        
        // Check win condition
        if (currentWord === targetWord) {
            handleWin();
            return;
        }
        
        // Move to next row
        gameState.currentRow++;
        gameState.currentRowLetters = Array(currentWordLength).fill('');
        gameState.currentCellIndex = 0;
        
        // Check loss condition
        if (gameState.currentRow >= gameState.rowCount) {
            handleLoss();
            return;
        }
        
        // Update UI
        updateBoard();
        updateRowControls();
        saveGameState();
    } finally {
        // Always unlock, even if error occurs
        isRevealing = false;
    }
}

function getRuledOutLettersInGuess(guess) {
    const ruledOut = getRuledOutLetters();
    const uniqueRuledOut = new Set();
    
    guess.split('').forEach(letter => {
        if (ruledOut.has(letter)) {
            uniqueRuledOut.add(letter);
        }
    });
    
    return Array.from(uniqueRuledOut);
}


function handleWin() {
    gameState.gameOver = true;
    gameState.won = true;
    
    // Update stats
    stats.gamesPlayed++;
    stats.gamesWon++;
    stats.currentStreak++;
    if (stats.currentStreak > stats.maxStreak) {
        stats.maxStreak = stats.currentStreak;
    }
    
    // Ensure distribution array is large enough
    while (stats.distribution.length <= gameState.currentRow) {
        stats.distribution.push(0);
    }
    stats.distribution[gameState.currentRow]++;
    
    saveStats();
    updateStreakDisplay();
    
    // Show win toast (match modal timing)
    showToast('Excellent! 🎉', 3000);
    
    // Fire confetti almost immediately
    setTimeout(() => {
        showConfetti();
    }, 100);
    
    // Show end game modal after confetti plays (~3s total)
    setTimeout(() => {
        showEndGameModal(true);
    }, 3000);
}

function handleLoss() {
    gameState.gameOver = true;
    gameState.won = false;
    
    // Update stats
    stats.gamesPlayed++;
    stats.currentStreak = 0;
    
    saveStats();
    updateStreakDisplay();
    
    // Show end game modal after animation completes
    setTimeout(() => {
        showEndGameModal(false, targetWord);
    }, 2000);
}

function getRuledOutLetters() {
    const letterStatus = {}; // Track best status for each letter
    
    gameState.guesses.forEach(guess => {
        const result = checkGuess(guess);
        guess.split('').forEach((letter, i) => {
            const status = result[i];
            const currentStatus = letterStatus[letter];
            
            // Priority: correct > present > absent
            // Only update if better status found
            if (status === 'correct') {
                letterStatus[letter] = 'correct';
            } else if (status === 'present' && currentStatus !== 'correct') {
                letterStatus[letter] = 'present';
            } else if (!currentStatus) {
                letterStatus[letter] = status;
            }
        });
    });
    
    // Return ONLY letters that are truly ruled out:
    // - Never marked correct or present across ALL guesses
    // - Marked absent at least once
    const ruledOut = new Set();
    for (const [letter, status] of Object.entries(letterStatus)) {
        if (status === 'absent') {
            ruledOut.add(letter);
        }
    }
    
    return ruledOut;
}

// ============================================
// FEATURE: DYNAMIC ROWS
// ============================================

function addRow() {
    if (isInputBlocked()) return;
    
    if (gameState.rowCount >= 12) {
        showMessage('Maximum 12 rows');
        return;
    }
    
    gameState.rowCount++;
    localStorage.setItem('wordle-rowcount-preference', gameState.rowCount);
    updateBoard();
    updateRowControls();
    saveGameState();
    showMessage('➕ Row added');
}

function removeRow() {
    if (isInputBlocked()) return;
    
    // Minimum: can't drop below current row position, submitted guesses, or absolute minimum of 3
    const minRows = Math.max(3, gameState.currentRow + 1, gameState.guesses.length);
    
    if (gameState.rowCount <= minRows) {
        showMessage(`Cannot remove: need at least ${minRows} rows`);
        return;
    }
    
    gameState.rowCount--;
    localStorage.setItem('wordle-rowcount-preference', gameState.rowCount);
    updateBoard();
    updateRowControls();
    saveGameState();
    showMessage('➖ Row removed');
}

function updateRowControls() {
    const addBtn = document.getElementById('add-row-btn');
    const removeBtn = document.getElementById('remove-row-btn');
    
    if (!addBtn || !removeBtn) return;
    
    // Disable add if at max or game over
    addBtn.disabled = gameState.rowCount >= 12 || gameState.gameOver;
    
    // Disable remove if at minimum or game over
    const minRows = Math.max(3, gameState.currentRow + 1, gameState.guesses.length);
    removeBtn.disabled = gameState.rowCount <= minRows || gameState.gameOver;
}

// ============================================
// FEATURE: STREAK DISPLAY & NUKE
// ============================================

function updateStreakDisplay() {
    const streakEl = document.getElementById('current-streak');
    if (streakEl) {
        streakEl.textContent = stats.currentStreak;
    }
}

async function nukeGame() {
    if (isRevealing) return; // Don't allow nuke during animation
    
    const confirmed = await showConfirmDialog(
        '💣 NUKE WARNING 💣\n\n' +
        'This will:\n' +
        '• Reset your streak to 0\n' +
        '• Clear the current game\n' +
        '• Start a fresh game\n\n' +
        'Are you sure?'
    );
    
    if (!confirmed) return;
    
    // Reset current streak in stats (but keep maxStreak)
    stats.currentStreak = 0;
    saveStats();
    updateStreakDisplay();
    
    // Clear game state
    localStorage.removeItem('wordle-game-state');
    
    // Start new game
    await newGame();
    
    showMessage('💣 Game nuked! Streak reset to 0.', 2000);
}

// ============================================
// GAME CONTROLS
// ============================================

async function newGame() {
    // Prevent new game during reveal animation
    if (isRevealing) {
        console.warn('Cannot start new game during reveal');
        return;
    }
    
    try {
        isLoading = true;
        
        // Reset submission lock
        isRevealing = false;
        
        // Get preferred row count (persist user's choice or default to 6)
        const rowCountPreference = localStorage.getItem('wordle-rowcount-preference');
        const preferredRowCount = rowCountPreference ? parseInt(rowCountPreference) : 6;
        
        // Reset game state with preserved/preferred row count
        gameState = {
            guesses: [],
            currentRow: 0,
            currentRowLetters: Array(currentWordLength).fill(''),
            currentCellIndex: 0,
            gameOver: false,
            won: false,
            rowCount: Math.max(3, Math.min(12, preferredRowCount))
        };
        
        // Pick new word (wait for any pending load)
        await loadWordLists();
        
        if (!wordsLoaded || !words || words.length === 0) {
            showMessage('Error: No words available. Please refresh the page.', 3000);
            console.error('Failed to load word list for length:', currentWordLength);
            return;
        }
        
        targetWord = '';  // Force new target selection
        ensureTargetWordAfterLoad();
        
        // Update UI
        updateBoard();
        updateRowControls();
        saveGameState();
        
    } finally {
        isLoading = false;
    }
    
    // Hide play again button in stats modal
    const playAgainContainer = document.getElementById('play-again-container');
    if (playAgainContainer) {
        playAgainContainer.style.display = 'none';
    }
}

async function changeWordLength(newLength) {
    try {
        isLoading = true;
        currentWordLength = parseInt(newLength);
        await newGame();
    } finally {
        isLoading = false;
    }
}

// ============================================
// KEYBOARD SETUP & HANDLING
// ============================================

function setupKeyboard() {
    if (keyboardBound) return;
    keyboardBound = true;
    
    const keyboard = document.getElementById('keyboard');
    if (!keyboard) {
        console.error('#keyboard not found');
        return;
    }
    
    const rows = [
        ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
        ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'],
        ['ENTER', 'Z', 'X', 'C', 'V', 'B', 'N', 'M', '⌫']
    ];
    
    keyboard.innerHTML = '';
    
    rows.forEach(row => {
        const rowDiv = document.createElement('div');
        rowDiv.className = 'keyboard-row';
        
        row.forEach(key => {
            const keyButton = document.createElement('button');
            keyButton.className = 'key';
            keyButton.textContent = key;
            
            if (key === 'ENTER' || key === '⌫') {
                keyButton.classList.add('wide');
            }
            
            keyButton.addEventListener('click', () => handleKeyPress(key));
            rowDiv.appendChild(keyButton);
        });
        
        keyboard.appendChild(rowDiv);
    });
}

function updateKeyboard() {
    // Get all keyboard keys
    const keys = document.querySelectorAll('.key');
    
    // Build letter status map from all guesses
    const letterStatus = {};
    
    gameState.guesses.forEach(guess => {
        const result = checkGuess(guess);
        guess.split('').forEach((letter, i) => {
            const status = result[i];
            const currentStatus = letterStatus[letter];
            
            // Priority: correct > present > absent
            if (status === 'correct') {
                letterStatus[letter] = 'correct';
            } else if (status === 'present' && currentStatus !== 'correct') {
                letterStatus[letter] = 'present';
            } else if (!currentStatus) {
                letterStatus[letter] = 'absent';
            }
        });
    });
    
    // Update key colors
    keys.forEach(key => {
        const letter = key.textContent;
        if (letter === 'ENTER' || letter === '⌫') return;
        
        const status = letterStatus[letter];
        
        // Remove all status classes
        key.classList.remove('correct', 'present', 'absent');
        
        // Add current status
        if (status) {
            key.classList.add(status);
        }
    });
}

function handleKeyPress(key) {
    if (isInputBlocked()) return;
    
    if (key === 'ENTER') {
        submitGuess();
    } else if (key === '⌫') {
        handleBackspace();
    } else {
        handleLetterInput(key);
    }
}

function setupEventListeners() {
    if (listenersBound) return;
    listenersBound = true;
    
    // Physical keyboard
    document.addEventListener('keydown', (e) => {
        // Enter starts new game ONLY when endgame modal is open
        const endgameOpen = document.getElementById('endgame-modal')?.classList.contains('show');
        if (e.key === 'Enter' && endgameOpen) {
            e.preventDefault();
            closeEndGameModal();
            newGame();
            return;
        }
        
        // Block all input if blocked
        if (isInputBlocked()) return;
        
        const key = e.key;
        
        if (key === 'Enter') {
            e.preventDefault();
            submitGuess();
        } else if (key === 'Backspace') {
            e.preventDefault();
            handleBackspace();
        } else if (key === 'Delete') {
            e.preventDefault();
            handleDelete();
        } else if (key === 'ArrowLeft') {
            e.preventDefault();
            handleArrowLeft();
        } else if (key === 'ArrowRight') {
            e.preventDefault();
            handleArrowRight();
        } else if (/^[a-zA-Z]$/.test(key)) {
            e.preventDefault();
            handleLetterInput(key);
        }
    });
    
    // Control buttons
    document.getElementById('new-game-btn')?.addEventListener('click', newGame);
    document.getElementById('add-row-btn')?.addEventListener('click', addRow);
    document.getElementById('remove-row-btn')?.addEventListener('click', removeRow);
    document.getElementById('nuke-btn')?.addEventListener('click', nukeGame);
    document.getElementById('settings-btn')?.addEventListener('click', showSettingsModal);
    document.getElementById('stats-btn')?.addEventListener('click', showStatsModal);
    document.getElementById('theme-toggle')?.addEventListener('click', toggleDarkMode);
    
    // Word length selector
    document.getElementById('word-length-select')?.addEventListener('change', (e) => {
        changeWordLength(e.target.value);
    });
    
    // Settings toggles
    document.getElementById('warn-ruled-out-toggle')?.addEventListener('change', (e) => {
        settings.warnRuledOut = e.target.checked;
        saveSettings();
    });
    
    document.getElementById('ghost-greens-toggle')?.addEventListener('change', (e) => {
        settings.ghostGreens = e.target.checked;
        saveSettings();
        updateBoard();
    });
    
    // Stats modal buttons
    document.getElementById('share-stats-btn')?.addEventListener('click', shareStats);
    document.getElementById('reset-stats-btn')?.addEventListener('click', showResetConfirmation);
    document.getElementById('play-again-btn')?.addEventListener('click', () => {
        closeAllModals();
        newGame();
    });
    
    // Reset confirmation
    document.getElementById('reset-confirm-btn')?.addEventListener('click', () => {
        resetStats();
        closeModal('reset-confirm-modal');
        showStatsModal();
    });
    
    document.getElementById('reset-cancel-btn')?.addEventListener('click', () => {
        closeModal('reset-confirm-modal');
    });
    
    // End game modal
    document.getElementById('endgame-new-game')?.addEventListener('click', () => {
        closeEndGameModal();
        newGame();
    });
    
    // Close buttons
    document.querySelectorAll('.close-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const modalId = e.currentTarget.dataset.modal;
            if (modalId === 'endgame-modal') {
                closeEndGameModal();
            } else {
                closeModal(modalId);
            }
        });
    });
    
    // Close on outside click
    window.addEventListener('click', (e) => {
        if (!e.target.classList.contains('modal')) return;
        if (e.target.id === 'confirm-dialog') return; // Let showConfirmDialog handle its own backdrop
        if (e.target.id === 'endgame-modal') {
            closeEndGameModal();
        } else {
            e.target.classList.remove('show');
        }
    });
}

// ============================================
// ANIMATIONS
// ============================================

function shakeRow() {
    const rows = document.querySelectorAll('.row');
    const currentRowElement = rows[gameState.currentRow];
    if (currentRowElement) {
        currentRowElement.style.animation = 'shake 0.5s';
        setTimeout(() => {
            currentRowElement.style.animation = '';
        }, 500);
    }
}

// Reveal animation - returns Promise that resolves when animation completes
async function animateReveal(guess) {
    const rows = document.querySelectorAll('.row');
    const currentRowElement = rows[gameState.currentRow];
    if (!currentRowElement) return;
    
    const tiles = currentRowElement.querySelectorAll('.tile');
    const result = checkGuess(guess);
    
    // Animate each tile with delay for suspense effect
    for (let i = 0; i < tiles.length; i++) {
        await new Promise(resolve => setTimeout(resolve, REVEAL_DELAY_PER_TILE));
        tiles[i].classList.add('flip');
        tiles[i].classList.add(result[i]);
    }
    
    // Wait for final tile animation to complete
    await new Promise(resolve => setTimeout(resolve, REVEAL_FINAL_DELAY));
    
    // Update keyboard colors after reveal
    updateKeyboard();
    
    // Animation complete - Promise resolves here
}

// ============================================
// PERSISTENCE
// ============================================

function saveGameState() {
    let state = {
        wordLength: currentWordLength,
        targetWord: targetWord,
        guesses: gameState.guesses,
        currentRow: gameState.currentRow,
        currentRowLetters: gameState.currentRowLetters,
        currentCellIndex: gameState.currentCellIndex,
        gameOver: gameState.gameOver,
        won: gameState.won,
        rowCount: gameState.rowCount
    };
    
    // Sanitize before saving
    state = sanitizeGameState(state);
    localStorage.setItem('wordle-game-state', JSON.stringify(state));
}

async function loadGameState() {
    const saved = localStorage.getItem('wordle-game-state');
    if (saved) {
        try {
            let state = JSON.parse(saved);
            
            // Sanitize loaded state
            state = sanitizeGameState(state);
            
            // Apply sanitized state
            currentWordLength = state.wordLength || 5;
            targetWord = state.targetWord || '';
            gameState.guesses = state.guesses;
            gameState.currentRow = state.currentRow;
            gameState.currentRowLetters = state.currentRowLetters;
            gameState.currentCellIndex = state.currentCellIndex;
            gameState.gameOver = state.gameOver;
            gameState.won = state.won;
            gameState.rowCount = state.rowCount;
            
            const wordLengthSelect = document.getElementById('word-length-select');
            if (wordLengthSelect) wordLengthSelect.value = currentWordLength;
        } catch (e) {
            console.error('Error loading game state:', e);
            currentWordLength = 5;
            gameState.currentRowLetters = Array(5).fill('');
            gameState.currentCellIndex = 0;
        }
    } else {
        gameState.currentRowLetters = Array(currentWordLength).fill('');
    }
}

function saveStats() {
    localStorage.setItem('wordle-stats', JSON.stringify(stats));
}

function loadStats() {
    const saved = localStorage.getItem('wordle-stats');
    if (saved) {
        try {
            const loaded = JSON.parse(saved);
            stats = {
                gamesPlayed: Math.max(0, parseInt(loaded.gamesPlayed) || 0),
                gamesWon: Math.max(0, parseInt(loaded.gamesWon) || 0),
                currentStreak: Math.max(0, parseInt(loaded.currentStreak) || 0),
                maxStreak: Math.max(0, parseInt(loaded.maxStreak) || 0),
                distribution: Array.isArray(loaded.distribution) 
                    ? loaded.distribution.slice(0, 12).map(n => Math.max(0, parseInt(n) || 0))
                    : Array(12).fill(0)
            };
            
            // Ensure distribution has 12 entries
            while (stats.distribution.length < 12) {
                stats.distribution.push(0);
            }
        } catch (e) {
            console.error('Error loading stats:', e);
            // stats already has defaults from initialization
        }
    }
}

function resetStats() {
    stats = {
        gamesPlayed: 0,
        gamesWon: 0,
        currentStreak: 0,
        maxStreak: 0,
        distribution: Array(12).fill(0)
    };
    saveStats();
    showMessage('Statistics reset');
}

function saveSettings() {
    localStorage.setItem('wordle-settings', JSON.stringify(settings));
}

function loadSettings() {
    const saved = localStorage.getItem('wordle-settings');
    if (saved) {
        try {
            const loaded = JSON.parse(saved);
            settings = {
                warnRuledOut: Boolean(loaded.warnRuledOut),
                ghostGreens: loaded.ghostGreens !== undefined ? Boolean(loaded.ghostGreens) : true
            };
        } catch (e) {
            console.error('Error loading settings:', e);
        }
    }
    
    // Apply settings to UI (with null checks)
    const warnToggle = document.getElementById('warn-ruled-out-toggle');
    const ghostGreensToggle = document.getElementById('ghost-greens-toggle');
    
    if (warnToggle) warnToggle.checked = settings.warnRuledOut;
    if (ghostGreensToggle) ghostGreensToggle.checked = settings.ghostGreens;
}

// ============================================
// UI HELPERS
// ============================================

function showMessage(text, duration = 1500) {
    const toast = document.getElementById('toast');
    if (!toast) {
        console.error('toast element not found');
        return;
    }
    
    toast.textContent = text;
    toast.classList.add('show');
    
    setTimeout(() => {
        toast.classList.remove('show');
    }, duration);
}

// Alias for clarity
function showToast(text, duration = 1500) {
    showMessage(text, duration);
}

// ============================================
// END GAME MODAL
// ============================================

function showEndGameModal(won, answer = '') {
    const modal = document.getElementById('endgame-modal');
    const title = document.getElementById('endgame-title');
    const answerContainer = document.getElementById('endgame-answer-container');
    const answerPill = document.getElementById('endgame-answer');
    
    if (!modal) return;
    
    if (won) {
        title.textContent = 'You Won! 🏆';
        answerContainer.style.display = 'none';
    } else {
        title.textContent = 'You Lost!';
        answerContainer.style.display = 'block';
        answerPill.textContent = answer;
    }
    
    modal.classList.add('show');
}

function closeEndGameModal() {
    const modal = document.getElementById('endgame-modal');
    if (modal) {
        modal.classList.remove('show');
    }
}

function showConfetti() {
    // Check if user prefers reduced motion
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) return;
    
    // Check if confetti library is loaded
    if (typeof confetti === 'undefined') return;
    
    // Fire confetti burst
    const duration = 2000;
    const animationEnd = Date.now() + duration;
    const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 0 };
    
    function randomInRange(min, max) {
        return Math.random() * (max - min) + min;
    }
    
    const interval = setInterval(function() {
        const timeLeft = animationEnd - Date.now();
        
        if (timeLeft <= 0) {
            return clearInterval(interval);
        }
        
        const particleCount = 50 * (timeLeft / duration);
        
        // Two bursts from different positions
        confetti({
            ...defaults,
            particleCount,
            origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 }
        });
        confetti({
            ...defaults,
            particleCount,
            origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 }
        });
    }, 250);
}


function toggleDarkMode() {
    document.body.classList.toggle('dark-mode');
    const isDark = document.body.classList.contains('dark-mode');
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
}

function loadTheme() {
    const theme = localStorage.getItem('theme');
    if (theme === 'dark') {
        document.body.classList.add('dark-mode');
    } else {
        document.body.classList.remove('dark-mode');
    }
}

function showStatsModal() {
    // Update stats display with null guards
    const statPlayed = document.getElementById('stat-played');
    const statWon = document.getElementById('stat-won');
    const statWinPercent = document.getElementById('stat-win-percent');
    const statCurrentStreak = document.getElementById('stat-current-streak');
    const statMaxStreak = document.getElementById('stat-max-streak');
    
    if (statPlayed) statPlayed.textContent = stats.gamesPlayed;
    
    const winPercent = stats.gamesPlayed > 0 
        ? Math.round((stats.gamesWon / stats.gamesPlayed) * 100) 
        : 0;
    if (statWon) statWon.textContent = stats.gamesWon;
    if (statWinPercent) statWinPercent.textContent = `${winPercent}%`;
    if (statCurrentStreak) statCurrentStreak.textContent = stats.currentStreak;
    if (statMaxStreak) statMaxStreak.textContent = stats.maxStreak;
    
    // Calculate best try
    let bestTry = 'N/A';
    for (let i = 0; i < stats.distribution.length; i++) {
        if (stats.distribution[i] > 0) {
            bestTry = `#${i + 1}`;
            break;
        }
    }
    const statBestTry = document.getElementById('stat-best-try');
    if (statBestTry) statBestTry.textContent = bestTry;
    
    // Update distribution chart
    updateDistributionChart();
    
    // Show play again button if game is over
    const playAgainContainer = document.getElementById('play-again-container');
    if (playAgainContainer) {
        playAgainContainer.style.display = gameState.gameOver ? 'block' : 'none';
    }
    
    showModal('stats-modal');
}

function updateDistributionChart() {
    const container = document.getElementById('guess-distribution');
    if (!container) return;
    
    container.innerHTML = '';
    
    // Calculate max rows to display (highest non-zero distribution + current rowCount)
    let maxRowsToShow = gameState.rowCount;
    for (let i = stats.distribution.length - 1; i >= 0; i--) {
        if (stats.distribution[i] > 0) {
            maxRowsToShow = Math.max(maxRowsToShow, i + 1);
            break;
        }
    }
    
    const maxCount = Math.max(...stats.distribution.slice(0, maxRowsToShow), 1);
    
    // Render only rows up to maxRowsToShow
    for (let index = 0; index < maxRowsToShow; index++) {
        const count = stats.distribution[index] || 0;
        
        const barContainer = document.createElement('div');
        barContainer.className = 'distribution-row';
        
        const label = document.createElement('div');
        label.className = 'distribution-label';
        label.textContent = index + 1;
        
        const barWrapper = document.createElement('div');
        barWrapper.className = 'distribution-bar-container';
        
        const bar = document.createElement('div');
        bar.className = 'distribution-bar';
        bar.style.width = count > 0 ? `${(count / maxCount) * 100}%` : '0%';
        
        if (gameState.gameOver && gameState.won && index === gameState.currentRow) {
            bar.classList.add('highlight');
        }
        
        const countLabel = document.createElement('div');
        countLabel.className = 'distribution-count';
        countLabel.textContent = count;
        
        barWrapper.appendChild(bar);
        barWrapper.appendChild(countLabel);
        
        barContainer.appendChild(label);
        barContainer.appendChild(barWrapper);
        
        container.appendChild(barContainer);
    }
}

function showSettingsModal() {
    showModal('settings-modal');
}

function showResetConfirmation() {
    showModal('reset-confirm-modal');
}

function showModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.add('show');
        
        // Focus first focusable element for accessibility
        setTimeout(() => {
            const focusable = modal.querySelector('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
            if (focusable) focusable.focus();
        }, 100);
    }
}

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.remove('show');
    }
}

function closeAllModals() {
    document.querySelectorAll('.modal').forEach(modal => {
        modal.classList.remove('show');
    });
}

function showConfirmDialog(message) {
    return new Promise((resolve) => {
        // Close any existing confirm dialog first
        if (activeConfirm) {
            activeConfirm.cleanup();
            activeConfirm.resolve(false);
            activeConfirm = null;
        }
        
        const modal = document.getElementById('confirm-dialog');
        const messageEl = document.getElementById('confirm-message');
        const confirmBtn = document.getElementById('confirm-submit');
        const cancelBtn = document.getElementById('confirm-cancel');
        
        // Validate all required elements exist
        if (!modal || !messageEl || !confirmBtn || !cancelBtn) {
            console.error('confirm-dialog elements missing:', { modal, messageEl, confirmBtn, cancelBtn });
            resolve(false);
            return;
        }
        
        messageEl.textContent = message;
        
        const handleConfirm = () => {
            cleanup();
            activeConfirm = null;
            resolve(true);
        };
        
        const handleCancel = () => {
            cleanup();
            activeConfirm = null;
            resolve(false);
        };
        
        // ESC/Enter key handler
        const handleEscape = (e) => {
            if (e.key === 'Escape') {
                handleCancel();
            } else if (e.key === 'Enter') {
                handleConfirm();
            }
        };
        
        // Backdrop click handler
        const handleBackdrop = (e) => {
            if (e.target === modal) {
                handleCancel();
            }
        };
        
        // Window blur handler (prevents stuck modal)
        const handleBlur = () => {
            handleCancel();
        };
        
        const cleanup = () => {
            modal.classList.remove('show');
            confirmBtn.removeEventListener('click', handleConfirm);
            cancelBtn.removeEventListener('click', handleCancel);
            document.removeEventListener('keydown', handleEscape);
            modal.removeEventListener('click', handleBackdrop);
            window.removeEventListener('blur', handleBlur);
        };
        
        // Track this dialog BEFORE showing modal
        activeConfirm = { resolve, cleanup };
        
        // Ensure modal is attached to body (in case it got moved)
        if (modal.parentNode !== document.body) {
            document.body.appendChild(modal);
        }
        
        // Attach all event listeners
        confirmBtn.addEventListener('click', handleConfirm);
        cancelBtn.addEventListener('click', handleCancel);
        document.addEventListener('keydown', handleEscape);
        modal.addEventListener('click', handleBackdrop);
        window.addEventListener('blur', handleBlur);
        
        // Show modal using class
        modal.classList.add('show');
        
        // Focus cancel button for accessibility
        setTimeout(() => cancelBtn.focus(), 100);
    });
}

async function shareStats() {
    const score = gameState.won ? `${gameState.currentRow + 1}/${gameState.rowCount}` : 'X';
    
    let shareText = `Wordle ${score}\n\n`;
    
    gameState.guesses.forEach(guess => {
        const result = checkGuess(guess);
        result.forEach(state => {
            if (state === 'correct') shareText += '🟩';
            else if (state === 'present') shareText += '🟨';
            else shareText += '⬜';
        });
        shareText += '\n';
    });
    
    try {
        if (navigator.share) {
            await navigator.share({ text: shareText });
        } else if (navigator.clipboard) {
            await navigator.clipboard.writeText(shareText);
            showMessage('Stats copied to clipboard!');
        } else {
            throw new Error('Sharing not supported');
        }
    } catch (err) {
        console.error('Error sharing:', err);
        showMessage('Could not share stats', 1500);
    }
}

// ============================================
// PUBLIC API FOR TIKFINITY
// ============================================

window.WordleActions = {
    addRow: addRow,
    removeRow: removeRow,
    nukeGame: nukeGame,
    newGame: newGame,
    submitGuess: submitGuess,
    getGameState: () => ({ ...gameState }),
    getStreak: () => ({ currentStreak: stats.currentStreak, maxStreak: stats.maxStreak }),
    getStats: () => ({ ...stats }),
    
    // TikFinity-friendly helpers (aliased from WordleHelpers in actions.js)
    setRowCount: (count) => window.WordleHelpers?.setRowCount(count),
    addRows: (count) => window.WordleHelpers?.addRows(count)
};
