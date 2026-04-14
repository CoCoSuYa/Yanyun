#!/bin/bash
# 燕云项目通用部署脚本

set -e

echo "🚀 开始部署燕云项目到服务器..."

# 读取环境变量
if [ ! -f ".env.local" ]; then
    echo "❌ 错误: .env.local 文件不存在"
    exit 1
fi

SERVER1_IP=$(grep "^SERVER1_IP=" .env.local | cut -d'=' -f2 | tr -d '\r')
SERVER1_USER=$(grep "^SERVER1_USER=" .env.local | cut -d'=' -f2 | tr -d '\r')
SERVER1_PASSWORD=$(grep "^SERVER1_PASSWORD=" .env.local | cut -d'=' -f2 | tr -d '\r')
SERVER1_PROJECT_PATH=$(grep "^SERVER1_PROJECT_PATH=" .env.local | cut -d'=' -f2 | tr -d '\r')

SERVER2_IP=$(grep "^SERVER2_IP=" .env.local | cut -d'=' -f2 | tr -d '\r')
SERVER2_USER=$(grep "^SERVER2_USER=" .env.local | cut -d'=' -f2 | tr -d '\r')
SERVER2_PASSWORD=$(grep "^SERVER2_PASSWORD=" .env.local | cut -d'=' -f2 | tr -d '\r')
SERVER2_PROJECT_PATH=$(grep "^SERVER2_PROJECT_PATH=" .env.local | cut -d'=' -f2 | tr -d '\r')

# 需要部署的文件列表
FILES=(
    "server.js"
    "dao/userDao.js"
    "dao/teamDao.js"
    "dao/noticeDao.js"
    "dao/suggestionDao.js"
    "dao/lotteryDao.js"
    "db/mysql.js"
    "public/js/app.js"
    "public/css/style.css"
    "public/share.html"
    "public/profile.html"
    "public/css/profile.css"
    "public/js/profile-demo.js"
    "public/games/dongtian-juejin.html"
)

echo "📦 准备部署文件..."

# 优先使用 expect（macOS 上 sshpass 可能有兼容性问题）
if command -v expect &> /dev/null; then
    USE_EXPECT=true
else
    USE_EXPECT=false
fi

# 部署函数
deploy_to_server() {
    local SERVER_IP=$1
    local SERVER_USER=$2
    local SERVER_PASSWORD=$3
    local SERVER_PROJECT_PATH=$4
    local SERVER_NAME=$5

    echo "\n📡 部署到$SERVER_NAME ($SERVER_IP)..."
    
    for file in "${FILES[@]}"; do
        echo "  上传: $file"
        if [ "$USE_EXPECT" = true ]; then
            expect << EOF
set timeout 30
spawn scp "$file" "$SERVER_USER@$SERVER_IP:$SERVER_PROJECT_PATH/$file"
expect {
    "password:" { send "$SERVER_PASSWORD\r"; exp_continue }
    "yes/no" { send "yes\r"; exp_continue }
    eof
}
EOF
        else
            sshpass -p "$SERVER_PASSWORD" scp -o StrictHostKeyChecking=no "$file" "$SERVER_USER@$SERVER_IP:$SERVER_PROJECT_PATH/$file"
        fi
        sleep 0.3
    done

    echo "  重启$SERVER_NAME..."
    if [ "$USE_EXPECT" = true ]; then
        expect << EOF
set timeout 30
spawn ssh "$SERVER_USER@$SERVER_IP" "cd $SERVER_PROJECT_PATH && pm2 restart yanyun || pm2 start server.js --name yanyun"
expect {
    "password:" { send "$SERVER_PASSWORD\r"; exp_continue }
    "yes/no" { send "yes\r"; exp_continue }
    eof
}
EOF
    else
        sshpass -p "$SERVER_PASSWORD" ssh -o StrictHostKeyChecking=no "$SERVER_USER@$SERVER_IP" "cd $SERVER_PROJECT_PATH && pm2 restart yanyun || pm2 start server.js --name yanyun"
    fi

    echo "✅ $SERVER_NAME部署完成"
}

# 只部署到服务器2
deploy_to_server "$SERVER2_IP" "$SERVER2_USER" "$SERVER2_PASSWORD" "$SERVER2_PROJECT_PATH" "服务器2"

echo "\n🎉 所有服务器部署完成！"
echo "\n📋 部署的文件:"
for file in "${FILES[@]}"; do
    echo "  - $file"
done
