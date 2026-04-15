# 燕云十六声 · 预约组队系统 — 项目文档

> 更新时间：2026-04-15

---

## 一、项目概览

| 项目 | 说明 |
|------|------|
| **名称** | yanyun-team-booking（燕云十六声预约组队网页） |
| **定位** | 游戏《燕云十六声》的百舸争流公会预约组队平台 |
| **架构** | Node.js (Express) 后端 + 原生 HTML/CSS/JS 前端 + WebSocket 实时通信 |
| **数据源** | MySQL（唯一数据持久化层）+ 内存缓存（运行时读写） |
| **端口** | 3000 |

### 核心业务

用户注册/登录 → 创建或加入打本队伍 → 签到、抽签、掘金小游戏、成就系统 → 贡献值结算

---

## 二、技术栈

| 技术 | 用途 |
|------|------|
| Express 4 | HTTP 服务 & REST API |
| ws (WebSocket) | 实时双向通信（队伍变动/抽签结果广播） |
| MySQL (mysql2/pool) | 唯一数据持久化层 |
| uuid | 生成主键（VARCHAR(36)） |

---

## 三、数据库表结构（重点）

数据库 `yanyun`，字符集 `utf8mb4`。

### 3.1 users — 用户表

存储所有注册用户，是系统的核心实体。

```sql
CREATE TABLE users (
  id                  VARCHAR(36)   PRIMARY KEY,       -- UUID 主键
  game_name           VARCHAR(50)   NOT NULL UNIQUE,   -- 游戏内昵称（唯一）
  guild_name          VARCHAR(50)   NOT NULL,          -- 所属公会名
  main_style          VARCHAR(10),                     -- 主流派（如"长剑"）
  sub_style           VARCHAR(10),                     -- 副流派
  password_hash       VARCHAR(255)  NOT NULL,          -- 密码哈希（bcrypt/salt）
  avatar_url          VARCHAR(255),                    -- 头像 URL
  lottery_count       INT           DEFAULT 1,         -- 本周剩余抽签次数
  sign_in_count       INT           DEFAULT 0,         -- 累计签到次数
  last_sign_in_date   DATE,                            -- 上次签到日期（防重复签）
  read_notice_ids     JSON,                            -- 已读公告 ID 列表 [id1, id2, ...]
  read_suggestion_ids JSON,                            -- 已读建议 ID 列表
  contribution_points INT           DEFAULT 0,         -- 贡献值
  consecutive_sign_ins INT          DEFAULT 0,         -- 连续签到天数
  juejin_high_score   INT           DEFAULT 0,         -- 掘金游戏最高分
  achievements        JSON,                             -- 已解锁成就列表 [{id, unlockedAt}, ...]
  juejin_completed    BOOLEAN       DEFAULT FALSE,     -- 是否通关掘金
  is_admin            BOOLEAN       DEFAULT FALSE,     -- 是否管理员
  juejin_last_played  TIMESTAMP,                        -- 最后一次玩掘金时间
  created_at          TIMESTAMP     DEFAULT NOW(),
  updated_at          TIMESTAMP     DEFAULT NOW() ON UPDATE NOW()
);

-- 索引：
INDEX idx_game_name (game_name),
INDEX idx_sign_in_count (sign_in_count DESC)
```

**字段说明：**

