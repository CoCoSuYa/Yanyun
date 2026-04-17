#!/usr/bin/env node
/**
 * 全量比对脚本：检查 MySQL 与云数据库数据是否一致
 *
 * 覆盖范围：
 * - users
 * - teams
 * - lottery（单例）
 * - notices
 * - suggestions
 *
 * 用法：
 *   node check-mysql-cloud-consistency.js
 */

const path = require('path');
const fs = require('fs');

(function loadEnvLocal() {
    try {
        const f = path.join(__dirname, '.env.local');
        if (!fs.existsSync(f)) return;
        fs.readFileSync(f, 'utf8').split(/\r?\n/).forEach(line => {
            const m = line.match(/^([A-Z_][A-Z0-9_]*)\s*=\s*(.+)$/);
            if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
        });
    } catch {
        // ignore
    }
})();

const db = require('./db/mysql');
const cloudbase = require('@cloudbase/node-sdk');
const {
    toCamelCaseUser,
    toCamelCaseTeam,
    toCamelCaseNotice,
    toCamelCaseSuggestion,
    toLotteryObject
} = require('./utils/format');

let cloudDb = null;

function initCloud() {
    if (cloudDb) return cloudDb;

    const env = process.env.MP_CLOUD_ENV;
    const secretId = process.env.CLOUD_SECRET_ID;
    const secretKey = process.env.CLOUD_SECRET_KEY;

    if (!env || !secretId || !secretKey) {
        throw new Error('缺少云开发环境变量：MP_CLOUD_ENV / CLOUD_SECRET_ID / CLOUD_SECRET_KEY');
    }

    const app = cloudbase.init({ env, secretId, secretKey });
    cloudDb = app.database();
    return cloudDb;
}

function stableSort(value) {
    if (Array.isArray(value)) {
        return value
            .map(stableSort)
            .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
    }

    if (value && typeof value === 'object') {
        return Object.keys(value)
            .sort()
            .reduce((acc, key) => {
                acc[key] = stableSort(value[key]);
                return acc;
            }, {});
    }

    return value;
}

function normalizeDate(value) {
    if (value === undefined || value === null || value === '') return null;

    if (value instanceof Date) return value.toISOString();

    if (typeof value === 'object') {
        if (typeof value.toDate === 'function') return value.toDate().toISOString();
        if (typeof value.seconds === 'number') return new Date(value.seconds * 1000).toISOString();
        if (value.$date) {
            const d = new Date(value.$date);
            if (!Number.isNaN(d.getTime())) return d.toISOString();
        }
    }

    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) return d.toISOString();

    return String(value);
}

function normalizeTimeValue(value) {
    if (value === undefined || value === null || value === '') return null;
    if (typeof value === 'string') {
        const m = value.match(/(\d{2}:\d{2}:\d{2})$/);
        if (m) return m[1];
    }

    const iso = normalizeDate(value);
    if (typeof iso === 'string') {
        const m = iso.match(/T(\d{2}:\d{2}:\d{2})/);
        if (m) return m[1];
    }

    return normalizePrimitive(value);
}

function normalizePrimitive(value) {
    if (value === undefined || value === null) return null;
    if (typeof value === 'number') return Number.isNaN(value) ? null : value;
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') return value;
    return value;
}

function tryParseJSON(value, fallback) {
    if (value === undefined || value === null || value === '') return fallback;
    if (typeof value === 'string') {
        try {
            return JSON.parse(value);
        } catch {
            return fallback;
        }
    }
    return value;
}

