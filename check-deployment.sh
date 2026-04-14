#!/usr/bin/expect -f
set timeout 30

set host "43.251.102.69"
set user "root"
set password "Xiaxue961124"
set remote_path "/opt/yanyun"

# SSH到服务器检查状态
spawn ssh ${user}@${host}
expect "password:"
send "${password}\r"
expect "#"

# 检查PM2状态
send "pm2 status\r"
expect "#"

# 检查文件修改时间
send "ls -lh ${remote_path}/server.js ${remote_path}/public/js/app.js ${remote_path}/dao/noticeDao.js\r"
expect "#"

# 查看最近的PM2日志
send "pm2 logs --lines 30 --nostream\r"
expect "#"

send "exit\r"
expect eof
