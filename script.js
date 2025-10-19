/* =========================
   Water 2048 — script.js
   Clean logical order, labeled sections
========================= */

/* ====== 1) CONSTANTS & CONFIG ====== */

// Tile fact unlock messages
const FACT_MESSAGES = {
  256: 'Diseases from dirty water kill more people every year than all forms of violence, including war.',
  512: 'Clean water helps keep kids in school, especially girls.',
  1024: 'For every $1 invested in clean water, there is an average return of $4 in increased productivity.'
};
const FACT_TEXT = 'halloween queen';

// Core game config
const SIZE = 4;
const STORAGE = 'water2048-demo';
const FACT_THRESHOLDS = [256, 512, 1024];
const unlockedKey = STORAGE + ':factsUnlocked';

// Blocker sentinel (unmergeable)
const BLOCKER = -1;

// Sprite symbol map (value → <symbol id>)
const SYMBOLS = {
  2:'2_glass',4:'4_jar',8:'8_pin',16:'16_helmet_blueprint',
  32:'32_drill_truck',64:'64_drill_bit',128:'128_pipes',
  256:'256_gravel_cement',512:'512_pump',1024:'1024_tap',2048:'2048_well'
};
SYMBOLS[BLOCKER] = 'blocker'; // optional if your sprite has a “blocker” symbol

// Difficulty modes
const MODES = {
  normal: {
    spawnWeights: {2: 0.90, 4: 0.10}, // classic
    extraSpawnOnNoMerge: false,
    allowUndo: true,
    blockerEvery: 0
  },
  hard: {
    spawnWeights: {2: 0.60, 4: 0.35, 8: 0.05}, // tougher openings
    extraSpawnOnNoMerge: true,                  // #2 punish no-merge slides
    allowUndo: false,                           // no undos
    blockerEvery: 8                             // #3 rock every 8 valid moves
  }
};

// Expose a toggle if you add <input id="modeToggle" type="checkbox">
let mode = 'normal';      // default: classic 2048. Toggle to 'hard' to enable hard rules
let moveCount = 0;


/* ====== 2) DOM ELEMENTS ====== */

const boardBg    = document.getElementById('boardBg');
const tilesEl    = document.getElementById('tiles');
const scoreEl    = document.getElementById('score');
const bestEl     = document.getElementById('best');
const newBtn     = document.getElementById('newBtn');
const restartBtn = document.getElementById('restartBtn');
const undoBtn    = document.getElementById('undoBtn');
const howBtn     = document.getElementById('howBtn');
const ctaPlay    = document.getElementById('ctaPlay');

const modal      = document.getElementById('modal');
const modalClose = document.getElementById('modalClose');
const modalOk    = document.getElementById('modalOk');

/* ====== SFX (user-provided) ======
   Place your sound file at /assets/sounds/game-bonus-144751.mp3
   (we created the folder earlier). Audio playback is attempted
   when a fact unlocks; failures are caught to avoid breaking the UI.
*/
const SFX = {
  factUnlock: new Audio('/assets/sounds/game-bonus-144751.mp3')
};
SFX.factUnlock.preload = 'auto';
SFX.factUnlock.load();

// Win sound (played when the badge modal appears)
SFX.win = new Audio('/assets/sounds/orchestral-win-331233.mp3');
SFX.win.preload = 'auto';
SFX.win.load();

// Optional mode toggle
document.getElementById('modeToggle')?.addEventListener('change', e => {
  mode = e.target.checked ? 'hard' : 'normal';
  reset();
});


/* ====== 3) GAME STATE ====== */

function emptyGrid(){ return Array.from({length:SIZE},()=>Array(SIZE).fill(0)); }
function cloneGrid(g){ return g.map(r=>r.slice()); }

const state = {
  grid: emptyGrid(),
  score: 0,
  best: Number(localStorage.getItem(STORAGE+':best') || 0),
  history: [],
  unlocked: JSON.parse(localStorage.getItem(unlockedKey) || '[]'),
  factQueue: [],
  showingFact: false
};
bestEl.textContent = state.best;


/* ====== 4) BOARD INITIALIZATION (background cells) ====== */