function normalizeUserRecord(user) {
    return {
        id: user.id,
        gameName: normalizePrimitive(user.gameName),
        guildName: normalizePrimitive(user.guildName),
        mainStyle: normalizePrimitive(user.mainStyle),
        subStyle: normalizePrimitive(user.subStyle || ''),
        passwordHash: normalizePrimitive(user.passwordHash),
        avatarUrl: normalizePrimitive(user.avatarUrl || ''),
        isAdmin: !!user.isAdmin,
        lotteryCount: Number(user.lotteryCount ?? 0),
        signInCount: Number(user.signInCount ?? 0),
        lastSignInDate: normalizeDate(user.lastSignInDate),
        readNoticeIds: stableSort(Array.isArray(user.readNoticeIds) ? user.readNoticeIds.filter(v => v != null) : []),
        readSuggestionIds: stableSort(Array.isArray(user.readSuggestionIds) ? user.readSuggestionIds.filter(v => v != null) : []),
        contributionPoints: Number(user.contributionPoints ?? 0),
        coins: Number(user.coins ?? 0),
        totalCoinsEarned: Number(user.totalCoinsEarned ?? 0),
        consecutiveSignIns: Number(user.consecutiveSignIns ?? 0),
        juejinHighScore: Number(user.juejinHighScore ?? 0),
        achievements: stableSort(Array.isArray(user.achievements) ? user.achievements : []),
        juejinCompleted: !!user.juejinCompleted,
        openId: normalizePrimitive(user.openId || null),
        juejinLastPlayed: normalizeDate(user.juejinLastPlayed),
        mpQuota: stableSort(user.mpQuota || { invite: 0, full: 0, remind: 0 }),
        inviteLog: stableSort(user.inviteLog || {}),
        pendingInvites: stableSort(Array.isArray(user.pendingInvites) ? user.pendingInvites : []),
        createdAt: normalizeDate(user.createdAt),
        updatedAt: normalizeDate(user.updatedAt)
    };
}

function normalizeTeamRecord(team) {
    return {
        id: team.id,
        type: normalizePrimitive(team.type),
        purpose: normalizePrimitive(team.purpose || ''),
        date: normalizePrimitive(team.date),
        time: normalizeTimeValue(team.time),
        leaderId: normalizePrimitive(team.leaderId),
        members: stableSort(Array.isArray(team.members) ? team.members : []),
        maxSize: Number(team.maxSize ?? 0),
        fullNotified: !!team.fullNotified,
        remindSent: !!team.remindSent,
        createdAt: normalizeDate(team.createdAt),
        updatedAt: normalizeDate(team.updatedAt)
    };
}

function normalizeNoticeRecord(notice) {
    return {
        id: notice.id,
        title: normalizePrimitive(notice.title),
        content: normalizePrimitive(notice.content),
        authorId: normalizePrimitive(notice.authorId),
        createdAt: normalizeDate(notice.createdAt),
        updatedAt: normalizeDate(notice.updatedAt)
    };
}

function normalizeSuggestionRecord(suggestion) {
    return {
        id: suggestion.id,
        content: normalizePrimitive(suggestion.content),
        authorId: normalizePrimitive(suggestion.authorId),
        createdAt: normalizeDate(suggestion.createdAt),
        updatedAt: normalizeDate(suggestion.updatedAt)
    };
}

function normalizeLotteryRecord(lottery) {
    return {
        id: 'singleton',
        slots: stableSort(Array.isArray(lottery.slots) ? lottery.slots : []),
        winners: stableSort(Array.isArray(lottery.winners) ? lottery.winners : []),
        bannerClearedAt: normalizeDate(lottery.bannerClearedAt),
        lastClear: normalizeDate(lottery.lastClear),
        luckyDrawRemaining: Number(lottery.luckyDrawRemaining ?? 0),
        lastLuckyReset: normalizeDate(lottery.lastLuckyReset),
        updatedAt: normalizeDate(lottery.updatedAt)
    };
}

function normalizeCloudUserRecord(doc) {
    return normalizeUserRecord({
        id: doc._id,
        gameName: doc.game_name,
        guildName: doc.guild_name,
        mainStyle: doc.main_style,
        subStyle: doc.sub_style,
        passwordHash: doc.password_hash,
        avatarUrl: doc.avatar_url,
        isAdmin: doc.is_admin,
        lotteryCount: doc.lottery_count,
        signInCount: doc.sign_in_count,
        lastSignInDate: doc.last_sign_in_date,
        readNoticeIds: doc.read_notice_ids,
        readSuggestionIds: doc.read_suggestion_ids,
        contributionPoints: doc.contribution_points,
        coins: doc.coins,
        totalCoinsEarned: doc.total_coins_earned,
        consecutiveSignIns: doc.consecutive_sign_ins,
        juejinHighScore: doc.juejin_high_score,
        achievements: doc.achievements,
        juejinCompleted: doc.juejin_completed,
        openId: doc.open_id,
        juejinLastPlayed: doc.juejin_last_played,
        mpQuota: doc.mp_quota,
        inviteLog: doc.invite_log,
        pendingInvites: doc.pending_invites,
        createdAt: doc.created_at,
        updatedAt: doc.updated_at
    });
}

