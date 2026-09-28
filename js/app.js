'use strict';

/* =========================================================
   DOM
   ========================================================= */
const $ = (id) => document.getElementById(id);

const arena = $('arena');
const statusText = $('status');
const music = $('bgMusic');
const loseMusic = $('loseMusic'); // সময় শেষ হলে বাজবে (music1.mp3)
const gun = $('gun');
const scoreDisplay = $('score');
const targetScoreDisplay = $('target-score');
const levelNameDisplay = $('level-name');
const timeDisplay = $('time-left');
const finalScoreDisplay = $('finalScore');
const progressBar = $('progressBar');
const header = document.querySelector('.header');

const startModal = $('startModal');
const quitModal = $('quitModal');
const gameOverModal = $('gameOverModal');
const timeUpModal = $('timeUpModal');
const retryBtn = $('retryBtn');
const timeUpMenuBtn = $('timeUpMenuBtn');
const quitBtn = $('quitBtn');
const resumeBtn = $('resumeBtn');
const quitConfirmBtn = $('quitConfirmBtn');
const restartBtn = $('restartBtn');

/* =========================================================
   Config (এখান থেকেই সব বদলানো যায়)
   ========================================================= */
const CONFIG = {
    targetScore: 50,
    pointsPerHit: 10,
    wrongPenalty: 10,     // ভুল লোককে গুলি করলে কত পয়েন্ট কাটবে
    hitCooldownMs: 250,
    bulletMs: 140,
    gunshotVolume: 0.5,

    targetImage: 'target.png.png', // আসল লোকের ছবি (ফাইলের নাম ঠিক করে নাও)

    // চাইলে অন্য মানুষের ছবি এখানে দাও, যেমন ['img/p1.png', 'img/p2.png'].
    // ফাঁকা থাকলে আসল ছবিটাই সাজ বদলে নকল হিসেবে ব্যবহার হবে।
    decoyImages: [],

    accessories: ['🎩', '🧢', '🕶️', '😷', '👑', '🥸', '🎭', '🤠'], // লাল কিছু নেই, যাতে আসল লোকের লাল ডটের সাথে গুলিয়ে না যায়
    obstacleEmojis: ['🌳', '🪨', '📦', '🌿', '🧱']
};

/*
  timeLimit       : পুরো লেভেলের সময়সীমা (সেকেন্ড)
  decoys          : নকল লোকের সংখ্যা
  size            : প্রতিটা লোকের মাপ (px)
  moveMs          : কতক্ষণ পরপর সবাই জায়গা বদলাবে
  hue             : নকল লোকের রঙ কতটা বদলাবে (ডিগ্রি) — কম মানে বেশি কঠিন
  accessoryChance : নকল লোকের টুপি/চশমা থাকার সম্ভাবনা (০ থেকে ১)
  accessorySize   : টুপি/চশমার মাপ (লোকের মাপের অনুপাতে)
  glow            : আসল লোকের গায়ে আলো থাকবে কিনা
  marker          : আসল লোকের উপরে ছোট লাল ডট থাকবে কিনা
  obstacles       : গাছ/বাক্সের সংখ্যা (আংশিক আড়াল করে)
*/
const LEVELS = {
    easy: {
        name: 'সহজ 🟢',
        timeLimit: 60, decoys: 4, size: 120, moveMs: 2600,
        hue: [90, 270], accessoryChance: 1, accessorySize: 0.45,
        glow: true, marker: false, obstacles: 0,
        hint: 'আসল লোকটির চারপাশে গোলাপি আলো আছে, তাকে গুলি করো!'
    },
    medium: {
        name: 'মধ্যম 🟡',
        timeLimit: 50, decoys: 10, size: 84, moveMs: 2000,
        hue: [25, 60], accessoryChance: 0.7, accessorySize: 0.32,
        glow: false, marker: true, obstacles: 3,
        hint: 'যার উপরে ছোট্ট লাল ডট আছে, সে-ই আসল লোক!'
    },
    hard: {
        name: 'কঠিন 🔴',
        timeLimit: 45, decoys: 19, size: 64, moveMs: 1500,
        hue: [14, 26], accessoryChance: 0.4, accessorySize: 0.24,
        glow: false, marker: true, obstacles: 6,
        hint: 'ভালো করে খোঁজো! লাল ডট আছে যার উপরে, সে-ই আসল।'
    }
};

