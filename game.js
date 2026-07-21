'use strict';

const COLS = 10;
const ROWS = 20;
const BLOCK = 30;

const COLORS = [
  null,
  '#4dd0e1', // I - cyan
  '#ffd54f', // O - yellow
  '#ba68c8', // T - purple
  '#81c784', // S - green
  '#e57373', // Z - red
  '#90caf9', // J - pale blue
  '#ffb74d', // L - orange
];

const PIECES = [
  null,
  [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], // I
  [[2,2],[2,2]],                               // O
  [[0,3,0],[3,3,3],[0,0,0]],                  // T
  [[0,4,4],[4,4,0],[0,0,0]],                  // S
  [[5,5,0],[0,5,5],[0,0,0]],                  // Z
  [[6,0,0],[6,6,6],[0,0,0]],                  // J
  [[0,0,7],[7,7,7],[0,0,0]],                  // L
];

const LINE_SCORES = [0, 100, 300, 500, 800];
const T_SPIN_SCORES = [400, 800, 1200, 1600]; // index = líneas (0 = T-spin en seco)
const PERFECT_CLEAR_BONUS = 1000;

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const nextCanvas = document.getElementById('next-canvas');
const nextCtx = nextCanvas.getContext('2d');
const scoreEl = document.getElementById('score');
const linesEl = document.getElementById('lines');
const levelEl = document.getElementById('level');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayScore = document.getElementById('overlay-score');
const restartBtn = document.getElementById('restart-btn');
const themeSwitch = document.getElementById('theme-switch');
const muteBtn = document.getElementById('mute-btn');
const bannerEl = document.getElementById('banner');
const pauseMenu = document.getElementById('pause-menu');
const resumeBtn = document.getElementById('resume-btn');
const pauseRestartBtn = document.getElementById('pause-restart-btn');
const controlsBtn = document.getElementById('controls-btn');
const pauseControls = document.getElementById('pause-controls');
const startLevelSelect = document.getElementById('start-level');

let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId;
let combo, b2b, lastMoveRotation;
let startLevel;

function createBoard() {
  return Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
}

function randomPiece() {
  const type = Math.floor(Math.random() * 7) + 1;
  const shape = PIECES[type].map(row => [...row]);
  return { type, shape, x: Math.floor(COLS / 2) - Math.floor(shape[0].length / 2), y: 0 };
}

function collide(shape, ox, oy) {
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      const nx = ox + c;
      const ny = oy + r;
      if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
      if (ny >= 0 && board[ny][nx]) return true;
    }
  }
  return false;
}

function rotateCW(shape) {
  const rows = shape.length, cols = shape[0].length;
  const result = Array.from({ length: cols }, () => new Array(rows).fill(0));
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      result[c][rows - 1 - r] = shape[r][c];
  return result;
}

function tryRotate() {
  const rotated = rotateCW(current.shape);
  const kicks = [0, -1, 1, -2, 2];
  for (const kick of kicks) {
    if (!collide(rotated, current.x + kick, current.y)) {
      current.shape = rotated;
      current.x += kick;
      lastMoveRotation = true;
      return;
    }
  }
}

function isTSpin() {
  if (current.type !== 3 || !lastMoveRotation) return false;
  // La T vive en una matriz 3x3; se cuenta cuántas de las 4 esquinas están ocupadas
  // (fuera del tablero o por un bloque asentado). 3+ ocupadas ⇒ T-spin.
  const corners = [[0, 0], [0, 2], [2, 0], [2, 2]];
  let filled = 0;
  for (const [dr, dc] of corners) {
    const x = current.x + dc, y = current.y + dr;
    if (x < 0 || x >= COLS || y >= ROWS || (y >= 0 && board[y][x])) filled++;
  }
  return filled >= 3;
}

function merge() {
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        board[current.y + r][current.x + c] = current.shape[r][c];
}

function clearLines() {
  let cleared = 0;
  for (let r = ROWS - 1; r >= 0; r--) {
    if (board[r].every(v => v !== 0)) {
      board.splice(r, 1);
      board.unshift(new Array(COLS).fill(0));
      cleared++;
      r++;
    }
  }
  return cleared;
}

function applyScore(cleared, tSpin) {
  const perfect = cleared > 0 && board.every(row => row.every(v => v === 0));
  const difficult = cleared === 4 || (tSpin && cleared >= 1);

  if (cleared > 0) {
    combo++;
    let gain = (tSpin ? T_SPIN_SCORES[cleared] : LINE_SCORES[cleared]) * level;
    if (difficult && b2b) gain = Math.floor(gain * 1.5);
    if (combo >= 2) gain *= combo;
    score += gain;
    if (perfect) score += PERFECT_CLEAR_BONUS * level;
    lines += cleared;
    level = Math.floor(lines / 10) + 1;
    dropInterval = Math.max(100, 1000 - (level - 1) * 90);
    b2b = difficult;
  } else {
    combo = 0;
    if (tSpin) score += T_SPIN_SCORES[0] * level;
  }

  announce({ cleared, tSpin, difficult, perfect, combo });
  updateHUD();
}

