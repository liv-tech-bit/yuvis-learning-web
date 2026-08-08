// ==========================================
// 1. STATE & LOCAL STORAGE
// ==========================================
let unlockedPhase = parseInt(localStorage.getItem('unlockedPhase')) || 1;
let absoluteDay = parseInt(localStorage.getItem('absoluteDay')) || 1;
let completedWords = JSON.parse(localStorage.getItem('completedWords')) || [];
let gameHighScore = parseInt(localStorage.getItem('gameHighScore')) || 0;

let isMissionActive = false;
let tracingQueue = [];
let matchingBatches = [];
let currentBatchIndex = 0;

// ==========================================
// 2. AUDIO MANAGER (Total Wipe Fixed)
// ==========================================
const audioManager = {
    bgm: null,
    activeSFX: [], 
    playBGM: function(filename, volume = 0.25) { 
        if (this.bgm) { 
            this.bgm.pause(); 
            this.bgm.src = ""; 
            this.bgm = null; 
        }
        this.bgm = new Audio(`audio/${filename}`);
        this.bgm.volume = volume; 
        this.bgm.loop = true;
        this.bgm.play().catch(e => console.error("BGM blocked:", e));
    },
    stopBGM: function() {
        if (this.bgm) { 
            this.bgm.pause(); 
            this.bgm.src = ""; 
            this.bgm = null; 
        }
    },
    stopAll: function() {
        this.stopBGM();
        this.activeSFX.forEach(sfx => {
            sfx.pause();
            sfx.src = "";
        });
        this.activeSFX = [];
    },
    playSFX: function(filename, volume = 1.0) {
        let sfx = new Audio(`audio/${filename}`);
        sfx.volume = volume; 
        
        this.activeSFX.push(sfx);
        sfx.addEventListener('ended', () => {
            this.activeSFX = this.activeSFX.filter(a => a !== sfx);
        });
        
        sfx.play().catch(e => console.error(`Error: ${filename}`, e));
    },
    playTracingSound: function() { this.playSFX('slide.wav', 0.15); }
};

document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
        audioManager.stopAll(); 
        if (gameState === 'PLAYING') {
            gameState = 'PAUSED';
            document.getElementById('game-overlay').style.display = 'flex';
            document.getElementById('game-overlay-title').innerText = "PAUSED";
            document.getElementById('game-start-btn').innerText = "RESUME";
        }
    } else {
        const activeTab = document.querySelector('.nav-item.active').getAttribute('data-target');
        if (activeTab === 'tab-games' && gameState === 'PLAYING') {
            audioManager.playBGM('bg_music.mp3', 0.25);
        }
    }
});

// ==========================================
// 3. UI RENDERING (Dictionary & Calendar)
// ==========================================
function renderDictionary(searchQuery = "") {
    const listContainer = document.getElementById('dictionary-list');
    listContainer.innerHTML = ""; 

    const wordsInPhase = dictionaryList.filter(w => w.phase === unlockedPhase);
    const completedInPhase = wordsInPhase.filter(w => completedWords.includes(w.english)).length;
    
    document.getElementById('level-title').innerText = `Level ${unlockedPhase} 🌟`;
    document.getElementById('progress-text').innerText = `${completedInPhase} / ${wordsInPhase.length} words done`;
    
    const levelUpBtn = document.getElementById('level-up-btn');
    if (completedInPhase === wordsInPhase.length && wordsInPhase.length > 0) {
        levelUpBtn.innerText = "Level Up! 🚀"; levelUpBtn.disabled = false;
    } else {
        levelUpBtn.innerText = "Locked 🔒"; levelUpBtn.disabled = true;
    }

    dictionaryList.forEach((word, index) => {
        if (searchQuery && !word.english.toLowerCase().includes(searchQuery.toLowerCase())) return;
        const isLocked = word.phase > unlockedPhase;
        const isCompleted = completedWords.includes(word.english);
        const emoji = funEmojis[index % funEmojis.length];

        const card = document.createElement('div');
        card.className = `word-card ${isLocked ? 'locked' : ''} ${isCompleted ? 'completed' : ''}`;
        card.innerHTML = `
            <div>
                <div class="word-title">${word.english} ${isCompleted ? '✅' : ''}</div>
                ${isLocked ? `<div class="subtitle">Complete previous phases to unlock!</div>` : `<div class="subtitle">Hindi: ${word.hindi}</div><div class="word-sub">Hinglish: ${word.hinglish}</div>`}
            </div>
            <div style="font-size: 32px;">${isLocked ? '🔒' : emoji}</div>
        `;
        
        if (!isLocked) {
            card.style.cursor = "pointer";
            card.onclick = () => { isMissionActive = false; openTracingScreen(word, emoji, 1); };
        }
        listContainer.appendChild(card);
    });
}

