const db = require('../db/mysql');

async function getAllUsers() {
  return await db.query('SELECT * FROM users ORDER BY sign_in_count DESC, consecutive_sign_ins DESC');
}

async function getUserById(id) {
  const rows = await db.query('SELECT * FROM users WHERE id = ?', [id]);
  return rows[0] || null;
}

async function updateUser(id, data) {
  const fields = [];
  const values = [];
  for (const [key, value] of Object.entries(data)) {
    fields.push(`${key} = ?`);
    values.push(value);
  }
  values.push(id);
  await db.query(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`, values);
}

async function createUser(data) {
  await db.query(
    `INSERT INTO users (id, game_name, guild_name, main_style, sub_style,
     password_hash, avatar_url, open_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [data.id, data.game_name, data.guild_name, data.main_style,
     data.sub_style, data.password_hash, data.avatar_url, data.open_id]
  );
}

async function deleteUser(id) {
  await db.query('DELETE FROM users WHERE id = ?', [id]);
}

module.exports = { getAllUsers, getUserById, updateUser, createUser, deleteUser };
