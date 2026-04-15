#!/usr/bin/env node
/**
 * 完整同步脚本：将 MySQL 所有数据同步到云数据库
 * 包含：users, teams, lottery, notices, suggestions
 * 用法：node scripts/fullSyncToCloud.js
 * 注意：执行前请先手动清空云数据库所有表
 */

const path = require('path');
require('dotenv-flow').config({ path: path.join(__dirname, '..') });

const db = require('../db/mysql');
const cloudbase = require('@cloudbase/node-sdk');

let cloudDb = null;

// 初始化云开发
function initCloud() {
    if (cloudDb) return cloudDb;

    const env = process.env.MP_CLOUD_ENV;
    const secretId = process.env.CLOUD_SECRET_ID;
    const secretKey = process.env.CLOUD_SECRET_KEY;

    if (!env || !secretId || !secretKey) {
        console.error('[全量同步] ❌ 缺少云开发环境变量');
        console.error('[全量同步] 需要配置: MP_CLOUD_ENV, CLOUD_SECRET_ID, CLOUD_SECRET_KEY');
        process.exit(1);
    }

    try {
        const app = cloudbase.init({ env, secretId, secretKey });
        cloudDb = app.database();
        console.log('[全量同步] ✓ 云开发初始化成功');
        return cloudDb;
    } catch (err) {
        console.error('[全量同步] ❌ 初始化失败:', err.message);
        process.exit(1);
    }
}

// 修复 teams 表的 time 字段格式（根据错误信息调整）
async function fixTeamsTimeFormat(errorMessage) {
    console.log('\n[数据修复] 开始修复 teams 表的 time 字段格式...');
    console.log(`[数据修复] 错误信息: ${errorMessage}`);

    try {
        const teams = await db.query('SELECT id, time FROM teams');
        console.log(`[数据修复] 共 ${teams.length} 条队伍记录待检查`);

        let fixed = 0;
        for (const team of teams) {
            if (team.time && team.time.includes(' - ')) {
                // 将 " - " 替换为其他格式，例如 " 至 " 或 "~"
                const fixedTime = team.time.replace(' - ', '~');
                await db.query('UPDATE teams SET time = ? WHERE id = ?', [fixedTime, team.id]);
                fixed++;
                console.log(`[数据修复] 修复队伍 ${team.id}: "${team.time}" -> "${fixedTime}"`);
            }
        }

        console.log(`[数据修复] ✓ 完成，共修复 ${fixed} 条记录\n`);
        return true;
    } catch (err) {
        console.error('[数据修复] ❌ 失败:', err.message);
        return false;
    }
}