function renderCalendar() {
    const container = document.getElementById('calendar-container');
    container.innerHTML = "";
    const currentWeek = Math.floor((absoluteDay - 1) / 7) + 1;
    const dayOfWeek = ((absoluteDay - 1) % 7) + 1;
    const isSunday = dayOfWeek === 7;
    document.getElementById('mission-title').innerText = isSunday ? `Sunday Mega Quiz! 🏆` : `Week ${currentWeek}, Day ${dayOfWeek} 🚀`;

    for (let w = 1; w <= 4; w++) {
        const weekBlock = document.createElement('div');
        weekBlock.className = 'week-block';
        weekBlock.innerHTML = `<div class="week-title">Week ${w}</div>`;
        const daysRow = document.createElement('div');
        daysRow.className = 'days-row';
        for (let d = 1; d <= 7; d++) {
            const thisDayAbs = ((w - 1) * 7) + d;
            const dayBox = document.createElement('div');
            dayBox.className = 'day-box';
            if (thisDayAbs < absoluteDay) { dayBox.classList.add('completed'); dayBox.innerText = '⭐'; } 
            else if (thisDayAbs === absoluteDay) { dayBox.classList.add('current'); dayBox.innerText = '🎯'; } 
            else { dayBox.innerText = d; }
            daysRow.appendChild(dayBox);
        }
        weekBlock.appendChild(daysRow);
        container.appendChild(weekBlock);
    }
}

// ==========================================
// 4. SPACED REPETITION (SRS) MATH
// ==========================================
function getTodaySrsWords(day) {
    if (dictionaryList.length === 0) return [];
    const isSunday = ((day - 1) % 7) + 1 === 7;
    const completedWeeks = Math.floor((day - 1) / 7);
    const learningDaysThisWeek = Math.min((day - 1) % 7, 6);
    const totalUnlockedPreviously = (completedWeeks * 12) + (learningDaysThisWeek * 2);

    if (isSunday) {
        const startIdx = Math.max(0, totalUnlockedPreviously - 12);
        return dictionaryList.slice(startIdx, Math.min(totalUnlockedPreviously, dictionaryList.length));
    } else {
        const startIdx = Math.max(0, totalUnlockedPreviously - 12);
        const endIdx = totalUnlockedPreviously + 2;
        return dictionaryList.slice(startIdx, Math.min(endIdx, dictionaryList.length));
    }
}

function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

// ==========================================
// 5. DRAWING & TRACING ENGINE
// ==========================================
const tCanvas = document.getElementById('tracing-canvas');
const tCtx = tCanvas.getContext('2d');
let isDrawing = false;
let totalDistance = 0; let requiredDistance = 0; let lastPos = null;
let activeWord = null; let currentStep = 1;

let currentColor = '#2EC4B6'; let currentBrushSize = 6; 
const penColors = ['#2EC4B6', '#FF5252', '#FF4081', '#7C4DFF', '#448AFF', '#00E676', '#FFD740', '#000000'];

const paletteContainer = document.getElementById('color-palette');
penColors.forEach(color => {
    const btn = document.createElement('div'); btn.className = 'color-btn'; btn.style.backgroundColor = color;
    if (color === currentColor) btn.style.border = '3px solid black';
    btn.onclick = () => {
        currentColor = color;
        Array.from(paletteContainer.children).forEach(c => c.style.border = '1px solid lightgray');
        btn.style.border = '3px solid black';
    };
    paletteContainer.appendChild(btn);
});

document.getElementById('brush-toggle').onclick = (e) => {
    currentBrushSize = currentBrushSize === 6 ? 12 : 6;
    e.target.innerText = currentBrushSize === 6 ? '🖊️' : '🖌️';
};

function resizeTCanvas() {
    tCanvas.width = tCanvas.parentElement.clientWidth; tCanvas.height = tCanvas.parentElement.clientHeight;
    tCtx.lineCap = 'round'; tCtx.lineJoin = 'round';
}
window.addEventListener('resize', resizeTCanvas);

function getCoords(e) {
    if (e.touches && e.touches.length > 0) {
        const rect = tCanvas.getBoundingClientRect();
        return { x: e.touches[0].clientX - rect.left, y: e.touches[0].clientY - rect.top };
    }
    return { x: e.offsetX, y: e.offsetY };
}

function startDraw(e) { 
    isDrawing = true; lastPos = getCoords(e); tCtx.beginPath(); tCtx.moveTo(lastPos.x, lastPos.y); 
    audioManager.playTracingSound();
}
function drawing(e) {
    if (!isDrawing) return;
    const pos = getCoords(e);
    tCtx.lineWidth = currentBrushSize; tCtx.strokeStyle = currentColor; tCtx.lineTo(pos.x, pos.y); tCtx.stroke();
    
    if (lastPos) {
        const dx = pos.x - lastPos.x; const dy = pos.y - lastPos.y;
        totalDistance += Math.sqrt(dx * dx + dy * dy);
    }
    lastPos = pos;
    const btn = document.getElementById('done-tracing-btn');
    if (totalDistance >= requiredDistance && btn.disabled) {
        audioManager.playSFX('slide.wav', 1.0); btn.disabled = false;
    }
}
function stopDraw() { isDrawing = false; tCtx.beginPath(); lastPos = null; }

tCanvas.addEventListener('mousedown', startDraw); tCanvas.addEventListener('mousemove', drawing);
tCanvas.addEventListener('mouseup', stopDraw); tCanvas.addEventListener('mouseout', stopDraw);
tCanvas.addEventListener('touchstart', (e) => { e.preventDefault(); startDraw(e); }, { passive: false });
tCanvas.addEventListener('touchmove', (e) => { e.preventDefault(); drawing(e); }, { passive: false });
tCanvas.addEventListener('touchend', stopDraw); tCanvas.addEventListener('touchcancel', stopDraw);