| 字段 | 类型 | 说明 | 业务规则 |
|------|------|------|----------|
| id | VARCHAR(36) | UUID 主键 | 注册时自动生成 |
| game_name | VARCHAR(50) | 游戏昵称 | **唯一约束**，不可重复 |
| guild_name | VARCHAR(50) | 公会名 | 必填 |
| main/sub_style | VARCHAR(10) | 流派 | 用户创建时选择，显示在队伍成员列表中 |
| password_hash | VARCHAR(255) | 密码哈希 | PWD_SALT = 'yanyun-salt'，使用 crypto.createHash('sha256') |
| avatar_url | VARCHAR(255) | 头像 URL | 通过 POST /api/users/avatar 上传到 /uploads/ 目录 |
| lottery_count | INT | 抽签次数 | 默认 1 次/周，周一凌晨重置为默认值 |
| sign_in_count | INT | 累计签到数 | 每次签到 +1，用于排行榜展示 |
| last_sign_in_date | DATE | 上次签到日期 | 与当天对比判断是否已签到 |
| read_notice_ids | JSON | 已读公告 | 存储已读的 notice id 数组 |
| read_suggestion_ids | JSON | 已读建议 | 同上，管理员视角用 |
| contribution_points | INT | 贡献值 | 每晚 23:50 结算发放 |
| consecutive_sign_ins | INT | 连续签到 | 每日签到连续计数，断签归零 |
| juejin_high_score | INT | 掘金最高分 | 提交分数时取 max |
| achievements | JSON | 成就列表 | `[{id: "xxx", unlockedAt: "ISO字符串"}]` |
| juejin_completed | BOOLEAN | 掘金通关 | 一次性标记 |
| is_admin | BOOLEAN | 管理员 | 特定密码哈希判定（DEFAULT_PWD_HASH） |
| juejin_last_played | TIMESTAMP | 最后游玩时间 | 用于限制每日参与次数 |

**内存对象格式（camelCase）：**
```javascript
{
  id, gameName, guildName, mainStyle, subStyle,
  passwordHash, avatarUrl, isAdmin,
  signInCount, lastSignInDate, lotteryCount,
  readNoticeIds: [], readSuggestionIds: [],
  juejinHighScore, juejinCompleted,
  achievements: [], contributionPoints, consecutiveSignIns,
  juejinLastPlayed
}
```

---

### 3.2 teams — 队伍表

打本预约队伍，核心协作功能。

```sql
CREATE TABLE teams (
  id             VARCHAR(36)   PRIMARY KEY,         -- UUID 主键
  type           VARCHAR(20)   NOT NULL,            -- 队伍类型（"五人本"/"十人本"等）
  purpose        VARCHAR(100),                      -- 打本目的描述
  date           DATE          NOT NULL,            -- 开本日期
  time           VARCHAR(50)   NOT NULL,            -- 开本时间（ISO 格式或 HH:mm:ss）
  leader_id      VARCHAR(36)   NOT NULL,            -- 队长 user.id → 外键 users(id)
  members        JSON          NOT NULL,            -- 成员列表（见下方结构）
  max_size       INT           DEFAULT 10,          -- 最大人数（五人本=5，十人本=10）
  full_notified  BOOLEAN       DEFAULT FALSE,        -- 是否已触发满员处理
  remind_sent    BOOLEAN       DEFAULT FALSE,        -- 是否已发送开本提醒
  created_at     TIMESTAMP     DEFAULT NOW(),
  updated_at     TIMESTAMP     DEFAULT NOW() ON UPDATE NOW(),

  INDEX idx_date (date),
  INDEX idx_leader (leader_id),
  FOREIGN KEY (leader_id) REFERENCES users(id) ON DELETE CASCADE
);
```

**members JSON 结构（数组）：**
```json
[
  {
    "userId": "uuid",
    "gameName": "玩家名",
    "mainStyle": "长剑",
    "subStyle": "琴"
  }
]
```

**字段说明：**

| 字段 | 类型 | 说明 | 业务规则 |
|------|------|------|----------|
| type | VARCHAR(20) | 类型 | 决定 maxSize："五人本"→5，其他→10 |
| purpose | VARCHAR(100) | 目的 | 可选描述 |
| date | DATE | 日期 | 按此字段查询当日队伍 |
| time | VARCHAR(50) | 时间 | ISO 字符串；内存中补全为完整 ISO 格式 |
| leader_id | VARCHAR(36) | 队长 | 外键关联 users.id，退队时自动转移给第一个队员 |
| members | JSON | 成员数组 | 含 userId/gameName/mainStyle/subStyle |
| max_size | INT | 上限 | 由 type 自动决定 |
| full_notified | BOOLEAN | 满员标记 | 满员时置 true，用于避免重复处理 |
| remind_sent | BOOLEAN | 提醒标记 | 开本提醒发送后置 true |