// 同步用户到云库
async function syncUsersToCloud() {
    console.log('\n========== 同步用户表 (users) ==========');
    const cdb = initCloud();

    try {
        const users = await db.query('SELECT * FROM users ORDER BY created_at');
        console.log(`[用户同步] 共 ${users.length} 个用户待同步`);

        let success = 0;
        let failed = 0;
        const errors = [];

        for (let i = 0; i < users.length; i++) {
            const user = users[i];
            try {
                // 辅助函数：安全解析 JSON（处理 Buffer 类型）
                const safeParseJSON = (value, defaultValue = null) => {
                    if (!value) return defaultValue;
                    if (Buffer.isBuffer(value)) value = value.toString('utf8');
                    if (typeof value === 'string') {
                        try {
                            return JSON.parse(value);
                        } catch (e) {
                            return defaultValue;
                        }
                    }
                    return value;
                };

                const cloudDoc = {
                    _id: user.id,
                    game_name: user.game_name,
                    guild_name: user.guild_name,
                    main_style: user.main_style,
                    sub_style: user.sub_style || '',
                    password_hash: user.password_hash,
                    avatar_url: user.avatar_url || '',
                    is_admin: user.is_admin || false,
                    lottery_count: user.lottery_count || 1,
                    sign_in_count: user.sign_in_count || 0,
                    last_sign_in_date: user.last_sign_in_date || null,
                    read_notice_ids: safeParseJSON(user.read_notice_ids, []),
                    read_suggestion_ids: safeParseJSON(user.read_suggestion_ids, []),
                    contribution_points: user.contribution_points || 0,
                    consecutive_sign_ins: user.consecutive_sign_ins || 0,
                    juejin_high_score: user.juejin_high_score || 0,
                    achievements: safeParseJSON(user.achievements, []),
                    juejin_completed: user.juejin_completed || false,
                    open_id: user.open_id || null,
                    juejin_last_played: user.juejin_last_played || null,
                    mp_quota: safeParseJSON(user.mp_quota, { invite: 0, full: 0, remind: 0 }),
                    invite_log: safeParseJSON(user.invite_log, {}),
                    pending_invites: safeParseJSON(user.pending_invites, []),
                    created_at: user.created_at ? new Date(user.created_at).toISOString() : new Date().toISOString(),
                    updated_at: user.updated_at ? new Date(user.updated_at).toISOString() : new Date().toISOString()
                };

                await cdb.collection('users').add(cloudDoc);
                success++;
                process.stdout.write(`\r[用户同步] 进度: ${i + 1}/${users.length} | 成功: ${success} | 失败: ${failed}`);
            } catch (err) {
                failed++;
                errors.push({ name: user.game_name, id: user.id, error: err.message });
                process.stdout.write(`\r[用户同步] 进度: ${i + 1}/${users.length} | 成功: ${success} | 失败: ${failed}`);
            }
        }

        console.log(`\n[用户同步] ✓ 完成：成功 ${success}，失败 ${failed}`);
        if (errors.length > 0) {
            console.log('[用户同步] 失败详情:');
            errors.forEach(e => console.log(`  - ${e.name} (${e.id}): ${e.error}`));
        }

        return { success, failed, errors };
    } catch (err) {
        console.error('[用户同步] ❌ 异常:', err.message);
        throw err;
    }
}

// 同步队伍到云库
async function syncTeamsToCloud() {
    console.log('\n========== 同步队伍表 (teams) ==========');
    const cdb = initCloud();

    try {
        const teams = await db.query('SELECT * FROM teams ORDER BY created_at');
        console.log(`[队伍同步] 共 ${teams.length} 个队伍待同步`);

        let success = 0;
        let failed = 0;
        const errors = [];

        for (let i = 0; i < teams.length; i++) {
            const team = teams[i];
            try {
                // 辅助函数：安全解析 JSON（处理 Buffer 类型）
                const safeParseJSON = (value, defaultValue = null) => {
                    if (!value) return defaultValue;
                    if (Buffer.isBuffer(value)) value = value.toString('utf8');
                    if (typeof value === 'string') {
                        try {
                            return JSON.parse(value);
                        } catch (e) {
                            return defaultValue;
                        }
                    }
                    return value;
                };

                const cloudDoc = {
                    _id: team.id,
                    type: team.type,
                    purpose: team.purpose || '',
                    date: team.date,
                    time: team.time,
                    leader_id: team.leader_id,
                    members: safeParseJSON(team.members, []),
                    max_size: team.max_size || 10,
                    full_notified: team.full_notified || false,
                    remind_sent: team.remind_sent || false,
                    created_at: team.created_at ? new Date(team.created_at).toISOString() : new Date().toISOString(),
                    updated_at: team.updated_at ? new Date(team.updated_at).toISOString() : new Date().toISOString()
                };

                await cdb.collection('teams').add(cloudDoc);
                success++;
                process.stdout.write(`\r[队伍同步] 进度: ${i + 1}/${teams.length} | 成功: ${success} | 失败: ${failed}`);
            } catch (err) {
                failed++;
                errors.push({ id: team.id, type: team.type, error: err.message });
                process.stdout.write(`\r[队伍同步] 进度: ${i + 1}/${teams.length} | 成功: ${success} | 失败: ${failed}`);
            }
        }

        console.log(`\n[队伍同步] ✓ 完成：成功 ${success}，失败 ${failed}`);
        if (errors.length > 0) {
            console.log('[队伍同步] 失败详情:');
            errors.forEach(e => console.log(`  - ${e.id} (${e.type}): ${e.error}`));
        }

        return { success, failed, errors };
    } catch (err) {
        console.error('[队伍同步] ❌ 异常:', err.message);
        throw err;
    }
}

