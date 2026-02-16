// ============================================
// DEAD PARIS - Main Entry Point
// Bootstrap and initialization
// Made by QuadMonkey 2026
// ============================================

import Engine from './engine.js';

// Start the game when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    console.log('%cDEAD PARIS %c— Made by QuadMonkey 2026', 'color:#f87171;font-weight:bold;font-size:14px', 'color:#8888a0;font-size:11px');
    Engine.init().catch(err => {
        console.error('Failed to initialize Dead Paris:', err);
        document.getElementById('output-area').innerHTML =
            '<p class="message damage">Failed to load game. Check console for errors.</p>';
    });
});
