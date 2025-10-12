/* =========================
   Water 2048 — script.js
   Sprite-only icon rendering (clean)
   ========================= */

const SIZE = 4;

// DOM
const boardBg   = document.getElementById('boardBg');
const tilesEl   = document.getElementById('tiles');
const scoreEl   = document.getElementById('score');
const bestEl    = document.getElementById('best');
const newBtn    = document.getElementById('newBtn');
const restartBtn= document.getElementById('restartBtn');
const undoBtn   = document.getElementById('undoBtn');
const howBtn    = document.getElementById('howBtn');
const ctaPlay   = document.getElementById('ctaPlay');

const modal     = document.getElementById('modal');
const modalClose= document.getElementById('modalClose');
const modalOk   = document.getElementById('modalOk');

const STORAGE = 'water2048-demo';
const FACT_THRESHOLDS = [256, 512, 1024];
const FACT_TEXT = "halloween queen";
const unlockedKey = STORAGE + ':factsUnlocked';

// Map tile value → <symbol id> in the sprite
const SYMBOLS = {
  2:'2_glass',4:'4_jar',8:'8_pin',16:'16_helmet_blueprint',
  32:'32_drill_truck',64:'64_drill_bit',128:'128_pipes',
  256:'256_gravel_cement',512:'512_pump',1024:'1024_tap',2048:'2048_well'
};

// Load the SVG sprite once into the DOM
async function loadSprite() {
  const res = await fetch('./assets/icons/well_story_sprite.svg');
  if (!res.ok) throw new Error('Sprite HTTP ' + res.status);
  const svg = await res.text();
  const holder = document.createElement('div');
  holder.style.display = 'none';
  holder.innerHTML = svg;     // inlines all <symbol> ids
  document.body.prepend(holder);
}

// ---------- state ----------
function emptyGrid(){ return Array.from({length:SIZE},()=>Array(SIZE).fill(0)); }
function cloneGrid(g){ return g.map(r=>r.slice()); }

const state = {
  grid: emptyGrid(),
  score: 0,
  best: Number(localStorage.getItem(STORAGE+':best') || 0),
  history: [],
  unlocked: JSON.parse(localStorage.getItem(unlockedKey) || '[]'),
  factQueue: [],
  showingFact: false,
};
bestEl.textContent = state.best;

// Build the 16 background cells
for (let i=0;i<SIZE*SIZE;i++){
  const cell = document.createElement('div');
  cell.className = 'cell';
  boardBg.appendChild(cell);
}

// ---------- helpers ----------
function randomChoice(a){ return a[Math.floor(Math.random()*a.length)]; }