const state = {
    score: 0,
    level: null,
    levelKey: null,
    timeLeft: 0,
    timerId: null,
    lastTickAt: 0,
    charSize: 100,
    chars: [],          // { el, isTarget }
    obstacles: [],
    isGameStarted: false,
    isPaused: false,
    isSongPlaying: false,
    lastHitAt: 0,
    shuffleTimer: null,
    endTimer: null
};

const DEFAULT_STATUS = 'গেম শুরু করতে একটি লেভেল বেছে নাও';

targetScoreDisplay.textContent = CONFIG.targetScore;

/* =========================================================
   Helpers
   ========================================================= */
const rand = (min, max) => min + Math.random() * (max - min);
const pick = (list) => list[Math.floor(Math.random() * list.length)];

function setStatus(text, color = '#ffffff') {
    statusText.style.color = color;
    statusText.textContent = text;
}

// একই CSS animation আবার চালানোর জন্য
function retriggerClass(el, className) {
    el.classList.remove(className);
    void el.offsetWidth;
    el.classList.add(className);
}

function updateScore() {
    scoreDisplay.textContent = state.score;
    const progress = Math.min(state.score / CONFIG.targetScore, 1);
    progressBar.style.transform = `scaleX(${progress})`;
    retriggerClass(scoreDisplay, 'pop');
}

/* =========================================================
   Sound (একটাই AudioContext বারবার ব্যবহার হয়)
   ========================================================= */
let audioCtx = null;

function getAudioContext() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
    return audioCtx;
}

function playGunshotSound() {
    try {
        const ctx = getAudioContext();
        const now = ctx.currentTime;

        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(320, now);
        osc.frequency.exponentialRampToValueAtTime(10, now + 0.12);

        gain.gain.setValueAtTime(CONFIG.gunshotVolume, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.12);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(now);
        osc.stop(now + 0.12);
    } catch (e) {
        console.log('Audio Error:', e);
    }
}

/* =========================================================
   Gun cursor
   ========================================================= */
let pointerX = -100;
let pointerY = -100;
let gunFrameQueued = false;

function renderGun() {
    gun.style.transform = `translate3d(${pointerX}px, ${pointerY}px, 0)`;
    gunFrameQueued = false;
}

function trackPointer(e) {
    pointerX = e.clientX;
    pointerY = e.clientY;
    gun.classList.add('visible');

    if (!gunFrameQueued) {
        gunFrameQueued = true;
        requestAnimationFrame(renderGun);
    }
}

document.addEventListener('pointermove', trackPointer);

/* =========================================================
   Arena তৈরি: আসল লোক + নকল লোক + আড়াল
   ========================================================= */
function getCharSize(level) {
    const limit = Math.round(Math.min(window.innerWidth, window.innerHeight) * 0.22);
    return Math.max(48, Math.min(level.size, limit));
}

function createChar(isTarget, level, size, zIndex) {
    const el = document.createElement('div');
    el.className = 'char';
    el.style.width = `${size}px`;
    el.style.height = `${size}px`;
    el.style.zIndex = zIndex;

    const img = document.createElement('img');
    img.className = 'char-img';
    img.alt = '';
    img.draggable = false;

    const useSameImage = CONFIG.decoyImages.length === 0;

    if (isTarget) {
        img.src = CONFIG.targetImage;
        if (level.glow) el.classList.add('glow');
    } else if (useSameImage) {
        // নকল লোক: একই ছবি, কিন্তু রঙ বদলানো আর (সম্ভাবনা অনুযায়ী) টুপি/চশমা
        img.src = CONFIG.targetImage;
        const sign = level.hue[0] >= 90 ? 1 : (Math.random() < 0.5 ? -1 : 1);
        const deg = Math.round(rand(level.hue[0], level.hue[1]) * sign);
        img.style.filter = `hue-rotate(${deg}deg)`;
    } else {
        img.src = pick(CONFIG.decoyImages);
    }

    el.appendChild(img);

    // আসল লোকের উপরে ছোট লাল ডট (Medium ও Hard এ)
    if (isTarget && level.marker) {
        const marker = document.createElement('span');
        marker.className = 'char-marker';
        const dot = Math.max(12, Math.round(size * 0.2));
        marker.style.width = `${dot}px`;
        marker.style.height = `${dot}px`;
        el.appendChild(marker);
    }

    if (!isTarget && useSameImage && Math.random() < level.accessoryChance) {
        const acc = document.createElement('span');
        acc.className = 'char-acc';
        acc.textContent = pick(CONFIG.accessories);
        acc.style.fontSize = `${Math.round(size * level.accessorySize)}px`;
        acc.style.top = `${Math.round(rand(-8, 35))}%`;
        el.appendChild(acc);
    }

    return el;
}

