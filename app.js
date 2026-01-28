// ============================================
// WORDLE CLONE - V3 with Dynamic Rows, Free Cell Editing, and Streak
// ============================================

// ============================================
// GLOBAL STATE & CONFIGURATION
// ============================================

let currentWordLength = 5;
let words = [];
let allowedWords = [];
let targetWord = '';

// Game state - now with dynamic rows and cursor
let gameState = {
    guesses: [],
    currentRow: 0,
    currentRowLetters: [],  // Array instead of string for cursor editing
    currentCellIndex: 0,    // Cursor position in current row
    gameOver: false,
    won: false,
    rowCount: 6            // Dynamic row count (was const MAX_GUESSES)
};

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
    warnRuledOut: true
};

// ============================================
// INITIALIZATION
// ============================================

document.addEventListener('DOMContentLoaded', async () => {
    await loadWordLists();
    loadGameState();
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
    try {
        const [wordsResponse, allowedResponse] = await Promise.all([
            fetch(`words-${currentWordLength}.json`),
            fetch(`allowed-${currentWordLength}.json`)
        ]);
        
        words = await wordsResponse.json();
        allowedWords = await allowedResponse.json();
        
        if (!targetWord || targetWord.length !== currentWordLength) {
            targetWord = words[Math.floor(Math.random() * words.length)].toUpperCase();
        }
    } catch (error) {
        console.error('Error loading word lists:', error);
        showMessage('Failed to load word lists. Please refresh.');
    }
}

// ============================================
// FEATURE: FREE CELL EDITING - CURSOR MODEL
// ============================================

function moveCursor(newIndex) {
    if (gameState.gameOver) return;
    
    gameState.currentCellIndex = Math.max(0, Math.min(newIndex, currentWordLength - 1));
    updateBoard();
}

function handleCellClick(rowIndex, cellIndex) {
    // Only allow editing the current active row
    if (rowIndex !== gameState.currentRow || gameState.gameOver) {
        return;
    }
    
    gameState.currentCellIndex = cellIndex;
    updateBoard();
}

function handleLetterInput(letter) {
    if (gameState.gameOver) return;
    
    const upperLetter = letter.toUpperCase();
    if (!/^[A-Z]$/.test(upperLetter)) return;
    
    // Write letter at current cursor position
    gameState.currentRowLetters[gameState.currentCellIndex] = upperLetter;
    
    // Advance cursor (stop at end)
    if (gameState.currentCellIndex < currentWordLength - 1) {
        gameState.currentCellIndex++;
    }
    
    updateBoard();
    saveGameState();
}

function handleBackspace() {
    if (gameState.gameOver) return;
    
    const currentCell = gameState.currentRowLetters[gameState.currentCellIndex];
    
    if (currentCell) {
        // Current cell has a letter: clear it and stay
        gameState.currentRowLetters[gameState.currentCellIndex] = '';
    } else if (gameState.currentCellIndex > 0) {
        // Current cell empty: move left and clear that cell
        gameState.currentCellIndex--;
        gameState.currentRowLetters[gameState.currentCellIndex] = '';
    }
    
    updateBoard();
    saveGameState();
}

function handleDelete() {
    if (gameState.gameOver) return;
    
    // Clear current cell without moving
    gameState.currentRowLetters[gameState.currentCellIndex] = '';
    updateBoard();
    saveGameState();
}

function handleArrowLeft() {
    if (gameState.gameOver) return;
    moveCursor(gameState.currentCellIndex - 1);
}

function handleArrowRight() {
    if (gameState.gameOver) return;
    moveCursor(gameState.currentCellIndex + 1);
}

// ============================================
// BOARD RENDERING
// ============================================

function updateBoard() {
    const board = document.getElementById('game-board');
    board.innerHTML = '';
    
    // Use dynamic row count
    for (let row = 0; row < gameState.rowCount; row++) {
        const rowDiv = document.createElement('div');
        rowDiv.className = 'row';
        
        for (let col = 0; col < currentWordLength; col++) {
            const tile = document.createElement('div');
            tile.className = 'tile';
            
            // Determine tile content
            let letter = '';
            if (row < gameState.guesses.length) {
                // Submitted guess
                letter = gameState.guesses[row][col] || '';
                tile.classList.add('submitted');
            } else if (row === gameState.currentRow) {
                // Current active row
                letter = gameState.currentRowLetters[col] || '';
                
                // Highlight active cell
                if (col === gameState.currentCellIndex && !gameState.gameOver) {
                    tile.classList.add('active-cell');
                }
            }
            
            tile.textContent = letter;
            
            // Add click handler for active row
            if (row === gameState.currentRow && !gameState.gameOver) {
                tile.addEventListener('click', () => handleCellClick(row, col));
            }
            
            // Apply color classes for submitted guesses
            if (row < gameState.guesses.length) {
                const guess = gameState.guesses[row];
                const result = checkGuess(guess);
                tile.classList.add(result[col]);
            }
            
            rowDiv.appendChild(tile);
        }
        
        board.appendChild(rowDiv);
    }
    
    // Update keyboard colors based on current guesses
    updateKeyboard();
}

function checkGuess(guess) {
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

async function submitGuess() {
    if (gameState.gameOver) return;
    
    // Check if row is fully filled
    const currentGuess = gameState.currentRowLetters.join('');
    if (currentGuess.length !== currentWordLength) {
        showMessage('Not enough letters');
        shakeRow();
        return;
    }
    
    // Validate word
    if (!allowedWords.map(w => w.toUpperCase()).includes(currentGuess)) {
        showMessage('Not in word list');
        shakeRow();
        return;
    }
    
    // Check ruled out letters if warning enabled
    if (settings.warnRuledOut && hasRuledOutLetters(currentGuess)) {
        const confirmed = await showConfirmDialog(
            'This guess contains letters you\'ve already ruled out. Submit anyway?'
        );
        if (!confirmed) return;
    }
    
    // Add guess to history
    gameState.guesses.push(currentGuess);
    
    // Animate reveal
    await animateReveal();
    
    // Check win/loss
    if (currentGuess === targetWord) {
        handleWin();
    } else if (gameState.currentRow >= gameState.rowCount - 1) {
        handleLoss();
    } else {
        // Move to next row
        gameState.currentRow++;
        gameState.currentRowLetters = Array(currentWordLength).fill('');
        gameState.currentCellIndex = 0;
    }
    
    updateBoard();
    updateRowControls();
    saveGameState();
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
    
    // Fire confetti immediately
    setTimeout(() => {
        showConfetti();
    }, 600);
    
    setTimeout(() => {
        showMessage(`🎉 You won! The word was ${targetWord}`, 3000);
        setTimeout(() => showStatsModal(), 500);
    }, 1500);
}

function handleLoss() {
    gameState.gameOver = true;
    gameState.won = false;
    
    // Update stats
    stats.gamesPlayed++;
    stats.currentStreak = 0;
    
    saveStats();
    updateStreakDisplay();
    
    setTimeout(() => {
        showMessage(`Game over! The word was ${targetWord}`, 3000);
        setTimeout(() => showStatsModal(), 500);
    }, 1500);
}

function hasRuledOutLetters(guess) {
    const ruledOut = getRuledOutLetters();
    return guess.split('').some(letter => ruledOut.has(letter));
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
    
    // Only return letters that are truly absent (never correct or present)
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
    if (gameState.rowCount >= 12) {
        showMessage('Maximum 12 rows');
        return;
    }
    
    gameState.rowCount++;
    updateBoard();
    updateRowControls();
    saveGameState();
    showMessage('➕ Row added');
}

function removeRow() {
    // Minimum: max(3, currentRow + 1)
    const minRows = Math.max(3, gameState.currentRow + 1);
    
    if (gameState.rowCount <= minRows) {
        showMessage(`Cannot remove: need at least ${minRows} rows`);
        return;
    }
    
    // Check if removing would delete submitted guesses
    if (gameState.guesses.length >= gameState.rowCount) {
        showMessage('Cannot remove: would delete guesses');
        return;
    }
    
    gameState.rowCount--;
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
    const minRows = Math.max(3, gameState.currentRow + 1);
    removeBtn.disabled = gameState.rowCount <= minRows || 
                        gameState.guesses.length >= gameState.rowCount ||
                        gameState.gameOver;
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
    // Reset game state
    gameState = {
        guesses: [],
        currentRow: 0,
        currentRowLetters: Array(currentWordLength).fill(''),
        currentCellIndex: 0,
        gameOver: false,
        won: false,
        rowCount: 6
    };
    
    // Pick new word
    await loadWordLists();
    targetWord = words[Math.floor(Math.random() * words.length)].toUpperCase();
    
    // Update UI
    updateBoard();
    updateRowControls();
    saveGameState();
    
    // Hide play again button in stats modal
    const playAgainContainer = document.getElementById('play-again-container');
    if (playAgainContainer) {
        playAgainContainer.style.display = 'none';
    }
}

async function changeWordLength(newLength) {
    currentWordLength = parseInt(newLength);
    await newGame();
}

// ============================================
// KEYBOARD SETUP & HANDLING
// ============================================

function setupKeyboard() {
    const keyboard = document.getElementById('keyboard');
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
    if (key === 'ENTER') {
        submitGuess();
    } else if (key === '⌫') {
        handleBackspace();
    } else {
        handleLetterInput(key);
    }
}

function setupEventListeners() {
    // Physical keyboard
    document.addEventListener('keydown', (e) => {
        if (gameState.gameOver) return;
        
        // Don't interfere with modal inputs
        if (document.querySelector('.modal[style*="block"]')) return;
        
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
    document.getElementById('new-game-btn').addEventListener('click', newGame);
    document.getElementById('add-row-btn').addEventListener('click', addRow);
    document.getElementById('remove-row-btn').addEventListener('click', removeRow);
    document.getElementById('nuke-btn').addEventListener('click', nukeGame);
    document.getElementById('settings-btn').addEventListener('click', showSettingsModal);
    document.getElementById('stats-btn').addEventListener('click', showStatsModal);
    document.getElementById('theme-toggle').addEventListener('click', toggleDarkMode);
    
    // Word length selector
    document.getElementById('word-length-select').addEventListener('change', (e) => {
        changeWordLength(e.target.value);
    });
    
    // Settings toggles
    document.getElementById('warn-ruled-out-toggle').addEventListener('change', (e) => {
        settings.warnRuledOut = e.checked;
        saveSettings();
    });
    
    // Stats modal buttons
    document.getElementById('share-stats-btn').addEventListener('click', shareStats);
    document.getElementById('reset-stats-btn').addEventListener('click', showResetConfirmation);
    document.getElementById('play-again-btn').addEventListener('click', () => {
        closeAllModals();
        newGame();
    });
    
    // Reset confirmation
    document.getElementById('reset-confirm-btn').addEventListener('click', () => {
        resetStats();
        closeModal('reset-confirm-modal');
        showStatsModal();
    });
    
    document.getElementById('reset-cancel-btn').addEventListener('click', () => {
        closeModal('reset-confirm-modal');
    });
    
    // Close buttons
    document.querySelectorAll('.close-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const modalId = e.target.dataset.modal;
            closeModal(modalId);
        });
    });
    
    // Close on outside click
    window.addEventListener('click', (e) => {
        if (e.target.classList.contains('modal')) {
            e.target.style.display = 'none';
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

async function animateReveal() {
    const rows = document.querySelectorAll('.row');
    const currentRowElement = rows[gameState.currentRow];
    if (!currentRowElement) return;
    
    const tiles = currentRowElement.querySelectorAll('.tile');
    const guess = gameState.currentRowLetters.join('');
    const result = checkGuess(guess);
    
    for (let i = 0; i < tiles.length; i++) {
        await new Promise(resolve => setTimeout(resolve, 200));
        tiles[i].classList.add('flip');
        tiles[i].classList.add(result[i]);
    }
    
    await new Promise(resolve => setTimeout(resolve, 300));
    
    // Update keyboard colors after reveal
    updateKeyboard();
}

// ============================================
// PERSISTENCE
// ============================================

function saveGameState() {
    const state = {
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
    localStorage.setItem('wordle-game-state', JSON.stringify(state));
}

async function loadGameState() {
    const saved = localStorage.getItem('wordle-game-state');
    if (saved) {
        try {
            const state = JSON.parse(saved);
            currentWordLength = state.wordLength || 5;
            targetWord = state.targetWord || '';
            gameState.guesses = state.guesses || [];
            gameState.currentRow = state.currentRow || 0;
            gameState.currentRowLetters = state.currentRowLetters || Array(currentWordLength).fill('');
            gameState.currentCellIndex = state.currentCellIndex || 0;
            gameState.gameOver = state.gameOver || false;
            gameState.won = state.won || false;
            gameState.rowCount = state.rowCount || 6;
            
            document.getElementById('word-length-select').value = currentWordLength;
        } catch (e) {
            console.error('Error loading game state:', e);
            gameState.currentRowLetters = Array(currentWordLength).fill('');
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
            stats = JSON.parse(saved);
        } catch (e) {
            console.error('Error loading stats:', e);
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
            const parsed = JSON.parse(saved);
            settings = { ...settings, ...parsed };
        } catch (e) {
            console.error('Error loading settings:', e);
        }
    }
    
    // Apply settings to UI
    const warnToggle = document.getElementById('warn-ruled-out-toggle');
    
    if (warnToggle) {
        warnToggle.checked = settings.warnRuledOut;
    }
}

// ============================================
// UI HELPERS
// ============================================

function showMessage(text, duration = 1500) {
    const toast = document.getElementById('toast');
    if (!toast) return;
    
    toast.textContent = text;
    toast.classList.add('show');
    
    setTimeout(() => {
        toast.classList.remove('show');
    }, duration);
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
    // Update stats display
    document.getElementById('stat-played').textContent = stats.gamesPlayed;
    
    const winPercent = stats.gamesPlayed > 0 
        ? Math.round((stats.gamesWon / stats.gamesPlayed) * 100) 
        : 0;
    document.getElementById('stat-won').textContent = stats.gamesWon;
    document.getElementById('stat-win-percent').textContent = `${winPercent}%`;
    document.getElementById('stat-current-streak').textContent = stats.currentStreak;
    document.getElementById('stat-max-streak').textContent = stats.maxStreak;
    
    // Calculate best try
    let bestTry = 'N/A';
    for (let i = 0; i < stats.distribution.length; i++) {
        if (stats.distribution[i] > 0) {
            bestTry = `#${i + 1}`;
            break;
        }
    }
    document.getElementById('stat-best-try').textContent = bestTry;
    
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
        barWrapper.className = 'distribution-bar-wrapper';
        
        const bar = document.createElement('div');
        bar.className = 'distribution-bar';
        bar.style.width = count > 0 ? `${(count / maxCount) * 100}%` : '0%';
        
        if (gameState.gameOver && gameState.won && index === gameState.currentRow) {
            bar.classList.add('highlight');
        }
        
        const countLabel = document.createElement('div');
        countLabel.className = 'distribution-count';
        countLabel.textContent = count;
        
        bar.appendChild(countLabel);
        barWrapper.appendChild(bar);
        
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
        modal.style.display = 'block';
    }
}

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.style.display = 'none';
    }
}

function closeAllModals() {
    document.querySelectorAll('.modal').forEach(modal => {
        modal.style.display = 'none';
    });
}

function showConfirmDialog(message) {
    return new Promise((resolve) => {
        const modal = document.getElementById('confirm-dialog');
        const messageEl = document.getElementById('confirm-message');
        const confirmBtn = document.getElementById('confirm-submit');
        const cancelBtn = document.getElementById('confirm-cancel');
        
        if (!modal || !messageEl) {
            resolve(false);
            return;
        }
        
        messageEl.textContent = message;
        modal.style.display = 'block';
        
        const handleConfirm = () => {
            cleanup();
            resolve(true);
        };
        
        const handleCancel = () => {
            cleanup();
            resolve(false);
        };
        
        const cleanup = () => {
            modal.style.display = 'none';
            confirmBtn.removeEventListener('click', handleConfirm);
            cancelBtn.removeEventListener('click', handleCancel);
        };
        
        confirmBtn.addEventListener('click', handleConfirm);
        cancelBtn.addEventListener('click', handleCancel);
    });
}

async function shareStats() {
    const emoji = gameState.won ? '🟩' : '🟥';
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
        } else {
            await navigator.clipboard.writeText(shareText);
            showMessage('Stats copied to clipboard!');
        }
    } catch (err) {
        console.error('Error sharing:', err);
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
    getStreak: () => ({ ...streakData }),
    getStats: () => ({ ...stats })
};

// Expose for debugging
if (settings.revealAnswer) {
    window.DEBUG = {
        gameState,
        stats,
        streakData,
        targetWord: () => targetWord
    };
}

// Load theme preference on startup
loadTheme();
