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

// Round timer - tracks elapsed time for the current round
let roundStartTime = 0;   // Date.now() when the round began
let roundElapsedMs = 0;   // Frozen when round ends (win or loss)

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

// Format elapsed milliseconds as mm:ss for display
function formatRoundTime(ms) {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
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

    // Start round timer if a game is already in progress (restored from storage)
    if (!gameState.gameOver) {
        roundStartTime = Date.now();
        roundElapsedMs = 0;
    }
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
    // Freeze round timer before any stat updates
    if (roundStartTime > 0) roundElapsedMs = Date.now() - roundStartTime;

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
    // Freeze round timer before any stat updates
    if (roundStartTime > 0) roundElapsedMs = Date.now() - roundStartTime;

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

        // Start round timer for the new game
        roundStartTime = Date.now();
        roundElapsedMs = 0;

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

    // Definition toggle in endgame modal
    document.getElementById('endgame-def-toggle')?.addEventListener('click', () => {
        const defEl = document.getElementById('endgame-definition');
        const toggleBtn = document.getElementById('endgame-def-toggle');
        if (!defEl || !toggleBtn) return;
        const isHidden = defEl.style.display === 'none';
        defEl.style.display = isHidden ? 'block' : 'none';
        toggleBtn.textContent = isHidden ? 'Hide definition' : 'Show definition';
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
    const answerPill = document.getElementById('endgame-answer');
    const answerLabel = document.getElementById('endgame-answer-label');

    if (!modal) return;

    title.textContent = won ? 'You Won! 🏆' : 'You Lost!';

    // Always show the answer word; label differs by outcome
    const word = answer || targetWord;
    if (answerLabel) answerLabel.textContent = won ? 'The word was:' : 'The answer was:';
    if (answerPill) answerPill.textContent = word;

    // Show solve time (only if timer was actually running)
    const timerEl = document.getElementById('endgame-timer');
    if (timerEl) {
        if (roundElapsedMs > 0) {
            timerEl.textContent = `Time: ${formatRoundTime(roundElapsedMs)}`;
            timerEl.style.display = 'block';
        } else {
            timerEl.style.display = 'none';
        }
    }

    // Populate definition and reset to collapsed state each open
    const defSection = document.getElementById('endgame-def-section');
    const defEl = document.getElementById('endgame-definition');
    const defToggle = document.getElementById('endgame-def-toggle');
    if (defEl && word) {
        const def = getDefinition(word);
        defEl.textContent = def !== null ? def : 'Definition unavailable.';
        defEl.style.display = 'none';                  // collapsed by default
        if (defToggle) defToggle.textContent = 'Show definition';
        if (defSection) defSection.style.display = 'block';
    } else if (defSection) {
        defSection.style.display = 'none';
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
// WORD DEFINITIONS
// Full definitions are in definitions.js (loaded before this file)
// ============================================

const DEFINITIONS = {
    // 4-letter
    BOLD: 'Showing bravery or confidence; standing out clearly.',
    CALM: 'Free from agitation; peaceful.',
    CAVE: 'A natural underground hollow in rock.',
    DARK: 'With little or no light; deeply colored.',
    DAWN: 'The first light of day; a beginning.',
    DEEP: 'Extending far down; intense or profound.',
    DUST: 'Fine dry powder covering a surface.',
    EDGE: 'The outside limit of something.',
    FIRE: 'Combustion producing heat and light.',
    FLOW: 'To move steadily in one direction.',
    FOAM: 'A mass of small bubbles on a liquid.',
    FOLD: 'To bend over on itself; a crease.',
    GLOW: 'A steady light; warmth and radiance.',
    GOLD: 'A precious yellow metal; excellent quality.',
    GRIP: 'A firm hold; to hold tightly.',
    GUST: 'A sudden strong burst of wind.',
    HAZE: 'A light mist or smoke obscuring clarity.',
    KEEN: 'Eager and enthusiastic; sharp.',
    LARK: 'A small songbird; a fun adventure.',
    MIST: 'Thin fog or fine water droplets.',
    MOOD: 'A temporary state of mind.',
    MYTH: 'A traditional story explaining a belief.',
    OATH: 'A solemn promise.',
    OMEN: 'A sign of things to come.',
    PREY: 'An animal hunted for food.',
    RUIN: 'The remains of a destroyed structure.',
    RUST: 'A reddish coating that forms on iron.',
    SAGE: 'A wise person; a herb used in cooking.',
    SCAR: 'A mark left after a wound has healed.',
    SLAB: 'A broad flat piece of material.',
    SOAR: 'To fly high in the air.',
    SOOT: 'Black powder produced by fire.',
    SPAN: 'The full extent from one end to the other.',
    SPUR: 'A spike on a boot heel; an incentive.',
    SWAY: 'To move slowly from side to side.',
    THORN: 'A sharp point on a plant.',
    TIDE: 'The rise and fall of the sea.',
    TOIL: 'Hard and exhausting work.',
    TREK: 'A long and difficult journey.',
    VAST: 'Very great in size or extent.',
    VALE: 'A valley.',
    VEIL: 'A piece of fabric used as a covering.',
    WILT: 'To become limp; to lose vitality.',
    WISP: 'A small thin bundle or streak.',
    WREN: 'A small brown songbird.',
    ZEAL: 'Great energy or enthusiasm for a cause.',
    // 5-letter
    ABOUT: 'On the subject of; concerning.',
    ABOVE: 'At a higher level or position than.',
    ALARM: 'A warning signal; to make anxious.',
    ALERT: 'Quick to notice; a warning signal.',
    ALIVE: 'Living; not dead.',
    ALLOW: 'To permit or give permission.',
    ALONE: 'Without others; solitary.',
    ANGEL: 'A spiritual being; a very kind person.',
    ANGER: 'A strong feeling of displeasure.',
    ANGLE: 'The space between two lines meeting at a point.',
    APPLE: 'A round fruit grown on a tree.',
    ARISE: 'To come into existence; to get up.',
    ARMOR: 'Protective covering worn in combat.',
    ARROW: 'A projectile shot from a bow; a pointer.',
    ATTIC: 'A space just below the roof of a building.',
    AVOID: 'To keep away from.',
    AWAKE: 'No longer asleep; fully alert.',
    AWARD: 'A prize given for achievement.',
    AWARE: 'Having knowledge of something.',
    AWFUL: 'Very bad or unpleasant.',
    BEACH: 'A sandy or pebbly shore by water.',
    BEGIN: 'To start or commence.',
    BEING: 'Existence; a living creature.',
    BELOW: 'At a lower level or position.',
    BENCH: 'A long seat; a work table.',
    BLACK: 'The darkest color; the absence of light.',
    BLADE: 'The flat cutting edge of a knife.',
    BLAST: 'A strong gust of air; an explosion.',
    BLAZE: 'A large bright fire; to burn intensely.',
    BLEND: 'To mix smoothly together.',
    BLOCK: 'A solid piece of material; to obstruct.',
    BLOOD: 'The red fluid circulating in the body.',
    BLOOM: 'A flower; to produce flowers and thrive.',
    BOARD: 'A flat piece of wood; to get on a vehicle.',
    BOOST: 'To increase or improve; an upward push.',
    BOUND: 'Tied; heading toward; a leap forward.',
    BRAIN: 'The organ of thought inside the skull.',
    BRAND: 'A type of product; a mark of identity.',
    BRAVE: 'Ready to face danger; courageous.',
    BREAD: 'A baked food made from flour.',
    BREAK: 'To separate into pieces; a pause.',
    BRIEF: 'Lasting a short time; concise.',
    BRING: 'To carry or take to a place.',
    BROAD: 'Wide; covering a large range.',
    BROOK: 'A small natural stream.',
    BROWN: 'A color like wood or earth.',
    BRUSH: 'A tool with bristles; to sweep lightly.',
    BUILD: 'To construct by putting parts together.',
    BURST: 'To break open suddenly with force.',
    CABIN: 'A small wooden shelter.',
    CARRY: 'To hold and move from one place to another.',
    CATCH: 'To intercept and hold something moving.',
    CAUSE: 'The reason something happens.',
    CHAIN: 'A series of linked rings.',
    CHAIR: 'A seat with a back and legs.',
    CHAOS: 'Complete disorder and confusion.',
    CHARM: 'An attractive quality; a lucky object.',
    CHASE: 'To run after in order to catch.',
    CLEAN: 'Free from dirt; to remove dirt.',
    CLEAR: 'Easy to see through; obvious.',
    CLIMB: 'To go up using hands and feet.',
    CLOCK: 'An instrument for measuring time.',
    CLOSE: 'Near in space or time; to shut.',
    CLOUD: 'A mass of water vapor in the sky.',
    COAST: 'The land near the sea.',
    COMET: 'A celestial body with a luminous tail.',
    COUNT: 'To determine the number of something.',
    CRACK: 'A narrow break; a sharp sound.',
    CRANE: 'A large wading bird; a machine for lifting.',
    CRASH: 'A sudden loud collision.',
    CRIME: 'An act that breaks the law.',
    CROSS: 'Angry; a mark formed by two intersecting lines.',
    CROWN: 'An ornamental headdress worn by royalty.',
    CRUEL: 'Causing pain or suffering deliberately.',
    CURVE: 'A line that bends smoothly.',
    CYCLE: 'A series of events that repeat; a bicycle.',
    DANCE: 'To move rhythmically to music.',
    DEATH: 'The end of life.',
    DENSE: 'Closely packed; thick.',
    DEPTH: 'The distance from top to bottom.',
    DRAFT: 'A first version; a current of air.',
    DRAIN: 'A channel that removes liquid.',
    DRAMA: 'A play; an exciting or emotional situation.',
    DREAM: 'Images experienced during sleep; a hope.',
    DRESS: 'A garment; to put on clothes.',
    DRIFT: 'To be carried along by a current.',
    DRIVE: 'To operate a vehicle; strong determination.',
    DRONE: 'A remote-controlled aircraft; a low hum.',
    DROWN: 'To die from submersion in liquid.',
    EARLY: 'Before the usual or expected time.',
    EARTH: 'Our planet; the ground; soil.',
    EMPTY: 'Containing nothing; to remove the contents.',
    ENEMY: 'A person who is hostile to another.',
    ENTER: 'To come or go into.',
    EQUAL: 'The same in value or amount.',
    ERROR: 'A mistake; something incorrect.',
    EVENT: 'Something that happens; an occasion.',
    EXTRA: 'More than is expected or usual.',
    FABLE: 'A short story with a moral lesson.',
    FAITH: 'Strong belief; trust in something.',
    FATAL: 'Causing death; having disastrous consequences.',
    FAULT: 'A defect; responsibility for a mistake.',
    FEAST: 'A large meal; to eat lavishly.',
    FIELD: 'An open area of land; a sphere of activity.',
    FIGHT: 'A struggle or conflict.',
    FINAL: 'Last in a series; a decisive contest.',
    FIRST: 'Before all others in time or order.',
    FLAME: 'The visible part of fire.',
    FLASH: 'A brief burst of light.',
    FLESH: 'The soft muscular tissue of the body.',
    FLOAT: 'To rest or move on a liquid surface.',
    FLOOD: 'An overflow of water; an overwhelming amount.',
    FLOOR: 'The lower surface of a room.',
    FORCE: 'Physical power; to compel someone.',
    FORGE: 'To make by heating metal; to falsify.',
    FOUND: 'Past tense of find; to establish.',
    FRAME: 'A structure that supports something.',
    FRESH: 'New; recently made; not stale.',
    FRONT: 'The forward-facing side of something.',
    FROST: 'Ice crystals that form on cold surfaces.',
    FRUIT: 'The sweet product of a plant.',
    FUNNY: 'Amusing; causing laughter.',
    GHOST: 'The spirit of a dead person.',
    GIVEN: 'Accepted as true; past participle of give.',
    GLASS: 'A hard transparent material.',
    GRACE: 'Elegance of movement; a blessing.',
    GRAND: 'Large and impressive; magnificent.',
    GRANT: 'To give formally; money awarded.',
    GREAT: 'Of an extent, amount, or intensity well above average.',
    GREEN: 'The color of grass; relating to the environment.',
    GRIEF: 'Deep sorrow, especially after a loss.',
    GUARD: 'To watch over and protect.',
    GUESS: 'To estimate or suppose without certainty.',
    GUIDE: 'A person who shows the way; to direct.',
    GUILT: 'The fact of having committed an offence.',
    HAVEN: 'A place of safety or refuge.',
    HEART: 'The organ that pumps blood; the centre.',
    HEAVY: 'Of great weight; not easy to lift.',
    HINGE: 'A movable joint on which a door turns.',
    HORSE: 'A large four-legged animal used for riding.',
    HOUSE: 'A building for people to live in.',
    HUMOR: 'The quality of being amusing; mood.',
    IMAGE: 'A visual representation.',
    INNER: 'Located inside; relating to the mind.',
    ISSUE: 'An important topic; to supply officially.',
    JEWEL: 'A precious stone; something highly valued.',
    JUDGE: 'A person who decides in a court; to form an opinion.',
    KNIFE: 'A cutting instrument with a blade.',
    KNOCK: 'To strike a surface sharply.',
    KNOWN: 'Recognised and familiar.',
    LABEL: 'A tag attached to identify something.',
    LAYER: 'A sheet, quantity, or thickness over a surface.',
    LEARN: 'To acquire knowledge or skill.',
    LEAVE: 'To go away from; to allow to remain.',
    LEVEL: 'A horizontal plane; a stage of difficulty.',
    LIGHT: 'Electromagnetic radiation visible to the eye.',
    LIMIT: 'A point beyond which something cannot go.',
    LINED: 'Marked with lines; having a lining.',
    LINEN: 'Fabric woven from flax; household items.',
    LIVER: 'An organ that filters the blood.',
    LOCAL: 'Relating to a particular area.',
    LODGE: 'A small house; to present formally.',
    LOGIC: 'Reasoning conducted according to principles.',
    LOOSE: 'Not firmly fixed; free from restraint.',
    LOWER: 'Less high; to move downward.',
    LUCKY: 'Having, bringing, or resulting from good luck.',
    MAGIC: 'Using supernatural powers; wonderful.',
    MAJOR: 'Of great importance; a military rank.',
    MAKER: 'A person or thing that makes something.',
    MARCH: 'To walk in a military manner; the third month.',
    MATCH: 'A contest; a stick for lighting fire; to be equal.',
    MAYBE: 'Perhaps; possibly.',
    METAL: 'A hard shiny material such as iron.',
    MIGHT: 'Power or strength; may possibly.',
    MINOR: 'Lesser in importance; a musical key.',
    MINUS: 'Less; subtraction symbol.',
    MODEL: 'A representation; an example to follow.',
    MONEY: 'A medium of exchange.',
    MONTH: 'A period of approximately four weeks.',
    MORAL: 'Concerned with right and wrong.',
    MOUNT: 'To climb; a mountain.',
    MOUSE: 'A small rodent; a computer input device.',
    MOUTH: 'The opening in the face for eating.',
    MOVED: 'Changed position; deeply affected emotionally.',
    MUSIC: 'Sounds arranged in a pleasing way.',
    NIGHT: 'The time from sunset to sunrise.',
    NOBLE: 'Having fine personal qualities; of high rank.',
    NOISE: 'A loud or unpleasant sound.',
    NORTH: 'The direction toward the North Pole.',
    NOTED: 'Well known; past tense of note.',
    NOVEL: 'A long fictional narrative; new and original.',
    NURSE: 'A person who cares for the sick.',
    OCEAN: 'A very large expanse of sea.',
    OFFER: 'To present for acceptance.',
    ORDER: 'An arrangement; an instruction; to request.',
    OTHER: 'Used to refer to different people or things.',
    OUGHT: 'Used to express duty or advisability.',
    OUTER: 'Outside; further from the center.',
    OVERT: 'Done openly; not concealed.',
    PAINT: 'A coloured substance applied to a surface.',
    PANIC: 'Sudden uncontrollable fear.',
    PAPER: 'A thin material used for writing.',
    PATCH: 'A piece used to cover a hole; a small area.',
    PAUSE: 'A temporary stop.',
    PEACE: 'Freedom from disturbance; quiet.',
    PEARL: 'A hard lustrous sphere formed inside a shell.',
    PEDAL: 'A foot-operated lever.',
    PHASE: 'A stage in a process.',
    PILOT: 'A person who flies an aircraft.',
    PITCH: 'The steepness of a slope; a thrown ball.',
    PIXEL: 'The smallest element in a digital image.',
    PLACE: 'A particular position or area.',
    PLAIN: 'Not decorated; easy to understand.',
    PLANE: 'A flat surface; an aircraft.',
    PLANT: 'A living organism that grows in soil.',
    PLATE: 'A flat dish; a flat sheet of material.',
    PLAZA: 'An open public area in a city.',
    POINT: 'A precise location; a dot; a purpose.',
    POLAR: 'Relating to the poles of the Earth.',
    POWER: 'The ability to do something; energy.',
    PRESS: 'To push firmly; newspapers collectively.',
    PRICE: 'The amount required to buy something.',
    PRIDE: 'A feeling of deep satisfaction in oneself.',
    PRIME: 'Most important; of the best quality.',
    PRIZE: 'Something given as a reward for winning.',
    PROBE: 'To investigate thoroughly; a device used to explore.',
    PRONE: 'Likely to do something; lying face down.',
    PROOF: 'Evidence that something is true.',
    PROSE: 'Ordinary written language, not poetry.',
    PROUD: 'Feeling deep satisfaction in achievement.',
    PROVE: 'To demonstrate the truth of something.',
    PROWL: 'To move stealthily.',
    PROXY: 'A person acting on behalf of another.',
    PULSE: 'The rhythmic beating of the heart.',
    PUNCH: 'A blow with the fist; a drink.',
    PUPIL: 'A student; the dark opening in the eye.',
    PURSE: 'A small bag for money.',
    QUEEN: 'A female ruler; the most powerful chess piece.',
    QUEST: 'A long search for something.',
    QUICK: 'Moving fast; done with speed.',
    QUIET: 'Making little or no noise.',
    QUOTE: 'To repeat someone else\'s words.',
    RAISE: 'To lift upward; to bring up.',
    RALLY: 'To come together for a common purpose.',
    RANGE: 'The area of variation; a series.',
    RAPID: 'Happening in a short time; fast.',
    REACH: 'To stretch toward something; to arrive.',
    READY: 'In a suitable state for action.',
    REALM: 'A kingdom; a field of activity.',
    REFER: 'To direct attention to; to consult.',
    REIGN: 'The period of a ruler\'s power.',
    RELAX: 'To become less tense or anxious.',
    REPAY: 'To pay back; to do something in return.',
    RIDER: 'A person who rides a horse or bicycle.',
    RIDGE: 'A long narrow hilltop.',
    RISKY: 'Full of the possibility of danger.',
    RIVAL: 'A person competing with another.',
    RIVER: 'A large natural stream of water.',
    ROBIN: 'A small bird with a red breast.',
    ROCKY: 'Full of or like rocks; unsteady.',
    ROMAN: 'Relating to ancient Rome.',
    ROOST: 'A place where birds rest; to settle to rest.',
    ROUGH: 'Having an uneven surface; not gentle.',
    ROUND: 'Circular in shape; a stage in a contest.',
    ROUTE: 'A way taken from one place to another.',
    ROYAL: 'Relating to or belonging to a king or queen.',
    RURAL: 'Relating to the countryside.',
    SADLY: 'In a sad manner.',
    SAINT: 'A holy person recognised by a church.',
    SALAD: 'A mixture of raw vegetables.',
    SAUCE: 'A liquid condiment served with food.',
    SCALE: 'A range of levels; to climb.',
    SCENT: 'A pleasant smell.',
    SCENE: 'A place where something occurs; part of a play.',
    SCORE: 'The number of points in a game.',
    SCOUT: 'A person sent ahead to gather information.',
    SEIZE: 'To take hold of suddenly.',
    SENSE: 'A faculty such as sight or hearing; judgement.',
    SERVE: 'To work for; to provide food.',
    SHADE: 'Comparative darkness; a colour variant.',
    SHAKY: 'Trembling; not stable.',
    SHALL: 'Used to indicate future action or obligation.',
    SHAME: 'A painful feeling of humiliation.',
    SHAPE: 'The external form or outline of something.',
    SHARE: 'A portion given to each; to use jointly.',
    SHARP: 'Having a thin edge; sudden and intense.',
    SHELF: 'A flat surface for storing objects.',
    SHELL: 'The hard outer covering of an egg or nut.',
    SHIFT: 'A change; a period of work.',
    SHINE: 'To give out light; to excel.',
    SHIRT: 'A garment for the upper body.',
    SHOCK: 'A sudden disturbing surprise.',
    SHORE: 'The land along the edge of water.',
    SHORT: 'Of small length or duration.',
    SHOUT: 'To call out loudly.',
    SIGHT: 'The ability to see; something seen.',
    SKILL: 'The ability to do something well.',
    SKULL: 'The bony structure of the head.',
    SLANT: 'A slope or diagonal direction.',
    SLASH: 'A cut made by a sweeping stroke.',
    SLEEP: 'A natural state of rest.',
    SLICE: 'A thin flat piece cut from something.',
    SLIDE: 'To move smoothly along a surface.',
    SLOPE: 'A surface of which one end is higher.',
    SMART: 'Intelligent; neat and stylish.',
    SMELL: 'The faculty of perceiving odours.',
    SMILE: 'A facial expression showing happiness.',
    SMOKE: 'A visible gas produced by burning.',
    SOLAR: 'Relating to the sun.',
    SOLID: 'Firm and stable; not hollow.',
    SOLVE: 'To find the answer to a problem.',
    SOUND: 'Vibrations that are heard; to make a noise.',
    SOUTH: 'The direction toward the South Pole.',
    SPACE: 'A continuous area; the universe beyond Earth.',
    SPARE: 'Additional; to save from harm.',
    SPARK: 'A small fiery particle; a flash of light.',
    SPEAK: 'To say words aloud.',
    SPEED: 'Rapid movement; the rate of movement.',
    SPEND: 'To pay out money; to pass time.',
    SPILL: 'To accidentally flow over the edge.',
    SPINE: 'The backbone; a sharp rigid point.',
    SPITE: 'A desire to hurt or annoy.',
    SPLIT: 'To divide into parts.',
    SPORE: 'A reproductive cell of a fungus or plant.',
    SPORT: 'A physical activity or game.',
    SPRAY: 'Liquid dispersed in fine droplets.',
    SQUAD: 'A small group of people.',
    STACK: 'A pile of objects; to arrange in a pile.',
    STAGE: 'A raised platform; a phase of development.',
    STAIN: 'A coloured mark; to mark with a stain.',
    STAKE: 'A strong post; something wagered.',
    STALE: 'No longer fresh.',
    STALL: 'A stand in a market; to delay.',
    STAND: 'To be upright on feet; a structure.',
    STARE: 'To look fixedly at.',
    START: 'The beginning; to begin.',
    STATE: 'The condition of something; a nation.',
    STAYS: 'Remains in a place; supports.',
    STEER: 'To guide a vehicle; a young bull.',
    STERN: 'Strict and serious; the back of a ship.',
    STICK: 'A thin rod; to attach with adhesive.',
    STILL: 'Not moving; up to the present time.',
    STING: 'A wound from a sharp organ; to cause sharp pain.',
    STONE: 'Hard solid mineral matter; a gem.',
    STOOD: 'Past tense of stand.',
    STORE: 'A shop; to keep for future use.',
    STORM: 'A violent weather disturbance.',
    STORY: 'An account of events; a floor of a building.',
    STOVE: 'A cooking or heating appliance.',
    STUDY: 'The act of learning; a room for reading.',
    STUFF: 'Material; to fill tightly.',
    STUNT: 'A daring feat; to hinder growth.',
    SUNNY: 'Bright with sunlight.',
    SUPER: 'Excellent; above the usual.',
    SURGE: 'A sudden powerful rush.',
    SWEET: 'Having the taste of sugar; pleasant.',
    SWEPT: 'Past tense of sweep.',
    SWORD: 'A weapon with a long metal blade.',
    TABLE: 'A flat-topped furniture piece; to propose.',
    TASTE: 'The faculty of perceiving flavour.',
    TEACH: 'To impart knowledge or skill.',
    TEARS: 'Drops of liquid from the eyes.',
    TENOR: 'A singing voice between bass and alto.',
    TENSE: 'Stretched tight; a verb form indicating time.',
    THEIR: 'Belonging to them.',
    THEME: 'A subject of discussion; a recurring melody.',
    THERE: 'In, at, or to that place.',
    THICK: 'Of great depth; dense.',
    THING: 'An object, fact, or idea.',
    THINK: 'To have a particular opinion or belief.',
    THORN: 'A sharp pointed growth on a plant.',
    THREE: 'The number 3.',
    THREW: 'Past tense of throw.',
    THROW: 'To propel through the air.',
    THUMB: 'The short thick digit of the hand.',
    TIDAL: 'Relating to tides.',
    TIGER: 'A large striped wild cat.',
    TIGHT: 'Held firmly; not loose.',
    TIRED: 'In need of rest or sleep.',
    TITLE: 'A name identifying something; a championship.',
    TODAY: 'On or during this present day.',
    TOKEN: 'A thing representing something else.',
    TOTAL: 'The whole number; comprising everything.',
    TOUCH: 'To put a hand on; to make contact.',
    TOUGH: 'Strong; not easily broken.',
    TOWER: 'A tall narrow building.',
    TOXIC: 'Poisonous.',
    TRACE: 'A mark left behind; to follow.',
    TRACK: 'A path; to follow the course of.',
    TRADE: 'The buying and selling of goods.',
    TRAIL: 'A path through rough ground.',
    TRAIN: 'A series of railway carriages; to teach.',
    TRAIT: 'A distinguishing quality or characteristic.',
    TRAMP: 'A person who travels on foot; to walk heavily.',
    TREND: 'A general direction of change.',
    TRIAL: 'A test; a legal examination.',
    TRICK: 'A cunning act intended to deceive.',
    TRILL: 'A rapid alternation of two musical notes.',
    TROOP: 'A group of people or animals.',
    TROVE: 'A store of valuable things.',
    TRUCK: 'A large motor vehicle for goods.',
    TRULY: 'In a truthful way; genuinely.',
    TRUMP: 'To outdo; a playing card of a leading suit.',
    TRUNK: 'The main stem of a tree; a large box.',
    TRUTH: 'The quality of being true.',
    TUMOR: 'An abnormal growth of tissue.',
    TUNER: 'A device for receiving radio signals.',
    TWIRL: 'To spin quickly.',
    TWIST: 'To turn and wind together.',
    TYPED: 'Written using a keyboard.',
    ULTRA: 'Extreme; going beyond.',
    UNCLE: 'The brother of one\'s parent.',
    UNDER: 'Below; not reaching the standard.',
    UNFIT: 'Not suitable; not in good health.',
    UNION: 'The act of joining together.',
    UNTIL: 'Up to the point in time when.',
    UPPER: 'Higher in place or rank.',
    UPSET: 'To make unhappy; a surprising result.',
    UTTER: 'Complete; to speak.',
    VALID: 'Logically sound; legally acceptable.',
    VALUE: 'The importance or worth of something.',
    VALVE: 'A device controlling flow.',
    VERSE: 'A line of poetry; a passage of scripture.',
    VIGOR: 'Physical strength and energy.',
    VIRAL: 'Spreading quickly like a virus.',
    VISOR: 'A screen protecting the eyes.',
    VITAL: 'Absolutely necessary; relating to life.',
    VIVID: 'Intensely bright or strong.',
    VOCAL: 'Relating to the voice; outspoken.',
    VOICE: 'Sound produced in speech or song.',
    VOTER: 'A person who votes.',
    VOWED: 'Made a solemn promise.',
    WAKEN: 'To cause to wake up.',
    WATCH: 'To look at; a small timepiece.',
    WATER: 'A clear liquid essential for life.',
    WEAVE: 'To interlace threads to make fabric.',
    WEDGE: 'A piece of material thick at one end.',
    WEIGH: 'To determine how heavy something is.',
    WEIRD: 'Suggesting something supernatural; strange.',
    WHELP: 'A young dog or other carnivore.',
    WHERE: 'In or to what place.',
    WHILE: 'During the time that.',
    WHITE: 'The lightest colour; the colour of snow.',
    WHOLE: 'Complete; not divided.',
    WHOSE: 'Belonging to or associated with which person.',
    WIDEN: 'To make or become wider.',
    YIELD: 'To produce; to give way.',
    YOUNG: 'Having lived for only a short time.',
    YOURS: 'Belonging to you.',
    ZONAL: 'Relating to a zone or zones.',
    // 6-letter
    BATTLE: 'A fight between armed forces.',
    BEAUTY: 'A quality giving pleasure to the senses.',
    BEFORE: 'Earlier in time; in front of.',
    BORDER: 'A boundary line; an edge.',
    BRIDGE: 'A structure spanning a gap; to connect.',
    BRIGHT: 'Emitting or reflecting much light.',
    BROKEN: 'Past participle of break; not functioning.',
    CASTLE: 'A large medieval fortified building.',
    CHANGE: 'To make or become different.',
    CIRCLE: 'A perfectly round plane figure.',
    CLEVER: 'Quick to understand; ingenious.',
    COMBAT: 'Fighting between armed forces.',
    CORNER: 'A place where two sides or edges meet.',
    CREATE: 'To bring something into existence.',
    CRISIS: 'A time of intense difficulty or danger.',
    DAMAGE: 'Physical harm impairing value or usefulness.',
    DANGER: 'The possibility of suffering harm.',
    DEBATE: 'A formal argument; to argue about.',
    DEFINE: 'To state the exact meaning of a word.',
    DESERT: 'A barren dry region; to abandon.',
    DETAIL: 'A small individual fact or element.',
    DIRECT: 'Going straight; to manage or guide.',
    DOMAIN: 'An area of territory or knowledge.',
    DOUBLE: 'Twice as much; consisting of two.',
    DRIVEN: 'Past participle of drive; highly motivated.',
    DURING: 'Throughout the course of.',
    EMERGE: 'To come into view; to become known.',
    EMPIRE: 'An extensive group under one authority.',
    ENERGY: 'The capacity for activity; power.',
    ESCAPE: 'To break free; a means of getting away.',
    EVOLVE: 'To develop gradually over time.',
    EXPAND: 'To make or become larger or more extensive.',
    EXPECT: 'To regard as likely; to anticipate.',
    EXPOSE: 'To uncover; to make known.',
    FACTOR: 'Something contributing to a result.',
    FALLEN: 'Past participle of fall; having dropped.',
    FAMOUS: 'Known by many people; celebrated.',
    FIERCE: 'Having a violent and aggressive nature.',
    FIGURE: 'A number; a person; a shape.',
    FILTER: 'A device removing impurities.',
    FINGER: 'Each of the five digits of the hand.',
    FINISH: 'To bring or come to an end.',
    FLIGHT: 'The action of flying; fleeing danger.',
    FLOWER: 'The seed-bearing part of a plant.',
    FOLLOW: 'To go after; to come next in order.',
    FOREST: 'A large area covered with trees.',
    FORGET: 'To fail to remember.',
    FROZEN: 'Past participle of freeze; very cold.',
    FUTURE: 'Time that is yet to come.',
    GENTLE: 'Mild or kind in manner.',
    GROWTH: 'The process of increasing in size.',
    HAMMER: 'A tool for striking nails.',
    HEAVEN: 'A place of great happiness; the sky.',
    HIDDEN: 'Not visible; concealed.',
    HONEST: 'Free from deceit; truthful.',
    IMPACT: 'The force of a collision; a strong effect.',
    INSECT: 'A small arthropod with six legs.',
    ISLAND: 'A piece of land surrounded by water.',
    JUNGLE: 'A dense tropical forest.',
    LAUNCH: 'To set in motion; to begin an enterprise.',
    LEGEND: 'A traditional story; a very famous person.',
    LIVELY: 'Full of life and energy.',
    LIZARD: 'A reptile with a long body and four legs.',
    LONELY: 'Sad from lack of company.',
    MARVEL: 'Something wonderful; to feel amazed.',
    MEADOW: 'An area of grassland.',
    MIRROR: 'A reflective surface showing an image.',
    MORTAL: 'Subject to death; causing death.',
    MOTHER: 'A female parent.',
    MOTION: 'Movement; a formal proposal.',
    MUSCLE: 'A tissue producing movement in the body.',
    NARROW: 'Of small width; limited in outlook.',
    NATURE: 'The physical world; an inherent quality.',
    NEEDLE: 'A thin pointed instrument for sewing.',
    NORMAL: 'Conforming to a standard; usual.',
    NOTICE: 'To become aware of; a written announcement.',
    OBTAIN: 'To get possession of something.',
    ORANGE: 'A round citrus fruit; a warm colour.',
    ORIGIN: 'The starting point or source.',
    OXYGEN: 'A colourless gas essential for life.',
    PALACE: 'A large and impressive residence.',
    PARENT: 'A father or mother.',
    PEOPLE: 'Human beings in general.',
    PERIOD: 'A length of time; a punctuation mark.',
    PERMIT: 'To allow; an official licence.',
    PLANET: 'A celestial body orbiting a star.',
    POCKET: 'A small bag sewn into clothing.',
    POETRY: 'Literary work expressed in verse.',
    POLITE: 'Respectful and considerate in manner.',
    PORTAL: 'A doorway or gate.',
    PRETTY: 'Pleasing to look at; moderately.',
    PRISON: 'A building where criminals are confined.',
    PROFIT: 'A financial gain after costs.',
    PUZZLE: 'A problem designed to test ingenuity.',
    RABBIT: 'A small mammal with long ears.',
    RANDOM: 'Made or done without a pattern.',
    RESCUE: 'To save from danger or difficulty.',
    REVEAL: 'To make known; to uncover.',
    REWARD: 'Something given in return for service.',
    RIDDLE: 'A puzzling question; to pierce with holes.',
    ROCKET: 'A vehicle propelled by rocket engines.',
    SACRED: 'Regarded with great respect and reverence.',
    SAMPLE: 'A small part taken as representative.',
    SAVAGE: 'Fierce and violent; uncivilised.',
    SEARCH: 'To look carefully for something.',
    SECRET: 'Something deliberately kept hidden.',
    SECURE: 'Fixed firmly; free from danger.',
    SELECT: 'Carefully chosen; to choose from a group.',
    SETTLE: 'To resolve; to establish in a place.',
    SIGNAL: 'A sign conveying information.',
    SILVER: 'A precious white metallic element.',
    SIMPLE: 'Easy to understand; not complicated.',
    SINGLE: 'Only one; not married.',
    SKETCH: 'A rough drawing; to make a quick drawing.',
    SLOWLY: 'At a slow pace.',
    SMOOTH: 'Having an even surface; flowing.',
    SOCIAL: 'Relating to society; friendly.',
    SOLVED: 'Past tense of solve; found the answer.',
    SORROW: 'Distress caused by loss; sadness.',
    SOURCE: 'A place from which something originates.',
    SPIRAL: 'A curve winding around a central point.',
    SPRING: 'The season after winter; a coil.',
    STATUE: 'A carved or cast figure.',
    STEADY: 'Firmly fixed; regular and even.',
    STOLEN: 'Past participle of steal.',
    STREAM: 'A small river; a continuous flow.',
    STREET: 'A road in a city or town.',
    STRICT: 'Demanding exact compliance with rules.',
    STRIKE: 'To hit; to refuse to work in protest.',
    STRING: 'A thin cord; a series of things.',
    STRONG: 'Having great physical power.',
    STUPID: 'Lacking intelligence or common sense.',
    SUBTLE: 'So delicate as to be difficult to detect.',
    SUDDEN: 'Occurring unexpectedly.',
    SUMMER: 'The warmest season of the year.',
    SUMMIT: 'The highest point; a meeting of leaders.',
    SUNSET: 'When the sun disappears below the horizon.',
    SUPPLY: 'A stock of something; to provide.',
    SURELY: 'Without doubt.',
    SURVEY: 'To examine thoroughly; an investigation.',
    SYMBOL: 'A mark representing something else.',
    TACKLE: 'Equipment for a task; to deal with firmly.',
    TALENT: 'A natural aptitude or skill.',
    TARGET: 'A person or thing aimed at.',
    TENDER: 'Gentle and kind; soft and delicate.',
    TERROR: 'Extreme fear; the use of terror.',
    THEORY: 'A system of ideas explaining something.',
    THIRST: 'A need to drink; a strong desire.',
    THREAT: 'A statement of intention to cause harm.',
    THRIVE: 'To grow or develop well and vigorously.',
    TIMBER: 'Wood prepared for building.',
    TONGUE: 'The muscular organ in the mouth.',
    TOWARD: 'In the direction of.',
    TRAVEL: 'To make a journey to a place.',
    TRIPLE: 'Consisting of three parts; three times as much.',
    TROPHY: 'A prize won in competition.',
    TUMBLE: 'To fall suddenly; to roll over and over.',
    TUNNEL: 'An underground passage.',
    UNIQUE: 'Unlike anything else; one of a kind.',
    UNITED: 'Joined together for a common purpose.',
    UPDATE: 'To make current; an act of updating.',
    USEFUL: 'Able to be used for a practical purpose.',
    VALLEY: 'A low area between hills or mountains.',
    VANISH: 'To disappear suddenly and completely.',
    VELVET: 'A soft fabric with a thick short pile.',
    VESSEL: 'A ship or large boat; a container.',
    VICTIM: 'A person harmed by another.',
    VIOLET: 'A bluish-purple colour; a small plant.',
    VISION: 'The ability to see; a mental image.',
    VOLUME: 'The amount of space; the loudness of sound.',
    WANDER: 'To walk without a fixed destination.',
    WARMTH: 'The quality of being warm.',
    WEALTH: 'Abundance of money or possessions.',
    WEIGHT: 'The heaviness of something.',
    WINDOW: 'An opening in a wall fitted with glass.',
    WINTER: 'The coldest season of the year.',
    WISDOM: 'Experience, knowledge, and good judgement.',
    WONDER: 'Surprise and admiration; to feel curious.',
    YELLOW: 'The colour of lemons or sunshine.',
    ZIPPER: 'A fastener with interlocking teeth.',
    // 7-letter
    ABSENCE: 'The state of being away from a place.',
    ACHIEVE: 'To successfully reach a desired goal.',
    ANCIENT: 'Belonging to the very distant past.',
    ANXIETY: 'A feeling of worry and nervousness.',
    BLOSSOM: 'A flower; to develop fully.',
    CAPTAIN: 'The commander of a ship or team.',
    CAPTURE: 'To catch and hold; a catch.',
    CENTURY: 'A period of one hundred years.',
    CHAPTER: 'A main division of a book.',
    CLIMATE: 'The weather conditions of a region.',
    CLUSTER: 'A group of similar things close together.',
    COLLECT: 'To gather things together.',
    COMFORT: 'Ease and freedom from pain; to console.',
    COMPLEX: 'Consisting of many interrelated parts.',
    CONCERN: 'Worry; to be relevant or important to.',
    CONNECT: 'To join or link together.',
    CONTAIN: 'To have within; to hold back.',
    CONTROL: 'The power to regulate or command.',
    COURAGE: 'The ability to face fear or difficulty.',
    CURRENT: 'Happening now; a flow of water or air.',
    DECLINE: 'To become smaller; to refuse politely.',
    DELIVER: 'To bring goods; to rescue from danger.',
    DESTROY: 'To cause so much damage as to ruin.',
    DEVELOP: 'To grow or cause to grow and improve.',
    DISPLAY: 'An exhibition; to show clearly.',
    DISTANT: 'Far away in space or time.',
    DOLPHIN: 'An intelligent marine mammal.',
    DYNAMIC: 'Characterised by constant change and energy.',
    ELEMENT: 'A basic component; a chemical substance.',
    EMOTION: 'A feeling such as happiness or fear.',
    ENHANCE: 'To improve the quality or value of.',
    ETERNAL: 'Lasting forever; without end.',
    EVIDENT: 'Plain or obvious; clearly seen.',
    EXAMPLE: 'A representative instance of a type.',
    EXPLODE: 'To burst violently outward.',
    EXPLORE: 'To investigate unknown regions.',
    EXPRESS: 'To convey in words; a fast train.',
    EXTREME: 'Very great or severe.',
    FANTASY: 'Imagination; a genre involving magic.',
    FEATURE: 'A distinctive aspect; to include prominently.',
    FICTION: 'Invented stories; not real events.',
    FLUTTER: 'To move lightly and rapidly.',
    FORWARD: 'Toward the front; ahead in time.',
    FRAGILE: 'Easily broken or damaged.',
    FREEDOM: 'The power to act without restriction.',
    GENERAL: 'Affecting all; not specific; a military rank.',
    GENUINE: 'Truly what it is claimed to be; sincere.',
    GLIMPSE: 'A brief or partial view of something.',
    GLACIER: 'A slowly moving mass of ice.',
    GRAVITY: 'The force pulling objects toward the Earth.',
    HARMONY: 'Agreement; pleasing combination of sounds.',
    HARVEST: 'The process of gathering mature crops.',
    HEALTHY: 'In good physical or mental condition.',
    HISTORY: 'The study of past events.',
    HORIZON: 'The line where sky and earth appear to meet.',
    HOSTILE: 'Unfriendly; showing opposition.',
    IMAGINE: 'To form a mental image or concept.',
    IMPROVE: 'To make or become better.',
    INSPIRE: 'To fill with the ability to create.',
    INTENSE: 'Of extreme force, degree, or strength.',
    JOURNEY: 'An act of travelling from one place to another.',
    JUSTICE: 'Just behaviour or treatment.',
    KNOWING: 'Having knowledge; deliberate.',
    MACHINE: 'An apparatus using mechanical power.',
    MIRACLE: 'An extraordinary and welcome event.',
    MONSTER: 'An imaginary frightening creature.',
    MORNING: 'The early part of the day.',
    MYSTERY: 'Something unexplained or secret.',
    NETWORK: 'A system of connected things or people.',
    OBVIOUS: 'Easily perceived; clear.',
    OCTOPUS: 'A sea creature with eight arms.',
    OUTLINE: 'A line around a shape; a summary.',
    PACKAGE: 'An object or set of objects wrapped up.',
    PATTERN: 'A repeated design; a regular arrangement.',
    PERFORM: 'To carry out an action; to entertain.',
    PHANTOM: 'A ghost; an apparition.',
    PILGRIM: 'A person who journeys to a sacred place.',
    PIONEER: 'A person who develops new ideas.',
    POPULAR: 'Liked or enjoyed by many people.',
    POSSESS: 'To have as belonging to one; to own.',
    POTTERY: 'Ceramic ware made by a potter.',
    PREVENT: 'To keep something from happening.',
    PROBLEM: 'A matter involving difficulty.',
    PROCESS: 'A series of actions producing a result.',
    PROGRAM: 'A plan of events; a computer application.',
    PURPOSE: 'The reason for which something is done.',
    REALITY: 'The state of things as they actually exist.',
    RECEIVE: 'To be given or presented with something.',
    REFLECT: 'To throw back light; to think deeply.',
    REPLACE: 'To take the position or role of.',
    RESOLVE: 'To settle a problem; firm determination.',
    RESPECT: 'Admiration for someone\'s qualities.',
    RESTORE: 'To bring back to a former condition.',
    RETREAT: 'To withdraw; a quiet and peaceful place.',
    ROUTINE: 'A regular sequence of actions.',
    SCRATCH: 'A mark made by a sharp point; to scrape.',
    SERIOUS: 'Demanding careful thought or action.',
    SILENCE: 'Complete absence of sound.',
    SOLDIER: 'A person who serves in an army.',
    SPECIES: 'A group of living organisms.',
    SQUEEZE: 'To press firmly; to extract by pressing.',
    STADIUM: 'A sports arena with tiers of seating.',
    STATION: 'A stopping place; a place of employment.',
    STRANGE: 'Unusual or surprising; unfamiliar.',
    STUDENT: 'A person who is studying.',
    SUCCESS: 'The achievement of an aim or goal.',
    SUGGEST: 'To put forward an idea for consideration.',
    SUPPORT: 'To bear the weight of; to give assistance.',
    SURFACE: 'The outside or uppermost layer.',
    SURVIVE: 'To continue to live through difficulty.',
    TEACHER: 'A person who teaches or instructs.',
    TEXTURE: 'The feel, appearance, or consistency of a surface.',
    THUNDER: 'A loud rumbling sound during a storm.',
    TONIGHT: 'During the present night.',
    TRAGEDY: 'An event causing great suffering.',
    TRIUMPH: 'A great victory or achievement.',
    TROUBLE: 'Difficulty or problems.',
    TYPICAL: 'Having the qualities expected of a type.',
    UNUSUAL: 'Not habitually done; remarkable.',
    VENTURE: 'A risky undertaking; to dare.',
    VIBRANT: 'Full of energy and life.',
    VILLAGE: 'A small community in a rural area.',
    VISIBLE: 'Able to be seen by the eye.',
    WARNING: 'A statement that danger is ahead.',
    WARRIOR: 'A brave or experienced fighter.',
    WEBSITE: 'A set of pages on the internet.',
    WELCOME: 'To greet warmly; expressing gladness.',
    WITNESS: 'A person who sees an event.',
    WORSHIP: 'To show reverence for a deity.',
    WRITING: 'The activity or skill of writing.',
};

// Return definition for a word, or null if not in the map
// Prefers WORDS_5_DEFINITIONS (definitions.js) over the inline fallback
function getDefinition(word) {
    const key = String(word).toUpperCase();
    if (typeof WORDS_5_DEFINITIONS !== 'undefined' && WORDS_5_DEFINITIONS[key]) {
        return WORDS_5_DEFINITIONS[key];
    }
    return DEFINITIONS[key] || null;
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
