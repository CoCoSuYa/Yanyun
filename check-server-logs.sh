#!/bin/bash
# 查看服务器运行日志
# 用法: ./check-server-logs.sh [行数]

set -e

LINES=${1:-100}

if [ ! -f ".env.local" ]; then
    echo "❌ 错误: .env.local 文件不存在"
    exit 1
fi

SERVER_IP=$(grep "^SERVER2_IP=" .env.local | cut -d'=' -f2 | tr -d '\r')
SERVER_USER=$(grep "^SERVER2_USER=" .env.local | cut -d'=' -f2 | tr -d '\r')

echo "📋 查看最近 ${LINES} 行运行日志 ($SERVER_IP)..."
echo ""

ssh "$SERVER_USER@$SERVER_IP" "cd /opt/yanyun && pm2 logs yanyun --lines ${LINES} --nostream"
