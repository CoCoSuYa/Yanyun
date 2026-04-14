# 燕云十六声 · 预约组队系统 — 项目分析文档

> 生成时间：2026-04-13

---

## 一、项目概览

| 项目 | 说明 |
|------|------|
| **项目名称** | yanyun-team-booking（燕云十六声预约组队网页） |
| **项目定位** | 游戏《燕云十六声》的百舸争流公会预约组队平台 |
| **运行方式** | Node.js 后端 + 原生 HTML/CSS/JS 前端，通过 WebSocket 实现实时通信 |
| **配套小程序** | yanyun-mp（微信小程序，提供移动端邀请、订阅消息推送等功能） |
| **默认端口** | 3000 |

---

## 二、技术栈

### 后端
| 技术 | 用途 |
|------|------|
| **Express 4** | HTTP 服务 & REST API |
| **ws (WebSocket)** | 实时双向通信（队伍状态、用户变动、抽奖等广播） |
| **MySQL (mysql2)** | 主数据持久化层（连接池模式） |
| **@cloudbase/node-sdk** | 腾讯云开发 SDK（历史遗留，用于异步同步数据到云数据库） |
| **uuid** | 生成唯一 ID |
| **dotenv** | 环境变量管理（`.env.local`） |
| **ssh2 / ssh2-sftp-client** | 部署相关工具 |

### 前端
| 技术 | 用途 |
|------|------|
| **原生 HTML/CSS/JS** | 主界面，无框架依赖 |
| **SweetAlert2** | 弹窗提示 |
| **WebSocket (原生)** | 实时数据同步 |

### 数据库
| 数据库 | 用途 |
|--------|------|
| **MySQL** | 主存储（用户、队伍、抽奖、公告、建议） |
| **腾讯云开发数据库** | 辅助同步（写入 MySQL 后异步同步到云端） |

---

## 三、项目结构

```
yanyun/
├── server.js                 # 主服务入口（~2200行，包含所有 API & 调度逻辑）
├── package.json              # 项目依赖
├── deploy.sh                 # 部署脚本
├── deploy-*.sh               # 各种热修复部署脚本
├── check-*.sh                # 运维检查脚本
├── db/
│   └── mysql.js              # MySQL 连接池封装
├── dao/
│   ├── userDao.js            # 用户数据访问层
│   ├── teamDao.js            # 队伍数据访问层
│   ├── lotteryDao.js         # 抽奖数据访问层
│   ├── noticeDao.js          # 公告数据访问层
│   └── suggestionDao.js      # 建议数据访问层
├── scripts/
│   ├── init-mysql-tables.sql # 数据库初始化 SQL
│   ├── compensate-users.js   # 用户补偿脚本
│   ├── compensate-users.sql  # 补偿 SQL
│   ├── fix-notice-titles.sql # 公告标题修复 SQL
│   └── update-notice-titles-ancient.sql # 古风日期格式修复
├── public/
│   ├── index.html            # 主页（预约组队界面）
│   ├── profile.html          # 个人主页
│   ├── share.html            # 分享页面（动态 OG 标签）
│   ├── css/                  # 样式文件
│   ├── js/
│   │   └── app.js            # 前端主逻辑
│   ├── games/
│   │   └── dongtian-juejin.html  # 掘金小游戏
│   ├── img/                  # 静态图片资源
│   ├── music/                # BGM 音乐文件（12 首 MP3）
│   ├── uploads/              # 用户上传的头像
│   └── fonts/                # 字体文件
└── .env.local                # 环境变量（不入库）
```

---

## 四、数据库设计

### 核心表

| 表名 | 说明 | 关键字段 |
|------|------|----------|
| **users** | 用户表 | id, game_name, guild_name, main_style, sub_style, password_hash, avatar_url, lottery_count, sign_in_count, contribution_points, open_id, achievements |
| **teams** | 队伍表 | id, type, purpose, date, time, leader_id, members(JSON), max_size, full_notified, remind_sent |
| **lottery** | 抽奖配置表 | id(global_state), slots(JSON), winners(JSON), banner_cleared_at |
| **notices** | 公告表 | id, title, content, author_id, created_at |
| **suggestions** | 建议表 | id, content, author_id, created_at |
| **sync_queue** | 同步队列表 | id, operation, table_name, record_id, data(JSON), status |

