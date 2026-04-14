const db = require('../db/mysql');

async function getTeamsByDate(date) {
  return await db.query('SELECT * FROM teams WHERE date = ? ORDER BY time', [date]);
}

async function getTeamById(id) {
  const rows = await db.query('SELECT * FROM teams WHERE id = ?', [id]);
  return rows[0] || null;
}

async function updateTeam(id, data) {
  const fields = [];
  const values = [];
  for (const [key, value] of Object.entries(data)) {
    fields.push(`${key} = ?`);
    values.push(value);
  }
  values.push(id);
  await db.query(`UPDATE teams SET ${fields.join(', ')} WHERE id = ?`, values);
}

async function deleteTeam(id) {
  await db.query('DELETE FROM teams WHERE id = ?', [id]);
}

async function createTeam(data) {
  await db.query(
    `INSERT INTO teams (id, type, purpose, date, time, leader_id, members, max_size, full_notified, remind_sent)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [data.id, data.type, data.purpose, data.date, data.time, data.leader_id,
    JSON.stringify(data.members), data.max_size, data.full_notified || false, data.remind_sent || false]
  );
}

async function getAllTeams() {
  return await db.query('SELECT * FROM teams ORDER BY date, time');
}

module.exports = { getTeamsByDate, getTeamById, updateTeam, deleteTeam, createTeam, getAllTeams };
