/**
 * 公告服务
 * CRUD + 已读标记
 * 已去除：云同步、直接云库操作
 */
const { v4: uuidv4 } = require('uuid');
const cache = require('../cache');
const userDao = require('../dao/userDao');
const noticeDao = require('../dao/noticeDao');
const { toMySQLDateTime, toChineseDate } = require('../utils/format');

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

  return { id: noticeId, content, date: createdAt };
}

async function deleteNotice(noticeId) {
  await noticeDao.deleteNotice(noticeId);
  cache.setNotices(cache.getNotices().filter(n => n.id !== noticeId));
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
  }

  return { ok: true };
}

module.exports = { listNotices, createNotice, deleteNotice, markNoticeRead };