### 关键设计特点
- **双写策略**：所有写操作先写 MySQL，再异步同步到腾讯云数据库
- **内存缓存**：启动时从 MySQL 加载全量数据到内存，读操作直接读内存，写操作乐观更新
- **UUID 主键**：所有业务表使用 UUID 字符串作为主键
- **JSON 字段**：members、slots、winners、achievements 等使用 MySQL JSON 类型存储

---

## 五、核心功能模块

### 1. 用户系统
- **注册**：限定公会名"百舸争流"，流派仅允许1-2个中文字符
- **登录**：游戏名 + 密码（SHA-256 加盐哈希）
- **个人资料**：修改游戏名、流派、密码
- **头像**：Base64 上传，支持 jpg/png/webp/gif，上限 3MB
- **管理员**：通过 `isAdmin` 字段标识，拥有踢人、解散队伍、管理抽奖等权限

### 2. 组队系统
- **创建队伍**：支持"五人本"（max=5）和十人本（max=10）
- **加入/退出**：实时 WebSocket 广播，乐观更新 + 异步持久化
- **踢人**：仅队长权限
- **调整成员顺序**：队长可拖拽排序
- **修改时间**：队长可改期
- **解散队伍**：管理员权限
- **满员通知**：队伍满员时自动推送微信订阅消息给队长
- **开本提醒**：开本前5分钟自动推送订阅消息给全体队员
- **分享入队**：通过 share.html 动态渲染 OG 标签，支持微信分享卡片直接入队

### 3. 抽签系统
- **16格转盘**：管理员可配置每格的奖品名、数量、是否中奖
- **每周重置**：周一零点自动清空中奖记录，重置所有用户抽签次数为1
- **签到奖励**：签到额外获得1次抽签机会
- **中奖播报**：轮播 Banner 实时展示中奖信息

### 4. 签到系统
- **每日签到**：同一天不可重复签到
- **连续签到**：中断超过1天则重置，连续签到有额外贡献值奖励
- **贡献值**：基础10分 + 连续签到加成（最多+5）

### 5. 信箱系统
- **公告（告示）**：管理员发布，全员可见，古风日期标题（如"二〇二六年四月十三日"）
- **建议**：全员可提交，仅管理员可查看
- **已读标记**：每个用户独立维护已读公告/建议列表

### 6. 掘金小游戏
- **内嵌 HTML5 游戏**：`dongtian-juejin.html`
- **积分排行**：实时排行榜，高分记录持久化
- **贡献值兑换**：每1000分 = 1贡献值

### 7. 成就系统
| 成就 ID | 名称 | 条件 |
|---------|------|------|
| signin_30 | 初心不改 | 累计签到30天 |
| signin_90 | 坚持不懈 | 累计签到90天 |
| signin_180 | 半载相伴 | 累计签到180天 |
| signin_365 | 岁月如歌 | 累计签到365天 |
| juejin_complete | 掘金之王 | 通关掘金玩法 |

### 8. 贡献值系统
- **签到**：10 + min(连签天数-1, 5)
- **组队**：每晚 23:50 扫描当日队伍，十人本每人100分，五人本每人50分
- **掘金游戏**：每1000分 = 1贡献值

### 9. 微信小程序联动
- **账号绑定**：小程序验证游戏名+密码，将 openId 绑定到用户
- **订阅消息**：邀请入队、满员通知、开本提醒三种模板
- **令牌额度**：用户授权订阅后获得对应令牌，发送通知时扣减
- **邀请系统**：队长可邀请已绑定用户，每天每人最多被邀请3次
- **待处理邀请**：小程序悬浮窗展示，接受/拒绝后清除

### 10. 音乐系统
- **BGM 播放**：12首 MP3 背景音乐，支持播放/暂停/随机切歌
- **曲目列表**：从 `/music/` 目录动态读取

---

## 六、API 一览

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

### 小程序
| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/mp/bind` | 绑定小程序账号 |
| GET | `/api/mp/quota/:userId` | 查询令牌额度 |
| POST | `/api/mp/quota/add` | 增加令牌额度 |
| GET | `/api/mp/userByOpenId/:openId` | 通过 openId 查找用户 |
| GET | `/api/mp/users/invitable` | 可邀请用户列表 |
| POST | `/api/mp/invite` | 发起邀请 |
| GET | `/api/mp/invites/:userId` | 查询待处理邀请 |
| DELETE | `/api/mp/invites/:userId/:inviteId` | 删除邀请记录 |

### 游戏 & 成就
| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/games/juejin/score` | 提交掘金分数 |
| GET | `/api/games/juejin/leaderboard` | 排行榜 |
| GET | `/api/games/juejin/user/:userId` | 个人掘金数据 |
| POST | `/api/games/juejin/complete` | 通关掘金 |
| GET | `/api/achievements/:userId` | 获取成就 |
| POST | `/api/achievements/check` | 检查成就 |
| GET | `/api/contribution/:userId` | 获取贡献值 |
| GET | `/api/music` | 音乐列表 |