for (let i=0;i<SIZE*SIZE;i++){
  const cell = document.createElement('div');
  cell.className = 'cell';
  boardBg.appendChild(cell);
}


/* ====== 5) HELPERS (random, spawns, high tile) ====== */

function randomChoice(a){ return a[Math.floor(Math.random()*a.length)]; }

// Weighted value picker for spawns
function spawnValue(weights){
  const entries = Object.entries(weights).map(([k, p]) => [Number(k), p]);
  let r = Math.random(), acc = 0;
  for (const [val, prob] of entries){
    acc += prob;
    if (r < acc) return val;
  }
  return 2;
}

// Spawn a normal tile using current mode weights
function spawnTile(){
  const empty = [];
  for (let r=0;r<SIZE;r++) for (let c=0;c<SIZE;c++){
    if (state.grid[r][c] === 0) empty.push({r,c});
  }
  if (!empty.length) return false;
  const {r,c} = randomChoice(empty);
  const val = spawnValue(MODES[mode].spawnWeights || {2:.9,4:.1});
  state.grid[r][c] = val;
  return true;
}

// Spawn an unmergeable blocker (-1)
function spawnBlocker(){
  const empty = [];
  for (let r=0;r<SIZE;r++) for (let c=0;c<SIZE;c++){
    if (state.grid[r][c] === 0) empty.push({r,c});
  }
  if (!empty.length) return false;
  const {r,c} = randomChoice(empty);
  state.grid[r][c] = BLOCKER;
  return true;
}

function highestTile(g){
  let m = 0;
  for (let r=0;r<g.length;r++){
    for (let c=0;c<g[r].length;c++){
      if (g[r][c] > m) m = g[r][c];
    }
  }
  return m;
}


/* ====== 6) RENDERING ====== */

function draw(){
  // Clear previous tiles
  tilesEl.innerHTML = '';

  // Measure the grid to compute exact cell size and gaps.
  const grid = boardBg; // #boardBg is the .grid element
  const cs = window.getComputedStyle(grid);
  const paddingLeft = parseFloat(cs.paddingLeft) || 0;
  const paddingRight = parseFloat(cs.paddingRight) || 0;
  const paddingTop = parseFloat(cs.paddingTop) || 0;
  const paddingBottom = parseFloat(cs.paddingBottom) || 0;
  const gap = parseFloat(cs.columnGap || cs.gap) || 0;

  const gridWidth = grid.clientWidth - paddingLeft - paddingRight;
  const gridHeight = grid.clientHeight - paddingTop - paddingBottom;

  // Prefer square cells — use the smaller axis to compute size so tiles fit.
  const cellSizeX = (gridWidth - gap * (SIZE - 1)) / SIZE;
  const cellSizeY = (gridHeight - gap * (SIZE - 1)) / SIZE;
  const cell = Math.min(cellSizeX, cellSizeY);

  // Respect CSS scale factor if present
  const root = window.getComputedStyle(document.documentElement);
  const tileScale = parseFloat(root.getPropertyValue('--tile-scale')) || 1;

  // Build tiles positioned relative to the .tiles (which fills the grid)
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      const v = state.grid[r][c];
      if (!v) continue;

      const tile = document.createElement('div');
      tile.className = 'tile';
      tile.dataset.v = v;

      // Set size to match computed cell size and scale factor
      const w = Math.round(cell * tileScale);
      const h = w; // square
      tile.style.width = w + 'px';
      tile.style.height = h + 'px';

      // Compute top-left position for the cell inside the grid's padding
      const x = Math.round(paddingLeft + c * (cell + gap) + (cell - w) / 2);
      const y = Math.round(paddingTop + r * (cell + gap) + (cell - h) / 2);

      tile.style.setProperty('--x', x + 'px');
      tile.style.setProperty('--y', y + 'px');

      // Content
      if (v === BLOCKER){
        tile.classList.add('blocker');
        const id = SYMBOLS[BLOCKER];
        if (id) {
          tile.innerHTML = `
            <div class="tile-icon">
              <img class="tile-img" src="assests/icons/${id}.png" alt="" onload="this.nextElementSibling && (this.nextElementSibling.style.display='none')" onerror="this.style.display='none'" />
              <svg class="tile-svg" viewBox="0 0 512 512" aria-hidden="true"><use href="#${id}"></use></svg>
            </div>
            <span class="num">🪨</span>
          `;
        } else {
          tile.innerHTML = `<span class="num">🪨</span>`;
        }
      } else {
        const id = SYMBOLS[v];
        tile.innerHTML = `
          <div class="tile-icon">
            <img class="tile-img" src="assests/icons/${id}.png" alt="" onload="this.nextElementSibling && (this.nextElementSibling.style.display='none')" onerror="this.style.display='none'" />
            <svg class="tile-svg" viewBox="0 0 512 512" aria-hidden="true"><use href="#${id}"></use></svg>
          </div>
          <span class="num">${v}</span>
        `;
      }

      tilesEl.appendChild(tile);
    }
  }

  // Update score and best
  scoreEl.textContent = state.score;
  if (state.score > state.best) {
    state.best = state.score;
    bestEl.textContent = state.best;
    localStorage.setItem(STORAGE+':best', String(state.best));
  }

  renderLegendIcons();
}


