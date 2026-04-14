# 燕云十六声 · 预约组队系统 — 项目文档

> 更新时间：2026-04-15（模块化重构后）

---

## 一、项目概览

| 项目 | 说明 |
|------|------|
| **项目名称** | yanyun-team-booking（燕云十六声预约组队网页） |
| **项目定位** | 游戏《燕云十六声》的百舸争流公会预约组队平台 |
| **运行方式** | Node.js 后端 + 原生 HTML/CSS/JS 前端，通过 WebSocket 实时通信 |
| **唯一数据源** | MySQL（已与云开发/云数据库完全解耦） |
| **默认端口** | 3000 |

---

## 二、技术栈

| 技术 | 用途 |
|------|------|
| **Express 4** | HTTP 服务 & REST API |
| **ws (WebSocket)** | 实时双向通信 |
| **MySQL (mysql2)** | 唯一数据持久化层 |
| **uuid** | 生成唯一 ID |

---

## 三、项目结构

```
yanyun/
├── server.js                        # 启动入口（~30行）
├── app.js                           # Express 应用配置（路由挂载、中间件、WS初始化、share.html）
├── package.json                     # 项目依赖
├── deploy.sh                        # 部署脚本
├── cache/
│   └── index.js                     # 内存缓存管理（users/teams/lottery/notices/suggestions + loadData）
├── routes/                          # 路由层：定义端点、参数校验、调用 service
│   ├── auth.js                      # POST /api/auth/login
│   ├── users.js                     # /api/users/*
│   ├── teams.js                     # /api/teams/*
│   ├── lottery.js                   # /api/lottery/*
│   ├── signin.js                    # /api/sign-in/*
│   ├── notices.js                   # /api/notices/*
│   ├── suggestions.js               # /api/suggestions/*
│   ├── games.js                     # /api/games/juejin/*
│   ├── achievements.js              # /api/achievements/*
│   ├── admin.js                     # /api/admin/*
│   ├── music.js                     # /api/music
│   └── contribution.js              # /api/contribution/:userId
├── services/                        # 服务层：业务逻辑、缓存操作、DAO调用、广播
│   ├── userService.js               # 用户注册/登录/修改/删除/头像
│   ├── teamService.js               # 队伍CRUD/加入/退出/踢人/排序/改时间/解散
│   ├── lotteryService.js            # 抽签/配置/清空/设定次数
│   ├── signInService.js             # 签到/状态查询
│   ├── noticeService.js             # 公告CRUD/已读标记
│   ├── suggestionService.js         # 建议CRUD/已读标记
│   ├── gameService.js               # 掘金游戏分数/排行榜/通关
│   ├── achievementService.js        # 成就检查/触发
│   └── contributionService.js       # 贡献值查询
├── middleware/
│   └── auth.js                      # requireUser / requireAdmin 中间件
├── schedulers/
│   ├── weeklyReset.js               # 周一零点重置抽签次数+清空中奖记录
│   └── contributionSettlement.js    # 每晚23:50扫描队伍发放贡献值
├── websocket/
│   └── broadcast.js                 # broadcast() + safeUser() + WS连接处理
├── utils/
│   ├── format.js                    # toMySQLDateTime, todayStr, toCamelCase*, formatTeamTime, toChineseDate
│   ├── password.js                  # hashPassword, PWD_SALT, DEFAULT_PWD_HASH, isAdminUser
│   └── avatar.js                    # getAvatarExtension, removeUserAvatarFiles
├── dao/                             # 数据访问层（直接操作 MySQL）
│   ├── userDao.js
│   ├── teamDao.js
│   ├── lotteryDao.js
│   ├── noticeDao.js
│   └── suggestionDao.js
├── db/
│   └── mysql.js                     # MySQL 连接池封装
├── scripts/
│   └── init-mysql-tables.sql        # 数据库初始化 SQL
└── public/                          # 前端静态资源
    ├── index.html
    ├── profile.html
    ├── share.html
    ├── css/
    ├── js/
    │   ├── app.js
    │   └── profile.js
    ├── games/
    ├── img/
    ├── music/
    ├── uploads/
    └── fonts/
```

---

## 四、API 一览