---

## 七、WebSocket 消息类型

| 类型 | 方向 | 说明 |
|------|------|------|
| `init` | 服务端→客户端 | 连接时推送全量数据（users, teams, lottery） |
| `user_joined` | 广播 | 新用户注册 |
| `user_updated` | 广播 | 用户信息变更 |
| `user_deleted` | 广播 | 用户被删除 |
| `team_created` | 广播 | 新队伍创建 |
| `team_updated` | 广播 | 队伍信息变更 |
| `team_deleted` | 广播 | 队伍解散 |
| `lottery_update` | 广播 | 抽奖格子配置变更 |
| `lottery_slot_update` | 广播 | 某格奖品数量扣减 |
| `lottery_winner` | 广播 | 新中奖记录 |
| `lottery_winners_cleared` | 广播 | 中奖记录清空 |
| `lottery_banner_cleared` | 广播 | 轮播清空 |
| `achievement` | 广播 | 成就解锁 |

---

## 八、定时任务

| 任务 | 频率 | 说明 |
|------|------|------|
| 周一重置 | 每小时检查 | 周一零点清空中奖记录，重置抽签次数 |
| 开本提醒 | 每分钟检查 | 开本前5分钟推送微信订阅消息 |
| 贡献值结算 | 每分钟检查 | 每晚 23:50 扫描当日队伍发放贡献值 |

---

## 九、部署与运维

### 部署方式
- **SSH/SFTP 部署**：通过 `deploy.sh` 及各类 `deploy-*.sh` 脚本自动部署到远程服务器
- **环境变量**：通过 `.env.local` 配置（MYSQL、微信小程序、腾讯云开发等凭证）

### 运维脚本
- `check-deployment.sh` — 检查部署状态
- `check-error-logs.sh` — 查看错误日志
- `check-server-logs.sh` — 查看服务器日志
- `check-notices-data.sh` — 检查公告数据

---

## 十、架构特点与潜在问题

### 优点
1. **古风沉浸感**：UI 文案、日期格式、错误提示均采用古风措辞，贴合游戏主题
2. **实时性好**：WebSocket 全量广播，组队、抽签等操作实时同步
3. **乐观更新 + 回滚**：写操作先更新内存立即响应，异步持久化失败时回滚
4. **微信生态联动**：小程序绑定 + 订阅消息推送，闭环体验完整

### 潜在风险
1. **单文件巨石**：`server.js` 约2200行，所有业务逻辑集中在一个文件，维护成本高
2. **全量内存缓存**：用户量增长后内存占用和启动时间会成问题
3. **双写一致性**：MySQL + 云数据库异步同步，存在数据不一致窗口
4. **无认证中间件**：API 无 token 鉴权，仅靠前端传 userId，存在安全风险
5. **无单元测试**：项目未包含测试代码
6. **备份文件残留**：`app.js.bak`/`app.js.bak2`/`app.js.bak3` 等冗余文件

### 优化建议
1. **拆分 server.js**：按模块（路由、控制器、服务层）重构，提升可维护性
2. **引入认证机制**：JWT 或 Session 鉴权，替代当前的明文 userId 传递
3. **分页查询**：用户/队伍列表 API 增加分页，避免全量数据传输
4. **清理云数据库依赖**：既然已迁移到 MySQL，可逐步去掉云数据库的双写逻辑
5. **添加错误监控**：集成 Sentry 等工具，及时捕获线上异常
6. **清理冗余文件**：删除 `.bak` 文件，使用 Git 管理版本

---

## 十一、配套小程序（yanyun-mp）

位于 `../yanyun-mp/`，微信小程序端，主要功能：
- 账号绑定（游戏名 + 密码）
- 自动登录（通过 openId 恢复）
- 订阅消息授权（邀请/满员/提醒三种令牌）
- 邀请入队
- 待处理邀请悬浮窗
- 开本提醒推送

---

*本文档基于项目源码自动分析生成，如有遗漏或需更新，请手动补充。*