function normalizeCloudTeamRecord(doc) {
    return normalizeTeamRecord({
        id: doc._id,
        type: doc.type,
        purpose: doc.purpose,
        date: doc.date,
        time: doc.time,
        leaderId: doc.leader_id,
        members: doc.members,
        maxSize: doc.max_size,
        fullNotified: doc.full_notified,
        remindSent: doc.remind_sent,
        createdAt: doc.created_at,
        updatedAt: doc.updated_at
    });
}

function normalizeCloudNoticeRecord(doc) {
    return normalizeNoticeRecord({
        id: doc._id,
        title: doc.title,
        content: doc.content,
        authorId: doc.author_id,
        createdAt: doc.created_at,
        updatedAt: doc.updated_at
    });
}

function normalizeCloudSuggestionRecord(doc) {
    return normalizeSuggestionRecord({
        id: doc._id,
        content: doc.content,
        authorId: doc.author_id,
        createdAt: doc.created_at,
        updatedAt: doc.updated_at
    });
}

function normalizeCloudLotteryRecord(doc) {
    return normalizeLotteryRecord({
        slots: doc?.slots,
        winners: doc?.winners,
        bannerClearedAt: doc?.banner_cleared_at,
        lastClear: doc?.last_clear,
        luckyDrawRemaining: doc?.lucky_draw_remaining,
        lastLuckyReset: doc?.last_lucky_reset,
        updatedAt: doc?.updated_at
    });
}

async function fetchAllCloudCollection(name, orderField = '_id') {
    const cdb = initCloud();
    const pageSize = 100;
    let skip = 0;
    const all = [];

    while (true) {
        const res = await cdb.collection(name).orderBy(orderField, 'asc').skip(skip).limit(pageSize).get();
        const rows = res.data || [];
        all.push(...rows);
        if (rows.length < pageSize) break;
        skip += pageSize;
    }

    return all;
}

async function fetchCloudCollectionAuto(candidates, orderField = '_id') {
    const errors = [];

    for (const name of candidates) {
        try {
            const data = await fetchAllCloudCollection(name, orderField);
            return { collectionName: name, data };
        } catch (err) {
            errors.push(`${name}: ${err.message}`);
        }
    }

    throw new Error(`云集合读取失败: ${errors.join(' | ')}`);
}

async function fetchCloudSingletonAuto(candidates, docId) {
    const cdb = initCloud();
    const errors = [];

    for (const name of candidates) {
        try {
            const res = await cdb.collection(name).doc(docId).get();
            const doc = Array.isArray(res.data) ? res.data[0] : res.data;
            return { collectionName: name, data: doc || null };
        } catch (err) {
            errors.push(`${name}: ${err.message}`);
        }
    }

    throw new Error(`云单例文档读取失败: ${errors.join(' | ')}`);
}

function diffObjects(mysqlObj, cloudObj, prefix = '') {
    const diffs = [];
    const keys = Array.from(new Set([
        ...Object.keys(mysqlObj || {}),
        ...Object.keys(cloudObj || {})
    ])).sort();

    for (const key of keys) {
        const pathKey = prefix ? `${prefix}.${key}` : key;
        const left = mysqlObj ? mysqlObj[key] : undefined;
        const right = cloudObj ? cloudObj[key] : undefined;

        const leftIsObj = left && typeof left === 'object';
        const rightIsObj = right && typeof right === 'object';

        if (leftIsObj && rightIsObj && !Array.isArray(left) && !Array.isArray(right)) {
            diffs.push(...diffObjects(left, right, pathKey));
            continue;
        }

        if (pathKey === 'createdAt' || pathKey === 'updatedAt') {
            continue;
        }

        if (JSON.stringify(left) !== JSON.stringify(right)) {
            diffs.push({ field: pathKey, mysql: left, cloud: right });
        }
    }

    return diffs;
}

function printSection(title) {
    console.log(`\n${'='.repeat(72)}`);
    console.log(title);
    console.log(`${'='.repeat(72)}`);
}

function printCountResult(name, mysqlCount, cloudCount) {
    const ok = mysqlCount === cloudCount;
    console.log(`[数量] ${name}: MySQL=${mysqlCount}, Cloud=${cloudCount} ${ok ? '✓' : '✗'}`);
    return ok;
}

