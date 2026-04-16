/**
 * 清理用户 readNoticeIds 中的已删除告示ID
 * 用于修复Bug4的存量异常数据
 */
const cache = require('../cache');
const userDao = require('../dao/userDao');
const { syncUpdateUserToCloud } = require('../utils/cloudSync');

async function cleanupReadNoticeIds() {
    console.log('【清理脚本】开始清理用户 readNoticeIds 中的已删除告示ID...');

    // 初始化缓存
    await cache.init();

    const notices = cache.getNotices();
    const noticeIds = notices.map(n => n.id);
    console.log(`【清理脚本】当前告示数量: ${notices.length}`);
    console.log(`【清理脚本】当前告示ID列表: ${noticeIds.join(', ') || '无'}`);

    const users = cache.getUsers();
    console.log(`【清理脚本】用户数量: ${users.length}`);

    let cleanedCount = 0;
    let cloudSyncCount = 0;

    for (const user of users) {
        if (!user.readNoticeIds || user.readNoticeIds.length === 0) continue;

        // 过滤掉不存在的告示ID
        const validIds = user.readNoticeIds.filter(id => noticeIds.includes(id));
        const removedIds = user.readNoticeIds.filter(id => !noticeIds.includes(id));

        if (removedIds.length > 0) {
            console.log(`【清理脚本】用户 ${user.gameName} (${user.id}) 清理前: ${user.readNoticeIds.length}个, 清理后: ${validIds.length}个`);
            console.log(`【清理脚本】  移除的无效ID: ${removedIds.join(', ')}`);

            user.readNoticeIds = validIds;

            // 更新MySQL数据库
            await userDao.updateUser(user.id, { read_notice_ids: JSON.stringify(validIds) });
            cleanedCount++;

            // 异步同步到云库（不阻塞主流程，失败静默处理）
            syncUpdateUserToCloud(user.id, { readNoticeIds: validIds })
                .then(() => {
                    cloudSyncCount++;
                    console.log(`【清理脚本】  ✓ 云库同步成功`);
                })
                .catch(err => {
                    console.error(`【清理脚本】  ✗ 云库同步失败: ${err.message}`);
                });
        }
    }

    // 等待云同步完成
    await new Promise(resolve => setTimeout(resolve, 2000));

    console.log(`【清理脚本】清理完成！`);
    console.log(`【清理脚本】  清理用户数: ${cleanedCount}`);
    console.log(`【清理脚本】  云库同步成功数: ${cloudSyncCount}`);

    process.exit(0);
}

cleanupReadNoticeIds().catch(err => {
    console.error('【清理脚本】执行失败:', err);
    process.exit(1);
});