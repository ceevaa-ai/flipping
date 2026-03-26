import { Board } from './Board.js';
import { SoundEngine } from './SoundEngine.js';
import { MessageRotator } from './MessageRotator.js';
import { KeyboardController } from './KeyboardController.js';
import { PhoneMode } from './PhoneMode.js';
import { TVMode } from './TVMode.js';

document.addEventListener('DOMContentLoaded', () => {
  const modeSelector  = document.getElementById('mode-selector');
  const boardSection  = document.getElementById('board-section');
  const phoneModeEl   = document.getElementById('phone-mode');
  const tvOverlayEl   = document.getElementById('tv-overlay');
  const boardContainer = document.getElementById('board-container');
  const volumeBtn     = document.getElementById('volume-btn');

  // ── Shared audio setup ──────────────────────────────────────────────
  const soundEngine = new SoundEngine();
  let audioInitialized = false;
  const initAudio = async () => {
    if (audioInitialized) return;
    audioInitialized = true;
    await soundEngine.init();
    soundEngine.resume();
    document.removeEventListener('click', initAudio);
    document.removeEventListener('keydown', initAudio);
  };
  document.addEventListener('click', initAudio);
  document.addEventListener('keydown', initAudio);

  if (volumeBtn) {
    volumeBtn.addEventListener('click', () => {
      initAudio();
      const muted = soundEngine.toggleMute();
      volumeBtn.classList.toggle('muted', muted);
    });
  }

  // ── TV Mode ─────────────────────────────────────────────────────────
  document.getElementById('btn-tv').addEventListener('click', () => {
    modeSelector.classList.add('hidden');
    boardSection.classList.remove('hidden');
    tvOverlayEl.classList.remove('hidden');

    const board = new Board(boardContainer, soundEngine);
    // Keyboard controller works (fullscreen, mute) but no auto-rotation
    const rotator = new MessageRotator(board);
    new KeyboardController(rotator, soundEngine);
    // Show the initial board with a blank display rather than auto-rotating
    board.displayMessage(['', '', '', '', '']);

    new TVMode(board, tvOverlayEl);
  });

  // ── Phone Mode ───────────────────────────────────────────────────────
  document.getElementById('btn-phone').addEventListener('click', () => {
    modeSelector.classList.add('hidden');
    phoneModeEl.classList.remove('hidden');

    const phone = new PhoneMode(phoneModeEl);
    phone.init();
  });
});
