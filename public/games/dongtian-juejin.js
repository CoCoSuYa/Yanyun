/**
 * 洞天掘金 - 游戏逻辑
 * dongtian-juejin.js
 * Canvas 抓金游戏完整逻辑
 */
(function () {
    const canvas = document.getElementById('gameCanvas');
    const ctx = canvas.getContext('2d');
    const minerImage = new Image();
    minerImage.src = '/img/dongtian-juejin-miner.png';

    const scoreValue = document.getElementById('scoreValue');
    const timeValue = document.getElementById('timeValue');
    const goalValue = document.getElementById('goalValue');
    const levelValue = document.getElementById('levelValue');
    const missionText = document.getElementById('missionText');
    const resultPop = document.getElementById('resultPop');
    const shootBtn = document.getElementById('shootBtn');
    const restartBtn = document.getElementById('restartBtn');
    const startScreen = document.getElementById('startScreen');
    const gameUi = document.getElementById('gameUi');
    const startBtn = document.getElementById('startBtn');
    const finalOverlay = document.getElementById('finalOverlay');
    const finalSummary = document.getElementById('finalSummary');
    const finalConfirmBtn = document.getElementById('finalConfirmBtn');
    let currentUser = null;
    let userHighScore = 0;
    let leaderboardData = [];
    let challengeLevel = 1;
    let globalLoadingEl = null;

    function showLoading(message = '加载中...') {
        if (globalLoadingEl) return;
        globalLoadingEl = document.createElement('div');
        globalLoadingEl.className = 'loading-overlay';
        globalLoadingEl.innerHTML = `
                <div class="loading-spinner"></div>
                <div class="loading-text">${message}</div>
            `;
        document.body.appendChild(globalLoadingEl);
    }

    function hideLoading() {
        if (!globalLoadingEl) return;
        globalLoadingEl.classList.add('hiding');
        setTimeout(() => {
            globalLoadingEl?.remove();
            globalLoadingEl = null;
        }, 200);
    }

    function loadUser() {
        try { return JSON.parse(localStorage.getItem('yanyun_user') || 'null'); }
        catch { return null; }
    }

    async function apiCall(method, url, body) {
        const options = { method, headers: { 'Content-Type': 'application/json' } };
        if (body) options.body = JSON.stringify(body);
        const res = await fetch(url, options);
        if (!res.ok) throw new Error('请求失败');
        return res.json();
    }

    async function checkLoginAndLoadData() {
        showLoading('初始化中...');
        currentUser = loadUser();
        if (!currentUser || !currentUser.id) {
            hideLoading();
            document.getElementById('loginPrompt').classList.remove('hidden');
            return false;
        }
        try {
            const [userData, leaderboard] = await Promise.all([
                apiCall('GET', `/api/games/juejin/user/${currentUser.id}`),
                apiCall('GET', '/api/games/juejin/leaderboard?limit=10')
            ]);
            userHighScore = userData.highScore || 0;
            document.getElementById('highScoreValue').textContent = userHighScore;
            leaderboardData = leaderboard.leaderboard || [];
            renderLeaderboard();
            hideLoading();
            return true;
        } catch (e) {
            console.error('加载数据失败:', e);
            renderLeaderboard();
            hideLoading();
            return true;
        }
    }

    function renderLeaderboard() {
        const list = document.getElementById('leaderboardList');
        if (!leaderboardData || leaderboardData.length === 0) {
            list.innerHTML = '<div class="leaderboard-empty">暂无排行数据</div>';
            return;
        }
        list.innerHTML = leaderboardData.map(item => `
                <div class="leaderboard-item">
                    <span class="rank">${item.rank}</span>
                    <img class="avatar" src="${item.avatarUrl}" alt="${item.gameName}" onerror="this.src='/img/default-avatar.jpg'" />
                    <span class="name">${item.gameName}</span>
                    <span class="score">${item.highScore}</span>
                </div>
            `).join('');
    }

    // ===== 游戏常量 =====
    const WORLD = {
        width: canvas.width,
        height: canvas.height,
        surfaceY: 242,
        minerX: canvas.width / 2,
        minerY: 146,
        hookBaseY: 196,
        minAngle: -1.42,
        maxAngle: 1.42,
    };

    const LEVEL_CONFIGS = [
        { stage: '入门试炼', title: '初入洞天', time: 55, target: 1000, maxScore: 1300, values: { suiJin: 100, chiJin: 300, xuanJin: 800, wanShi: 10, moShi: 5 }, ratios: { suiJin: 42, chiJin: 16, xuanJin: 3, wanShi: 27, moShi: 12 }, itemCount: 16 },
        { stage: '入门试炼', title: '岩窟试手', time: 55, target: 2200, maxScore: 2200, values: { suiJin: 100, chiJin: 300, xuanJin: 800, wanShi: 10, moShi: 5 }, ratios: { suiJin: 38, chiJin: 20, xuanJin: 4, wanShi: 26, moShi: 12 }, itemCount: 17 },
        { stage: '入门试炼', title: '金脉渐显', time: 52, target: 3600, maxScore: 3200, values: { suiJin: 100, chiJin: 300, xuanJin: 800, wanShi: 10, moShi: 5 }, ratios: { suiJin: 34, chiJin: 24, xuanJin: 5, wanShi: 25, moShi: 12 }, itemCount: 18 },
        { stage: '秘境探宝', title: '赤金秘道', time: 50, target: 5000, maxScore: 4500, values: { suiJin: 120, chiJin: 350, xuanJin: 900, wanShi: 10, moShi: 5 }, ratios: { suiJin: 30, chiJin: 26, xuanJin: 6, wanShi: 24, moShi: 14 }, itemCount: 19 },
        { stage: '秘境探宝', title: '宝气翻涌', time: 48, target: 6600, maxScore: 6000, values: { suiJin: 120, chiJin: 350, xuanJin: 900, wanShi: 10, moShi: 5 }, ratios: { suiJin: 28, chiJin: 28, xuanJin: 7, wanShi: 23, moShi: 14 }, itemCount: 20 },
        { stage: '秘境探宝', title: '深窟寻玄', time: 46, target: 8200, maxScore: 7700, values: { suiJin: 120, chiJin: 350, xuanJin: 900, wanShi: 10, moShi: 5 }, ratios: { suiJin: 24, chiJin: 31, xuanJin: 8, wanShi: 23, moShi: 14 }, itemCount: 21 },
        { stage: '玄金秘境', title: '玄脉初启', time: 44, target: 10200, maxScore: 9600, values: { suiJin: 150, chiJin: 400, xuanJin: 1000, wanShi: 10, moShi: 5 }, ratios: { suiJin: 22, chiJin: 32, xuanJin: 9, wanShi: 22, moShi: 15 }, itemCount: 22 },
        { stage: '玄金秘境', title: '洞天生辉', time: 42, target: 13000, maxScore: 11800, values: { suiJin: 150, chiJin: 400, xuanJin: 1000, wanShi: 10, moShi: 5 }, ratios: { suiJin: 20, chiJin: 34, xuanJin: 10, wanShi: 21, moShi: 15 }, itemCount: 23 },
        { stage: '玄金秘境', title: '终局掘金', time: 40, target: 16000, maxScore: 14500, values: { suiJin: 150, chiJin: 400, xuanJin: 1000, wanShi: 10, moShi: 5 }, ratios: { suiJin: 18, chiJin: 35, xuanJin: 11, wanShi: 21, moShi: 15 }, itemCount: 24 },
    ];
    const ITEM_META = {
        suiJin: { name: '碎金', baseColor: '#f26d3d', shape: 'gold-small' },
        chiJin: { name: '赤金', baseColor: '#f0b63c', shape: 'gold-big' },
        xuanJin: { name: '玄金', color: '#8cf7ff', weight: [1.1, 1.28], radius: [16, 16], shape: 'xuan-gold', fixedValue: 800, pullFactor: 0.78 },
        wanShi: { name: '顽石', color: '#8d8d95', weight: [2.6, 3.4], radius: [22, 32], shape: 'stone', pullFactor: [0.12, 0.2] },
        moShi: { name: '墨石', color: '#43404a', weight: [2.9, 3.8], radius: [18, 26], shape: 'obsidian', pullFactor: [0.1, 0.17] },
    };
    const collectMessages = ['一钩一个准！', '金光入囊！', '洞天有获！', '这一钩赚到了。'];

    // ===== 音频系统 =====
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    let countdownInterval = null;

    function playLaunchSound() {
        const now = audioCtx.currentTime;
        const osc1 = audioCtx.createOscillator(); const gain1 = audioCtx.createGain();
        osc1.type = 'square'; osc1.frequency.setValueAtTime(800, now); osc1.frequency.exponentialRampToValueAtTime(400, now + 0.1);
        gain1.gain.setValueAtTime(0.4, now); gain1.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
        osc1.connect(gain1); gain1.connect(audioCtx.destination); osc1.start(now); osc1.stop(now + 0.1);

        const osc2 = audioCtx.createOscillator(); const gain2 = audioCtx.createGain();
        osc2.type = 'sine'; osc2.frequency.setValueAtTime(2400, now); osc2.frequency.exponentialRampToValueAtTime(1800, now + 0.08);
        gain2.gain.setValueAtTime(0.3, now); gain2.gain.exponentialRampToValueAtTime(0.01, now + 0.08);
        osc2.connect(gain2); gain2.connect(audioCtx.destination); osc2.start(now); osc2.stop(now + 0.08);
    }

    function playExplosionSound() {
        const now = audioCtx.currentTime;
        const bass = audioCtx.createOscillator(); const bassGain = audioCtx.createGain();
        bass.type = 'sine'; bass.frequency.setValueAtTime(200, now); bass.frequency.exponentialRampToValueAtTime(30, now + 0.4);
        bassGain.gain.setValueAtTime(0.8, now); bassGain.gain.exponentialRampToValueAtTime(0.01, now + 0.4);
        bass.connect(bassGain); bassGain.connect(audioCtx.destination); bass.start(now); bass.stop(now + 0.4);

        const mid = audioCtx.createOscillator(); const midGain = audioCtx.createGain();
        mid.type = 'square'; mid.frequency.setValueAtTime(120, now); mid.frequency.exponentialRampToValueAtTime(50, now + 0.2);
        midGain.gain.setValueAtTime(0.4, now); midGain.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
        mid.connect(midGain); midGain.connect(audioCtx.destination); mid.start(mid); mid.stop(now + 0.2);

        const bufferSize = audioCtx.sampleRate * 0.5;
        const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;

        const noise = audioCtx.createBufferSource(); const noiseGain = audioCtx.createGain(); const noiseFilter = audioCtx.createBiquadFilter();
        noise.buffer = buffer; noiseFilter.type = 'lowpass'; noiseFilter.frequency.setValueAtTime(2000, now); noiseFilter.frequency.exponentialRampToValueAtTime(200, now + 0.3);
        noiseGain.gain.setValueAtTime(0.6, now); noiseGain.gain.exponentialRampToValueAtTime(0.01, now + 0.5);
        noise.connect(noiseFilter); noiseFilter.connect(noiseGain); noiseGain.connect(audioCtx.destination); noise.start(now);
    }

    function playScoreSound() {
        const now = audioCtx.currentTime;
        const notes = [523.25, 659.25, 783.99];
        notes.forEach((freq, i) => {
            const osc = audioCtx.createOscillator(); const gain = audioCtx.createGain();
            osc.type = 'sine'; osc.frequency.value = freq;
            const startTime = now + i * 0.08;
            gain.gain.setValueAtTime(0, startTime); gain.gain.linearRampToValueAtTime(0.3, startTime + 0.01);
            gain.gain.exponentialRampToValueAtTime(0.01, startTime + 0.2);
            osc.connect(gain); gain.connect(audioCtx.destination); osc.start(startTime); osc.stop(startTime + 0.2);
        });

        const sparkle = audioCtx.createOscillator(); const sparkleGain = audioCtx.createGain();
        sparkle.type = 'sine'; sparkle.frequency.setValueAtTime(2000, now + 0.15); sparkle.frequency.exponentialRampToValueAtTime(3000, now + 0.35);
        sparkleGain.gain.setValueAtTime(0.2, now + 0.15); sparkleGain.gain.exponentialRampToValueAtTime(0.01, now + 0.35);
        sparkle.connect(sparkleGain); sparkleGain.connect(audioCtx.destination); sparkle.start(now + 0.15); sparkle.stop(now + 0.35);
    }

    function startCountdownTick() {
        if (countdownInterval) return;
        const tick = () => {
            const now = audioCtx.currentTime;
            const osc = audioCtx.createOscillator(); const gain = audioCtx.createGain();
            osc.type = 'sine'; osc.frequency.value = state.timeLeft <= 3 ? 1200 : 800;
            gain.gain.setValueAtTime(0.3, now); gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
            osc.connect(gain); gain.connect(audioCtx.destination); osc.start(now); osc.stop(now + 0.1);
        };
        tick(); countdownInterval = setInterval(tick, 1000);
    }

    function stopCountdownTick() {
        if (countdownInterval) { clearInterval(countdownInterval); countdownInterval = null; }
    }

    // ===== 游戏状态 =====
    const state = {
        running: false, started: false, level: 1, score: 0,
        targetScore: LEVEL_CONFIGS[0].target, timeLeft: LEVEL_CONFIGS[0].time,
        lastTick: 0, popTimer: 0, goalHintShown: false,
        objects: [], particles: [], hook: null, powerup: null,
        buffs: { speed: 0, score: 0 }, hasDynamite: false,
    };

    function lerp(start, end, t) { return start + (end - start) * t; }

    function mixColor(colorA, colorB, amount) {
        const a = colorA.replace('#', ''); const b = colorB.replace('#', '');
        const an = parseInt(a, 16), bn = parseInt(b, 16);
        const r = Math.round(lerp((an >> 16) & 255, (bn >> 16) & 255, amount));
        const g = Math.round(lerp((an >> 8) & 255, (bn >> 8) & 255, amount));
        const b2 = Math.round(lerp(an & 255, bn & 255, amount));
        return `rgb(${r}, ${g}, ${b2})`;
    }

    function createGoldItem(type) {
        if (type === 'xuanJin') return { value: ITEM_META.xuanJin.fixedValue, radius: ITEM_META.xuanJin.radius[0], weight: randomRange(ITEM_META.xuanJin.weight[0], ITEM_META.xuanJin.weight[1]), color: ITEM_META.xuanJin.color, pullFactor: ITEM_META.xuanJin.pullFactor, shape: ITEM_META.xuanJin.shape };
        const isSmallGold = type === 'suiJin';
        const valueMin = isSmallGold ? 50 : 200; const valueMax = isSmallGold ? 150 : 400;
        const value = Math.round(randomRange(valueMin, valueMax));
        const normalized = (value - valueMin) / (valueMax - valueMin);
        const radius = isSmallGold ? lerp(20, 26, normalized) : lerp(25, 33, normalized);
        const weight = isSmallGold ? lerp(1.05, 1.75, normalized) : lerp(1.55, 2.65, normalized);
        const pullFactor = isSmallGold ? lerp(0.62, 0.42, normalized) : lerp(0.42, 0.24, normalized);
        const color = isSmallGold ? mixColor('#de5a32', '#fff2c1', normalized) : mixColor('#f08a2c', '#fff8d7', normalized);
        return { value, radius, weight, color, pullFactor, shape: ITEM_META[type].shape };
    }

    function createHook() { return { angle: -1.18, swingSpeed: 1.45, direction: 1, length: 42, maxLength: WORLD.height * 0.84, speed: 690, state: 'swing', caught: null }; }
    function randomRange(min, max) { return Math.random() * (max - min) + min; }

    // 控制台调试命令
    window.add_score = function (amount) {
        if (!state.started || !state.running) { console.log('游戏未开始，无法添加分数'); return; }
        state.score += amount; updateHud(); console.log(`已添加 ${amount} 分，当前分数：${state.score}`);
    };
    window.set_challenge = function (level) {
        if (state.started) { console.log('游戏已开始，无法设置挑战关卡'); return; }
        challengeLevel = Math.max(1, Math.min(level, LEVEL_CONFIGS.length));
        console.log(`已设置挑战关卡为第 ${challengeLevel} 关，点击开始游戏后将从该关卡开始`);
    };

    function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }

    function colorWithAlpha(color, alpha) {
        const hex = color.replace('#', '');
        const full = hex.length === 3 ? hex.split('').map(ch => ch + ch).join('') : hex;
        const num = parseInt(full, 16);
        return `rgba(${(num >> 16) & 255}, ${(num >> 8) & 255}, ${num & 255}, ${alpha})`;
    }

    function showPop(text, danger = false) {
        resultPop.textContent = text;
        resultPop.style.borderColor = danger ? 'rgba(255,107,87,0.52)' : 'rgba(255,217,102,0.42)';
        resultPop.style.color = danger ? '#ffd5cd' : '#fff7dd';
        resultPop.classList.add('show'); state.popTimer = 2.2;
    }

    function getLevelConfig(level = state.level) { return LEVEL_CONFIGS[Math.min(level - 1, LEVEL_CONFIGS.length - 1)]; }

    function updateHud() {
        const config = getLevelConfig();
        scoreValue.textContent = state.score; timeValue.textContent = Math.max(0, Math.ceil(state.timeLeft));
        goalValue.textContent = state.targetScore; levelValue.textContent = state.level;
        missionText.textContent = `【${config.stage}·${config.title}】本关需在 ${config.time} 秒内达到 ${state.targetScore} 分。`;
        shootBtn.disabled = !state.running || !state.hook || state.hook.state !== 'swing';
    }

    function createLevel(level) {
        const config = getLevelConfig(level); const objects = [];
        const rows = 5, cols = 7;
        const left = 78, right = WORLD.width - 78, top = WORLD.surfaceY + 78, bottom = WORLD.height - 210;
        const cellW = (right - left) / (cols - 1), cellH = (bottom - top) / (rows - 1);
        const occupied = []; const typeOrder = ['suiJin', 'chiJin', 'xuanJin', 'wanShi', 'moShi'];
        function isValid(x, y, radius) { return !occupied.some(item => Math.hypot(item.x - x, item.y - y) < item.radius + radius + 16); }
        function buildCounts() {
            const total = config.itemCount; const counts = {}; let assigned = 0;
            typeOrder.forEach((type, index) => {
                if (index === typeOrder.length - 1) counts[type] = total - assigned;
                else { counts[type] = Math.round(total * config.ratios[type] / 100); assigned += counts[type]; }
            });
            while (Object.values(counts).reduce((sum, v) => sum + v, 0) > total) { const adjustType = typeOrder.find(t => counts[t] > 1); counts[adjustType] -= 1; }
            while (Object.values(counts).reduce((sum, v) => sum + v, 0) < total) { counts[typeOrder[0]] += 1; }
            return counts;
        }
        function addObject(type) {
            const meta = ITEM_META[type]; const goldConfig = type === 'suiJin' || type === 'chiJin' || type === 'xuanJin' ? createGoldItem(type) : null;
            for (let i = 0; i < 80; i++) {
                const col = Math.floor(Math.random() * cols); const row = Math.floor(Math.random() * rows);
                const x = left + col * cellW + randomRange(-30, 30); const y = top + row * cellH + randomRange(-28, 28);
                const radius = goldConfig ? goldConfig.radius : randomRange(meta.radius[0], meta.radius[1]);
                if (isValid(x, y, radius)) {
                    occupied.push({ x, y, radius }); objects.push({ x, y, radius, type, value: goldConfig ? goldConfig.value : config.values[type], weight: goldConfig ? goldConfig.weight : randomRange(meta.weight[0], meta.weight[1]), color: goldConfig ? goldConfig.color : meta.color, shape: goldConfig ? goldConfig.shape : meta.shape, pullFactor: goldConfig ? goldConfig.pullFactor : randomRange(meta.pullFactor[0], meta.pullFactor[1]), rotation: randomRange(0, Math.PI * 2) });
                    return;
                }
            }
        }
        const counts = buildCounts();
        typeOrder.forEach(type => { for (let i = 0; i < counts[type]; i++) addObject(type); });
        return objects;
    }

    function spawnPowerup(level) {
        if (level < 3) return null;
        const types = ['dynamite', 'potion', 'clover']; const type = types[Math.floor(Math.random() * types.length)];
        return { x: randomRange(120, WORLD.width - 120), y: randomRange(WORLD.surfaceY + 100, WORLD.height - 250), type, radius: 20 };
    }

    function resetLevel(level = 1, resetScore = true) {
        stopCountdownTick(); const config = getLevelConfig(level);
        state.started = true; state.level = level; state.targetScore = config.target;
        state.timeLeft = config.time; if (resetScore) state.score = 0;
        state.goalHintShown = false; state.objects = createLevel(level);
        state.particles = []; state.hook = createHook();
        state.powerup = spawnPowerup(level); state.buffs = { speed: 0, score: 0 }; state.hasDynamite = false;
        state.running = true; state.lastTick = performance.now();
        resultPop.classList.remove('show'); updateHud();
    }

    function showStartScreen() {
        stopCountdownTick(); state.running = false; state.started = false; state.level = 1;
        state.score = 0; state.targetScore = LEVEL_CONFIGS[0].target; state.timeLeft = LEVEL_CONFIGS[0].time;
        state.goalHintShown = false; state.objects = []; state.particles = []; state.hook = null;
        resultPop.classList.remove('show'); finalOverlay.classList.add('hidden');
        document.getElementById('levelFailOverlay').classList.add('hidden');
        document.getElementById('levelPassOverlay').classList.add('hidden');
        gameUi.classList.add('hidden'); startScreen.classList.remove('hidden'); updateHud();
    }

    function startGame() { startScreen.classList.add('hidden'); finalOverlay.classList.add('hidden'); gameUi.classList.remove('hidden'); resetLevel(challengeLevel, true); challengeLevel = 1; }
    function launchHook() {
        if (!state.running) return;
        if (state.hook.state === 'retract') { useDynamite(); return; }
        if (state.hook.state !== 'swing') return;
        state.hook.state = 'extend'; playLaunchSound();
    }

    function nextLevel() {
        const next = state.level + 1; const nextConfig = getLevelConfig(next);
        showPop(`闯关成功，进入第 ${next} 关【${nextConfig.stage}·${nextConfig.title}】！`); resetLevel(next, false);
    }

    function showFinalModal(title, detail) {
        state.running = false; if (state.hook) state.hook.state = 'idle';
        finalSummary.textContent = `${title} ${detail} 总分 ${state.score} 分。`;
        finalOverlay.classList.remove('hidden'); updateHud();
    }

    function endLevelSuccess() {
        state.running = false; if (state.hook) state.hook.state = 'idle';
        state.level >= LEVEL_CONFIGS.length ? showGameComplete() : showLevelPass();
    }
    function endLevelFail() { state.running = false; if (state.hook) state.hook.state = 'idle'; showLevelFail(); }

    function showLevelFail() {
        const config = getLevelConfig(); document.getElementById('levelFailInfo').textContent = `第${state.level}关【${config.stage}·${config.title}】挑战失败`;
        document.getElementById('levelFailScore').textContent = state.score; document.getElementById('levelFailTarget').textContent = state.targetScore;
        document.getElementById('levelFailOverlay').classList.remove('hidden'); saveScore();
    }

    function showLevelPass() {
        state.running = false; const config = getLevelConfig(); const nextConfig = getLevelConfig(state.level + 1);
        document.getElementById('levelPassInfo').textContent = `第${state.level}关【${config.stage}·${config.title}】通过`;
        document.getElementById('levelPassScore').textContent = state.score; document.getElementById('levelPassNextTarget').textContent = nextConfig.target;
        document.getElementById('levelPassOverlay').classList.remove('hidden');
    }

    function showGameComplete() {
        document.getElementById('finalTitle').textContent = '九重洞天通关';
        document.getElementById('finalSummary').textContent = `恭喜通关！总分 ${state.score} 分`;
        document.getElementById('finalOverlay').classList.remove('hidden'); saveScore();
        if (currentUser && currentUser.id) apiCall('POST', '/api/games/juejin/complete', { userId: currentUser.id }).catch(() => { });
    }

    async function saveScore() {
        if (!currentUser || !currentUser.id) return;
        showLoading('保存分数中...');
        try {
            const result = await apiCall('POST', '/api/games/juejin/score', { userId: currentUser.id, score: state.score });
            if (result.updated) { userHighScore = result.highScore; document.getElementById('highScoreValue').textContent = userHighScore; document.getElementById('highScoreHint').classList.remove('hidden'); }
        } catch (e) { console.error('保存分数失败:', e); } finally { hideLoading(); }
    }

    function addParticles(x, y, color, amount = 10) {
        for (let i = 0; i < amount; i++) {
            state.particles.push({ x, y, vx: randomRange(-110, 110), vy: randomRange(-180, -30), life: randomRange(0.35, 0.75), maxLife: 0, size: randomRange(2, 5), color });
            state.particles[state.particles.length - 1].maxLife = state.particles[state.particles.length - 1].life;
        }
    }

    function getHookTip() { const hook = state.hook; return { x: WORLD.minerX + Math.sin(hook.angle) * hook.length, y: WORLD.hookBaseY + Math.cos(hook.angle) * hook.length }; }
    function applyPowerup(type) {
        if (type === 'dynamite') { state.hasDynamite = true; showPop('💣 获得炸药桶！勾取物品后点击屏幕可引爆，本局有效'); }
        else if (type === 'potion') { state.buffs.speed = 10; showPop('⚡ 获得速度药水！钩子速度提升25%，持续10秒'); }
        else if (type === 'clover') { state.buffs.score = 10; showPop('🍀 获得幸运草！所有物品得分翻倍，持续10秒'); }
    }

    function useDynamite() {
        if (!state.hasDynamite || !state.hook || !state.hook.caught) return false;
        if (state.hook.state !== 'retract') return false;
        playExplosionSound(); addParticles(state.hook.caught.x, state.hook.caught.y, '#ff6b57', 20);
        state.hook.caught = null; state.hook.length = 42; state.hook.state = 'swing'; state.hasDynamite = false; showPop('💣 炸药桶引爆！'); return true;
    }

    // ===== 物理更新 =====
    function updateHook(dt) {
        const hook = state.hook; if (!hook) return;
        if (hook.state === 'swing') {
            hook.angle += hook.direction * hook.swingSpeed * dt;
            if (hook.angle > WORLD.maxAngle) { hook.angle = WORLD.maxAngle; hook.direction = -1; }
            if (hook.angle < WORLD.minAngle) { hook.angle = WORLD.minAngle; hook.direction = 1; }
            return;
        }
        const speedBoost = state.buffs.speed > 0 ? 1.25 : 1; const basePullSpeed = hook.speed * speedBoost;
        if (hook.state === 'extend') {
            hook.length += basePullSpeed * dt; const tip = getHookTip();
            const boundaryHit = tip.x < 12 || tip.x > WORLD.width - 12 || tip.y > WORLD.height - 12;
            if (boundaryHit || hook.length >= hook.maxLength) { hook.state = 'retract'; }
            else {
                if (state.powerup && Math.hypot(state.powerup.x - tip.x, state.powerup.y - tip.y) <= state.powerup.radius + 10) { applyPowerup(state.powerup.type); state.powerup = null; hook.state = 'retract'; return; }
                for (const item of state.objects) { if (Math.hypot(item.x - tip.x, item.y - tip.y) <= item.radius + 10) { hook.caught = item; hook.state = 'retract'; break; } }
            }
        }
        if (hook.state === 'retract') {
            const slowFactor = hook.caught ? hook.caught.pullFactor : 1;
            hook.length -= basePullSpeed * dt * slowFactor; const tip = getHookTip();
            if (hook.caught) { const carryAngle = Math.atan2(tip.y - WORLD.hookBaseY, tip.x - WORLD.minerX); const hangOffset = Math.max(4, hook.caught.radius * 0.8); hook.caught.x = tip.x + Math.cos(carryAngle) * hangOffset; hook.caught.y = tip.y + Math.sin(carryAngle) * hangOffset; hook.caught.rotation += dt * 2.4; }
            if (hook.length <= 44) {
                hook.length = 42;
                if (hook.caught) {
                    const item = hook.caught; const scoreMultiplier = state.buffs.score > 0 ? 2 : 1; const earnedScore = item.value * scoreMultiplier;
                    state.score += earnedScore; playScoreSound(); state.objects = state.objects.filter(obj => obj !== item);
                    addParticles(WORLD.minerX, WORLD.hookBaseY + 8, item.color, 12);
                    showPop(`${collectMessages[Math.floor(Math.random() * collectMessages.length)]} 获得${ITEM_META[item.type].name} +${earnedScore} 分${scoreMultiplier > 1 ? ' (x' + scoreMultiplier + ')' : ''}`);
                    hook.caught = null;
                }
                if (state.powerup && Math.hypot(state.powerup.x - WORLD.minerX, state.powerup.y - WORLD.hookBaseY) <= state.powerup.radius + 30) { applyPowerup(state.powerup.type); state.powerup = null; }
                hook.state = 'swing'; updateHud();
            }
        }
    }

    function updateParticles(dt) { state.particles = state.particles.filter(p => { p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 240 * dt; return p.life > 0; }); }

    function update(deltaMs) {
        const dt = Math.min(deltaMs / 1000, 0.033);
        if (state.running) {
            state.timeLeft -= dt; updateHook(dt); updateParticles(dt);
            if (state.buffs.speed > 0) { state.buffs.speed -= dt; if (state.buffs.speed < 0) state.buffs.speed = 0; }
            if (state.buffs.score > 0) { state.buffs.score -= dt; if (state.buffs.score < 0) state.buffs.score = 0; }
            if (state.timeLeft <= 0) { state.timeLeft = 0; stopCountdownTick(); state.score >= state.targetScore ? endLevelSuccess() : endLevelFail(); }
            if (state.score >= state.targetScore && !state.goalHintShown) { state.goalHintShown = true; showPop(`【${getLevelConfig().stage}·${getLevelConfig().title}】目标已达成，守住分数即可过关！`); }
        } else { updateParticles(dt); }
        if (state.popTimer > 0) { state.popTimer -= dt; if (state.popTimer <= 0) resultPop.classList.remove('show'); }
        updateHud();
    }

    // ===== 渲染函数 =====
    function drawCloud(x, y, scale) {
        ctx.save(); ctx.translate(x, y); ctx.scale(scale, scale); ctx.fillStyle = 'rgba(255,255,255,0.16)';
        ctx.beginPath(); ctx.arc(0, 14, 22, 0, Math.PI * 2); ctx.arc(26, 8, 28, 0, Math.PI * 2); ctx.arc(58, 16, 20, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    }

    function drawMiner() {
        const frameWidth = 156, frameHeight = 220;
        const frameX = WORLD.minerX - frameWidth / 2, frameY = WORLD.minerY - 74;
        if (minerImage.complete && minerImage.naturalWidth > 0) {
            const scale = Math.min(frameWidth / minerImage.naturalWidth, frameHeight / minerImage.naturalHeight);
            ctx.drawImage(minerImage, frameX + (frameWidth - minerImage.naturalWidth * scale) / 2, frameY + (frameHeight - minerImage.naturalHeight * scale) / 2, minerImage.naturalWidth * scale, minerImage.naturalHeight * scale);
            return;
        }
        ctx.save(); ctx.translate(WORLD.minerX, WORLD.minerY); ctx.scale(0.78, 0.78);
        ctx.fillStyle = '#603c11'; ctx.fillRect(-54, 54, 108, 14); ctx.fillStyle = '#ffe28d'; ctx.beginPath(); ctx.arc(0, -34, 30, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#f3b44b'; ctx.fillRect(-30, -4, 60, 62); ctx.fillStyle = '#7a2f0f'; ctx.fillRect(-50, -8, 22, 68); ctx.fillRect(28, -8, 22, 68);
        ctx.fillRect(-24, 56, 14, 72); ctx.fillRect(10, 56, 14, 72); ctx.fillStyle = '#d8dce4'; ctx.fillRect(-28, 128, 18, 16); ctx.fillRect(10, 128, 18, 16);
        ctx.fillStyle = '#ffd54f'; ctx.beginPath(); ctx.moveTo(-34, -44); ctx.lineTo(0, -76); ctx.lineTo(34, -44); ctx.closePath(); ctx.fill(); ctx.restore();
    }

    function drawHook() {
        const hook = state.hook; if (!hook) return; const tip = getHookTip();
        const ropeAngle = Math.atan2(tip.y - WORLD.hookBaseY, tip.x - WORLD.minerX);
        ctx.save(); ctx.strokeStyle = '#f5e6b6'; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.moveTo(WORLD.minerX, WORLD.hookBaseY); ctx.lineTo(tip.x, tip.y); ctx.stroke();
        ctx.translate(tip.x, tip.y); ctx.rotate(ropeAngle - Math.PI / 2); ctx.fillStyle = '#d8dce4';
        ctx.beginPath(); ctx.moveTo(0, 6); ctx.lineTo(-16, 30); ctx.lineTo(-6, 28); ctx.lineTo(-2, 14); ctx.closePath(); ctx.fill();
        ctx.beginPath(); ctx.moveTo(0, 6); ctx.lineTo(16, 30); ctx.lineTo(6, 28); ctx.lineTo(2, 14); ctx.closePath(); ctx.fill();
        ctx.fillRect(-3, -8, 6, 20); ctx.restore();
    }

    function drawGold(item) {
        ctx.save(); ctx.translate(item.x, item.y); ctx.rotate(item.rotation);
        const gradient = ctx.createRadialGradient(-item.radius * 0.3, -item.radius * 0.35, 2, 0, 0, item.radius);
        gradient.addColorStop(0, '#fffdf2'); gradient.addColorStop(0.48, item.color); gradient.addColorStop(1, '#8a4a11');
        ctx.fillStyle = gradient; ctx.beginPath();
        ctx.moveTo(-item.radius * 0.65, -item.radius * 0.1); ctx.lineTo(-item.radius * 0.2, -item.radius * 0.72); ctx.lineTo(item.radius * 0.58, -item.radius * 0.4); ctx.lineTo(item.radius * 0.74, item.radius * 0.22); ctx.lineTo(item.radius * 0.16, item.radius * 0.75); ctx.lineTo(-item.radius * 0.7, item.radius * 0.44);
        ctx.closePath(); ctx.fill(); ctx.strokeStyle = 'rgba(120, 68, 0, 0.36)'; ctx.lineWidth = 2; ctx.stroke(); ctx.restore();
    }

    function drawStone(item) {
        ctx.save(); ctx.translate(item.x, item.y); ctx.rotate(item.rotation * 0.6); ctx.fillStyle = item.color;
        ctx.beginPath(); ctx.moveTo(-item.radius * 0.7, -item.radius * 0.16); ctx.lineTo(-item.radius * 0.3, -item.radius * 0.78); ctx.lineTo(item.radius * 0.5, -item.radius * 0.52); ctx.lineTo(item.radius * 0.82, 0); ctx.lineTo(item.radius * 0.34, item.radius * 0.78); ctx.lineTo(-item.radius * 0.54, item.radius * 0.56);
        ctx.closePath(); ctx.fill(); ctx.strokeStyle = 'rgba(255,255,255,0.15)'; ctx.lineWidth = 1.5; ctx.stroke(); ctx.restore();
    }

    function drawXuanJin(item) {
        ctx.save(); ctx.translate(item.x, item.y); ctx.rotate(item.rotation); ctx.fillStyle = item.color;
        ctx.beginPath(); ctx.moveTo(0, -item.radius); ctx.lineTo(item.radius * 0.72, 0); ctx.lineTo(0, item.radius); ctx.lineTo(-item.radius * 0.72, 0);
        ctx.closePath(); ctx.fill(); ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 1.3; ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, -item.radius); ctx.lineTo(0, item.radius); ctx.moveTo(-item.radius * 0.72, 0); ctx.lineTo(item.radius * 0.72, 0); ctx.stroke(); ctx.restore();
    }

    function drawObject(item) { if (item.shape === 'gold-small' || item.shape === 'gold-big') drawGold(item); else if (item.shape === 'xuan-gold') drawXuanJin(item); else drawStone(item); }

    function drawParticles() { for (const p of state.particles) { const alpha = clamp(p.life / p.maxLife, 0, 1); ctx.fillStyle = colorWithAlpha(p.color, alpha); ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill(); } }

    function drawBackground() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const sky = ctx.createLinearGradient(0, 0, 0, WORLD.surfaceY); sky.addColorStop(0, '#295081'); sky.addColorStop(1, '#3d78a1');
        ctx.fillStyle = sky; ctx.fillRect(0, 0, canvas.width, WORLD.surfaceY);
        drawCloud(90, 76, 0.88); drawCloud(240, 132, 0.72); drawCloud(660, 72, 0.94); drawCloud(780, 138, 0.68);
        const dirt = ctx.createLinearGradient(0, WORLD.surfaceY, 0, canvas.height); dirt.addColorStop(0, '#9b6127'); dirt.addColorStop(0.18, '#7e4a17'); dirt.addColorStop(1, '#4a2709');
        ctx.fillStyle = dirt; ctx.fillRect(0, WORLD.surfaceY, canvas.width, canvas.height - WORLD.surfaceY);
        ctx.fillStyle = 'rgba(255,255,255,0.06)';
        for (let i = 0; i < 44; i++) { ctx.beginPath(); ctx.arc((i * 61) % canvas.width + (i % 3) * 11, WORLD.surfaceY + ((i * 87) % (canvas.height - WORLD.surfaceY - 40)) + 16, 3 + (i % 4), 0, Math.PI * 2); ctx.fill(); }
        ctx.fillStyle = '#5a300d'; ctx.fillRect(0, WORLD.surfaceY - 8, canvas.width, 12);
    }

    function drawPowerup(p) { ctx.save(); ctx.font = '32px Arial'; ctx.textAlign = center; ctx.textBaseline = middle; const emoji = p.type === 'dynamite' ? '💣' : p.type === 'potion' ? '⚡' : '🍀'; ctx.fillText(emoji, p.x, p.y); ctx.restore(); }

    function draw() {
        if (!state.started) return; drawBackground(); drawMiner(); state.objects.forEach(drawObject);
        if (state.powerup) drawPowerup(state.powerup); drawHook(); drawParticles();

        const showCountdown = state.running && state.timeLeft <= 10 && state.timeLeft > 0;
        if (state.buffs.speed > 0 || state.buffs.score > 0 || state.hasDynamite || showCountdown) {
            ctx.save(); ctx.fillStyle = 'rgba(0,0,0,0.6)';
            const lines = (state.buffs.speed > 0 ? 1 : 0) + (state.buffs.score > 0 ? 1 : 0) + (state.hasDynamite ? 1 : 0) + (showCountdown ? 1 : 0);
            ctx.fillRect(10, 10, 160, 15 + lines * 25); ctx.font = 'bold 16px Arial'; ctx.fillStyle = '#fff'; let y = 30;
            if (showCountdown) { const flash = Math.floor(state.timeLeft * 2) % 2 === 0; ctx.fillStyle = flash ? '#ff4444' : '#ffaa00'; ctx.fillText(`⏰ 倒计时: ${Math.ceil(state.timeLeft)}s`, 20, y); ctx.fillStyle = '#fff'; y += 25; }
            if (state.hasDynamite) { ctx.fillText('💣 炸药桶已装填', 20, y); y += 25; }
            if (state.buffs.speed > 0) { ctx.fillText(`⚡ 速度提升: ${Math.ceil(state.buffs.speed)}s`, 20, y); y += 25; }
            if (state.buffs.score > 0) { ctx.fillText(`🍀 得分翻倍: ${Math.ceil(state.buffs.score)}s`, 20, y); }
            ctx.restore();
        }
    }

    function gameLoop(now) { const delta = now - state.lastTick; state.lastTick = now; update(delta); draw(); requestAnimationFrame(gameLoop); }

    // ===== 事件绑定 =====
    shootBtn.addEventListener('click', launchHook);
    restartBtn.addEventListener('click', () => { showStartScreen(); });
    startBtn.addEventListener('click', startGame);
    finalConfirmBtn.addEventListener('click', () => { document.getElementById('highScoreHint').classList.add('hidden'); showStartScreen(); });
    document.getElementById('goLoginBtn').addEventListener('click', () => { window.location.href = '/profile.html'; });
    document.getElementById('levelFailRestartBtn').addEventListener('click', () => { document.getElementById('levelFailOverlay').classList.add('hidden'); showStartScreen(); });
    document.getElementById('levelPassNextBtn').addEventListener('click', () => { document.getElementById('levelPassOverlay').classList.add('hidden'); const next = state.level + 1; resetLevel(next, false); state.running = true; });
    canvas.addEventListener('click', launchHook);
    window.addEventListener('keydown', event => {
        if (event.code === 'Space') { event.preventDefault(); launchHook(); }
        if (event.code === 'KeyR' && state.started) { showPop('已重新开启【入门试炼·初入洞天】。'); resetLevel(1, true); }
    });

    // ===== 初始化 =====
    checkLoginAndLoadData().then(loggedIn => { if (loggedIn) startScreen.classList.remove('hidden'); });
    requestAnimationFrame(now => { state.lastTick = now; requestAnimationFrame(gameLoop); });
})();
