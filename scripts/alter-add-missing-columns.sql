-- 线上数据库补丁：添加数据库改造中遗漏的字段
-- 执行时间：2026-04-14
-- 说明：这些字段在代码中有使用，但建表脚本中遗漏了

USE yanyun;

-- 1. users 表添加缺失字段
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT FALSE AFTER open_id,
  ADD COLUMN IF NOT EXISTS mp_quota JSON AFTER is_admin,
  ADD COLUMN IF NOT EXISTS invite_log JSON AFTER mp_quota,
  ADD COLUMN IF NOT EXISTS pending_invites JSON AFTER invite_log,
  ADD COLUMN IF NOT EXISTS juejin_last_played TIMESTAMP AFTER juejin_completed;

-- 2. lottery 表添加缺失字段
ALTER TABLE lottery
  ADD COLUMN IF NOT EXISTS last_clear TIMESTAMP AFTER banner_cleared_at;

-- 3. 修正 teams 表 time 字段数据（将旧的 HH:MM:SS 格式补全为完整 ISO 时间）
-- 注意：只有当 time 字段存储的是纯时间格式如 "14:30:00" 时才需要执行
-- 先检查是否有旧格式数据：
-- SELECT id, date, time FROM teams WHERE time NOT LIKE '%T%';
-- 如果有，执行以下修正：
-- UPDATE teams SET time = CONCAT(date, 'T', time, '.000Z') WHERE time NOT LIKE '%T%';
-- 谨慎操作，建议先备份！

-- 4. 修正 teams 表 full_notified 和 remind_sent 为 0/1 而不是 false/true
-- MySQL 中 BOOLEAN 实际是 TINYINT(1)，存储 0 或 1，这里不需要修改
