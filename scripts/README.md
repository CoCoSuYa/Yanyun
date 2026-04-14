# MySQL 数据迁移指南

本文档说明如何将燕云项目的数据从微信云数据库迁移到MySQL。

## 前置条件

1. **安装MySQL**
   ```bash
   # macOS
   brew install mysql
   brew services start mysql
   
   # Ubuntu
   sudo apt update
   sudo apt install mysql-server
   sudo systemctl start mysql
   ```

2. **配置MySQL密码**
   ```bash
   # 设置root密码
   mysql -u root
   ALTER USER 'root'@'localhost' IDENTIFIED BY 'your_password';
   FLUSH PRIVILEGES;
   EXIT;
   ```

3. **配置环境变量**
   
   在 `.env.local` 文件中添加MySQL配置：
   ```env
   # MySQL配置
   MYSQL_HOST=localhost
   MYSQL_USER=root
   MYSQL_PASSWORD=your_password
   MYSQL_DATABASE=yanyun
   ```

## 迁移步骤

### 步骤1：创建数据库和表

```bash
# 创建数据库
mysql -u root -p -e "CREATE DATABASE IF NOT EXISTS yanyun CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"

# 执行建表SQL
mysql -u root -p yanyun < scripts/init-mysql-tables.sql
```

### 步骤2：从云数据库导出数据

```bash
cd yanyun
node scripts/export-cloud-data.js
```

**输出示例：**
```
开始从云数据库导出数据...

✅ 导出 6 个用户
✅ 导出 2 个队伍
✅ 导出抽奖数据
✅ 导出 0 条公告
✅ 导出 0 条建议

✅ 数据导出完成！文件保存在 data/ 目录
   - users.json: 6 条记录
   - teams.json: 2 条记录
   - lottery.json: 1 条记录
   - notices.json: 0 条记录
   - suggestions.json: 0 条记录
```

### 步骤3：导入数据到MySQL

```bash
node scripts/import-to-mysql.js
```

**输出示例：**
```
开始导入数据到MySQL...

导入 6 个用户...
✅ 用户导入完成

导入 2 个队伍...
✅ 队伍导入完成

导入抽奖数据...
✅ 抽奖数据导入完成

✅ 所有数据导入完成！
```

### 步骤4：验证数据完整性

```bash
node scripts/verify-migration.js
```

**输出示例：**
```
开始验证数据迁移...

数据对比结果：
  用户数：云数据库 6 vs MySQL 6 ✅
  队伍数：云数据库 2 vs MySQL 2 ✅
  抽奖数据：云数据库 1 vs MySQL 1 ✅
  公告数：云数据库 0 vs MySQL 0 ✅
  建议数：云数据库 0 vs MySQL 0 ✅

✅ 数据迁移验证通过！所有数据已完整迁移。
```

## 一键执行脚本

为了方便执行，可以创建一个一键迁移脚本：

```bash
#!/bin/bash
# migrate.sh

echo "=== 步骤1：导出云数据库数据 ==="
node scripts/export-cloud-data.js

if [ $? -ne 0 ]; then
  echo "❌ 导出失败"
  exit 1
fi

echo ""
echo "=== 步骤2：导入到MySQL ==="
node scripts/import-to-mysql.js

if [ $? -ne 0 ]; then
  echo "❌ 导入失败"
  exit 1
fi

echo ""
echo "=== 步骤3：验证数据完整性 ==="
node scripts/verify-migration.js

if [ $? -ne 0 ]; then
  echo "❌ 验证失败"
  exit 1
fi

echo ""
echo "✅ 数据迁移全部完成！"
```

使用方法：
```bash
chmod +x migrate.sh
./migrate.sh
```

## 故障排查

### 问题1：MySQL连接失败

**错误信息：**
```
Error: Access denied for user 'root'@'localhost'
```

**解决方法：**
- 检查 `.env.local` 中的 `MYSQL_PASSWORD` 是否正确
- 确认MySQL服务已启动：`brew services list` 或 `systemctl status mysql`

### 问题2：外键约束失败

**错误信息：**
```
Error: Cannot add or update a child row: a foreign key constraint fails
```

**解决方法：**
- 确保先导入users表，再导入teams/notices/suggestions表
- 检查数据中的 `leader_id` 和 `author_id` 是否存在于users表中

### 问题3：JSON字段格式错误

**错误信息：**
```
Error: Invalid JSON text
```

**解决方法：**
- 检查导出的JSON文件格式是否正确
- 确保 `JSON.stringify()` 正确处理了数组和对象

## 下一步

数据迁移完成后，继续以下步骤：

1. **创建数据库连接层**：`db/mysql.js`
2. **创建DAO层**：`dao/userDao.js`、`dao/teamDao.js`等
3. **创建同步服务**：`sync/cloudSync.js`
4. **修改server.js**：将云数据库查询改为MySQL查询
5. **测试验证**：确保所有功能正常工作

详细实施方案请参考：[`plans/yanyun-mysql-migration-plan.md`](../plans/yanyun-mysql-migration-plan.md)
