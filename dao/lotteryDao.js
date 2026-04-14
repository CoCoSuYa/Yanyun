const db = require('../db/mysql');

async function getLottery() {
  const rows = await db.query('SELECT * FROM lottery LIMIT 1');
  return rows[0] || null;
}

async function updateLottery(data) {
  const fields = [];
  const values = [];
  for (const [key, value] of Object.entries(data)) {
    fields.push(`${key} = ?`);
    values.push(value);
  }
  await db.query(`UPDATE lottery SET ${fields.join(', ')} WHERE id = 'global_state'`, values);
}

module.exports = { getLottery, updateLottery };