document.getElementById('clear-board-btn').onclick = () => {
    tCtx.clearRect(0, 0, tCanvas.width, tCanvas.height); totalDistance = 0; document.getElementById('done-tracing-btn').disabled = true;
};

function openTracingScreen(wordObj, emoji, step = 1) {
    activeWord = wordObj; currentStep = step;
    document.getElementById('tracing-title').innerText = `${emoji} ${wordObj.english.toUpperCase()}`;
    document.getElementById('tracing-step-label').innerText = isMissionActive ? `Step ${step} of 5` : "Practice Mode";
    
    let fontSize = "80px"; let textAlpha = 0.25;
    if(step === 2) fontSize = "70px";
    if(step === 3) { fontSize = "60px"; textAlpha = 0.15; }
    if(step === 4) { fontSize = "50px"; textAlpha = 0.08; }
    if(step === 5) { fontSize = "50px"; textAlpha = 0.02; } 
    
    const hText = document.getElementById('trace-hindi'); const eText = document.getElementById('trace-hinglish');
    hText.innerText = wordObj.hindi; hText.style.fontSize = fontSize; hText.style.color = `rgba(0,0,0,${textAlpha})`;
    eText.innerText = wordObj.hinglish; eText.style.fontSize = fontSize; eText.style.color = `rgba(0,0,0,${textAlpha})`;
    
    const totalChars = wordObj.hindi.length + wordObj.hinglish.length;
    requiredDistance = Math.max(150, totalChars * 60);
    
    document.getElementById('tracing-screen').classList.remove('hidden');
    document.getElementById('done-tracing-btn').innerText = (isMissionActive && step < 5) ? "Next Step" : "Done!";
    
    resizeTCanvas(); tCtx.clearRect(0, 0, tCanvas.width, tCanvas.height);
    totalDistance = 0; document.getElementById('done-tracing-btn').disabled = true;
}

document.getElementById('close-tracing-btn').onclick = () => { document.getElementById('tracing-screen').classList.add('hidden'); isMissionActive = false; };
document.getElementById('done-tracing-btn').onclick = () => {
    if (!completedWords.includes(activeWord.english)) {
        completedWords.push(activeWord.english); localStorage.setItem('completedWords', JSON.stringify(completedWords));
    }
    if (isMissionActive) {
        if (currentStep < 5) { openTracingScreen(activeWord, funEmojis[dictionaryList.indexOf(activeWord) % funEmojis.length], currentStep + 1); } 
        else { audioManager.playSFX('win.mp3'); tracingQueue.shift(); processNextMissionTask(); }
    } else {
        audioManager.playSFX('win.mp3'); document.getElementById('tracing-screen').classList.add('hidden'); renderDictionary();
    }
};

// ==========================================
// 6. MISSION & MATCHING LOGIC
// ==========================================
document.getElementById('start-mission-btn').addEventListener('click', () => {
    const todayWords = getTodaySrsWords(absoluteDay);
    if (todayWords.length === 0) return;
    audioManager.playSFX('gamestart.mp3'); isMissionActive = true; tracingQueue = [];
    const isSunday = ((absoluteDay - 1) % 7) + 1 === 7;
    const reviewCount = isSunday ? todayWords.length : Math.max(0, todayWords.length - 2);
    if (isSunday) { todayWords.forEach(w => tracingQueue.push({ word: w, startStep: 5 })); } 
    else {
        todayWords.slice(0, reviewCount).forEach(w => tracingQueue.push({ word: w, startStep: 3 }));
        todayWords.slice(reviewCount).forEach(w => tracingQueue.push({ word: w, startStep: 1 }));
    }

    matchingBatches = [];
    let shuffled = shuffleArray([...todayWords]);
    for (let i = 0; i < shuffled.length; i += 6) { matchingBatches.push(shuffled.slice(i, i + 6)); }
    currentBatchIndex = 0; processNextMissionTask();
});

function processNextMissionTask() {
    if (tracingQueue.length > 0) {
        const next = tracingQueue[0];
        const emoji = funEmojis[dictionaryList.indexOf(next.word) % funEmojis.length];
        openTracingScreen(next.word, emoji, next.startStep);
    } else {
        document.getElementById('tracing-screen').classList.add('hidden');
        if (currentBatchIndex < matchingBatches.length) { openMatchingScreen(matchingBatches[currentBatchIndex]); } 
        else {
            showDancingReward(() => {
                absoluteDay++; localStorage.setItem('absoluteDay', absoluteDay); isMissionActive = false;
                renderCalendar(); renderDictionary();
            });
        }
    }
}