function buildArena() {
    const level = state.level;
    arena.textContent = '';
    state.chars = [];
    state.obstacles = [];
    state.charSize = getCharSize(level);

    arena.style.setProperty('--move-ms', `${Math.round(level.moveMs * 0.3)}ms`);

    const total = level.decoys + 1;
    const targetIndex = Math.floor(Math.random() * total);

    for (let i = 0; i < total; i++) {
        const isTarget = i === targetIndex;
        // আসল লোক সবসময় নকলদের উপরে থাকে, যাতে পুরো ঢাকা পড়ে না যায়
        const zIndex = isTarget ? total + 1 : 1 + Math.floor(Math.random() * total);
        const el = createChar(isTarget, level, state.charSize, zIndex);
        arena.appendChild(el);
        state.chars.push({ el, isTarget });
    }

    for (let i = 0; i < level.obstacles; i++) {
        const el = document.createElement('div');
        el.className = 'obstacle';
        el.textContent = pick(CONFIG.obstacleEmojis);
        el.style.fontSize = `${Math.round(state.charSize * 0.75)}px`;
        arena.appendChild(el);
        state.obstacles.push(el);
    }
}

/* =========================================================
   সবাইকে নতুন জায়গায় সরানো
   ========================================================= */
function getRandomPosition(size) {
    const margin = 20;
    const minY = header.getBoundingClientRect().bottom + 10;
    const maxX = Math.max(margin, window.innerWidth - size - margin);
    const maxY = Math.max(minY, window.innerHeight - size - margin);

    return {
        x: margin + Math.random() * (maxX - margin),
        y: minY + Math.random() * (maxY - minY)
    };
}

function place(el, x, y) {
    el.style.transform = `translate3d(${Math.max(0, x)}px, ${Math.max(0, y)}px, 0)`;
}

function shuffleArena(instant = false) {
    if (!state.chars.length) return;
    const size = state.charSize;

    if (instant) arena.classList.add('no-anim');

    const positions = state.chars.map((c) => {
        const p = getRandomPosition(size);
        place(c.el, p.x, p.y);
        return p;
    });

    // আড়াল: কোনো একজন লোকের কাছাকাছি বসে আংশিক ঢেকে দেয়
    state.obstacles.forEach((el) => {
        const base = pick(positions);
        const dx = rand(0.3, 0.6) * size * (Math.random() < 0.5 ? -1 : 1);
        const dy = rand(0.3, 0.6) * size * (Math.random() < 0.5 ? -1 : 1);
        place(el, base.x + dx, base.y + dy);
    });

    if (instant) {
        void arena.offsetWidth;
        arena.classList.remove('no-anim');
    }
}

function stopShuffle() {
    clearInterval(state.shuffleTimer);
    state.shuffleTimer = null;
}

function startShuffle(instant = false) {
    stopShuffle();
    shuffleArena(instant);
    state.shuffleTimer = setInterval(() => shuffleArena(), state.level.moveMs);
}

window.addEventListener('resize', () => {
    if (state.isGameStarted && !state.isPaused) shuffleArena(true);
});

/* =========================================================
   Visual effects
   ========================================================= */
function createBullet(startX, startY, endX, endY) {
    const bullet = document.createElement('div');
    bullet.className = 'flying-bullet';
    document.body.appendChild(bullet);

    const angle = Math.atan2(endY - startY, endX - startX) * (180 / Math.PI);
    const from = `translate(${startX - 8}px, ${startY - 3}px) rotate(${angle}deg)`;
    const to = `translate(${endX - 8}px, ${endY - 3}px) rotate(${angle}deg)`;

    const anim = bullet.animate(
        [{ transform: from }, { transform: to }],
        { duration: CONFIG.bulletMs, easing: 'linear', fill: 'both' }
    );
    anim.onfinish = () => bullet.remove();
}

function createMuzzleFlash(x, y) {
    const flash = document.createElement('div');
    flash.className = 'muzzle-flash';
    flash.style.left = `${x}px`;
    flash.style.top = `${y}px`;
    document.body.appendChild(flash);
    flash.addEventListener('animationend', () => flash.remove(), { once: true });
}

