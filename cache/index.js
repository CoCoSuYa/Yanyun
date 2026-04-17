/**
 * 内存缓存管理
 * 单例模块：users/teams/lottery/notices/suggestions + loadData()
 * 已去除云相关字段（openId/mpQuota/inviteLog/pendingInvites）
 */
const userDao = require('../dao/userDao');
const teamDao = require('../dao/teamDao');
const lotteryDao = require('../dao/lotteryDao');
const noticeDao = require('../dao/noticeDao');
const suggestionDao = require('../dao/suggestionDao');
const { toCamelCaseUser, toCamelCaseTeam, toCamelCaseNotice, toCamelCaseSuggestion, toLotteryObject } = require('../utils/format');

// ---------- 内存数据 ----------
let users = [];
let teams = [];
let lottery = { slots: [], winners: [] };
let notices = [];
let suggestions = [];

// ---------- Getters ----------
function getUsers() { return users; }
function getTeams() { return teams; }
function getLottery() { return lottery; }
function getNotices() { return notices; }
function getSuggestions() { return suggestions; }

// ---------- Setters ----------
function setUsers(v) { users = v; }
function setTeams(v) { teams = v; }
function setLottery(v) { lottery = v; }
function setNotices(v) { notices = v; }
function setSuggestions(v) { suggestions = v; }

// ---------- 数据加载 ----------
async function loadData() {
  try {
    const t0 = Date.now();
    console.log('正在从MySQL加载数据...');

    const [mysqlUsers, mysqlLottery, mysqlNotices, mysqlSuggestions] = await Promise.all([
      userDao.getAllUsers(),
      lotteryDao.getLottery(),
      noticeDao.getAllNotices(),
      suggestionDao.getAllSuggestions()
    ]);

    users = mysqlUsers.map(toCamelCaseUser);
    notices = mysqlNotices.map(toCamelCaseNotice);
    suggestions = mysqlSuggestions.map(toCamelCaseSuggestion);

    const t3 = Date.now();
    const mysqlTeams = await teamDao.getAllTeams();
    teams = mysqlTeams.map(toCamelCaseTeam);
    console.log(`[性能] 加载teams耗时: ${Date.now() - t3}ms`);

    lottery = toLotteryObject(mysqlLottery);

    console.log(`✅ 已从MySQL加载 ${users.length} 名游侠, ${notices.length} 条公告, ${suggestions.length} 条建议`);
    console.log(`[性能] loadData总耗时: ${Date.now() - t0}ms`);
  } catch (e) {
    console.error('❌ 从MySQL加载数据失败:', e.message);
  }
}

module.exports = {
  getUsers, getTeams, getLottery, getNotices, getSuggestions,
  setUsers, setTeams, setLottery, setNotices, setSuggestions,
  loadData
};