function openMatchingScreen(batchWords) {
    document.getElementById('matching-screen').classList.remove('hidden');
    document.getElementById('matching-progress').innerText = `Part ${currentBatchIndex + 1} of ${matchingBatches.length}`;
    const leftCol = document.getElementById('match-left'); const rightCol = document.getElementById('match-right');
    leftCol.innerHTML = ''; rightCol.innerHTML = '';
    
    let leftWords = shuffleArray([...batchWords]); let rightWords = shuffleArray([...batchWords]);
    let selectedLeft = null; let matchedCount = 0;

    leftWords.forEach(w => {
        const btn = document.createElement('button'); btn.className = 'match-btn'; btn.innerText = w.english;
        btn.onclick = () => {
            if (btn.classList.contains('matched')) return;
            audioManager.playSFX('slide.wav'); 
            Array.from(leftCol.children).forEach(c => c.classList.remove('selected'));
            btn.classList.add('selected'); selectedLeft = w;
        };
        leftCol.appendChild(btn);
    });

    rightWords.forEach((w) => {
        const btn = document.createElement('button'); btn.className = 'match-btn'; btn.innerText = w.hinglish; 
        btn.onclick = () => {
            if (btn.classList.contains('matched') || !selectedLeft) return;
            if (selectedLeft === w) {
                audioManager.playSFX('coin.wav'); btn.classList.add('matched');
                const leftBtn = Array.from(leftCol.children).find(b => b.innerText === w.english);
                leftBtn.classList.remove('selected'); leftBtn.classList.add('matched');
                selectedLeft = null; matchedCount++;
                if (matchedCount === batchWords.length) {
                    setTimeout(() => {
                        document.getElementById('matching-screen').classList.add('hidden');
                        currentBatchIndex++;
                        if (currentBatchIndex < matchingBatches.length) { showDancingReward(() => processNextMissionTask()); } 
                        else { processNextMissionTask(); }
                    }, 500);
                }
            } else {
                audioManager.playSFX('wrong.wav'); 
                Array.from(leftCol.children).forEach(c => c.classList.remove('selected'));
                selectedLeft = null;
            }
        };
        rightCol.appendChild(btn);
    });
}

function showDancingReward(onContinueCallback) {
    const randomReward = rewardData[Math.floor(Math.random() * rewardData.length)];
    document.getElementById('reward-emoji').innerText = randomReward[0];
    document.getElementById('reward-continue-btn').innerText = randomReward[1];
    audioManager.playSFX('greatjobletskeepgoing.mp3'); 
    const rewardScreen = document.getElementById('reward-screen'); rewardScreen.classList.remove('hidden');
    document.getElementById('reward-continue-btn').onclick = () => {
        rewardScreen.classList.add('hidden'); if (onContinueCallback) onContinueCallback(); 
    };
}

// ==========================================
// 7. BOTTOM NAVIGATION
// ==========================================
document.querySelectorAll('.nav-item').forEach(button => {
    button.addEventListener('click', () => {
        document.querySelectorAll('.nav-item').forEach(btn => btn.classList.remove('active'));
        document.querySelectorAll('.tab-view').forEach(tab => tab.classList.add('hidden'));
        
        const targetId = button.getAttribute('data-target');
        button.classList.add('active');
        document.getElementById(targetId).classList.remove('hidden');

        if (targetId === 'tab-games') {
            if (gameState === 'START' || gameState === 'GAMEOVER') {
                initGame();
            } else if (gameState === 'PAUSED' && score > 0) {
                document.getElementById('game-overlay').style.display = 'flex';
                audioManager.playBGM('bg_music.mp3', 0.25);
            }
        } else {
            audioManager.stopAll();
            if (gameState === 'PLAYING') {
                gameState = 'PAUSED'; 
                document.getElementById('game-overlay').style.display = 'flex';
                document.getElementById('game-overlay-title').innerText = "PAUSED";
                document.getElementById('game-start-btn').innerText = "RESUME";
            }
        }
    });
});

document.getElementById('level-up-btn').addEventListener('click', () => {
    if (unlockedPhase < 3) {
        unlockedPhase++; localStorage.setItem('unlockedPhase', unlockedPhase);
        audioManager.playSFX('win.mp3'); renderDictionary();
    }
});

document.getElementById('reset-btn').addEventListener('click', () => {
    const num1 = Math.floor(Math.random() * 900) + 100; const num2 = Math.floor(Math.random() * 90) + 10;   
    const answer = num1 + num2;
    const userInput = prompt(`Parental Lock 🔒\nSolve this to reset progress:\nWhat is ${num1} + ${num2}?`);
    if (userInput !== null && parseInt(userInput) === answer) {
        localStorage.clear(); unlockedPhase = 1; absoluteDay = 1; completedWords = [];
        renderDictionary(); renderCalendar();
        alert("Progress successfully reset to Level 1.");
    } else if (userInput !== null) { alert("Incorrect answer. Progress was not reset."); }
});

document.getElementById('search-input').addEventListener('input', (e) => renderDictionary(e.target.value));

renderDictionary(); renderCalendar();

// ==========================================
// 8. ENDLESS RUNNER GAME
// ==========================================
const gCanvas = document.getElementById('game-canvas');
const gCtx = gCanvas.getContext('2d');

const uiScore = document.getElementById('game-score');
const uiHiScore = document.getElementById('game-hi-score');
const uiLives = document.getElementById('game-lives');
const uiTarget = document.getElementById('game-target-word');
const uiFeedback = document.getElementById('game-feedback');
const overlay = document.getElementById('game-overlay');
const startBtn = document.getElementById('game-start-btn');

let gameRAF;
let gameState = 'START'; 
let score = 0; let lives = 3; let lastTime = 0; 
let gameSpeed = 200; 

let char = { x: 120, y: 650, w: 50, h: 60, vy: 0, gravity: 2200, jumpForce: -1100, isJumping: false, isSliding: false };
let obstacles = [];
let gameWords = []; let targetWord = null; let groundScrollX = 0;