/* ====== 7) GAME LOGIC & MOVES ====== */

// Save history only if mode allows undo
function saveHistory(){
  if (!MODES[mode]?.allowUndo){
    undoBtn.disabled = true;
    return;
  }
  state.history = [{grid: cloneGrid(state.grid), score: state.score}];
  undoBtn.disabled = false;
}

// Slide a row left; merge only positive equals; blockers never merge
function slideRowLeft(row){
  const arr = row.filter(v => v !== 0);
  let mergedFlag = false;

  for (let i=0; i<arr.length-1; i++){
    if (arr[i] > 0 && arr[i] === arr[i+1]){
      arr[i] *= 2;
      state.score += arr[i];
      arr[i+1] = 0;
      mergedFlag = true;
    }
  }
  const res = arr.filter(v => v !== 0);
  while (res.length < SIZE) res.push(0);
  return { row: res, merged: mergedFlag };
}

// Rotate grid clockwise
function rotate(g){
  const m = emptyGrid();
  for (let r=0;r<SIZE;r++) for (let c=0;c<SIZE;c++) m[c][SIZE-1-r]=g[r][c];
  return m;
}

// Full move (0 left, 1 up, 2 right, 3 down) with hard-mode rules
function move(dir){
  saveHistory();

  let g = cloneGrid(state.grid);
  for (let i=0;i<dir;i++) g = rotate(g);

  let moved = false;
  let mergedAny = false;

  for (let r=0;r<SIZE;r++){
    const before = g[r].slice();
    const { row: slid, merged } = slideRowLeft(g[r]);
    if (slid.some((v,i)=>v !== before[i])) moved = true;
    if (merged) mergedAny = true;
    g[r] = slid;
  }

  for (let i=0;i<(4-dir)%4;i++) g = rotate(g);

  if (!moved){
    state.history.pop?.();
    return;
  }

  // Commit
  state.grid = g;

  // Base spawn
  spawnTile();

  // #2: punish no-merge with a second spawn (hard mode)
  if (MODES[mode]?.extraSpawnOnNoMerge && !mergedAny){
    spawnTile();
  }

  // #3: every N valid moves, spawn a blocker
  moveCount = (moveCount || 0) + 1;
  const every = MODES[mode]?.blockerEvery || 0;
  if (every && moveCount % every === 0){
    spawnBlocker();
  }

  draw();
  checkUnlocksAndRender();
  // Check win after draws and unlocks
  checkForWinAndCelebrate();

  if (!movesAvailable(state.grid)){
    showModal('Game Over', `<p>Final score: <strong>${state.score}</strong></p>`);
  }
}

// Move availability: positives can merge; blockers never merge
function movesAvailable(g){
  for (let r=0;r<SIZE;r++) for (let c=0;c<SIZE;c++){
    const v = g[r][c];
    if (v === 0) return true;                 // empty
    if (v > 0){                               // only positives merge
      if (r+1<SIZE && g[r+1][c] === v) return true;
      if (c+1<SIZE && g[r][c+1] === v) return true;
    }
  }
  return false;
}