function spawnTile(){
  const empty = [];
  for(let r=0;r<SIZE;r++) for(let c=0;c<SIZE;c++){
    if(state.grid[r][c]===0) empty.push({r,c});
  }
  if(!empty.length) return false;
  const {r,c} = randomChoice(empty);
  state.grid[r][c] = Math.random()<0.9 ? 2 : 4;
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

// ---------- drawing ----------
function draw(){
  tilesEl.innerHTML = '';

  const W = tilesEl.clientWidth;
  const pad = 10, gap = 12;
  const cell = (W - pad*2 - gap*3) / 4;

  for (let r=0;r<SIZE;r++) {
    for (let c=0;c<SIZE;c++) {
      const v = state.grid[r][c];
      if (!v) continue;

      const tile = document.createElement('div');
      tile.className = 'tile';
      tile.dataset.v = v;

      tile.style.setProperty('--x', `${c*(cell+gap)}px`);
      tile.style.setProperty('--y', `${r*(cell+gap)}px`);

      const id = SYMBOLS[v];
      tile.innerHTML = `
        <svg class="tile-svg" viewBox="0 0 512 512" aria-hidden="true">
          <use href="#${id}"></use>
        </svg>
        <span class="num">${v}</span>
      `;
      tilesEl.appendChild(tile);
    }
  }

  // score/best
  scoreEl.textContent = state.score;
  if (state.score > state.best) {
    state.best = state.score;
    bestEl.textContent = state.best;
    localStorage.setItem(STORAGE+':best', String(state.best));
  }

  renderLegendIcons();
}

// ---------- moves ----------
function saveHistory(){
  state.history = [{grid: cloneGrid(state.grid), score: state.score}];
  undoBtn.disabled = false;
}

function slideRowLeft(row){
  const arr = row.filter(v=>v);
  for(let i=0;i<arr.length-1;i++){
    if(arr[i]===arr[i+1]){
      arr[i]*=2;
      state.score += arr[i];
      arr[i+1]=0;
    }
  }
  const res = arr.filter(v=>v);
  while(res.length<SIZE) res.push(0);
  return res;
}

function rotate(g){ // clockwise
  const m = emptyGrid();
  for(let r=0;r<SIZE;r++) for(let c=0;c<SIZE;c++) m[c][SIZE-1-r]=g[r][c];
  return m;
}

function move(dir){ // 0 left,1 up,2 right,3 down
  saveHistory();
  let g = cloneGrid(state.grid);
  for(let i=0;i<dir;i++) g = rotate(g);

  let moved = false;
  for(let r=0;r<SIZE;r++){
    const row = g[r];
    const sl = slideRowLeft(row);
    if(sl.some((v,i)=>v!==row[i])) moved = true;
    g[r] = sl;
  }

  for(let i=0;i<(4-dir)%4;i++) g = rotate(g);
  if(!moved){
    state.history.pop();
    return;
  }
  state.grid = g;
  spawnTile();
  draw();
  checkUnlocksAndRender();
  if(!movesAvailable(state.grid)){
    showModal('Game Over', `<p>Final score: <strong>${state.score}</strong></p>`);
  }
}

function movesAvailable(g){
  for(let r=0;r<SIZE;r++) for(let c=0;c<SIZE;c++){
    if(g[r][c]===0) return true;
    const v = g[r][c];
    if(r+1<SIZE && g[r+1][c]===v) return true;
    if(c+1<SIZE && g[r][c+1]===v) return true;
  }
  return false;
}

function reset(){
  state.grid = emptyGrid();
  state.score = 0;
  state.history = [];
  spawnTile();
  spawnTile();
  renderFacts();
  draw();
  checkUnlocksAndRender();
}

// ---------- facts / legend ----------
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

function renderFacts(){
  document.querySelectorAll('.facts .fact').forEach(el=>{
    const th = Number(el.dataset.threshold);
    const ok = state.unlocked.includes(th);
    el.classList.toggle('locked', !ok);
    el.classList.toggle('unlocked', ok);
  });
}

function runFactQueue(){
  if (state.showingFact || state.factQueue.length===0) return;
  state.showingFact = true;
  const th = state.factQueue.shift();
  showModal('Fact unlocked!', `<p>${FACT_TEXT}</p><p style="color:#6b7280;margin:.5rem 0 0"><small>Unlocked at ${th}</small></p>`);
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
    sw.innerHTML = id ? `<svg viewBox="0 0 512 512" width="28" height="24"><use href="#${id}"></use></svg>` : '';
  });
}

// ---------- modal / input ----------
function showModal(title, html){
  document.getElementById('modalTitle').textContent = title;
  document.getElementById('modalBody').innerHTML = html;
  modal.classList.remove('hidden');
}
function closeModal(){ modal.classList.add('hidden'); }

window.addEventListener('keydown', (e)=>{
  const k=e.key;
  if(['ArrowLeft','ArrowUp','ArrowRight','ArrowDown','a','w','d','s'].includes(k)) e.preventDefault();
  if(k==='ArrowLeft'||k==='a') move(0);
  if(k==='ArrowUp'  ||k==='w') move(3);
  if(k==='ArrowRight'||k==='d') move(2);
  if(k==='ArrowDown'||k==='s') move(1);
});

let start=null;
tilesEl.addEventListener('touchstart',(e)=>{
  if(e.touches.length===1){
    start={x:e.touches[0].clientX,y:e.touches[0].clientY};
  }
},{passive:true});
tilesEl.addEventListener('touchend',(e)=>{
  if(!start) return;
  const dx = e.changedTouches[0].clientX - start.x;
  const dy = e.changedTouches[0].clientY - start.y;
  const ax = Math.abs(dx), ay = Math.abs(dy);
  if(Math.max(ax,ay) > 24){
    if(ax>ay) move(dx<0?0:2); else move(dy<0?1:3);
  }
  start=null;
});

howBtn.onclick = ()=> showModal('How to Play',
  `<ol>
     <li>Use arrow keys or swipe to move tiles.</li>
     <li>Equal tiles merge into the next icon tier.</li>
     <li>Build toward <strong>2048</strong> to complete the well.</li>
   </ol>`);
ctaPlay.onclick = newBtn.onclick = reset;
restartBtn.onclick = reset;
undoBtn.onclick = ()=>{
  const last = state.history.pop();
  if(!last) return;
  state.grid = last.grid; state.score = last.score;
  draw(); checkUnlocksAndRender();
  undoBtn.disabled = true;
};
modalClose.onclick = modalOk.onclick = closeModal;
modal.addEventListener('click',(e)=>{ if(e.target===modal) closeModal(); });

// ---------- boot ----------
document.addEventListener('DOMContentLoaded', async () => {
  try {
    await loadSprite();  // inline all <symbol>s
  } catch (e) {
    console.error(e);    // still start without icons if fetch fails
  }
  renderLegendIcons();
  reset();
});