**关键业务逻辑：**
- 加入队伍 → 不能超过 max_size，时间不能过期，不能重复加入
- 退出队伍 → 最后一人退队则**解散整个队伍**（删除记录），队长退出则转移队长身份
- 踢人 → 仅队长可操作
- 改期 → 仅队长可操作，新时间不能早于当前时刻
- 解散 → 仅管理员可操作

**内存对象格式（camelCase）：**
```javascript
{
  id, type, purpose, date, time,      // time 在内存中为 ISO 完整格式
  leaderId, members: [{userId, gameName, mainStyle, subStyle}],
  maxSize, fullNotified, remindSent,
  createdAt, updatedAt
}
```

---

### 3.3 lottery — 抽奖配置表（单例）

全局唯一的抽奖状态表，只有一条记录（id='global_state'）。

```sql
CREATE TABLE lottery (
  id                 VARCHAR(36) PRIMARY KEY DEFAULT 'global_state',
  slots              JSON         NOT NULL,    -- 16 个格子配置（见下方结构）
  winners            JSON         NOT NULL,    -- 中奖记录列表（见下方结构）
  banner_cleared_at  TIMESTAMP,                -- 轮播清空时间戳
  last_clear         TIMESTAMP,                -- 最近一次清空中奖记录的时间
  updated_at         TIMESTAMP     DEFAULT NOW() ON UPDATE NOW()
);
```

**slots JSON 结构（16 个元素的数组）：**
```json
[
  { "text": "谢谢参与", "quantity": -1, "isWinning": false },
  { "text": "玄铁×5",   "quantity": 3,  "isWinning": true  },
  { "text": "银两×100", "quantity": 5,  "isWinning": true  },
  // ... 共 16 个
]
```
- `quantity`: 奖品库存数量，`-1` 表示无限（非中奖格通常设为 -1）
- `isWinning`: 是否为中奖格
- `text`: 显示文本（最多 8 字符）

**winners JSON 结构（数组）：**
```json
[
  { "gameName": "玩家名", "prize": "玄铁×5", "slotIndex": 3, "timestamp": "2026-04-15T10:30:00.000Z" }
]
```

**业务规则：**
- 每人每周有有限抽签次数（lottery_count），周一凌晨重置
- 抽中中奖格且有库存 → 扣减 quantity，记录 winner，广播
- 抽中但无库存 → 不扣次，提示"已被捷足先登"
- 未中奖格 → 扣次，返回安慰消息
- 管理员可修改格子配置、清空轮播、清空中奖记录、设定用户抽签次数

**内存对象格式：**
```javascript
{
  slots: [{ text, quantity, isWinning }],  // 16 个元素
  winners: [{ gameName, prize, slotIndex, timestamp }],
  bannerClearedAt: "ISO string or null",
  lastClear: "timestamp or null"
}
// 默认值（数据库无记录时）：
{ slots: Array(16).fill({text:'谢谢参与', quantity:-1, isWinning:false}), winners: [] }
```

---

### 3.4 notices — 公告表

系统公告，管理员发布，全员可见。

```sql
CREATE TABLE notices (
  id          VARCHAR(36)   PRIMARY KEY,        -- UUID 主键
  title       VARCHAR(100)  NOT NULL,           -- 公告标题
  content     TEXT          NOT NULL,           -- 公告正文（支持 HTML）
  author_id   VARCHAR(36)   NOT NULL,           -- 发布者 user.id → 外键
  created_at  TIMESTAMP     DEFAULT NOW(),       -- 发布时间

  INDEX idx_created_at (created_at DESC),
  FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE CASCADE
);
```

**已读机制：** 不在此表中维护。每个用户的已读状态存在 `users.read_notice_ids`（JSON 数组）。前端通过对比 notice.id 和用户的 read_notice_ids 判断未读数量。

---

### 3.5 suggestions — 建议表

用户提交的建议反馈，仅管理员可见。

```sql
CREATE TABLE suggestions (
  id          VARCHAR(36)   PRIMARY KEY,         -- UUID 主键
  content     TEXT          NOT NULL,            -- 建议内容
  author_id   VARCHAR(36)   NOT NULL,            -- 提交者 user.id → 外键
  created_at  TIMESTAMP     DEFAULT NOW(),        -- 提交时间

  INDEX idx_created_at (created_at DESC),
  FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE CASCADE
);
```

