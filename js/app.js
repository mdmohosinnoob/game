const target = document.getElementById('target');
const statusText = document.getElementById('status');
const music = document.getElementById('bgMusic');
const gun = document.getElementById('gun');

// বন্ধুকের গুলির রিয়েল সাউন্ড
function playGunshotSound() {
    try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();

        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(300, audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(10, audioCtx.currentTime + 0.15);

        gain.gain.setValueAtTime(1, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.15);

        osc.connect(gain);
        gain.connect(audioCtx.destination);

        osc.start();
        osc.stop(audioCtx.currentTime + 0.15);
    } catch(e) {
        console.log("Audio Error:", e);
    }
}

// মাউসের সাথে বন্দুক ট্র্যাকিং
document.addEventListener('mousemove', (e) => {
    gun.style.left = `${e.clientX}px`;
    gun.style.top = `${e.clientY}px`;
});

// র্যান্ডম পজিশনে টার্গেট সরানো
function moveTarget() {
    const x = Math.random() * (window.innerWidth - 160) + 60;
    const y = Math.random() * (window.innerHeight - 260) + 130;
    target.style.left = `${x}px`;
    target.style.top = `${y}px`;
}

let moveInterval = setInterval(moveTarget, 1600);

// ফায়ারিং ও বুলেটের গতিপথ
document.addEventListener('click', (e) => {
    // ১. বন্দুকের শব্দ ও রিকয়েল অ্যানিমেশন
    playGunshotSound();
    gun.classList.add('fire');
    setTimeout(() => gun.classList.remove('fire'), 100);

    const startX = e.clientX;
    const startY = e.clientY;

    // টার্গেটের বর্তমান পজিশন নির্ণয়
    const rect = target.getBoundingClientRect();
    const targetCenterX = rect.left + rect.width / 2;
    const targetCenterY = rect.top + rect.height / 2;

    // নিশানায় লেগেছে কি না পরীক্ষা (Hit Area)
    const isHit = (
        startX >= rect.left &&
        startX <= rect.right &&
        startY >= rect.top &&
        startY <= rect.bottom
    );

    createMuzzleFlash(startX, startY);

    // ২. গুলিটি বন্দুক থেকে ছিটকে টার্গেটের দিকে যাবে
    const destinationX = isHit ? targetCenterX : startX + (Math.random() * 200 - 100);
    const destinationY = isHit ? targetCenterY : startY + (Math.random() * 200 - 100);

    shootBulletToTarget(startX, startY, destinationX, destinationY, () => {
        // ৩. গুলি শরীরে পৌঁছানোর পর হিট/মিস ইভেন্ট চালু হবে
        if (isHit) {
            statusText.style.color = '#00ff88';
            statusText.innerText = 'BANG! 🔫 গায়ে গুলি লেগেছে!';
            createEffect(targetCenterX, targetCenterY, '💥 HIT!', '#00ff88');

            // টার্গেটের গায়ে আঘাতের ধাক্কা অ্যানিমেশন
            target.style.transform = 'translate(-50%, -50%) scale(1.15)';
            setTimeout(() => {
                target.style.transform = 'translate(-50%, -50%) scale(1)';
            }, 100);

            // গান বাজানো শুরু
            if (music) {
                music.currentTime = 0;
                music.play().catch(err => console.log("Music play error:", err));
            }

            moveTarget();
        } else {
            statusText.style.color = '#ff3333';
            statusText.innerText = 'MISS! ❌ লক্ষ্যভ্রষ্ট হয়েছে!';
            createEffect(startX, startY, '💨 MISS!', '#ff3333');

            if (music) {
                music.pause();
            }
        }
    });
});

// ড্রামাটিক ফ্লাইং বুলেট অ্যানিমেশন
function shootBulletToTarget(startX, startY, endX, endY, onHitCallback) {
    const bullet = document.createElement('div');
    bullet.className = 'flying-bullet';
    bullet.style.left = `${startX}px`;
    bullet.style.top = `${startY}px`;
    document.body.appendChild(bullet);

    // ডাইনামিক রোটেশন ও এনিমেশন
    const angle = Math.atan2(endY - startY, endX - startX) * (180 / Math.PI);
    bullet.style.transform = `rotate(${angle}deg)`;

    // বুলেট ট্রাভেল সময় (200ms)
    setTimeout(() => {
        bullet.style.left = `${endX}px`;
        bullet.style.top = `${endY}px`;
    }, 20);

    // শরীরে পৌঁছানোর পর
    setTimeout(() => {
        bullet.remove();
        if (onHitCallback) onHitCallback();
    }, 200);
}

function createMuzzleFlash(x, y) {
    const flash = document.createElement('div');
    flash.className = 'muzzle-flash';
    flash.style.left = `${x}px`;
    flash.style.top = `${y}px`;
    document.body.appendChild(flash);

    setTimeout(() => flash.remove(), 150);
}

function createEffect(x, y, text, color) {
    const el = document.createElement('div');
    el.className = 'effect';
    el.innerText = text;
    el.style.color = color;
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    document.body.appendChild(el);

    setTimeout(() => el.remove(), 600);
}
