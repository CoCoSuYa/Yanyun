const db = require('../db/mysql');

// 转换 ISO 8601 日期为 MySQL DATETIME 格式
function toMySQLDateTime(isoString) {
  if (!isoString) return null;
  return isoString.replace('T', ' ').replace('Z', '').substring(0, 19);
}

async function getAllNotices() {
  return await db.query('SELECT * FROM notices ORDER BY created_at DESC');
}

async function deleteNotice(id) {
  await db.query('DELETE FROM notices WHERE id = ?', [id]);
}

async function createNotice(data) {
  await db.query(
    `INSERT INTO notices (id, title, content, author_id, created_at)
     VALUES (?, ?, ?, ?, ?)`,
    [data.id, data.title, data.content, data.author_id, toMySQLDateTime(data.created_at)]
  );
}

module.exports = { getAllNotices, deleteNotice, createNotice };