**已读机制：** 与 notices 相同，管理员的已读状态存在 `users.read_suggestion_ids`（JSON 数组）。

---

## 四、表关系图（ER）

```
┌─────────────┐         ┌─────────────┐
│   users     │──1:N───▶│    teams    │
│             │  队长/成员 │             │
│  PK: id     │         │  FK: leader │
│             │         │    _id      │
├─────────────┤         ├─────────────┤
│ id          │         │ id          │
│ game_name   │         │ type        │
│ guild_name  │         │ date        │
│ ...         │         │ members(JSON)│
│             │         └──────┬──────┘
├─────────────┤                │
│  ◀──FK── notices              │
│  ◀──FK── suggestions          │
└─────────────┘         ┌──────▼──────┐
                         │   lottery   │  （单例表）
                         ├─────────────┤
                         │ slots (JSON) │
                         │ winners(JSON)│
                         └─────────────┘
```

**外键关系：**
- `teams.leader_id` → `users.id` (CASCADE DELETE)
- `notices.author_id` → `users.id` (CASCADE DELETE)
- `suggestions.author_id` → `users.id` (CASCADE DELETE)

**注意：** `teams.members` 是 JSON 数组（含 userId 引用），不是外键约束，属于**嵌入式关系**。删除用户时需要应用层额外清理队伍中的成员引用。

---

## 五、数据流与架构

### 5.1 分层架构

```
请求 → routes/ (路由+参数校验)
     → services/ (业务逻辑+缓存操作)
     → dao/ (SQL 执行)
     → MySQL

     ↕ cache/index.js (内存缓存单例)
     ↕ websocket/broadcast.js (实时广播)
```

### 5.2 缓存策略

启动时全量加载到内存（`cache.loadData()`），之后：

- **读**：全部走内存缓存，不查库
- **写**：先改内存，再异步写 MySQL + WebSocket 广播
- **失败回滚**：MySQL 写入失败时还原内存中的数据（乐观更新模式）

缓存的数据域：
| 数据域 | 来源 | 更新时机 |
|--------|------|----------|
| users | SELECT * FROM users | 用户注册/修改/签到/抽签/掘金/贡献值变更 |
| teams | SELECT * FROM teams ORDER BY date,time | 创建/加入/退出/踢人/排序/改期/解散 |
| lottery | SELECT * FROM lottery LIMIT 1 | 配置格子/抽签/清空 |
| notices | SELECT * FROM notices ORDER BY created_at DESC | 发布/删除公告 |
| suggestions | SELECT * FROM suggestions ORDER BY created_at DESC | 提交/删除建议 |

### 5.3 字段命名转换

- **MySQL 存储**：snake_case（`game_name`, `leader_id`, `full_notified`）
- **内存/前端/API**：camelCase（`gameName`, `leaderId`, `fullNotified`）
- **转换函数**：`utils/format.js` 中的 `toCamelCaseUser/Team/Notice/Suggestion` 和 `toLotteryObject`
- **写入时反向转换**：service 层手动映射 camelCase → snake_case

---

## 六、API 一览（简版）

### 认证
| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/auth/login` | 登录（返回 token） |

### 用户
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/users` | 用户列表（按签到降序） |
| POST | `/api/users` | 注册 |
| PUT | `/api/users/:id` | 修改信息 |
| DELETE | `/api/users/:id` | 删除（管理员） |
| POST | `/api/users/avatar` | 上传头像 |

### 队伍
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/teams` | 当日队伍列表 |
| GET | `/api/teams/:id` | 单个队伍详情 |
| POST | `/api/teams` | 创建队伍 |
| POST | `/api/teams/:id/join` | 加入 |
| POST | `/api/teams/:id/leave` | 退出 |
| POST | `/api/teams/:id/kick` | 踢出成员（队长） |
| PUT | `/api/teams/:id/order` | 调整成员顺序（队长） |
| PUT | `/api/teams/:id/time` | 修改开本时间（队长） |
| POST | `/api/teams/:id/dissolve` | 解散（管理员） |

### 抽签
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/lottery` | 抽奖状态 |
| PUT | `/api/lottery/slots/:idx` | 修改格子（管理员） |
| POST | `/api/lottery/spin` | 抽签 |
| POST | `/api/lottery/clear-banner` | 清空轮播（管理员） |
| POST | `/api/lottery/clear-winners` | 清空中奖记录（管理员） |
| POST | `/api/lottery/add-count` | 设定抽签次数（管理员） |

