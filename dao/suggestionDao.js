const db = require('../db/mysql');

// 转换 ISO 8601 日期为 MySQL DATETIME 格式
function toMySQLDateTime(isoString) {
    if (!isoString) return null;
    return isoString.replace('T', ' ').replace('Z', '').substring(0, 19);
}

async function getAllSuggestions() {
    return await db.query('SELECT * FROM suggestions ORDER BY created_at DESC');
}

async function createSuggestion(data) {
    await db.query(
        `INSERT INTO suggestions (id, content, author_id, created_at)
     VALUES (?, ?, ?, ?)`,
        [data.id, data.content, data.author_id, toMySQLDateTime(data.created_at)]
    );
}

async function deleteSuggestion(id) {
    await db.query('DELETE FROM suggestions WHERE id = ?', [id]);
}

module.exports = { getAllSuggestions, createSuggestion, deleteSuggestion };
