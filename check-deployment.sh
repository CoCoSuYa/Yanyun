#!/bin/bash
# 检查部署状态
# 用法: ./check-deployment.sh

set -e

# 读取环境变量
if [ ! -f ".env.local" ]; then
    echo "❌ 错误: .env.local 文件不存在"
    exit 1
fi

SERVER_IP=$(grep "^SERVER2_IP=" .env.local | cut -d'=' -f2 | tr -d '\r')
SERVER_USER=$(grep "^SERVER2_USER=" .env.local | cut -d'=' -f2 | tr -d '\r')
SERVER_PROJECT_PATH=$(grep "^SERVER2_PROJECT_PATH=" .env.local | cut -d'=' -f2 | tr -d '\r')

echo "📋 检查服务器 ($SERVER_IP) 部署状态..."
echo ""

ssh "$SERVER_USER@$SERVER_IP" bash -s << REMOTE_SCRIPT
cd $SERVER_PROJECT_PATH

echo "=== PM2 状态 ==="
pm2 status yanyun

echo ""
echo "=== 关键文件修改时间 ==="
ls -lh server.js public/js/app.js dao/noticeDao.js

echo ""
echo "=== 最近30行日志 ==="
pm2 logs yanyun --lines 30 --nostream
REMOTE_SCRIPT