// 同步抽奖数据到云库
async function syncLotteryToCloud() {
    console.log('\n========== 同步抽奖表 (lottery) ==========');
    const cdb = initCloud();

    try {
        const lotteryRows = await db.query('SELECT * FROM lottery LIMIT 1');

        if (lotteryRows.length === 0) {
            console.log('[抽奖同步] ⚠️  MySQL 中无抽奖数据，跳过');
            return { success: 0, failed: 0, errors: [] };
        }

        const lottery = lotteryRows[0];
        console.log(`[抽奖同步] 开始同步抽奖数据...`);

        try {
            // 辅助函数：安全解析 JSON（处理 Buffer 类型）
            const safeParseJSON = (value, defaultValue = null) => {
                if (!value) return defaultValue;
                if (Buffer.isBuffer(value)) value = value.toString('utf8');
                if (typeof value === 'string') {
                    try {
                        return JSON.parse(value);
                    } catch (e) {
                        return defaultValue;
                    }
                }
                return value;
            };

            const cloudDoc = {
                _id: 'singleton',
                slots: safeParseJSON(lottery.slots, []),
                winners: safeParseJSON(lottery.winners, []),
                banner_cleared_at: lottery.banner_cleared_at || null,
                last_clear: lottery.last_clear || null,
                updated_at: lottery.updated_at ? new Date(lottery.updated_at).toISOString() : new Date().toISOString()
            };

            await cdb.collection('lottery').add(cloudDoc);
            console.log('[抽奖同步] ✓ 完成：成功 1，失败 0');
            return { success: 1, failed: 0, errors: [] };
        } catch (err) {
            console.log(`[抽奖同步] ❌ 失败: ${err.message}`);
            return { success: 0, failed: 1, errors: [{ error: err.message }] };
        }
    } catch (err) {
        console.error('[抽奖同步] ❌ 异常:', err.message);
        throw err;
    }
}

// 同步公告到云库
async function syncNoticesToCloud() {
    console.log('\n========== 同步公告表 (notices) ==========');
    const cdb = initCloud();

    try {
        const notices = await db.query('SELECT * FROM notices ORDER BY created_at DESC');
        console.log(`[公告同步] 共 ${notices.length} 条公告待同步`);

        if (notices.length === 0) {
            console.log('[公告同步] ⚠️  无公告数据，跳过');
            return { success: 0, failed: 0, errors: [] };
        }

        let success = 0;
        let failed = 0;
        const errors = [];

        for (let i = 0; i < notices.length; i++) {
            const notice = notices[i];
            try {
                const cloudDoc = {
                    _id: notice.id,
                    title: notice.title,
                    content: notice.content,
                    author_id: notice.author_id,
                    created_at: notice.created_at ? new Date(notice.created_at).toISOString() : new Date().toISOString()
                };

                await cdb.collection('notices').add(cloudDoc);
                success++;
                process.stdout.write(`\r[公告同步] 进度: ${i + 1}/${notices.length} | 成功: ${success} | 失败: ${failed}`);
            } catch (err) {
                failed++;
                errors.push({ id: notice.id, title: notice.title, error: err.message });
                process.stdout.write(`\r[公告同步] 进度: ${i + 1}/${notices.length} | 成功: ${success} | 失败: ${failed}`);
            }
        }

        console.log(`\n[公告同步] ✓ 完成：成功 ${success}，失败 ${failed}`);
        if (errors.length > 0) {
            console.log('[公告同步] 失败详情:');
            errors.forEach(e => console.log(`  - ${e.id} (${e.title}): ${e.error}`));
        }

        return { success, failed, errors };
    } catch (err) {
        console.error('[公告同步] ❌ 异常:', err.message);
        throw err;
    }
}

