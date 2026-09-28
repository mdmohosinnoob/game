'use strict';

/* =========================================================
   DOM
   ========================================================= */
const $ = (id) => document.getElementById(id);

const target = $('target');
const statusText = $('status');
const music = $('bgMusic');
const gun = $('gun');
const scoreDisplay = $('score');
const targetScoreDisplay = $('target-score');
const progressBar = $('progressBar');
const header = document.querySelector('.header');

const startModal = $('startModal');
const gameOverModal = $('gameOverModal');
const startBtn = $('startBtn');
const restartBtn = $('restartBtn');

/* =========================================================
   Config & State
   ========================================================= */
const CONFIG = {
    targetScore: 50,
    pointsPerHit: 10,
    moveEveryMs: 1600,   // টার্গেট কতক্ষণ পরপর জায়গা বদলাবে
    hitCooldownMs: 250,  // হিটের পর এত ms এর মধ্যে আরেকটা হিট গোনা হবে না
    bulletMs: 140,
    gunshotVolume: 0.5
};

const state = {
    score: 0,
    isGameStarted: false,
    isSongPlaying: false,
    lastHitAt: 0,
    moveTimer: null
};

const DEFAULT_STATUS = 'গেম শুরু করতে START চাপুন';

targetScoreDisplay.textContent = CONFIG.targetScore;

/* =========================================================
   Helpers
   ========================================================= */
function setStatus(text, color = '#ffffff') {
    statusText.style.color = color;
    statusText.textContent = text;
}

// একই CSS animation আবার চালানোর জন্য
function retriggerClass(el, className) {
    el.classList.remove(className);
    void el.offsetWidth; // reflow জোর করে করানো
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
   Gun cursor (মাউস + টাচ দুটোতেই কাজ করে)
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

    // প্রতি ফ্রেমে সর্বোচ্চ একবার আপডেট, তাই লাগ কম
    if (!gunFrameQueued) {
        gunFrameQueued = true;
        requestAnimationFrame(renderGun);
    }
}

document.addEventListener('pointermove', trackPointer);

/* =========================================================
   Target movement
   ========================================================= */
function getRandomPosition() {
    const size = target.offsetWidth;
    const margin = 20;
    const minY = header.getBoundingClientRect().bottom + 10;
    const maxX = Math.max(margin, window.innerWidth - size - margin);
    const maxY = Math.max(minY, window.innerHeight - size - margin);

    return {
        x: margin + Math.random() * (maxX - margin),
        y: minY + Math.random() * (maxY - minY)
    };
}

function moveTarget(instant = false) {
    const { x, y } = getRandomPosition();

    if (instant) target.classList.add('no-anim');
    target.style.transform = `translate3d(${x}px, ${y}px, 0)`;
    if (instant) {
        void target.offsetWidth;
        target.classList.remove('no-anim');
    }
}

function stopTargetMovement() {
    clearInterval(state.moveTimer);
    state.moveTimer = null;
}

function startTargetMovement(instant = false) {
    stopTargetMovement();
    moveTarget(instant);
    state.moveTimer = setInterval(moveTarget, CONFIG.moveEveryMs);
}

window.addEventListener('resize', () => {
    if (target.style.display === 'flex') moveTarget(true);
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
function handleShot(e) {
    if (!state.isGameStarted || e.button !== 0 || e.target.closest('.modal')) return;

    trackPointer(e);
    const x = e.clientX;
    const y = e.clientY;

    playGunshotSound();
    retriggerClass(gun, 'fire');
    setTimeout(() => gun.classList.remove('fire'), 100);
    createMuzzleFlash(x, y);

    // গোল টার্গেট: কেন্দ্র থেকে দূরত্ব <= ব্যাসার্ধ হলে হিট
    const rect = target.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const now = performance.now();

    const isHit =
        Math.hypot(x - centerX, y - centerY) <= rect.width / 2 &&
        now - state.lastHitAt > CONFIG.hitCooldownMs;

    createBullet(x, y, isHit ? centerX : x, isHit ? centerY : y);

    if (isHit) {
        state.lastHitAt = now;
        onHit(centerX, centerY);
    } else {
        onMiss(x, y);
    }
}

function onHit(centerX, centerY) {
    createEffect(centerX, centerY, `+${CONFIG.pointsPerHit} HIT!`, '#00ff88');
    target.classList.add('hit');
    setTimeout(() => target.classList.remove('hit'), 120);

    if (state.isSongPlaying) return;

    // স্কোর সাথে সাথে যোগ হয়, তাই দ্রুত ডাবল ক্লিকে ভুল হয় না
    state.score += CONFIG.pointsPerHit;
    updateScore();

    if (state.score >= CONFIG.targetScore) {
        finishMission();
        return;
    }

    const remaining = (CONFIG.targetScore - state.score) / CONFIG.pointsPerHit;
    setStatus(`🎯 দারুণ! গান বাজতে আর ${remaining} টি শট বাকি!`, '#ffcc00');
    startTargetMovement(); // নতুন জায়গায় সরানো + টাইমার রিসেট
}

function onMiss(x, y) {
    createEffect(x, y, '💨 MISS!', '#ff3333');
    if (!state.isSongPlaying) {
        setStatus('MISS! ❌ লক্ষ্যভ্রষ্ট হয়েছে!', '#ff3333');
    }
}

// pointerdown ব্যবহার করায় ক্লিকের সাথে সাথেই গুলি হয় (click এর চেয়ে দ্রুত)
document.addEventListener('pointerdown', handleShot);
document.addEventListener('contextmenu', (e) => e.preventDefault());

/* =========================================================
   Game flow
   ========================================================= */
function resetGame() {
    stopTargetMovement();
    music.removeEventListener('ended', showGameOver);
    music.pause();
    music.currentTime = 0;

    state.score = 0;
    state.isSongPlaying = false;
    state.lastHitAt = 0;
    updateScore();
}

function startGame() {
    getAudioContext(); // ইউজারের ক্লিকেই সাউন্ড আনলক
    resetGame();

    state.isGameStarted = true;
    startModal.classList.remove('active');

    target.style.display = 'flex';
    setStatus('নিশানা লাগাও!');
    startTargetMovement(true);
}

function finishMission() {
    state.isSongPlaying = true;
    stopTargetMovement();
    setStatus('🎉 মিশন কমপ্লিট! গান চলছে... 🎶', '#00ff88');

    if (!music) {
        showGameOver();
        return;
    }

    music.currentTime = 0;
    music.addEventListener('ended', showGameOver, { once: true });
    music.play().catch((err) => {
        console.log('Music error:', err);
        setTimeout(showGameOver, 1500); // গান না বাজলেও গেম যেন আটকে না থাকে
    });
}

function showGameOver() {
    state.isGameStarted = false;
    target.style.display = 'none';
    gameOverModal.classList.add('active');
}

function restartGame() {
    gameOverModal.classList.remove('active');
    resetGame();
    setStatus(DEFAULT_STATUS);
    startModal.classList.add('active');
}

startBtn.addEventListener('click', startGame);
restartBtn.addEventListener('click', restartGame);
