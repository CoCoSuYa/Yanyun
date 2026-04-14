/**
 * 建议服务
 * CRUD + 已读标记
 * 已去除：云同步、直接云库操作
 */
const { v4: uuidv4 } = require('uuid');
const cache = require('../cache');
const userDao = require('../dao/userDao');
const suggestionDao = require('../dao/suggestionDao');
const { toMySQLDateTime } = require('../utils/format');

function listSuggestions(adminId) {
  const suggestions = cache.getSuggestions();
  let suggestionsList = [...suggestions];

  const users = cache.getUsers();
  const admin = users.find(u => u.id === adminId);
  if (admin && admin.readSuggestionIds) {
    const readIds = admin.readSuggestionIds;
    suggestionsList = suggestionsList.map(s => ({
      ...s,
      isRead: readIds.includes(s.id)
    }));
  }

  return suggestionsList;
}

async function createSuggestion(userId, content) {
  const suggestionId = uuidv4();
  const createdAt = new Date().toISOString();

  await suggestionDao.createSuggestion({
    id: suggestionId,
    content,
    author_id: userId,
    created_at: toMySQLDateTime(createdAt)
  });

  const newSuggestion = { id: suggestionId, content, authorId: userId, createdAt };
  const suggestions = cache.getSuggestions();
  suggestions.unshift(newSuggestion);

  return { id: suggestionId, content, date: createdAt };
}

async function deleteSuggestion(suggestionId) {
  await suggestionDao.deleteSuggestion(suggestionId);
  cache.setSuggestions(cache.getSuggestions().filter(s => s.id !== suggestionId));
  return { ok: true };
}

async function markSuggestionRead(adminId, suggestionId) {
  const users = cache.getUsers();
  const admin = users.find(u => u.id === adminId);
  if (!admin) return { error: '管理员不存在', status: 404 };

  if (!admin.readSuggestionIds) admin.readSuggestionIds = [];

  if (!admin.readSuggestionIds.includes(suggestionId)) {
    admin.readSuggestionIds.push(suggestionId);
    await userDao.updateUser(adminId, { read_suggestion_ids: JSON.stringify(admin.readSuggestionIds) });
  }

  return { ok: true };
}

module.exports = { listSuggestions, createSuggestion, deleteSuggestion, markSuggestionRead };