function ghostY() {
  let gy = current.y;
  while (!collide(current.shape, current.x, gy + 1)) gy++;
  return gy;
}

function hardDrop() {
  const gy = ghostY();
  score += (gy - current.y) * 2;
  current.y = gy;
  lockPiece();
}

function softDrop() {
  if (!collide(current.shape, current.x, current.y + 1)) {
    current.y++;
    score += 1;
    updateHUD();
  } else {
    lockPiece();
  }
}

function lockPiece() {
  const tSpin = isTSpin();
  merge();
  const cleared = clearLines();
  applyScore(cleared, tSpin);
  spawn();
}

function spawn() {
  current = next;
  next = randomPiece();
  lastMoveRotation = false;
  if (collide(current.shape, current.x, current.y)) {
    endGame();
  }
  drawNext();
}

function updateHUD() {
  scoreEl.textContent = score.toLocaleString();
  linesEl.textContent = lines;
  levelEl.textContent = level;
}

function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  const color = COLORS[colorIndex];
  context.globalAlpha = alpha ?? 1;
  context.fillStyle = color;
  context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
  // highlight
  context.fillStyle = 'rgba(255,255,255,0.12)';
  context.fillRect(x * size + 1, y * size + 1, size - 2, 4);
  context.globalAlpha = 1;
}

function drawGrid() {
  ctx.strokeStyle = getComputedStyle(document.body).getPropertyValue('--grid-color').trim();
  ctx.lineWidth = 0.5;
  for (let c = 1; c < COLS; c++) {
    ctx.beginPath();
    ctx.moveTo(c * BLOCK, 0);
    ctx.lineTo(c * BLOCK, ROWS * BLOCK);
    ctx.stroke();
  }
  for (let r = 1; r < ROWS; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * BLOCK);
    ctx.lineTo(COLS * BLOCK, r * BLOCK);
    ctx.stroke();
  }
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGrid();

  // board
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      drawBlock(ctx, c, r, board[r][c], BLOCK);

  // ghost
  const gy = ghostY();
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        drawBlock(ctx, current.x + c, gy + r, current.shape[r][c], BLOCK, 0.2);

  // current piece
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      drawBlock(ctx, current.x + c, current.y + r, current.shape[r][c], BLOCK);
}

function drawNext() {
  const NB = 30;
  nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  const shape = next.shape;
  const offX = Math.floor((4 - shape[0].length) / 2);
  const offY = Math.floor((4 - shape.length) / 2);
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++)
      drawBlock(nextCtx, offX + c, offY + r, shape[r][c], NB);
}

function announce({ cleared, tSpin, difficult, perfect, combo }) {
  const bannerLines = [];
  if (perfect) bannerLines.push('PERFECT CLEAR');
  else if (tSpin && cleared) bannerLines.push('T-SPIN ' + ['', 'SINGLE', 'DOUBLE', 'TRIPLE'][cleared]);
  else if (tSpin) bannerLines.push('T-SPIN');
  else if (cleared === 4) bannerLines.push('TETRIS');
  if (difficult && b2b && !perfect) bannerLines.push('BACK-TO-BACK');
  if (combo >= 2) bannerLines.push('COMBO x' + combo);
  if (bannerLines.length) showBanner(bannerLines);

  if (perfect) playSound('perfect');
  else if (tSpin && cleared) playSound('tspin');
  else if (cleared === 4) playSound('tetris');
  else if (combo >= 2) playSound('combo', combo);
  else if (cleared) playSound('clear');
}

function showBanner(lines) {
  if (!bannerEl) return;
  bannerEl.innerHTML = lines.map(l => `<span>${l}</span>`).join('');
  bannerEl.classList.remove('show');
  void bannerEl.offsetWidth; // fuerza reflow para reiniciar la animación
  bannerEl.classList.add('show');
}

function endGame() {
  gameOver = true;
  cancelAnimationFrame(animId);
  pauseMenu.classList.add('hidden');
  restartBtn.classList.remove('hidden');
  overlayTitle.textContent = 'GAME OVER';
  overlayScore.textContent = `Puntuación: ${score.toLocaleString()}`;
  overlay.classList.remove('hidden');
}

function openPauseMenu() {
  overlayTitle.textContent = 'PAUSA';
  overlayScore.textContent = '';
  restartBtn.classList.add('hidden');
  pauseControls.classList.add('hidden');
  pauseMenu.classList.remove('hidden');
  overlay.classList.remove('hidden');
}

function closePauseMenu() {
  pauseMenu.classList.add('hidden');
  restartBtn.classList.remove('hidden');
  overlay.classList.add('hidden');
}

function togglePause() {
  if (gameOver) return;
  paused = !paused;
  if (!paused) {
    closePauseMenu();
    lastTime = performance.now();
    loop(lastTime);
  } else {
    cancelAnimationFrame(animId);
    openPauseMenu();
  }
}

