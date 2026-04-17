-- 燕云项目 MySQL 数据库初始化脚本

-- 创建数据库
CREATE DATABASE IF NOT EXISTS yanyun CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

USE yanyun;

-- 用户表
CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(36) PRIMARY KEY,
  game_name VARCHAR(50) NOT NULL UNIQUE,
  guild_name VARCHAR(50) NOT NULL,
  main_style VARCHAR(10),
  sub_style VARCHAR(10),
  password_hash VARCHAR(255) NOT NULL,
  avatar_url VARCHAR(255),
  lottery_count INT DEFAULT 1,
  sign_in_count INT DEFAULT 0,
  last_sign_in_date DATE,
  read_notice_ids JSON,
  read_suggestion_ids JSON,
  contribution_points INT DEFAULT 0,
  coins INT DEFAULT 0,
  total_coins_earned INT DEFAULT 0,
  consecutive_sign_ins INT DEFAULT 0,
  juejin_high_score INT DEFAULT 0,
  achievements JSON,
  juejin_completed BOOLEAN DEFAULT FALSE,
  is_admin BOOLEAN DEFAULT FALSE,
  juejin_last_played TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_game_name (game_name),
  INDEX idx_sign_in_count (sign_in_count DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 队伍表
CREATE TABLE IF NOT EXISTS teams (
  id VARCHAR(36) PRIMARY KEY,
  type VARCHAR(20) NOT NULL,
  purpose VARCHAR(100),
  date DATE NOT NULL,
  time VARCHAR(50) NOT NULL,
  leader_id VARCHAR(36) NOT NULL,
  members JSON NOT NULL,
  max_size INT DEFAULT 10,
  full_notified BOOLEAN DEFAULT FALSE,
  remind_sent BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_date (date),
  INDEX idx_leader (leader_id),
  FOREIGN KEY (leader_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 抽奖表
CREATE TABLE IF NOT EXISTS lottery (
  id VARCHAR(36) PRIMARY KEY DEFAULT 'global_state',
  slots JSON NOT NULL,
  winners JSON NOT NULL,
  banner_cleared_at TIMESTAMP,
  last_clear TIMESTAMP,
  lucky_draw_remaining INT DEFAULT 2,
  last_lucky_reset TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 公告表
CREATE TABLE IF NOT EXISTS notices (
  id VARCHAR(36) PRIMARY KEY,
  title VARCHAR(100) NOT NULL,
  content TEXT NOT NULL,
  author_id VARCHAR(36) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_created_at (created_at DESC),
  FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 建议表
CREATE TABLE IF NOT EXISTS suggestions (
  id VARCHAR(36) PRIMARY KEY,
  content TEXT NOT NULL,
  author_id VARCHAR(36) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_created_at (created_at DESC),
  FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
