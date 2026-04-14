(function () {
    const DEFAULT_AVATAR = 'img/default-avatar.jpg';
    const MAX_AVATAR_SIZE = 3 * 1024 * 1024;
    let currentUser = null;
    let uploadingAvatar = false;
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
        try {
            return JSON.parse(localStorage.getItem('yanyun_user') || 'null');
        } catch {
            return null;
        }
    }

    function saveUser(user) {
        localStorage.setItem('yanyun_user', JSON.stringify(user));
    }

    async function api(method, url, body) {
        const r = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: body ? JSON.stringify(body) : undefined,
        });
        const data = await r.json();
        if (!r.ok) throw data || new Error('请求失败');
        return data;
    }

    function showToast(message, duration = 2200) {
        const existingToast = document.querySelector('.toast');
        if (existingToast) existingToast.remove();

        const toast = document.createElement('div');
        toast.className = 'toast';
        toast.textContent = message;
        document.body.appendChild(toast);
        toast.offsetHeight;
        toast.classList.add('show');

        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        }, duration);
    }

    function getStyleText(user) {
        const main = (user && user.mainStyle ? String(user.mainStyle).trim() : '') || '未定';
        const sub = user && user.subStyle ? String(user.subStyle).trim() : '';
        return { main, sub };
    }

    function getAvatarUrl(user) {
        return user && user.avatarUrl && String(user.avatarUrl).trim()
            ? String(user.avatarUrl).trim()
            : DEFAULT_AVATAR;
    }

    function renderUserInfo(user) {
        const avatarImg = document.querySelector('.avatar-img');
        const userName = document.querySelector('.user-name');
        const mainStyleEl = document.querySelector('.style-main');
        const subStyleEl = document.querySelector('.style-sub');
        const dividerEl = document.querySelector('.style-divider');

        const { main, sub } = getStyleText(user);
        const avatarUrl = getAvatarUrl(user);

        if (avatarImg) {
            avatarImg.src = avatarUrl;
            avatarImg.onerror = () => {
                avatarImg.onerror = null;
                avatarImg.src = DEFAULT_AVATAR;
            };
        }

        if (userName) userName.textContent = user.gameName || '未入江湖';
        if (mainStyleEl) mainStyleEl.textContent = main;
        if (subStyleEl) {
            subStyleEl.textContent = sub || '暂无辅修';
            subStyleEl.classList.toggle('is-empty', !sub);
        }
        if (dividerEl) dividerEl.classList.toggle('is-hidden', !sub);
    }

    function renderStats(signInCount, lotteryCount) {
        const signInValue = document.querySelector('.stat-signin .stat-number');
        const lotteryValue = document.querySelector('.stat-lottery .stat-number');
        if (signInValue) signInValue.textContent = String(signInCount || 0);
        if (lotteryValue) lotteryValue.textContent = String(lotteryCount || 0);
    }

    const ACHIEVEMENTS = [
        { id: 'signin_30', name: '初心不改', desc: '累计签到30天', type: 'signin', target: 30 },
        { id: 'signin_90', name: '坚持不懈', desc: '累计签到90天', type: 'signin', target: 90 },
        { id: 'signin_180', name: '半载相伴', desc: '累计签到180天', type: 'signin', target: 180 },
        { id: 'signin_365', name: '岁月如歌', desc: '累计签到365天', type: 'signin', target: 365 },
        { id: 'juejin_complete', name: '掘金之王', desc: '成功通关掘金玩法', type: 'juejin', target: 1 }
    ];

    function createSignInIcon(days) {
        return `<svg class="achievement-icon" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
            <rect x="8" y="12" width="48" height="44" rx="4" fill="#c8a45e" opacity="0.9"/>
            <rect x="8" y="12" width="48" height="12" rx="4" fill="#8a6830"/>
            <circle cx="20" cy="18" r="2" fill="#e8c878"/>
            <circle cx="44" cy="18" r="2" fill="#e8c878"/>
            <text x="32" y="42" font-size="20" font-weight="bold" fill="#1e1208" text-anchor="middle">${days}</text>
        </svg>`;
    }

    function createJuejinIcon() {
        return `<svg class="achievement-icon" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
            <defs>
                <linearGradient id="metalGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" style="stop-color:#e8e8e8"/>
                    <stop offset="50%" style="stop-color:#c0c0c0"/>
                    <stop offset="100%" style="stop-color:#a0a0a0"/>
                </linearGradient>
            </defs>
            <rect x="28" y="20" width="4" height="32" rx="2" fill="#8b4513" transform="rotate(-15 30 36)"/>
            <path d="M 20 18 L 44 14 L 42 22 L 18 26 Z" fill="url(#metalGrad)"/>
            <circle cx="48" cy="48" r="8" fill="#ffd700" opacity="0.8"/>
            <text x="48" y="52" font-size="10" font-weight="bold" fill="#8b4513" text-anchor="middle">金</text>
        </svg>`;
    }

    async function fetchAchievements(userId) {
        try {
            return await api('GET', `/api/achievements/${encodeURIComponent(userId)}`);
        } catch {
            return { achievements: [], signInCount: 0, juejinCompleted: false };
        }
    }

    function renderAchievements(achievementData) {
        const grid = document.getElementById('achievementsGrid');
        if (!grid) return;

        const { achievements, signInCount, juejinCompleted } = achievementData;
        grid.innerHTML = '';

        ACHIEVEMENTS.forEach(ach => {
            const unlocked = achievements.includes(ach.id);
            const item = document.createElement('div');
            item.className = `achievement-item ${unlocked ? 'unlocked' : 'locked'}`;
            item.title = ach.desc;

            let icon = '';
            if (ach.type === 'signin') {
                icon = createSignInIcon(ach.target);
            } else if (ach.type === 'juejin') {
                icon = createJuejinIcon();
            }

            let progress = '';
            if (!unlocked && ach.type === 'signin') {
                progress = `<div class="achievement-progress">${signInCount}/${ach.target}</div>`;
            }

            item.innerHTML = `${icon}<div class="achievement-name">${ach.name}</div>${progress}`;
            grid.appendChild(item);
        });
    }

    function showAchievementUnlocked(achievement) {
        if (!window.Swal) return;
        const icon = achievement.id.startsWith('signin')
            ? createSignInIcon(achievement.id.split('_')[1])
            : createJuejinIcon();

        window.Swal.fire({
            title: '🎉 成就解锁',
            html: `<div style="display:flex;flex-direction:column;align-items:center;gap:12px;">
                ${icon}
                <div style="font-size:18px;color:#e8c878;letter-spacing:2px;">${achievement.name}</div>
                <div style="font-size:14px;color:#b8a888;">${achievement.desc}</div>
            </div>`,
            confirmButtonText: '太好了',
            customClass: { popup: 'swal-dark' }
        });
    }

    function setupWebSocket() {
        try {
            const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            const ws = new WebSocket(`${protocol}//${window.location.host}`);

            ws.onmessage = (event) => {
                try {
                    const msg = JSON.parse(event.data);
                    if (msg.type === 'achievement' && msg.userId === currentUser?.id && msg.achievement) {
                        showAchievementUnlocked(msg.achievement);
                    }
                } catch (e) { }
            };
        } catch (e) { }
    }

    function bindBackButton() {
        const backBtn = document.querySelector('.back-btn');
        if (!backBtn) return;
        backBtn.addEventListener('click', () => {
            window.location.href = 'index.html';
        });
    }

    function bindGoldGameEntry() {
        const goldGameBtn = document.getElementById('goldGameBtn');
        if (!goldGameBtn) return;
        goldGameBtn.addEventListener('click', () => {
            window.location.href = 'games/dongtian-juejin.html';
        });
    }

    function waitForIdentityModal(maxWait = 4000) {
        return new Promise(resolve => {
            const start = Date.now();
            const timer = setInterval(() => {
                if (typeof window.showIdentityModal === 'function') {
                    clearInterval(timer);
                    resolve(true);
                    return;
                }
                if (Date.now() - start > maxWait) {
                    clearInterval(timer);
                    resolve(false);
                }
            }, 80);
        });
    }

    async function ensureLoggedIn() {
        const localUser = loadUser();
        if (localUser && localUser.id) return localUser;

        const ok = await waitForIdentityModal();
        if (ok) {
            window.showIdentityModal('login');
            showToast('请先登录');
            return null;
        }

        if (window.Swal) {
            window.Swal.fire({
                title: '尚未登录',
                text: '当前未检测到登录状态，请先返回首页登录。',
                confirmButtonText: '返回首页',
                customClass: { popup: 'swal-dark' }
            }).then(() => {
                window.location.href = 'index.html';
            });
        } else {
            alert('当前未检测到登录状态，请先返回首页登录。');
            window.location.href = 'index.html';
        }
        return null;
    }

    async function refreshUser(user) {
        const users = await api('GET', '/api/users');
        const fresh = users.find(u => u.id === user.id);
        if (!fresh) {
            localStorage.removeItem('yanyun_user');
            throw new Error('当前用户已不存在，请重新登录');
        }
        saveUser(fresh);
        currentUser = fresh;
        return fresh;
    }

    async function fetchSignInStatus(userId) {
        try {
            const result = await api('GET', `/api/sign-in/status?userId=${encodeURIComponent(userId)}`);
            return result;
        } catch {
            return { signInCount: 0, alreadySignedIn: false, lastSignInDate: null };
        }
    }

    function fileToDataURL(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = () => reject(new Error('头像读取失败'));
            reader.readAsDataURL(file);
        });
    }

    function validateAvatarFile(file) {
        if (!file) throw new Error('未选择头像文件');
        if (!/^image\//.test(file.type)) throw new Error('仅支持上传图片文件');
        if (file.size > MAX_AVATAR_SIZE) throw new Error('头像不能超过 3MB');
    }

    async function uploadAvatar(file) {
        if (!currentUser || !currentUser.id) throw new Error('当前未登录');
        validateAvatarFile(file);
        const dataUrl = await fileToDataURL(file);
        return api('POST', '/api/users/avatar', {
            userId: currentUser.id,
            fileName: file.name,
            contentType: file.type,
            dataUrl
        });
    }

    function bindAvatarUploader() {
        const avatarWrap = document.querySelector('.avatar-wrap');
        const avatarImg = document.querySelector('.avatar-img');
        const avatarInput = document.querySelector('.avatar-input');
        if (!avatarWrap || !avatarInput || !avatarImg) return;

        avatarWrap.classList.add('is-uploadable');

        avatarWrap.addEventListener('click', () => {
            if (uploadingAvatar) return;
            avatarInput.click();
        });

        avatarInput.addEventListener('change', async event => {
            const file = event.target.files && event.target.files[0];
            if (!file) return;

            try {
                validateAvatarFile(file);
                const previewUrl = URL.createObjectURL(file);
                const previousSrc = avatarImg.src;
                avatarImg.src = previewUrl;
                uploadingAvatar = true;
                avatarWrap.classList.add('is-uploading');
                showLoading('头像上传中...');

                const result = await uploadAvatar(file);
                const nextUser = { ...(currentUser || {}), avatarUrl: result.avatarUrl };
                currentUser = nextUser;
                saveUser(nextUser);
                renderUserInfo(nextUser);
                showToast('头像已保存');
                URL.revokeObjectURL(previewUrl);

                const freshSrc = avatarImg.src;
                if (freshSrc === previousSrc) {
                    avatarImg.src = `${result.avatarUrl}?t=${Date.now()}`;
                }
            } catch (error) {
                renderUserInfo(currentUser);
                showToast(error && error.error ? error.error : (error.message || '头像上传失败'));
            } finally {
                hideLoading();
                uploadingAvatar = false;
                avatarWrap.classList.remove('is-uploading');
                avatarInput.value = '';
            }
        });
    }

    async function init() {
        showLoading('初始化中...');
        bindBackButton();
        bindGoldGameEntry();
        bindAvatarUploader();
        setupWebSocket();

        let user = await ensureLoggedIn();
        if (!user) {
            hideLoading();
            return;
        }

        try {
            const [freshUser, signStatus, achievementData] = await Promise.all([
                refreshUser(user),
                fetchSignInStatus(user.id),
                fetchAchievements(user.id)
            ]);
            renderUserInfo(freshUser);
            renderStats(signStatus.signInCount || 0, freshUser.lotteryCount || 0);
            renderAchievements(achievementData);
            hideLoading();

            // 初始化完成后设置控制台命令
            setupConsoleCommand();
        } catch (e) {
            hideLoading();
            const msg = e && e.message ? e.message : '个人页加载失败';
            showToast(msg);
            if (String(msg).includes('重新登录')) {
                setTimeout(async () => {
                    const ok = await waitForIdentityModal();
                    if (ok) window.showIdentityModal('login');
                    else window.location.href = 'index.html';
                }, 300);
            }
        }
    }

    function setupConsoleCommand() {
        window.get_achievement = async function (tag) {
            if (!currentUser || !currentUser.id) {
                console.error('❌ 未登录，无法触发成就');
                return;
            }

            const tagMap = {
                1: { name: '初心不改', count: 30 },
                2: { name: '坚持不懈', count: 90 },
                3: { name: '半载相伴', count: 180 },
                4: { name: '岁月如歌', count: 365 },
                5: { name: '掘金之王', juejin: true }
            };

            const config = tagMap[tag];
            if (!config) {
                console.error('❌ 无效的tag参数，请使用1-5');
                console.log('参数说明: 1=30天签到, 2=90天签到, 3=180天签到, 4=365天签到, 5=掘金通关');
                return;
            }

            try {
                console.log(`🎯 正在触发成就: ${config.name}...`);
                const result = await api('POST', '/api/achievements/trigger', {
                    userId: currentUser.id,
                    tag: tag
                });

                if (result.achievement) {
                    console.log(`✅ 成就已解锁: ${result.achievement.name} - ${result.achievement.desc}`);
                    showAchievementUnlocked(result.achievement);
                    const achievementData = await fetchAchievements(currentUser.id);
                    renderAchievements(achievementData);
                } else {
                    console.log('✅ 成就条件已设置，但可能已解锁过');
                }
            } catch (e) {
                console.error('❌ 触发失败:', e.error || e.message || e);
            }
        };

        window.set_checkin_days = async function (username, days) {
            if (!username || days === undefined) {
                console.error('❌ 参数错误，用法: set_checkin_days("游戏名", 天数)');
                return;
            }

            try {
                console.log(`🎯 正在设置 ${username} 的签到天数为 ${days}...`);
                const result = await api('POST', '/api/users/set-checkin-days', {
                    username: username,
                    days: days
                });

                if (result.success) {
                    console.log(`✅ 设置成功: ${result.gameName} 的签到天数已设置为 ${result.signInCount} 天`);

                    // 如果是当前用户，刷新页面数据
                    if (currentUser && currentUser.gameName === username) {
                        const [freshUser, signStatus, achievementData] = await Promise.all([
                            refreshUser(currentUser),
                            fetchSignInStatus(currentUser.id),
                            fetchAchievements(currentUser.id)
                        ]);
                        renderUserInfo(freshUser);
                        renderStats(signStatus.signInCount || 0, freshUser.lotteryCount || 0);
                        renderAchievements(achievementData);
                        console.log('✅ 页面数据已刷新');
                    }
                } else {
                    console.log('⚠️ 设置完成，但返回结果异常');
                }
            } catch (e) {
                console.error('❌ 设置失败:', e.error || e.message || e);
            }
        };

        console.log('💡 提示: 使用 get_achievement(1-5) 命令测试成就解锁');
        console.log('   1=30天签到, 2=90天签到, 3=180天签到, 4=365天签到, 5=掘金通关');
        console.log('💡 提示: 使用 set_checkin_days("游戏名", 天数) 设置签到天数');

        window.list_users = async function () {
            try {
                const result = await api('GET', '/api/users');
                if (Array.isArray(result)) {
                    console.log('📋 当前所有用户:');
                    result.forEach((u, i) => {
                        console.log(`  ${i + 1}. ${u.gameName} (ID: ${u.id}, 签到: ${u.signInCount || 0}天)`);
                    });
                } else {
                    console.log('⚠️ 无法获取用户列表');
                }
            } catch (e) {
                console.error('❌ 获取失败:', e.error || e.message || e);
            }
        };

        console.log('💡 提示: 使用 list_users() 查看所有用户名');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