let lastLane = 650; 
let lastHazardType = ''; 

let clouds = [ {x: 100, y: 100, w: 100, h: 40}, {x: 450, y: 150, w: 140, h: 50}, {x: 800, y: 80, w: 120, h: 45} ];
let trees = [ {x: 150}, {x: 500}, {x: 900} ];
let feedbackTimeout;

// DYNAMIC FEEDBACK SYSTEM (POPS THE TEXT EVERY TIME)
function showFeedback(text, color) {
    uiFeedback.innerText = text;
    uiFeedback.style.color = color;
    
    // Force CSS reflow to restart animation "Pop"
    uiFeedback.style.transition = 'none';
    uiFeedback.style.transform = 'scale(1.4)';
    
    setTimeout(() => {
        uiFeedback.style.transition = 'transform 0.2s ease-out';
        uiFeedback.style.transform = 'scale(1)';
    }, 50);

    clearTimeout(feedbackTimeout);
    feedbackTimeout = setTimeout(() => {
        if (gameState === 'PLAYING') uiFeedback.innerText = "";
    }, 800);
}

function initGame() {
    let safeGameDay = (absoluteDay - 1) === 0 ? 1 : absoluteDay - 1;
    gameWords = getTodaySrsWords(safeGameDay);
    if(gameWords.length === 0) gameWords = dictionaryList.slice(0, 5); 
    
    targetWord = gameWords[Math.floor(Math.random() * gameWords.length)];
    uiTarget.innerText = targetWord.english;
    uiScore.innerText = `SCORE: ${score}`;
    uiLives.innerText = "❤️❤️❤️";
    
    if (gameState === 'START' || gameState === 'GAMEOVER') {
        overlay.style.display = 'flex';
        document.getElementById('game-overlay-title').innerText = "HEDGEHOG RUN!";
        document.getElementById('game-overlay-score').style.display = 'none';
        startBtn.innerText = "PLAY";
    }
    drawGame();
}

function resetGame() {
    score = 0; lives = 3; gameSpeed = 200; 
    char.y = 650; char.vy = 0; char.isJumping = false; char.isSliding = false;
    
    obstacles = []; 
    lastHazardType = ''; 
    spawnObstacle();
    
    uiScore.innerText = `SCORE: ${score}`;
    uiLives.innerText = "❤️❤️❤️";
    showFeedback("READY? RUN!", "black");
    
    overlay.style.display = 'none';
    gameState = 'PLAYING';
    audioManager.playSFX('gamestart.mp3');
    lastTime = performance.now();
    gameRAF = requestAnimationFrame(gameLoop);
}

function spawnObstacle() {
    let obs = { active: true, passed: false, isHoming: false, isSine: false };
    
    let minGap = Math.max(250, 650 - (score * 3)); 
    let startX = 800;
    if (obstacles.length > 0) {
        startX = Math.max(800, obstacles[obstacles.length - 1].x + minGap + (Math.random() * 150));
    }
    obs.x = startX;

    let rand = Math.random();
    if (rand < 0.60) {
        lastHazardType = ''; 
        obs.type = rand < 0.35 ? 'TARGET' : 'DANGER'; 
        if(obs.type === 'TARGET') obs.wordObj = targetWord;
        else {
            let wrongWords = gameWords.filter(w => w.english !== targetWord.english);
            obs.wordObj = wrongWords.length > 0 ? wrongWords[Math.floor(Math.random() * wrongWords.length)] : gameWords[0];
        }
        obs.w = 100; obs.h = 90; 
        
        let lanes = [650, 530, 410];
        let availableLanes = lanes.filter(l => l !== lastLane);
        obs.y = availableLanes[Math.floor(Math.random() * availableLanes.length)];
        lastLane = obs.y;
        
    } else {
        let hazardList = ['MOUNTAIN', 'LAVA', 'BIRD', 'UFO', 'PUDDLE', 'ELEPHANT', 'CACTUS', 'TREE'];
        let availableHazards = hazardList.filter(h => h !== lastHazardType);
        let chosenHazard = availableHazards[Math.floor(Math.random() * availableHazards.length)];
        lastHazardType = chosenHazard; 
        obs.type = chosenHazard;

        // NEW FIX: THICKER LAVA & PUDDLE SO THEY CAN BE HIT!
        if (chosenHazard === 'MOUNTAIN') {
            obs.w = 80; obs.h = 80; obs.y = 650;
        } else if (chosenHazard === 'LAVA') {
            obs.w = 140; obs.h = 40; obs.y = 650; // Increased height to 40
        } else if (chosenHazard === 'PUDDLE') {
            obs.w = 140; obs.h = 30; obs.y = 650; // Increased height to 30
        } else if (chosenHazard === 'CACTUS') {
            obs.w = 60; obs.h = 80; obs.y = 650;
        } else if (chosenHazard === 'TREE') {
            obs.w = 70; obs.h = 100; obs.y = 650;
        } else if (chosenHazard === 'ELEPHANT') {
            obs.w = 100; obs.h = 60; obs.y = 650;
        } else if (chosenHazard === 'BIRD') {
            obs.w = 60; obs.h = 40; obs.y = 500; obs.isSine = true; 
        } else if (chosenHazard === 'UFO') {
            obs.w = 80; obs.h = 40; obs.y = 400; obs.isHoming = true; 
        }
    }
    obstacles.push(obs);
}