// Reset game
function reset(){
  state.grid = emptyGrid();
  state.score = 0;
  state.history = [];
  moveCount = 0;
  state.winCelebrated = false;

  spawnTile();
  spawnTile();

  // Undo availability per mode
  undoBtn.disabled = !MODES[mode]?.allowUndo;

  renderFacts();
  draw();
  checkUnlocksAndRender();
}

/* ====== DEV / TEST HELPERS ====== */
// Populate test presets for QA
function applyTestPreset(preset){
  // clear and turn off celebration flag so tests behave predictably
  state.winCelebrated = false;
  state.history = [];
  state.score = 0;
  state.grid = emptyGrid();

  if (preset === 'win2048'){
    // place a single 2048 tile in the top-left
    state.grid[0][0] = 2048; state.score = 2048;
  } else if (preset === 'two1024'){
    // two 1024 tiles next to each other to allow immediate merge
    state.grid[0][0] = 1024; state.grid[0][1] = 1024; state.score = 2048;
  } else if (preset === 'nearWin'){
    // near win: a board with high tiles but not yet merged
    state.grid[0] = [1024,512,256,128];
    state.grid[1] = [64,32,16,8];
    state.score = 1024+512+256+128+64+32+16+8;
  } else if (preset === 'full2048'){
    // fill entire board with 2048 tiles (force win + heavy load)
    for (let r=0;r<SIZE;r++) for (let c=0;c<SIZE;c++) state.grid[r][c] = 2048;
    state.score = 2048 * SIZE * SIZE;
  }

  draw();
  checkUnlocksAndRender();
  // run win check explicitly after applying preset
  checkForWinAndCelebrate();
}

// Wire test controls if present
document.getElementById('testApplyBtn')?.addEventListener('click', ()=>{
  const sel = document.getElementById('testPreset');
  if (!sel) return;
  applyTestPreset(sel.value);
});


/* ====== 8) FACTS & LEGEND ====== */

function checkUnlocksAndRender(){
  const high = highestTile(state.grid);
  const newly = [];
  FACT_THRESHOLDS.forEach(t=>{
    if (high>=t && !state.unlocked.includes(t)) {
      state.unlocked.push(t);
      newly.push(t);
    }
  });
  if (newly.length){
    localStorage.setItem(unlockedKey, JSON.stringify(state.unlocked));
    renderFacts();
    newly.forEach(t=>state.factQueue.push(t));
    runFactQueue();
  } else {
    renderFacts();
  }
}

/* ====== WIN CELEBRATION: confetti + downloadable badge ====== */
// Track whether we've already shown the win celebration for the current game
state.winCelebrated = false;

function checkForWinAndCelebrate(){
  const high = highestTile(state.grid);
  // Trigger only once per game when reaching 2048 or greater
  if (high >= 2048 && !state.winCelebrated){
    state.winCelebrated = true;
    // brief delay so board finishes rendering
    setTimeout(()=>{
      launchConfetti();
      showWinBadgeModal();
    }, 220);
  }
}

// Simple confetti using positioned <span> elements and CSS animation
function launchConfetti(count = 90){
  const wrap = document.createElement('div');
  wrap.className = 'confetti-wrap';
  for (let i=0;i<count;i++){
    const el = document.createElement('span');
    el.className = 'confetti-piece';
    const size = Math.random()*8 + 6;
    el.style.width = el.style.height = size + 'px';
    el.style.background = `hsl(${Math.random()*60+180}deg ${Math.random()*30+60}% ${Math.random()*30+40}%)`;
    el.style.left = Math.random()*100 + '%';
    el.style.top = (Math.random()*30 - 10) + '%';
    el.style.transform = `rotate(${Math.random()*360}deg)`;
    el.style.opacity = String(0.9 - Math.random()*0.5);
    wrap.appendChild(el);
  }
  wrap.style.position = 'fixed';
  wrap.style.left = '0'; wrap.style.top = '0'; wrap.style.width = '100%'; wrap.style.height = '100%';
  wrap.style.pointerEvents = 'none';
  wrap.style.zIndex = 99999;
  document.body.appendChild(wrap);
  // remove after animation
  setTimeout(()=>{ wrap.classList.add('confetti-finish'); setTimeout(()=>wrap.remove(), 1600); }, 1800);
}

