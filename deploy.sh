#!/bin/bash
# 燕云项目部署脚本（Git 版）
# 用法: ./deploy.sh [服务器编号]
#   ./deploy.sh      → 部署到服务器2（生产环境）
#   ./deploy.sh 1    → 部署到服务器1（已弃用）
#   ./deploy.sh 2    → 部署到服务器2

set -e

echo "🚀 开始部署燕云项目..."

# 读取环境变量
if [ ! -f ".env.local" ]; then
    echo "❌ 错误: .env.local 文件不存在"
    exit 1
fi

# 解析 .env.local 中的服务器配置
parse_env() {
    grep "^$1=" .env.local | cut -d'=' -f2 | tr -d '\r'
}

SERVER_NUM=${1:-2}
SERVER_IP=$(parse_env "SERVER${SERVER_NUM}_IP")
SERVER_USER=$(parse_env "SERVER${SERVER_NUM}_USER")
SERVER_PROJECT_PATH=$(parse_env "SERVER${SERVER_NUM}_PROJECT_PATH")

if [ -z "$SERVER_IP" ]; then
    echo "❌ 错误: 服务器${SERVER_NUM}未配置"
    exit 1
fi

echo "📡 部署到服务器${SERVER_NUM} ($SERVER_IP)..."

# 通过 SSH 执行: 拉取代码 + 安装依赖 + 重启服务
ssh "$SERVER_USER@$SERVER_IP" bash -s << REMOTE_SCRIPT
set -e
cd $SERVER_PROJECT_PATH

echo "📥 拉取最新代码..."
git pull origin main

echo "📦 安装依赖..."
npm install --production

echo "🔄 重启服务..."
pm2 restart yanyun 2>/dev/null || pm2 start server.js --name yanyun

echo "✅ 部署完成"
pm2 status yanyun
REMOTE_SCRIPT

echo ""
echo "🎉 部署完成！"