// Game Loop
function gameLoop(timestamp) {
    if (gameState !== 'PLAYING') return;
    
    let dt = (timestamp - lastTime) / 1000;
    lastTime = timestamp;
    if (dt > 0.1) dt = 0.016; 
    
    gameSpeed = 200 + (score * 1.5);
    groundScrollX = (groundScrollX + gameSpeed * dt) % 120;
    
    clouds.forEach(c => { c.x -= (gameSpeed * 0.2) * dt; if(c.x < -150) c.x = 800 + Math.random()*100; });
    trees.forEach(t => { t.x -= (gameSpeed * 0.6) * dt; if(t.x < -100) t.x = 800 + Math.random()*200; });
    
    if (char.y < 650 || char.vy !== 0) {
        char.vy += char.gravity * dt;
        char.y += char.vy * dt;
        if (char.y >= 650) {
            char.y = 650; char.vy = 0; char.isJumping = false;
        }
    }
    char.h = char.isSliding ? 30 : 60;
    
    obstacles.forEach(obs => {
        if (!obs.active) return;
        obs.x -= gameSpeed * dt;
        
        if (obs.isHoming) {
            let centerTargetY = char.y - (char.h / 2);
            let centerUFOY = obs.y - (obs.h / 2);
            if (centerTargetY < centerUFOY) obs.y -= gameSpeed * 0.5 * dt;
            if (centerTargetY > centerUFOY) obs.y += gameSpeed * 0.5 * dt;
        }
        if (obs.isSine) {
            obs.y = 520 + Math.sin(Date.now() / 200) * 100;
        }

        // NEW FIX: Adjusted vertical padding so Lava and Puddles actually trigger damage!
        let hitX = char.x + char.w - 15 > obs.x && char.x + 15 < obs.x + obs.w;
        let hitY = char.y > obs.y - obs.h + 5 && char.y - char.h + 15 < obs.y;
        
        if (hitX && hitY) {
            obs.active = false; 
            if (obs.type === 'TARGET') {
                score += 10;
                uiScore.innerText = `SCORE: ${score}`;
                showFeedback("AWESOME! +10", "#2E7D32");
                audioManager.playSFX('pickup.wav');
                targetWord = gameWords[Math.floor(Math.random() * gameWords.length)];
                uiTarget.innerText = targetWord.english;
            } else {
                lives--;
                uiLives.innerText = "❤️".repeat(Math.max(0, lives));
                showFeedback("OUCH! -1 LIFE", "#D32F2F");
                audioManager.playSFX('explosion.wav');
                
                if (lives <= 0) {
                    gameState = 'GAMEOVER';
                    audioManager.stopAll(); // Silence all audio immediately!
                    audioManager.playSFX('gameover.mp3', 1.0);
                    if (score > gameHighScore) {
                        gameHighScore = score;
                        localStorage.setItem('gameHighScore', gameHighScore);
                        uiHiScore.innerText = `HI: ${gameHighScore}`;
                    }
                    overlay.style.display = 'flex';
                    document.getElementById('game-overlay-title').innerText = "GAME OVER";
                    document.getElementById('game-overlay-score').innerText = `SCORE: ${score}`;
                    document.getElementById('game-overlay-score').style.display = 'block';
                    startBtn.innerText = "RETRY";
                }
            }
        }

        // DYNAMIC DODGING MESSAGES!
        if (obs.active && !obs.passed && obs.x + obs.w < char.x) {
            obs.passed = true;
            if (obs.type !== 'TARGET') {
                score += 2; uiScore.innerText = `SCORE: ${score}`;
                let dodgeTexts = ["DODGED! +2", "WOOSH! +2", "NICE! +2", "QUICK! +2"];
                let randomText = dodgeTexts[Math.floor(Math.random() * dodgeTexts.length)];
                showFeedback(randomText, "#1565C0");
            } else {
                showFeedback("MISSED IT!", "black");
            }
        }
    });
    
    obstacles = obstacles.filter(obs => obs.x > -200);
    let minGap = Math.max(250, 600 - (score * 3));
    if (obstacles.length === 0 || obstacles[obstacles.length - 1].x < 800 - minGap) {
        spawnObstacle();
    }
    
    drawGame();
    if (gameState === 'PLAYING') { gameRAF = requestAnimationFrame(gameLoop); }
}