### 签到 & 信箱
| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/sign-in` | 每日签到 |
| GET | `/api/sign-in/status` | 今日是否已签到 |
| GET/POST/DELETE | `/api/notices*` | 公告 CRUD + 已读 |
| GET/POST/DELETE | `/api/suggestions*` | 建议 CRUD + 已读（管理员） |

### 游戏 & 其他
| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/games/juejin/score` | 提交掘金分数 |
| GET | `/api/games/juejin/leaderboard` | 排行榜 |
| GET | `/api/games/juejin/user/:userId` | 个人掘金数据 |
| POST | `/api/games/juejin/complete` | 通关掘金 |
| GET | `/api/achievements/:userId` | 获取成就 |
| POST | `/api/achievements/check` | 检查并解锁成就 |
| POST | `/api/achievements/trigger` | 手动触发（测试） |
| GET | `/api/contribution/:userId` | 贡献值查询 |
| GET | `/api/music` | 音乐列表 |

---

## 七、定时任务

| 任务 | 触发条件 | 说明 |
|------|----------|------|
| **周重置** | 每小时检查，逢周一 00:00 | 重置所有用户 `lottery_count` 为默认值，清空 `lottery.winners` |
| **贡献值结算** | 每分钟检查，逢 23:50 | 扫描当日所有队伍，为每个在队成员发放贡献值 |

---

## 八、项目目录结构

```
yanyun/
├── server.js                   # 启动入口（加载 env → 创建 app → 加载数据 → 启动调度器 → 监听端口）
├── app.js                      # Express 配置（中间件、静态服务、路由挂载、WS 初始化、share.html）
├── package.json / deploy.sh
├── cache/index.js              # 内存缓存单例（users/teams/lottery/notices/suggestions + loadData）
├── routes/                     # 12 个路由模块
│   ├── auth.js / users.js / teams.js / lottery.js / signin.js
│   ├── notices.js / suggestions.js / games.js / achievements.js
│   ├── admin.js / music.js / contribution.js
├── services/                   # 9 个服务模块
│   ├── userService / teamService / lotteryService / signInService
│   ├── noticeService / suggestionService / gameService
│   ├── achievementService / contributionService
├── middleware/auth.js           # requireUser / requireAdmin
├── websocket/broadcast.js      # broadcast() / safeUser() / WS 连接管理
├── schedulers/                 # weeklyReset / contributionSettlement
├── utils/
│   ├── format.js               # 日期格式化 + snake_case→camelCase 转换
│   ├── password.js             # 密码哈希 + 管理员判定
│   └── avatar.js               # 头像文件操作
├── dao/                        # 数据访问层（userDao/teamDao/lotteryDao/noticeDao/suggestionDao）
├── db/mysql.js                 # MySQL 连接池封装
├── scripts/init-mysql-tables.sql
└── public/                     # 前端静态资源（HTML/CSS/JS + games/img/music/uploads/fonts）
```

---

## 九、部署方式

- **部署脚本**：`./deploy.sh`（git pull → npm install → pm2 restart）
- **环境变量**：`.env.local`（MYSQL_HOST/USER/PASSWORD/DATABASE）
- **PM2 应用名**：yanyun
- **服务器**：43.251.102.69:/opt/yanyun

---

## 十、已移除的功能（2026-04-15 重构后）

以下功能已彻底移除，代码中不应有任何残留：

- ❌ 云开发 SDK（@cloudbase/node-sdk）及所有云函数调用
- ❌ 双写队列（syncToCloud / queueCloudSync）
- ❌ sync-monitor / resync_cloud / cloud-sync.js
- ❌ 小程序相关 API（绑定、令牌、邀请、订阅消息）
- ✅ 保留：share.html（纯 SSR 动态 OG 标签，不依赖任何外部服务）