// Create a badge (SVG) and show modal with download link
function showWinBadgeModal(){
  (async () => {
    const title = 'You did it — Well Completed!';
    // Attempt to fetch the provided badge image and embed it into the SVG
    let imgData = null;
    try {
      // Use the same path you provided (note: repo uses 'assests' directory)
      imgData = await fetchImageDataUrl('assests/icons/Well 2048 win badge.png');
    } catch (e) {
      console.warn('Badge image fetch failed:', e);
      imgData = null;
    }

    const svg = generateBadgeSVG(state.best || state.score, imgData);
    const dataUrl = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svg)));

    const html = `
      <div style="display:flex;gap:12px;align-items:center;flex-direction:column">
        <div aria-hidden="true">${svg}</div>
        <div style="text-align:center;max-width:28rem">
          <p style="margin:.25rem 0">Congratulations — you reached the well! Download your badge and share it.</p>
          <p style="margin:.25rem 0;color:#6b7280"><small>Score: <strong>${state.score}</strong></small></p>
        </div>
        <div style="display:flex;gap:.5rem">
          <a id="downloadBadge" href="${dataUrl}" download="water2048-badge.svg" class="btn">Download badge</a>
          <button id="closeBadge" class="btn btn-secondary">Close</button>
        </div>
      </div>
    `;

  // Play win sound (best-effort) and show modal
  try { SFX.win.currentTime = 0; SFX.win.play().catch(()=>{}); } catch(e){}
  showModal(title, html);

    // Attach handler after modal inserted
    setTimeout(()=>{
      const dl = document.getElementById('downloadBadge');
      const close = document.getElementById('closeBadge');
      if (dl) dl.addEventListener('click', ()=>{ /* default link handles download */ });
      if (close) close.addEventListener('click', closeModal);
    }, 80);
  })();
}

// Fetch an image and return a data URL (base64). Throws on network errors.
async function fetchImageDataUrl(path){
  const res = await fetch(path);
  if (!res.ok) throw new Error('Image fetch ' + res.status);
  const blob = await res.blob();
  return await blobToDataURL(blob);
}

function blobToDataURL(blob){
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('FileReader failed'));
    reader.onloadend = () => resolve(reader.result);
    reader.readAsDataURL(blob);
  });
}

function generateBadgeSVG(score, imageDataUrl){
  const now = new Date();
  const year = now.getFullYear();
  const text = `Well Completed — Score ${score}`;
  const svg = `
  <svg xmlns='http://www.w3.org/2000/svg' width='600' height='200' viewBox='0 0 600 200'>
    <defs>
      <linearGradient id='g' x1='0' x2='1'>
        <stop offset='0' stop-color='#60a5fa'/>
        <stop offset='1' stop-color='#0ea5a0'/>
      </linearGradient>
      <filter id='f' x='-20%' y='-20%' width='140%' height='140%'>
        <feDropShadow dx='0' dy='6' stdDeviation='8' flood-color='#000' flood-opacity='0.25'/>
      </filter>
    </defs>
    <rect rx='18' width='100%' height='100%' fill='url(#g)' filter='url(#f)' />
    <g fill='#fff' font-family='Segoe UI, Roboto, Arial, sans-serif'>
      <text x='40' y='90' font-size='28' font-weight='700'>${escapeXml(text)}</text>
      <text x='40' y='130' font-size='18' fill='rgba(255,255,255,0.9)'>Completed ${year} — charity: water themed</text>
      <text x='40' y='165' font-size='14' fill='rgba(255,255,255,0.85)'>Share your achievement and encourage others to support clean water.</text>
    </g>
    <g transform='translate(460,30)'>
      <rect x='0' y='0' width='120' height='120' rx='12' fill='rgba(255,255,255,0.06)' />
      ${ imageDataUrl
        ? `<image href='${imageDataUrl}' x='6' y='6' width='108' height='108' preserveAspectRatio='xMidYMid slice' />`
        : `<text x='60' y='72' text-anchor='middle' font-size='40' font-weight='700' fill='#fff'>🏆</text>` }
    </g>
  </svg>
  `;
  return svg;
}

