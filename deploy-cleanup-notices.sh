#!/bin/bash
# 部署并执行清理 readNoticeIds 脚本
# 用法: ./deploy-cleanup-notices.sh [服务器编号]

set -e

echo "🚀 开始部署清理脚本..."

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

echo "📡 连接到服务器${SERVER_NUM} ($SERVER_IP)..."

# 通过 SSH 执行: 拉取代码 + 执行清理脚本
ssh "$SERVER_USER@$SERVER_IP" bash -s << 'REMOTE_SCRIPT'
set -e
cd $SERVER_PROJECT_PATH

echo "📥 拉取最新代码..."
git pull origin refactor/modular

echo "🧹 执行清理脚本..."
node scripts/cleanup-read-notice-ids.js

echo "✅ 清理完成"
REMOTE_SCRIPT

echo "✅ 部署和清理完成"