// 同步建议到云库
async function syncSuggestionsToCloud() {
    console.log('\n========== 同步建议表 (suggestions) ==========');
    const cdb = initCloud();

    try {
        const suggestions = await db.query('SELECT * FROM suggestions ORDER BY created_at DESC');
        console.log(`[建议同步] 共 ${suggestions.length} 条建议待同步`);

        if (suggestions.length === 0) {
            console.log('[建议同步] ⚠️  无建议数据，跳过');
            return { success: 0, failed: 0, errors: [] };
        }

        let success = 0;
        let failed = 0;
        const errors = [];

        for (let i = 0; i < suggestions.length; i++) {
            const suggestion = suggestions[i];
            try {
                const cloudDoc = {
                    _id: suggestion.id,
                    content: suggestion.content,
                    author_id: suggestion.author_id,
                    created_at: suggestion.created_at ? new Date(suggestion.created_at).toISOString() : new Date().toISOString()
                };

                await cdb.collection('suggestions').add(cloudDoc);
                success++;
                process.stdout.write(`\r[建议同步] 进度: ${i + 1}/${suggestions.length} | 成功: ${success} | 失败: ${failed}`);
            } catch (err) {
                failed++;
                errors.push({ id: suggestion.id, error: err.message });
                process.stdout.write(`\r[建议同步] 进度: ${i + 1}/${suggestions.length} | 成功: ${success} | 失败: ${failed}`);
            }
        }

        console.log(`\n[建议同步] ✓ 完成：成功 ${success}，失败 ${failed}`);
        if (errors.length > 0) {
            console.log('[建议同步] 失败详情:');
            errors.forEach(e => console.log(`  - ${e.id}: ${e.error}`));
        }

        return { success, failed, errors };
    } catch (err) {
        console.error('[建议同步] ❌ 异常:', err.message);
        throw err;
    }
}

async function main() {
    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║       MySQL → 云数据库 完整同步脚本                        ║');
    console.log('╚════════════════════════════════════════════════════════════╝');
    console.log('[全量同步] 开始时间:', new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }));
    console.log('[全量同步] ⚠️  请确保已手动清空云数据库所有表！\n');

    const results = {
        users: null,
        teams: null,
        lottery: null,
        notices: null,
        suggestions: null
    };

    try {
        // 步骤 1: 同步用户
        results.users = await syncUsersToCloud();

        // 步骤 2: 同步队伍（可能会报错，用于诊断）
        try {
            results.teams = await syncTeamsToCloud();
        } catch (err) {
            console.error('\n[队伍同步] ❌ 同步失败，错误信息:', err.message);
            console.log('\n[全量同步] 检测到 teams 表同步错误，尝试修复数据格式...');

            // 尝试修复数据格式
            const fixResult = await fixTeamsTimeFormat(err.message);
            if (fixResult) {
                console.log('[全量同步] 数据修复完成，重新尝试同步队伍...');
                results.teams = await syncTeamsToCloud();
            } else {
                throw new Error('teams 表数据修复失败');
            }
        }

        // 步骤 3: 同步抽奖
        results.lottery = await syncLotteryToCloud();

        // 步骤 5: 同步公告
        results.notices = await syncNoticesToCloud();

        // 步骤 6: 同步建议
        results.suggestions = await syncSuggestionsToCloud();

        // 汇总结果
        console.log('\n╔════════════════════════════════════════════════════════════╗');
        console.log('║                    同步结果汇总                             ║');
        console.log('╚════════════════════════════════════════════════════════════╝');

        const totalSuccess = Object.values(results).reduce((sum, r) => sum + (r?.success || 0), 0);
        const totalFailed = Object.values(results).reduce((sum, r) => sum + (r?.failed || 0), 0);

        console.log(`\n用户 (users):      成功 ${results.users.success} | 失败 ${results.users.failed}`);
        console.log(`队伍 (teams):      成功 ${results.teams.success} | 失败 ${results.teams.failed}`);
        console.log(`抽奖 (lottery):    成功 ${results.lottery.success} | 失败 ${results.lottery.failed}`);
        console.log(`公告 (notices):    成功 ${results.notices.success} | 失败 ${results.notices.failed}`);
        console.log(`建议 (suggestions): 成功 ${results.suggestions.success} | 失败 ${results.suggestions.failed}`);
        console.log(`\n总计:              成功 ${totalSuccess} | 失败 ${totalFailed}`);

        console.log('\n[全量同步] 结束时间:', new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }));

        if (totalFailed > 0) {
            console.log('\n[全量同步] ⚠️  同步完成，但有部分失败，请检查上述日志');
            process.exit(1);
        } else {
            console.log('\n[全量同步] ✓ 所有数据同步成功！');
            process.exit(0);
        }
    } catch (err) {
        console.error('\n[全量同步] ❌ 发生严重错误:', err);
        console.error(err.stack);
        process.exit(1);
    }
}

main();
