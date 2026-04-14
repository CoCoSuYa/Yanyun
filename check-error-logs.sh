#!/usr/bin/expect -f
set timeout 30

set host "43.251.102.69"
set user "root"
set password "Xiaxue961124"

# SSH到服务器查看错误日志
spawn ssh ${user}@${host}
expect "password:"
send "${password}\r"
expect "#"

# 查看最新的错误日志
send "tail -100 /root/.pm2/logs/yanyun-error.log\r"
expect "#"

send "exit\r"
expect eof