function loop(ts) {
  if (gameOver) return;
  const dt = ts - lastTime;
  lastTime = ts;
  dropAccum += dt;
  if (dropAccum >= dropInterval) {
    dropAccum = 0;
    if (!collide(current.shape, current.x, current.y + 1)) {
      current.y++;
    } else {
      lockPiece();
    }
  }
  draw();
  animId = requestAnimationFrame(loop);
}

function init() {
  board = createBoard();
  score = 0;
  lines = 0;
  level = startLevel;
  paused = false;
  gameOver = false;
  dropInterval = Math.max(100, 1000 - (level - 1) * 90);
  dropAccum = 0;
  combo = 0;
  b2b = false;
  lastMoveRotation = false;
  lastTime = performance.now();
  next = randomPiece();
  spawn();
  updateHUD();
  closePauseMenu();
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

document.addEventListener('keydown', e => {
  initAudio();
  if (e.code === 'KeyP' || e.code === 'Escape') { togglePause(); return; }
  if (e.code === 'KeyM') { toggleMute(); return; }
  if (paused || gameOver) return;
  switch (e.code) {
    case 'ArrowLeft':
      if (!collide(current.shape, current.x - 1, current.y)) { current.x--; lastMoveRotation = false; }
      break;
    case 'ArrowRight':
      if (!collide(current.shape, current.x + 1, current.y)) { current.x++; lastMoveRotation = false; }
      break;
    case 'ArrowDown':
      softDrop();
      break;
    case 'ArrowUp':
    case 'KeyX':
      tryRotate();
      break;
    case 'Space':
      e.preventDefault();
      hardDrop();
      break;
  }
  updateHUD();
});

restartBtn.addEventListener('click', init);

// ---- Menú de pausa ----
const START_LEVEL_KEY = 'tetris-start-level';

function loadStartLevel() {
  const stored = parseInt(localStorage.getItem(START_LEVEL_KEY), 10);
  return Number.isInteger(stored) && stored >= 1 && stored <= 15 ? stored : 1;
}

startLevel = loadStartLevel();

for (let i = 1; i <= 15; i++) {
  const opt = document.createElement('option');
  opt.value = i;
  opt.textContent = i;
  startLevelSelect.appendChild(opt);
}
startLevelSelect.value = startLevel;

startLevelSelect.addEventListener('change', () => {
  const val = parseInt(startLevelSelect.value, 10);
  if (Number.isInteger(val) && val >= 1 && val <= 15) {
    startLevel = val;
    localStorage.setItem(START_LEVEL_KEY, String(startLevel));
  }
});

resumeBtn.addEventListener('click', () => {
  if (paused) togglePause();
});

pauseRestartBtn.addEventListener('click', () => {
  init();
});

controlsBtn.addEventListener('click', () => {
  pauseControls.classList.toggle('hidden');
});

const THEME_KEY = 'tetris-theme';

function applyTheme(theme) {
  document.body.classList.toggle('light', theme === 'light');
  themeSwitch.checked = theme === 'light';
  if (next) drawNext();
}

themeSwitch.addEventListener('change', () => {
  const theme = themeSwitch.checked ? 'light' : 'dark';
  localStorage.setItem(THEME_KEY, theme);
  applyTheme(theme);
});

applyTheme(localStorage.getItem(THEME_KEY) === 'light' ? 'light' : 'dark');

// ---- Sonido (Web Audio, sintetizado) ----
const MUTE_KEY = 'tetris-muted';
let muted = localStorage.getItem(MUTE_KEY) === 'true';
let audioCtx = null;

function initAudio() {
  if (audioCtx) return;
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return;
  audioCtx = new AudioContextClass();
}

function tone(freq, duration, delay, type, gainAmount) {
  if (!audioCtx) return;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = type || 'square';
  osc.frequency.value = freq;
  const start = audioCtx.currentTime + (delay || 0);
  gain.gain.setValueAtTime(0, start);
  gain.gain.linearRampToValueAtTime(gainAmount ?? 0.15, start + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  osc.connect(gain).connect(audioCtx.destination);
  osc.start(start);
  osc.stop(start + duration);
}

const SOUND_PRESETS = {
  clear: () => tone(440, 0.15, 0, 'square'),
  tetris: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.18, i * 0.05, 'square')),
  tspin: () => [392, 587, 880].forEach((f, i) => tone(f, 0.16, i * 0.06, 'sawtooth')),
  perfect: () => [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.22, i * 0.07, 'triangle')),
  combo: n => tone(300 + Math.min(n, 10) * 60, 0.14, 0, 'square'),
};

function playSound(type, n) {
  if (muted || !audioCtx) return;
  const preset = SOUND_PRESETS[type];
  if (preset) preset(n);
}

function toggleMute() {
  muted = !muted;
  localStorage.setItem(MUTE_KEY, muted);
  applyMuteIcon();
}

function applyMuteIcon() {
  if (muteBtn) muteBtn.textContent = muted ? '🔇' : '🔊';
}

if (muteBtn) muteBtn.addEventListener('click', toggleMute);
applyMuteIcon();

init();
