// 用户补偿脚本
// 补偿内容：
// 1. 总打卡天数 +3
// 2. 连续打卡天数 +3
// 3. 贡献值 +200

const db = require('../db/mysql');

async function compensateUsers() {
    try {
        console.log('开始执行用户补偿...');

        // 执行补偿
        const result = await db.query(`
      UPDATE users 
      SET 
        sign_in_count = sign_in_count + 3,
        consecutive_sign_ins = consecutive_sign_ins + 3,
        contribution_points = contribution_points + 200
    `);

        console.log('补偿执行成功！');
        console.log('受影响的行数:', result.affectedRows || '未知');

        // 查看补偿后的结果
        const users = await db.query(`
      SELECT 
        game_name,
        sign_in_count,
        consecutive_sign_ins,
        contribution_points
      FROM users
      ORDER BY sign_in_count DESC
    `);

        console.log('\n补偿后的用户数据：');
        console.table(users);

        process.exit(0);
    } catch (error) {
        console.error('补偿执行失败:', error);
        process.exit(1);
    }
}

compensateUsers();
