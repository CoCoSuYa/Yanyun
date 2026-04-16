/**
 * 公告服务
 * CRUD + 已读标记
 */
const { v4: uuidv4 } = require('uuid');
const cache = require('../cache');
const userDao = require('../dao/userDao');
const noticeDao = require('../dao/noticeDao');
const { toMySQLDateTime, toChineseDate } = require('../utils/format');
const { syncNewNoticeToCloud, syncDeleteNoticeFromCloud, syncUpdateUserToCloud } = require('../utils/cloudSync');

function listNotices(userId) {
  const notices = cache.getNotices();
  let noticesList = [...notices];

  if (userId) {
    const users = cache.getUsers();
    const user = users.find(u => u.id === userId);
    if (user && user.readNoticeIds) {
      const readIds = user.readNoticeIds;
      noticesList = noticesList.map(n => ({
        ...n,
        isRead: readIds.includes(n.id)
      }));
    }
  }

  return noticesList;
}

async function createNotice(adminId, content) {
  const noticeId = uuidv4();
  const createdAt = new Date().toISOString();
  const title = toChineseDate();

  await noticeDao.createNotice({
    id: noticeId,
    title,
    content,
    author_id: adminId,
    created_at: toMySQLDateTime(createdAt)
  });

  const newNotice = { id: noticeId, title, content, authorId: adminId, createdAt };
  const notices = cache.getNotices();
  notices.unshift(newNotice);

  // 异步同步到云库（不阻塞主流程，失败静默处理）
  syncNewNoticeToCloud(newNotice).catch(() => { });

  return { id: noticeId, content, date: createdAt };
}

async function deleteNotice(noticeId) {
  await noticeDao.deleteNotice(noticeId);
  cache.setNotices(cache.getNotices().filter(n => n.id !== noticeId));

  // 异步同步到云库（不阻塞主流程，失败静默处理）
  syncDeleteNoticeFromCloud(noticeId).catch(() => { });

  // 清理所有用户的已读标记中已删除的告示ID
  const users = cache.getUsers();
  for (const user of users) {
    if (user.readNoticeIds && user.readNoticeIds.includes(noticeId)) {
      user.readNoticeIds = user.readNoticeIds.filter(id => id !== noticeId);
      await userDao.updateUser(user.id, { read_notice_ids: JSON.stringify(user.readNoticeIds) });
      // 异步同步到云库（不阻塞主流程，失败静默处理）
      syncUpdateUserToCloud(user.id, { readNoticeIds: user.readNoticeIds }).catch(() => { });
    }
  }

  return { ok: true };
}

async function markNoticeRead(userId, noticeId) {
  const users = cache.getUsers();
  const user = users.find(u => u.id === userId);
  if (!user) return { error: '用户不存在', status: 404 };

  if (!user.readNoticeIds) user.readNoticeIds = [];

  if (!user.readNoticeIds.includes(noticeId)) {
    user.readNoticeIds.push(noticeId);
    await userDao.updateUser(userId, { read_notice_ids: JSON.stringify(user.readNoticeIds) });

    // 异步同步到云库（不阻塞主流程，失败静默处理）
    syncUpdateUserToCloud(userId, { readNoticeIds: user.readNoticeIds }).catch(() => { });
  }

  return { ok: true };
}

module.exports = { listNotices, createNotice, deleteNotice, markNoticeRead };