function printRecordDiffs(name, diffsById, limit = 20) {
    if (diffsById.length === 0) {
        console.log(`[内容] ${name}: 全量内容一致 ✓`);
        return;
    }

    console.log(`[内容] ${name}: 发现 ${diffsById.length} 条差异 ✗`);
    diffsById.slice(0, limit).forEach(item => {
        console.log(`  - 主键: ${item.id}`);
        console.log(`    MySQL完整数据: ${JSON.stringify(item.mysqlFull, null, 2)}`);
        console.log(`    Cloud完整数据: ${JSON.stringify(item.cloudFull, null, 2)}`);
        console.log(`    字段差异:`);
        item.diffs.forEach(diff => {
            console.log(`      字段: ${diff.field}`);
            console.log(`        MySQL: ${JSON.stringify(diff.mysql)}`);
            console.log(`        Cloud: ${JSON.stringify(diff.cloud)}`);
        });
    });

    if (diffsById.length > limit) {
        console.log(`  ... 其余 ${diffsById.length - limit} 条差异未展开`);
    }
}

async function loadMysqlUsers() {
    const rows = await db.query('SELECT * FROM users ORDER BY id');
    return rows.map(row => normalizeUserRecord({
        ...toCamelCaseUser(row),
        openId: row.open_id || null,
        mpQuota: tryParseJSON(row.mp_quota, { invite: 0, full: 0, remind: 0 }),
        inviteLog: tryParseJSON(row.invite_log, {}),
        pendingInvites: tryParseJSON(row.pending_invites, []),
        createdAt: row.created_at || null,
        updatedAt: row.updated_at || null
    }));
}

async function loadMysqlTeams() {
    const rows = await db.query('SELECT * FROM teams ORDER BY id');
    return rows.map(row => normalizeTeamRecord(toCamelCaseTeam(row)));
}

async function loadMysqlNotices() {
    const rows = await db.query('SELECT * FROM notices ORDER BY id');
    return rows.map(row => normalizeNoticeRecord({
        ...toCamelCaseNotice(row),
        updatedAt: row.updated_at || null
    }));
}

async function loadMysqlSuggestions() {
    const rows = await db.query('SELECT * FROM suggestions ORDER BY id');
    return rows.map(row => normalizeSuggestionRecord({
        ...toCamelCaseSuggestion(row),
        updatedAt: row.updated_at || null
    }));
}

async function loadMysqlLottery() {
    const rows = await db.query('SELECT * FROM lottery LIMIT 1');
    const row = rows[0] || null;
    const lottery = toLotteryObject(row);
    return normalizeLotteryRecord({
        ...lottery,
        luckyDrawRemaining: lottery.luckyDrawRemaining,
        lastLuckyReset: lottery.lastLuckyReset,
        updatedAt: row?.updated_at || null
    });
}

async function loadCloudUsers() {
    const result = await fetchCloudCollectionAuto(['users', 'user']);
    return { collectionName: result.collectionName, list: result.data.map(normalizeCloudUserRecord) };
}

async function loadCloudTeams() {
    const result = await fetchCloudCollectionAuto(['teams', 'team']);
    return { collectionName: result.collectionName, list: result.data.map(normalizeCloudTeamRecord) };
}

async function loadCloudNotices() {
    const result = await fetchCloudCollectionAuto(['notices', 'notice']);
    return { collectionName: result.collectionName, list: result.data.map(normalizeCloudNoticeRecord) };
}

async function loadCloudSuggestions() {
    const result = await fetchCloudCollectionAuto(['suggestions', 'suggestion']);
    return { collectionName: result.collectionName, list: result.data.map(normalizeCloudSuggestionRecord) };
}

async function loadCloudLottery() {
    const result = await fetchCloudSingletonAuto(['lottery'], 'singleton');
    return { collectionName: result.collectionName, item: normalizeCloudLotteryRecord(result.data) };
}

function compareById(name, mysqlList, cloudList, collectionName) {
    const mysqlMap = new Map(mysqlList.map(item => [item.id, item]));
    const cloudMap = new Map(cloudList.map(item => [item.id, item]));
    const allIds = Array.from(new Set([...mysqlMap.keys(), ...cloudMap.keys()])).sort();
    const missingInCloud = [];
    const missingInMysql = [];
    const diffsById = [];

    printSection(`[比对] ${name}`);
    console.log(`[云集合] ${name}: ${collectionName}`);
    const countOk = printCountResult(name, mysqlList.length, cloudList.length);

    for (const id of allIds) {
        const mysqlItem = mysqlMap.get(id);
        const cloudItem = cloudMap.get(id);

        if (!mysqlItem) {
            missingInMysql.push(id);
            continue;
        }

        if (!cloudItem) {
            missingInCloud.push(id);
            continue;
        }

        const diffs = diffObjects(mysqlItem, cloudItem);
        if (diffs.length > 0) diffsById.push({ id, diffs });
    }

    if (missingInCloud.length > 0) {
        console.log(`[缺失] Cloud 缺少 ${missingInCloud.length} 条: ${missingInCloud.slice(0, 20).join(', ')}`);
        if (missingInCloud.length > 20) console.log(`  ... 其余 ${missingInCloud.length - 20} 条未展开`);
    }

    if (missingInMysql.length > 0) {
        console.log(`[缺失] MySQL 缺少 ${missingInMysql.length} 条: ${missingInMysql.slice(0, 20).join(', ')}`);
        if (missingInMysql.length > 20) console.log(`  ... 其余 ${missingInMysql.length - 20} 条未展开`);
    }

    printRecordDiffs(name, diffsById);

    return {
        ok: countOk && missingInCloud.length === 0 && missingInMysql.length === 0 && diffsById.length === 0,
        missingInCloud,
        missingInMysql,
        diffsById
    };
}

