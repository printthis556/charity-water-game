
/* =========================
   Water 2048 — script.js
   Clean logical order, labeled sections
========================= */

// ====== CONSTANTS & CONFIG ======
// Tile fact unlock messages
const FACT_MESSAGES = {
  256: 'Diseases from dirty water kill more people every year than all forms of violence, including war.',
  512: 'Clean water helps keep kids in school, especially girls.',
  1024: 'halloween queen'
};
const FACT_TEXT = 'halloween queen';
const SIZE = 4;
const STORAGE = 'water2048-demo';
const FACT_THRESHOLDS = [256, 512, 1024];
const unlockedKey = STORAGE + ':factsUnlocked';
// Map tile value → <symbol id> in the sprite
const SYMBOLS = {
  2:'2_glass',4:'4_jar',8:'8_pin',16:'16_helmet_blueprint',
  32:'32_drill_truck',64:'64_drill_bit',128:'128_pipes',
  256:'256_gravel_cement',512:'512_pump',1024:'1024_tap',2048:'2048_well'
};

// ====== DOM ELEMENTS ======
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

// ====== GAME STATE ======
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

// ====== BOARD INITIALIZATION ======
// Build the 16 background cells
for (let i=0;i<SIZE*SIZE;i++){
  const cell = document.createElement('div');
  cell.className = 'cell';
  boardBg.appendChild(cell);
}

// ====== HELPERS ======
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

// ====== DRAWING & RENDERING ======
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

// ====== GAME LOGIC & MOVES ======
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

// ====== FACTS & LEGEND ======
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
  document.querySelectorAll('.facts .fact').forEach(el => {
    const th = Number(el.dataset.threshold);
    const isUnlocked = state.unlocked.includes(th);
    el.classList.toggle('locked', !isUnlocked);
    el.classList.toggle('unlocked', isUnlocked);
    // Make sure the card has a container for the message
    let content = el.querySelector('.fact-content');
    if (!content) {
      content = document.createElement('div');
      content.className = 'fact-content';
      content.setAttribute('aria-live', 'polite');
      el.appendChild(content);
    }
    // Show the message only when unlocked
    content.innerHTML = isUnlocked ? `<p>${FACT_MESSAGES[th] || FACT_TEXT}</p>` : '';
  });
}
function runFactQueue(){
  if (state.showingFact || state.factQueue.length === 0) return;
  state.showingFact = true;
  const th = state.factQueue.shift();
  const msg = FACT_MESSAGES[th] || FACT_TEXT;
  showWaterSplash();
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
    sw.innerHTML = id ? `<svg viewBox="0 0 512 512" width="28" height="24"><use href="#${id}"></use></svg>` : '';
  });
}

// ====== WATER SPLASH ANIMATION ======
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

// ====== MODAL & INPUT HANDLING ======
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

// ====== NEWSLETTER FORM WIRING ======
(function wireNewsletter(){
  const form = document.getElementById('newsletterForm');
  if (!form) return;
  const yearSel = document.getElementById('nlYear');
  const monthSel = document.getElementById('nlMonth');
  const daySel = document.getElementById('nlDay');
  const reminder = document.getElementById('nlReminder');
  const status = document.getElementById('nlStatus');
  const email = document.getElementById('nlEmail');
  // Populate years (current year back to 70 years)
  const nowY = new Date().getFullYear();
  for (let y = nowY; y >= nowY - 70; y--){
    const opt = document.createElement('option'); opt.value = String(y); opt.textContent = y;
    yearSel.appendChild(opt);
  }
  function daysInMonth(m, y){
    if (!m || !y) return 31;
    return new Date(y, m, 0).getDate(); // last day of previous month m
  }
  function trimDays(){
    const m = Number(monthSel.value), y = Number(yearSel.value);
    const need = daysInMonth(m, y);
    // Ensure 1..need
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
    // Compose payload (ready for your ESP endpoint)
    const payload = {
      firstName: document.getElementById('nlFirst').value.trim(),
      lastName:  document.getElementById('nlLast').value.trim(),
      email:     emailVal,
      birthday:  monthSel.value && daySel.value && yearSel.value
                  ? `${yearSel.value}-${String(monthSel.value).padStart(2,'0')}-${String(daySel.value).padStart(2,'0')}`
                  : null,
      birthdayReminder: !reminder.disabled && reminder.checked
    };
    // TODO: POST to your email service (Mailchimp, ConvertKit, etc.)
    // fetch('/api/newsletter', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload)})
    // For now, show a friendly success message
    status.style.color = '#065f46';
    status.textContent = 'Thanks for subscribing — check your inbox!';
    form.reset();
    reminder.disabled = true; // reset
  });
})();

// ====== BOOTSTRAP & EVENT WIRING ======
document.addEventListener('DOMContentLoaded', async () => {
  try {
    await loadSprite();  // inline all <symbol>s
  } catch (e) {
    console.error(e);    // still start without icons if fetch fails
  }
  renderLegendIcons();
  reset();
  // Current year
  const yearEl = document.getElementById('year');
  if (yearEl) yearEl.textContent = new Date().getFullYear();
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
  // Stub modals
  document.getElementById('openShortcuts')?.addEventListener('click', e => { e.preventDefault(); alert('Arrow keys or swipe to move.'); });
  document.getElementById('openAccessibility')?.addEventListener('click', e => { e.preventDefault(); alert('High-contrast mode and keyboard are supported.'); });
  document.getElementById('openFeedback')?.addEventListener('click', e => { e.preventDefault(); alert('Thanks! Please describe what went wrong.'); });
  document.getElementById('startFundraiser')?.addEventListener('click', e => { e.preventDefault(); alert('This would deep-link to a campus fundraiser flow.'); });
});

// ====== SVG SPRITE LOADING ======
async function loadSprite() {
  const res = await fetch('./assets/icons/well_story_sprite.svg');
  if (!res.ok) throw new Error('Sprite HTTP ' + res.status);
  const svg = await res.text();
  const holder = document.createElement('div');
  holder.style.display = 'none';
  holder.innerHTML = svg;     // inlines all <symbol> ids
  document.body.prepend(holder);
}