### 认证
| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/auth/login` | 登录 |

### 用户
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/users` | 获取用户列表 |
| POST | `/api/users` | 注册用户 |
| PUT | `/api/users/:id` | 修改用户信息 |
| DELETE | `/api/users/:id` | 删除用户（管理员） |
| POST | `/api/users/avatar` | 上传头像 |
| POST | `/api/users/set-checkin-days` | 设置签到天数（测试用） |

### 队伍
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/teams` | 获取队伍列表 |
| GET | `/api/teams/:id` | 获取单个队伍 |
| POST | `/api/teams` | 创建队伍 |
| POST | `/api/teams/:id/join` | 加入队伍 |
| POST | `/api/teams/:id/leave` | 退出队伍 |
| POST | `/api/teams/:id/kick` | 踢人 |
| PUT | `/api/teams/:id/order` | 调整成员顺序 |
| PUT | `/api/teams/:id/time` | 修改开本时间 |
| POST | `/api/teams/:id/dissolve` | 解散队伍（管理员） |

### 抽签
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/lottery` | 获取抽奖状态 |
| PUT | `/api/lottery/slots/:idx` | 修改格子配置（管理员） |
| POST | `/api/lottery/spin` | 抽签 |
| POST | `/api/lottery/clear-banner` | 清空轮播（管理员） |
| POST | `/api/lottery/clear-winners` | 清空中奖记录（管理员） |
| POST | `/api/lottery/add-count` | 设定用户抽签次数（管理员） |

### 签到
| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/sign-in` | 签到 |
| GET | `/api/sign-in/status` | 签到状态 |

### 信箱
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/notices` | 获取公告列表 |
| POST | `/api/notices` | 发布公告（管理员） |
| DELETE | `/api/notices/:id` | 删除公告（管理员） |
| POST | `/api/notices/:id/read` | 标记公告已读 |
| GET | `/api/suggestions` | 获取建议列表（管理员） |
| POST | `/api/suggestions` | 提交建议 |
| DELETE | `/api/suggestions/:id` | 删除建议（管理员） |
| POST | `/api/suggestions/:id/read` | 标记建议已读（管理员） |

### 游戏 & 成就
| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/games/juejin/score` | 提交掘金分数 |
| GET | `/api/games/juejin/leaderboard` | 排行榜 |
| GET | `/api/games/juejin/user/:userId` | 个人掘金数据 |
| POST | `/api/games/juejin/complete` | 通关掘金 |
| GET | `/api/achievements/:userId` | 获取成就 |
| POST | `/api/achievements/check` | 检查成就 |
| POST | `/api/achievements/trigger` | 触发成就（测试用） |
| GET | `/api/contribution/:userId` | 获取贡献值 |
| GET | `/api/music` | 音乐列表 |

### 管理
| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/admin/fix-avatars` | 清理头像URL空格（管理员） |

---

## 五、已移除的功能

以下功能已在 2026-04-15 模块化重构中移除（与云开发/云数据库完全解耦）：

- ❌ `/api/mp/*` 全部8个端点（小程序绑定/令牌/邀请等）
- ❌ 微信工具函数（httpsGet/httpsPost/getWxToken/sendSubscribeMsg）
- ❌ 开本提醒调度器（依赖微信订阅消息）
- ❌ 满员微信通知（依赖微信订阅消息）
- ❌ 双写队列（syncToCloud/queueCloudSync）
- ❌ 直接云库操作（db.collection().doc().remove()/update()）
- ❌ 用户模型中的云相关字段（openId/mpQuota/inviteLog/pendingInvites）
- ✅ 分享功能保留（share.html 动态OG标签，纯服务端渲染不依赖云）

---

## 六、定时任务

| 任务 | 频率 | 说明 |
|------|------|------|
| 周一重置 | 每小时检查 | 周一零点清空中奖记录，重置抽签次数 |
| 贡献值结算 | 每分钟检查 | 每晚 23:50 扫描当日队伍发放贡献值 |

---

## 七、部署方式

- **部署脚本**：`./deploy.sh`（自动 git pull + npm install + pm2 restart）
- **环境变量**：通过 `.env.local` 配置（MYSQL 凭证等）
- **PM2 应用名**：yanyun
