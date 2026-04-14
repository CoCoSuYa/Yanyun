#!/usr/bin/expect -f
set timeout 30

set host "43.251.102.69"
set user "root"
set password "Xiaxue961124"

spawn ssh ${user}@${host}
expect {
    "password:" {
        send "${password}\r"
    }
    "yes/no" {
        send "yes\r"
        expect "password:"
        send "${password}\r"
    }
}

expect "#"
send "cd /opt/yanyun\r"

expect "#"
send "pm2 logs yanyun --lines 100 --nostream\r"

expect "#"
send "exit\r"

expect eof