function escapeXml(unsafe){ return unsafe.replace(/[&<>'"]/g, c=> ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":"&apos;"})[c]); }

function renderFacts(){
  document.querySelectorAll('.facts .fact').forEach(el => {
    const th = Number(el.dataset.threshold);
    const isUnlocked = state.unlocked.includes(th);

    el.classList.toggle('locked', !isUnlocked);
    el.classList.toggle('unlocked', isUnlocked);

    // Ensure message container
    let content = el.querySelector('.fact-content');
    if (!content) {
      content = document.createElement('div');
      content.className = 'fact-content';
      content.setAttribute('aria-live', 'polite');
      el.appendChild(content);
    }

    // Show only when unlocked
    content.innerHTML = isUnlocked ? `<p>${FACT_MESSAGES[th] || FACT_TEXT}</p>` : '';
  });
}

function runFactQueue(){
  if (state.showingFact || state.factQueue.length === 0) return;
  state.showingFact = true;
  const th = state.factQueue.shift();
  const msg = FACT_MESSAGES[th] || FACT_TEXT;

  showWaterSplash();
  // play unlock sound (best-effort)
  try { SFX.factUnlock.currentTime = 0; SFX.factUnlock.play().catch(()=>{}); } catch(e){}

  showModal('Fact unlocked!', `
    <p>${msg}</p>
    <p style="color:#6b7280;margin:.5rem 0 0"><small>Unlocked at ${th}</small></p>
  `);
}

function renderLegendIcons(){
  document.querySelectorAll('.legend li').forEach(li=>{
    const v = Number(li.dataset.v || (li.textContent.match(/(\d+)/)||[])[1]);
    if (!v) return;
    let sw = li.querySelector('.swatch');
    if (!sw) {
      const cb = li.querySelector('input[type="checkbox"]');
      sw = document.createElement('span'); sw.className = 'swatch';
      if (cb) cb.replaceWith(sw); else li.prepend(sw);
    }
    const id = SYMBOLS[v];
    // Show raster PNG first (fast if available) with an SVG <use> fallback
    if (id) {
      const imgPath = `assests/icons/${id}.png`;
      sw.innerHTML = `
        <img class="legend-img" src="${imgPath}" alt="" onerror="this.style.display='none'" />
        <svg class="legend-svg" viewBox="0 0 512 512" width="28" height="24" aria-hidden="true"><use href="#${id}"></use></svg>
      `;
    } else {
      sw.innerHTML = '';
    }
  });
}


/* ====== 9) WATER SPLASH ANIMATION ====== */

function showWaterSplash() {
  const splash = document.createElement('div');
  splash.className = 'water-splash';
  splash.innerHTML = `
    <svg viewBox="0 0 120 60" width="120" height="60" style="display:block;">
      <ellipse cx="60" cy="40" rx="50" ry="12" fill="#60a5fa" opacity=".7">
        <animate attributeName="rx" values="0;50;0" dur="1.2s" repeatCount="1" />
        <animate attributeName="opacity" values="1;.7;0" dur="1.2s" repeatCount="1" />
      </ellipse>
      <ellipse cx="60" cy="30" rx="30" ry="8" fill="#38bdf8" opacity=".5">
        <animate attributeName="rx" values="0;30;0" dur="1.2s" repeatCount="1" />
        <animate attributeName="opacity" values="1;.5;0" dur="1.2s" repeatCount="1" />
      </ellipse>
    </svg>
  `;
  splash.style.position = 'fixed';
  splash.style.left = '50%';
  splash.style.top = '40%';
  splash.style.transform = 'translate(-50%, -50%)';
  splash.style.zIndex = '9999';
  splash.style.pointerEvents = 'none';
  document.body.appendChild(splash);
  setTimeout(() => splash.remove(), 1300);
}


/* ====== 10) MODAL & INPUT HANDLING ====== */

function showModal(title, html){
  document.getElementById('modalTitle').textContent = title;
  document.getElementById('modalBody').innerHTML = html;
  modal.classList.remove('hidden');
}

function closeModal(){
  modal.classList.add('hidden');
  // Allow next queued fact to show
  state.showingFact = false;
  runFactQueue();
}

// Keyboard
window.addEventListener('keydown', (e)=>{
  const k=e.key;
  if(['ArrowLeft','ArrowUp','ArrowRight','ArrowDown','a','w','d','s'].includes(k)) e.preventDefault();
  if(k==='ArrowLeft'||k==='a') move(0);
  if(k==='ArrowUp'  ||k==='w') move(3);
  if(k==='ArrowRight'||k==='d') move(2);
  if(k==='ArrowDown'||k==='s') move(1);
});

// Touch & pointer swipe handling (works on phones)
let start = null;
// Use the board container as the gesture surface so swipes register
// even if the user starts outside the tiles overlay.
boardBg.addEventListener('touchstart', (e) => {
  if (e.touches.length === 1) {
    start = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  }
}, { passive: true });

// Prevent the page from scrolling while the user is actively swiping on the board.
boardBg.addEventListener('touchmove', (e) => {
  if (!start) return;
  const dx = e.touches[0].clientX - start.x;
  const dy = e.touches[0].clientY - start.y;
  // if the user has started a directional gesture, prevent default scrolling
  if (Math.abs(dx) > 8 || Math.abs(dy) > 8) e.preventDefault();
}, { passive: false });

boardBg.addEventListener('touchend', (e) => {
  if (!start) return;
  const dx = e.changedTouches[0].clientX - start.x;
  const dy = e.changedTouches[0].clientY - start.y;
  const ax = Math.abs(dx), ay = Math.abs(dy);
  if (Math.max(ax, ay) > 24) {
    if (ax > ay) move(dx < 0 ? 0 : 2);
    else move(dy < 0 ? 1 : 3);
  }
  start = null;
});

boardBg.addEventListener('touchcancel', () => { start = null; });

// Pointer events fallback (handles stylus and some hybrid devices)
if (window.PointerEvent) {
  boardBg.addEventListener('pointerdown', (e) => {
    if (e.isPrimary) start = { x: e.clientX, y: e.clientY };
  }, { passive: true });

  boardBg.addEventListener('pointerup', (e) => {
    if (!start) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    const ax = Math.abs(dx), ay = Math.abs(dy);
    if (Math.max(ax, ay) > 24) {
      if (ax > ay) move(dx < 0 ? 0 : 2);
      else move(dy < 0 ? 1 : 3);
    }
    start = null;
  });
  boardBg.addEventListener('pointercancel', () => { start = null; });
}

// Buttons
howBtn.onclick = ()=> showModal('How to Play',
  `<ol>
     <li>Use arrow keys or swipe to move tiles.</li>
     <li>Equal tiles merge into the next icon tier.</li>
     <li>Build toward <strong>2048</strong> to complete the well.</li>
   </ol>`);

ctaPlay.onclick = newBtn.onclick = reset;
restartBtn.onclick = reset;

undoBtn.onclick = ()=>{
  if (!MODES[mode]?.allowUndo) return;
  const last = state.history.pop();
  if(!last) return;
  state.grid = last.grid; state.score = last.score;
  draw(); checkUnlocksAndRender();
  undoBtn.disabled = true;
};

modalClose.onclick = modalOk.onclick = closeModal;
modal.addEventListener('click',(e)=>{ if(e.target===modal) closeModal(); });


/* ====== 11) NEWSLETTER FORM WIRING ====== */

(function wireNewsletter(){
  const form = document.getElementById('newsletterForm');
  if (!form) return;

  const yearSel = document.getElementById('nlYear');
  const monthSel = document.getElementById('nlMonth');
  const daySel = document.getElementById('nlDay');
  const reminder = document.getElementById('nlReminder');
  const status = document.getElementById('nlStatus');
  const email = document.getElementById('nlEmail');

  // Years: current back to 70
  const nowY = new Date().getFullYear();
  for (let y = nowY; y >= nowY - 70; y--){
    const opt = document.createElement('option'); opt.value = String(y); opt.textContent = y;
    yearSel.appendChild(opt);
  }

  function daysInMonth(m, y){
    if (!m || !y) return 31;
    return new Date(y, m, 0).getDate();
  }

  function trimDays(){
    const m = Number(monthSel.value), y = Number(yearSel.value);
    const need = daysInMonth(m, y);
    const current = Number(daySel.value) || '';
    daySel.innerHTML = '<option value="">DD</option>' +
      Array.from({length:need}, (_,i)=>`<option value="${i+1}">${String(i+1).padStart(2,'0')}</option>`).join('');
    if (current && current <= need) daySel.value = String(current);
  }

  function toggleReminder(){
    const enabled = monthSel.value && daySel.value && yearSel.value;
    reminder.disabled = !enabled;
  }

  monthSel.addEventListener('change', ()=>{ trimDays(); toggleReminder(); });
  yearSel.addEventListener('change', ()=>{ trimDays(); toggleReminder(); });
  daySel.addEventListener('change', toggleReminder);

  form.addEventListener('submit', (e)=>{
    e.preventDefault();
    status.textContent = '';
    const emailVal = (email.value || '').trim();
    const ok = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailVal);
    if (!ok){
      status.style.color = '#b91c1c';
      status.textContent = 'Please enter a valid email.';
      email.focus();
      return;
    }

    // Payload (ready for your ESP endpoint)
    const payload = {
      firstName: document.getElementById('nlFirst')?.value.trim() || '',
      lastName:  document.getElementById('nlLast')?.value.trim() || '',
      email:     emailVal,
      birthday:  monthSel.value && daySel.value && yearSel.value
                  ? `${yearSel.value}-${String(monthSel.value).padStart(2,'0')}-${String(daySel.value).padStart(2,'0')}`
                  : null,
      birthdayReminder: !reminder.disabled && reminder.checked
    };

    // TODO: POST to ESP
    // fetch('/api/newsletter', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload)})

    // Friendly success
    status.style.color = '#065f46';
    status.textContent = 'Thanks for subscribing — check your inbox!';
    form.reset();
    reminder.disabled = true;
  });
})();


/* ====== 12) BOOTSTRAP & EVENT WIRING ====== */

document.addEventListener('DOMContentLoaded', async () => {
  try {
    await loadSprite();  // inline all <symbol>s once
  } catch (e) {
    console.error(e);    // still start if sprites fail
  }
  renderLegendIcons();
  // Ensure UI toggle reflects the current mode (default: normal)
  const mt = document.getElementById('modeToggle');
  if (mt) mt.checked = (mode === 'hard');
  reset();
  // Safety: check if initial grid already meets win criteria
  checkForWinAndCelebrate();

  // Current year(s)
  const yearEl = document.getElementById('year');
  if (yearEl) yearEl.textContent = new Date().getFullYear();
  const cwYear = document.getElementById('cwYear');
  if (cwYear) cwYear.textContent = new Date().getFullYear();

  // Share button
  document.getElementById('shareGame')?.addEventListener('click', async () => {
    const shareData = {
      title: 'Water 2048 — Build the well',
      text: 'Play Water 2048 to support clean water with charity: water.',
      url: location.href
    };
    if (navigator.share) { try { await navigator.share(shareData); } catch(_){} }
    else { await navigator.clipboard.writeText(location.href); alert('Link copied!'); }
  });

  // Stub links
  document.getElementById('openShortcuts')?.addEventListener('click', e => { e.preventDefault(); alert('Arrow keys or swipe to move.'); });
  document.getElementById('openAccessibility')?.addEventListener('click', e => { e.preventDefault(); alert('High-contrast mode and keyboard are supported.'); });
  document.getElementById('openFeedback')?.addEventListener('click', e => { e.preventDefault(); alert('Thanks! Please describe what went wrong.'); });
  document.getElementById('startFundraiser')?.addEventListener('click', e => { e.preventDefault(); alert('This would deep-link to a campus fundraiser flow.'); });
});


/* ====== 13) SVG SPRITE LOADING ====== */

async function loadSprite() {
  const res = await fetch('./assets/icons/well_story_sprite.svg');
  if (!res.ok) throw new Error('Sprite HTTP ' + res.status);
  const svg = await res.text();
  const holder = document.createElement('div');
  holder.style.display = 'none';
  holder.innerHTML = svg;     // inlines all <symbol> ids
  document.body.prepend(holder);
}