function drawGame() {
    gCtx.clearRect(0, 0, gCanvas.width, gCanvas.height);
    
    gCtx.fillStyle = '#87CEEB'; gCtx.fillRect(0, 0, gCanvas.width, gCanvas.height);
    gCtx.fillStyle = '#FFEB3B'; gCtx.fillRect(650, 80, 80, 80);
    
    gCtx.fillStyle = 'white';
    clouds.forEach(c => {
        gCtx.fillRect(c.x, c.y, c.w, c.h);
        gCtx.fillRect(c.x + 10, c.y - 10, c.w - 20, c.h + 20);
    });

    trees.forEach(t => {
        gCtx.fillStyle = '#5D4037'; gCtx.fillRect(t.x + 15, 600, 20, 50);
        gCtx.fillStyle = '#1B5E20'; gCtx.fillRect(t.x - 5, 520, 60, 80);
        gCtx.fillStyle = '#2E7D32'; gCtx.fillRect(t.x + 5, 500, 40, 50);
    });

    gCtx.fillStyle = '#795548'; gCtx.fillRect(0, 650, gCanvas.width, 150);
    gCtx.fillStyle = '#5D4037';
    for (let i = -groundScrollX; i < gCanvas.width + 120; i += 60) {
        gCtx.fillRect(i, 670, 20, 20); gCtx.fillRect(i + 30, 710, 20, 20);
    }
    gCtx.fillStyle = '#2E7D32'; 
    for (let i = -groundScrollX; i < gCanvas.width + 120; i += 40) {
        gCtx.fillRect(i, 640, 20, 20); gCtx.fillStyle = '#1B5E20';
        gCtx.fillRect(i + 20, 640, 20, 20); gCtx.fillStyle = '#2E7D32';
    }
    
    obstacles.forEach(obs => {
        if (!obs.active) return;
        
        if (obs.type === 'TARGET' || obs.type === 'DANGER') {
            gCtx.fillStyle = '#FFF3E0';
            gCtx.fillRect(obs.x, obs.y - obs.h, obs.w, obs.h);
            gCtx.strokeStyle = 'black'; gCtx.lineWidth = 6;
            gCtx.strokeRect(obs.x, obs.y - obs.h, obs.w, obs.h);
            gCtx.fillStyle = 'black';
            gCtx.font = 'bold 22px "Comic Sans MS", sans-serif';
            gCtx.textAlign = 'center'; gCtx.textBaseline = 'middle';
            gCtx.fillText(obs.wordObj.hinglish, obs.x + obs.w/2, obs.y - obs.h/2);
            
        } else if (obs.type === 'MOUNTAIN') {
            gCtx.fillStyle = '#78909C'; gCtx.beginPath();
            gCtx.moveTo(obs.x, obs.y); gCtx.lineTo(obs.x + obs.w/2, obs.y - obs.h); gCtx.lineTo(obs.x + obs.w, obs.y); gCtx.fill();
            gCtx.fillStyle = '#CFD8DC'; gCtx.beginPath();
            gCtx.moveTo(obs.x + obs.w/2, obs.y - obs.h); gCtx.lineTo(obs.x + 20, obs.y - obs.h + 30); gCtx.lineTo(obs.x + obs.w - 20, obs.y - obs.h + 30); gCtx.fill();
            
        } else if (obs.type === 'LAVA') {
            gCtx.fillStyle = '#D84315'; gCtx.fillRect(obs.x, obs.y - obs.h, obs.w, obs.h); 
            gCtx.fillStyle = '#FF5722'; gCtx.fillRect(obs.x, obs.y - obs.h, obs.w, 15);
            gCtx.fillStyle = '#FFEB3B'; let offset = Math.floor(Date.now() / 200) % 20;
            gCtx.fillRect(obs.x + 20 + offset, obs.y - obs.h - 5, 10, 5);
            gCtx.fillRect(obs.x + 60 - offset, obs.y - obs.h - 5, 10, 5);
            gCtx.fillRect(obs.x + 100 + offset/2, obs.y - obs.h - 5, 10, 5);
            
        } else if (obs.type === 'PUDDLE') {
            gCtx.fillStyle = '#1E88E5'; gCtx.fillRect(obs.x, obs.y - obs.h, obs.w, obs.h);
            gCtx.fillStyle = '#4FC3F7'; gCtx.fillRect(obs.x + 10, obs.y - obs.h + 5, obs.w - 20, 10);

        } else if (obs.type === 'CACTUS') {
            gCtx.fillStyle = '#388E3C'; gCtx.fillRect(obs.x + 20, obs.y - 80, 20, 80);
            gCtx.fillRect(obs.x, obs.y - 50, 20, 15); gCtx.fillRect(obs.x, obs.y - 65, 15, 15);
            gCtx.fillRect(obs.x + 40, obs.y - 40, 20, 15); gCtx.fillRect(obs.x + 45, obs.y - 55, 15, 15);
            
        } else if (obs.type === 'TREE') {
            gCtx.fillStyle = '#5D4037'; gCtx.fillRect(obs.x + 25, obs.y - 40, 20, 40);
            gCtx.fillStyle = '#2E7D32'; gCtx.fillRect(obs.x, obs.y - 90, 70, 50);
            gCtx.fillRect(obs.x + 10, obs.y - 100, 50, 20);

        } else if (obs.type === 'ELEPHANT') {
            gCtx.fillStyle = '#9E9E9E'; gCtx.fillRect(obs.x + 20, obs.y - 60, 80, 60); 
            gCtx.fillRect(obs.x, obs.y - 40, 20, 30); gCtx.fillRect(obs.x - 10, obs.y - 20, 10, 20); 
            gCtx.fillRect(obs.x + 30, obs.y - 20, 10, 20); gCtx.fillRect(obs.x + 70, obs.y - 20, 10, 20); 
            gCtx.fillStyle = 'black'; gCtx.fillRect(obs.x + 5, obs.y - 35, 5, 5); 
            
        } else if (obs.type === 'BIRD') {
            gCtx.fillStyle = '#000000'; gCtx.fillRect(obs.x + 15, obs.y - 20, 30, 10);
            gCtx.fillStyle = '#E53935'; 
            if (Math.floor(Date.now() / 150) % 2 === 0) gCtx.fillRect(obs.x + 20, obs.y - 35, 20, 15); 
            else gCtx.fillRect(obs.x + 20, obs.y - 10, 20, 15); 
            gCtx.fillStyle = '#FDD835'; gCtx.fillRect(obs.x + 5, obs.y - 18, 10, 6);
            
        } else if (obs.type === 'UFO') {
            gCtx.fillStyle = '#455A64'; gCtx.fillRect(obs.x, obs.y - 20, 80, 20);
            gCtx.fillStyle = '#80CBC4'; gCtx.fillRect(obs.x + 20, obs.y - 40, 40, 20);
            gCtx.fillStyle = '#00E676'; gCtx.fillRect(obs.x + 35, obs.y - 30, 10, 10);
            gCtx.fillStyle = '#FF5252'; 
            if(Math.floor(Date.now() / 100) % 2 === 0) { 
                gCtx.fillRect(obs.x + 10, obs.y, 10, 10); gCtx.fillRect(obs.x + 60, obs.y, 10, 10);
            }
        }
    });
    
    gCtx.save();
    gCtx.translate(char.x + char.w/2, char.y);
    gCtx.scale(-1, 1); 
    let sc = 4; 
    
    if (char.isSliding) {
        gCtx.fillStyle = '#5D4037'; gCtx.fillRect(-8*sc, -8*sc, 14*sc, 8*sc);
        gCtx.fillStyle = '#8D6E63'; gCtx.fillRect(-6*sc, -6*sc, 12*sc, 6*sc);
        gCtx.fillStyle = '#FFCC80'; gCtx.fillRect(4*sc, -5*sc, 6*sc, 5*sc);
        gCtx.fillStyle = 'black'; gCtx.fillRect(10*sc, -3*sc, 2*sc, 2*sc); gCtx.fillRect(6*sc, -4*sc, 2*sc, 2*sc); 
    } else {
        gCtx.fillStyle = '#5D4037'; gCtx.fillRect(-7*sc, -14*sc, 12*sc, 14*sc);
        gCtx.fillStyle = '#8D6E63'; gCtx.fillRect(-5*sc, -12*sc, 10*sc, 12*sc);
        gCtx.fillStyle = '#FFCC80'; gCtx.fillRect(2*sc, -10*sc, 7*sc, 8*sc);
        gCtx.fillStyle = 'black'; gCtx.fillRect(9*sc, -7*sc, 2*sc, 2*sc); gCtx.fillRect(5*sc, -9*sc, 2*sc, 2*sc); 
        
        gCtx.fillStyle = 'black';
        if (Math.floor(groundScrollX / 30) % 2 === 0 || char.isJumping) {
            gCtx.fillRect(-3*sc, 0, 2*sc, 2*sc); gCtx.fillRect(3*sc, 0, 2*sc, 2*sc);
        } else {
            gCtx.fillRect(-1*sc, 0, 2*sc, 2*sc); gCtx.fillRect(5*sc, 0, 2*sc, 2*sc);
        }
    }
    gCtx.restore();
}

