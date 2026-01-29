/**
 * actions.js
 * Public API for TikFinity and external integrations
 * 
 * This file provides a clean interface for external tools to interact
 * with the Wordle game without touching internal implementation.
 * 
 * Usage from TikFinity or other external scripts:
 * 
 *   // Add a row dynamically
 *   window.WordleActions.addRow();
 * 
 *   // Remove a row
 *   window.WordleActions.removeRow();
 * 
 *   // Set row count directly (TikFinity helper)
 *   window.WordleActions.setRowCount(8);
 * 
 *   // Add multiple rows at once (TikFinity helper)
 *   window.WordleActions.addRows(3);
 * 
 *   // Nuke the game (resets streak and starts fresh)
 *   window.WordleActions.nukeGame();
 * 
 *   // Start a new game
 *   window.WordleActions.newGame();
 * 
 *   // Submit the current guess
 *   window.WordleActions.submitGuess();
 * 
 *   // Get current game state
 *   const state = window.WordleActions.getGameState();
 *   console.log(state.currentRow, state.rowCount, state.gameOver);
 * 
 *   // Get streak information
 *   const streak = window.WordleActions.getStreak();
 *   console.log('Current streak:', streak.currentStreak);
 *   console.log('Max streak:', streak.maxStreak);
 * 
 *   // Get statistics
 *   const stats = window.WordleActions.getStats();
 *   console.log('Win rate:', stats.gamesWon / stats.gamesPlayed);
 */

// All actions are exposed via window.WordleActions from app.js
// This file just provides documentation and optional helper functions

// Helper: Check if game is ready
function isGameReady() {
    return typeof window.WordleActions !== 'undefined';
}

// Helper: Safe action wrapper
function safeAction(actionName, ...args) {
    if (!isGameReady()) {
        console.error('WordleActions not available. Make sure app.js is loaded first.');
        return null;
    }
    
    if (typeof window.WordleActions[actionName] !== 'function') {
        console.error(`Action "${actionName}" not found in WordleActions.`);
        return null;
    }
    
    try {
        return window.WordleActions[actionName](...args);
    } catch (error) {
        console.error(`Error executing ${actionName}:`, error);
        return null;
    }
}

// TikFinity-friendly helpers (exposed on window.WordleActions)
const WordleHelpers = {
    // Set row count directly (safe wrapper)
    setRowCount(count) {
        if (!isGameReady()) return false;
        
        let state = window.WordleActions.getGameState();
        const minRows = Math.max(3, state.currentRow + 1, state.guesses.length);
        const targetCount = Math.max(minRows, Math.min(12, count));
        
        // Add rows (re-read state each iteration to avoid infinite loop)
        while (true) {
            state = window.WordleActions.getGameState();
            if (state.rowCount >= targetCount) break;
            window.WordleActions.addRow();
        }
        
        // Remove rows (re-read state each iteration)
        while (true) {
            state = window.WordleActions.getGameState();
            if (state.rowCount <= targetCount || state.rowCount <= minRows) break;
            window.WordleActions.removeRow();
        }
        
        return true;
    },
    
    // Add multiple rows at once
    addRows(count) {
        if (!isGameReady()) return false;
        for (let i = 0; i < count; i++) {
            window.WordleActions.addRow();
        }
        return true;
    }
};

// Expose helpers on window for easy access
window.WordleHelpers = WordleHelpers;

// Export safe wrappers for ES6 module usage (optional)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        addRow: () => safeAction('addRow'),
        removeRow: () => safeAction('removeRow'),
        nukeGame: () => safeAction('nukeGame'),
        newGame: () => safeAction('newGame'),
        submitGuess: () => safeAction('submitGuess'),
        getGameState: () => safeAction('getGameState'),
        getStreak: () => safeAction('getStreak'),
        getStats: () => safeAction('getStats'),
        setRowCount: window.WordleHelpers.setRowCount,
        addRows: window.WordleHelpers.addRows
    };
}

// Log when actions are ready
if (isGameReady()) {
    console.log('✅ WordleActions ready for TikFinity integration');
    console.log('Available actions:', Object.keys(window.WordleActions));
} else {
    // Wait for app.js to load
    window.addEventListener('load', () => {
        if (isGameReady()) {
            console.log('✅ WordleActions ready for TikFinity integration');
            console.log('Available actions:', Object.keys(window.WordleActions));
        }
    });
}