function createEffect(x, y, text, color) {
    const el = document.createElement('div');
    el.className = 'effect';
    el.textContent = text;
    el.style.color = color;
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    document.body.appendChild(el);
    el.addEventListener('animationend', () => el.remove(), { once: true });
}

/* =========================================================
   Shooting
   ========================================================= */
// ক্লিকের জায়গায় কোন লোক আছে (একাধিক থাকলে সবচেয়ে উপরেরজন)
function findCharAt(x, y) {
    let best = null;

    for (const char of state.chars) {
        const rect = char.el.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;

        if (Math.hypot(x - cx, y - cy) <= rect.width / 2) {
            const z = Number(char.el.style.zIndex) || 0;
            if (!best || z > best.z) best = { char, cx, cy, z };
        }
    }
    return best;
}

function handleShot(e) {
    if (!state.isGameStarted || state.isPaused || e.button !== 0) return;
    if (e.target.closest('.modal, .quit-btn')) return;

    trackPointer(e);
    const x = e.clientX;
    const y = e.clientY;

    playGunshotSound();
    retriggerClass(gun, 'fire');
    setTimeout(() => gun.classList.remove('fire'), 100);
    createMuzzleFlash(x, y);

    const found = findCharAt(x, y);
    const now = performance.now();

    let result = 'miss';
    if (found) {
        if (!found.char.isTarget) result = 'wrong';
        else result = now - state.lastHitAt > CONFIG.hitCooldownMs ? 'hit' : 'ignore';
    }

    createBullet(x, y, found ? found.cx : x, found ? found.cy : y);

    if (result === 'hit') {
        state.lastHitAt = now;
        onHit(found);
    } else if (result === 'wrong') {
        onWrong(found);
    } else if (result === 'miss') {
        onMiss(x, y);
    }
}

function onHit(found) {
    createEffect(found.cx, found.cy, `+${CONFIG.pointsPerHit} HIT!`, '#00ff88');
    found.char.el.classList.add('hit');

    if (state.isSongPlaying) return;

    state.score += CONFIG.pointsPerHit;
    updateScore();

    if (state.score >= CONFIG.targetScore) {
        finishMission();
        return;
    }

    const remaining = (CONFIG.targetScore - state.score) / CONFIG.pointsPerHit;
    setStatus(`🎯 দারুণ! গান বাজতে আর ${remaining} টি শট বাকি!`, '#ffcc00');

    // একটু পরে নতুন করে সবাইকে সাজিয়ে আবার খোঁজার রাউন্ড শুরু
    setTimeout(() => {
        if (state.isGameStarted && !state.isPaused && !state.isSongPlaying) {
            buildArena();
            startShuffle(true);
        }
    }, 180);
}

function onWrong(found) {
    createEffect(found.cx, found.cy, `-${CONFIG.wrongPenalty} ভুল লোক!`, '#ff9900');
    retriggerClass(found.char.el, 'wrong');

    if (state.isSongPlaying) return;

    state.score = Math.max(0, state.score - CONFIG.wrongPenalty);
    updateScore();
    setStatus('❌ ভুল লোক! আসল লোকটিকে খুঁজে বের করো', '#ff9900');
}

function onMiss(x, y) {
    createEffect(x, y, '💨 MISS!', '#ff3333');
    if (!state.isSongPlaying) {
        setStatus('MISS! ❌ লক্ষ্যভ্রষ্ট হয়েছে!', '#ff3333');
    }
}

document.addEventListener('pointerdown', handleShot);
document.addEventListener('contextmenu', (e) => e.preventDefault());

/* =========================================================
   Timer (সময়সীমা)
   ========================================================= */
function renderTime() {
    const secs = Math.max(0, Math.ceil(state.timeLeft));
    timeDisplay.textContent = secs;
    timeDisplay.classList.toggle('danger', secs <= 10); // শেষ ১০ সেকেন্ডে লাল
}

function tick() {
    const now = performance.now();
    state.timeLeft -= (now - state.lastTickAt) / 1000;
    state.lastTickAt = now;
    renderTime();

    if (state.timeLeft <= 0) timeUp();
}

function stopTimer() {
    clearInterval(state.timerId);
    state.timerId = null;
}

function startTimer() {
    stopTimer();
    state.lastTickAt = performance.now(); // পজের পর আবার শুরুতে বাড়তি সময় কাটবে না
    state.timerId = setInterval(tick, 100);
}

