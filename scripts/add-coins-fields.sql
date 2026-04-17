-- 添加抽签系统钱币字段到 users 表
USE yanyun;

-- 添加 coins 字段（如果不存在）
SET @exist := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS 
               WHERE TABLE_SCHEMA = 'yanyun' 
               AND TABLE_NAME = 'users' 
               AND COLUMN_NAME = 'coins');
SET @sqlstmt := IF(@exist = 0, 
                   'ALTER TABLE users ADD COLUMN coins INT DEFAULT 0 AFTER contribution_points', 
                   'SELECT ''coins column already exists'' AS message');
PREPARE stmt FROM @sqlstmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 添加 total_coins_earned 字段（如果不存在）
SET @exist := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS 
               WHERE TABLE_SCHEMA = 'yanyun' 
               AND TABLE_NAME = 'users' 
               AND COLUMN_NAME = 'total_coins_earned');
SET @sqlstmt := IF(@exist = 0, 
                   'ALTER TABLE users ADD COLUMN total_coins_earned INT DEFAULT 0 AFTER coins', 
                   'SELECT ''total_coins_earned column already exists'' AS message');
PREPARE stmt FROM @sqlstmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 显示表结构确认
DESCRIBE users;