function compareSingleton(name, mysqlObj, cloudObj, collectionName) {
    printSection(`[比对] ${name}`);
    console.log(`[云集合] ${name}: ${collectionName}`);
    const countOk = printCountResult(name, 1, cloudObj ? 1 : 0);
    const diffs = diffObjects(mysqlObj, cloudObj || {});

    if (diffs.length === 0 && cloudObj) {
        console.log(`[内容] ${name}: 全量内容一致 ✓`);
    } else if (!cloudObj) {
        console.log(`[缺失] Cloud 缺少单例文档 singleton ✗`);
    } else {
        console.log(`[内容] ${name}: 发现 ${diffs.length} 处差异 ✗`);
        diffs.forEach(diff => {
            console.log(`  - 字段: ${diff.field}`);
            console.log(`    MySQL: ${JSON.stringify(diff.mysql)}`);
            console.log(`    Cloud: ${JSON.stringify(diff.cloud)}`);
        });
    }

    return {
        ok: countOk && !!cloudObj && diffs.length === 0,
        diffs
    };
}

async function main() {
    console.log('[比对] 开始检查 MySQL 与云库的一致性...');
    console.log(`[比对] 时间: ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`);

    try {
        initCloud();

        const [
            mysqlUsers,
            mysqlTeams,
            mysqlNotices,
            mysqlSuggestions,
            mysqlLottery,
            cloudUsers,
            cloudTeams,
            cloudNotices,
            cloudSuggestions,
            cloudLottery
        ] = await Promise.all([
            loadMysqlUsers(),
            loadMysqlTeams(),
            loadMysqlNotices(),
            loadMysqlSuggestions(),
            loadMysqlLottery(),
            loadCloudUsers(),
            loadCloudTeams(),
            loadCloudNotices(),
            loadCloudSuggestions(),
            loadCloudLottery()
        ]);

        const userResult = compareById('users', mysqlUsers, cloudUsers.list, cloudUsers.collectionName);
        const teamResult = compareById('teams', mysqlTeams, cloudTeams.list, cloudTeams.collectionName);
        const noticeResult = compareById('notices', mysqlNotices, cloudNotices.list, cloudNotices.collectionName);
        const suggestionResult = compareById('suggestions', mysqlSuggestions, cloudSuggestions.list, cloudSuggestions.collectionName);
        const lotteryResult = compareSingleton('lottery', mysqlLottery, cloudLottery.item, cloudLottery.collectionName);

        const allOk = userResult.ok && teamResult.ok && noticeResult.ok && suggestionResult.ok && lotteryResult.ok;

        printSection('[汇总]');
        console.log(`- users: ${userResult.ok ? '一致 ✓' : '存在差异 ✗'}`);
        console.log(`- teams: ${teamResult.ok ? '一致 ✓' : '存在差异 ✗'}`);
        console.log(`- notices: ${noticeResult.ok ? '一致 ✓' : '存在差异 ✗'}`);
        console.log(`- suggestions: ${suggestionResult.ok ? '一致 ✓' : '存在差异 ✗'}`);
        console.log(`- lottery: ${lotteryResult.ok ? '一致 ✓' : '存在差异 ✗'}`);
        console.log(`- 总体结论: ${allOk ? 'MySQL 与云库已对齐 ✓' : 'MySQL 与云库存在不一致 ✗'}`);

        process.exit(allOk ? 0 : 1);
    } catch (err) {
        console.error('\n[比对] 执行失败:', err);
        process.exit(1);
    } finally {
        try {
            await db.close();
        } catch {
            // ignore
        }
    }
}

main();