function jump() {
    if (gameState === 'PLAYING' && char.y === 650) {
        char.vy = char.jumpForce; char.isJumping = true;
        audioManager.playSFX('jump.wav');
    }
}

document.getElementById('btn-jump').addEventListener('mousedown', jump);
document.getElementById('btn-jump').addEventListener('touchstart', (e) => { e.preventDefault(); jump(); }, { passive: false });

const slideBtn = document.getElementById('btn-slide');
function startSlide() { 
    if(gameState === 'PLAYING' && !char.isSliding) {
        char.isSliding = true; 
        audioManager.playSFX('slide.wav', 0.5); 
    }
}
function stopSlide() { char.isSliding = false; }

slideBtn.addEventListener('mousedown', startSlide);
slideBtn.addEventListener('mouseup', stopSlide);
slideBtn.addEventListener('mouseleave', stopSlide);
slideBtn.addEventListener('touchstart', (e) => { e.preventDefault(); startSlide(); }, { passive: false });
slideBtn.addEventListener('touchend', stopSlide);

window.addEventListener('keydown', (e) => {
    if (e.code === 'Space' || e.code === 'ArrowUp') { e.preventDefault(); jump(); }
    if (e.code === 'ArrowDown') { e.preventDefault(); startSlide(); }
});
window.addEventListener('keyup', (e) => {
    if (e.code === 'ArrowDown') stopSlide();
});

startBtn.addEventListener('click', () => {
    audioManager.stopAll();
    audioManager.playBGM('bg_music.mp3', 0.25);
    
    if (gameState === 'START' || gameState === 'GAMEOVER') {
        resetGame();
    } else if (gameState === 'PAUSED') {
        document.getElementById('game-overlay').style.display = 'none';
        gameState = 'PLAYING';
        lastTime = performance.now();
        gameRAF = requestAnimationFrame(gameLoop);
    }
});

document.getElementById('game-pause-btn').addEventListener('click', () => {
    if (gameState === 'PLAYING') {
        gameState = 'PAUSED';
        document.getElementById('game-overlay').style.display = 'flex';
        document.getElementById('game-overlay-title').innerText = "PAUSED";
        startBtn.innerText = "RESUME";
    } 
});