/* =========================================================
   Game flow
   ========================================================= */
function resetGame() {
    stopShuffle();
    stopTimer();
    loseMusic.pause();
    loseMusic.currentTime = 0;
    clearTimeout(state.endTimer);
    music.removeEventListener('ended', showGameOver);
    music.pause();
    music.currentTime = 0;

    arena.textContent = '';
    state.chars = [];
    state.obstacles = [];

    state.score = 0;
    state.isGameStarted = false;
    state.isPaused = false;
    state.isSongPlaying = false;
    state.lastHitAt = 0;

    quitBtn.classList.remove('visible');
    levelNameDisplay.textContent = '-';
    timeDisplay.textContent = '--';
    timeDisplay.classList.remove('danger');
    updateScore();
}

function startGame(levelKey) {
    getAudioContext(); // ইউজারের ক্লিকেই সাউন্ড আনলক
    resetGame();

    state.levelKey = levelKey;
    state.level = LEVELS[levelKey];
    state.timeLeft = state.level.timeLimit;
    state.isGameStarted = true;
    levelNameDisplay.textContent = state.level.name;

    startModal.classList.remove('active');
    quitBtn.classList.add('visible');
    setStatus(state.level.hint);

    buildArena();
    startShuffle(true);
    renderTime();
    startTimer();
}

function finishMission() {
    state.isSongPlaying = true;
    stopShuffle();
    stopTimer(); // মিশন শেষ, তাই আর সময় কমবে না
    setStatus('🎉 মিশন কমপ্লিট! গান চলছে... 🎶', '#00ff88');

    if (!music) {
        showGameOver();
        return;
    }

    music.currentTime = 0;
    music.addEventListener('ended', showGameOver, { once: true });
    music.play().catch((err) => {
        console.log('Music error:', err);
        state.endTimer = setTimeout(showGameOver, 1500); // গান না বাজলেও গেম আটকে থাকবে না
    });
}

function showGameOver() {
    state.isGameStarted = false;
    arena.textContent = '';
    state.chars = [];
    quitBtn.classList.remove('visible');
    gameOverModal.classList.add('active');
}

function timeUp() {
    stopTimer();
    stopShuffle();

    state.isGameStarted = false;
    arena.textContent = '';
    state.chars = [];
    quitBtn.classList.remove('visible');

    finalScoreDisplay.textContent = state.score;
    setStatus('⏰ সময় শেষ!', '#ff3333');

    loseMusic.currentTime = 0;
    loseMusic.play().catch((err) => console.log('Music error:', err));
    timeUpModal.classList.add('active');
}

function showMenu() {
    setStatus(DEFAULT_STATUS);
    startModal.classList.add('active');
}

/* ---------- Pause / Quit ---------- */
function pauseGame() {
    if (!state.isGameStarted || state.isPaused) return;
    state.isPaused = true;
    stopShuffle();
    stopTimer();
    if (state.isSongPlaying) music.pause();
    quitModal.classList.add('active');
}

function resumeGame() {
    if (!state.isPaused) return;
    state.isPaused = false;
    quitModal.classList.remove('active');

    if (state.isSongPlaying) {
        music.play().catch((err) => console.log('Music error:', err));
    } else {
        startShuffle();
        startTimer();
    }
}

function quitGame() {
    quitModal.classList.remove('active');
    resetGame();
    showMenu();
}

quitBtn.addEventListener('click', pauseGame);
resumeBtn.addEventListener('click', resumeGame);
quitConfirmBtn.addEventListener('click', quitGame);

document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (state.isPaused) resumeGame();
    else pauseGame();
});

// ট্যাব বদলালে গেম নিজে থেকে থামবে
document.addEventListener('visibilitychange', () => {
    if (document.hidden) pauseGame();
});

/* ---------- Buttons ---------- */
document.querySelectorAll('.level-btn').forEach((btn) => {
    btn.addEventListener('click', () => startGame(btn.dataset.level));
});

retryBtn.addEventListener('click', () => {
    timeUpModal.classList.remove('active');
    startGame(state.levelKey); // একই লেভেল আবার
});

timeUpMenuBtn.addEventListener('click', () => {
    timeUpModal.classList.remove('active');
    resetGame();
    showMenu();
});

restartBtn.addEventListener('click', () => {
    gameOverModal.classList.remove('active');
    resetGame();
    showMenu();
});
