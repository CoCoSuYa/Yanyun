-- 添加抽签系统钱币字段到 users 表
USE yanyun;

-- 检查并添加 coins 字段
ALTER TABLE users ADD COLUMN IF NOT EXISTS coins INT DEFAULT 0 AFTER contribution_points;

-- 检查并添加 total_coins_earned 字段
ALTER TABLE users ADD COLUMN IF NOT EXISTS total_coins_earned INT DEFAULT 0 AFTER coins;

-- 显示表结构确认
DESCRIBE users;
