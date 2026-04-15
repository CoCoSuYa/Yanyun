#!/usr/bin/env node
/**
 * 清空云数据库所有表的脚本
 * 用法：node scripts/clearCloudDatabase.js
 * 警告：此操作不可逆，请谨慎使用！
 */

const path = require('path');
require('dotenv-flow').config({ path: path.join(__dirname, '..') });

const cloudbase = require('@cloudbase/node-sdk');

let cloudDb = null;

// 初始化云开发
function initCloud() {
    if (cloudDb) return cloudDb;

    const env = process.env.MP_CLOUD_ENV;
    const secretId = process.env.CLOUD_SECRET_ID;
    const secretKey = process.env.CLOUD_SECRET_KEY;

    if (!env || !secretId || !secretKey) {
        console.error('[清空云库] ❌ 缺少云开发环境变量');
        console.error('[清空云库] 需要配置: MP_CLOUD_ENV, CLOUD_SECRET_ID, CLOUD_SECRET_KEY');
        process.exit(1);
    }

    try {
        const app = cloudbase.init({ env, secretId, secretKey });
        cloudDb = app.database();
        console.log('[清空云库] ✓ 云开发初始化成功');
        return cloudDb;
    } catch (err) {
        console.error('[清空云库] ❌ 初始化失败:', err.message);
        process.exit(1);
    }
}

// 清空指定集合
async function clearCollection(collectionName) {
    const cdb = initCloud();

    try {
        console.log(`\n[清空云库] 开始清空集合: ${collectionName}`);

        // 获取所有文档
        const { data } = await cdb.collection(collectionName).get();
        console.log(`[清空云库] 集合 ${collectionName} 共有 ${data.length} 条记录`);

        if (data.length === 0) {
            console.log(`[清空云库] ✓ 集合 ${collectionName} 已为空，跳过`);
            return { success: 0, failed: 0 };
        }

        let success = 0;
        let failed = 0;

        // 批量删除（每次最多 20 条）
        for (let i = 0; i < data.length; i += 20) {
            const batch = data.slice(i, i + 20);
            const deletePromises = batch.map(doc =>
                cdb.collection(collectionName).doc(doc._id).remove()
            );

            try {
                const results = await Promise.all(deletePromises);
                const batchSuccess = results.filter(r => r.deleted > 0).length;
                success += batchSuccess;
                failed += batch.length - batchSuccess;

                process.stdout.write(`\r[清空云库] ${collectionName}: 已删除 ${success}/${data.length}`);
            } catch (err) {
                console.error(`\n[清空云库] ❌ 批量删除失败:`, err.message);
                failed += batch.length;
            }
        }

        console.log(`\n[清空云库] ✓ 集合 ${collectionName} 清空完成：成功 ${success}，失败 ${failed}`);
        return { success, failed };
    } catch (err) {
        console.error(`[清空云库] ❌ 清空集合 ${collectionName} 失败:`, err.message);
        return { success: 0, failed: -1 };
    }
}

async function main() {
    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║              清空云数据库所有表                             ║');
    console.log('║              ⚠️  此操作不可逆！                            ║');
    console.log('╚════════════════════════════════════════════════════════════╝');
    console.log('[清空云库] 开始时间:', new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }));

    const collections = ['users', 'teams', 'lottery', 'notices', 'suggestions'];
    const results = {};

    try {
        for (const collection of collections) {
            results[collection] = await clearCollection(collection);
        }

        // 汇总结果
        console.log('\n╔════════════════════════════════════════════════════════════╗');
        console.log('║                    清空结果汇总                             ║');
        console.log('╚════════════════════════════════════════════════════════════╝\n');

        const totalSuccess = Object.values(results).reduce((sum, r) => sum + r.success, 0);
        const totalFailed = Object.values(results).reduce((sum, r) => sum + Math.max(0, r.failed), 0);

        collections.forEach(col => {
            const r = results[col];
            console.log(`${col.padEnd(15)}: 成功 ${r.success} | 失败 ${r.failed}`);
        });

        console.log(`\n总计:              成功 ${totalSuccess} | 失败 ${totalFailed}`);
        console.log('\n[清空云库] 结束时间:', new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }));

        if (totalFailed > 0) {
            console.log('\n[清空云库] ⚠️  清空完成，但有部分失败');
            process.exit(1);
        } else {
            console.log('\n[清空云库] ✓ 所有集合清空成功！');
            process.exit(0);
        }
    } catch (err) {
        console.error('\n[清空云库] ❌ 发生严重错误:', err);
        console.error(err.stack);
        process.exit(1);
    }
}

main();
