let express = require('express');
let http = require('http');
let fs = require('fs');
let IO = require('socket.io');

const serverPoint = 8081;   // 端口号

let app = express();

let allUsers = {};      // 所有用户名单
let allSockets = {};    // 所有客户端


app.use(express.static('../dist'));    // 获取静态页面（需要把静态页面放入这个目录内）

let server = http.createServer(app).listen(serverPoint);
console.log("The HTTP server is up and running on " + serverPoint);

let io = IO(server);
console.log("Socket server is up and running.");

// 每次有一个socket连上，会调用一次connection事件
io.on('connection', (socket) => {
    let user = '';   //本次登录用户名

    // message event handle
    socket.on('message', (dataString) => {
        let data = JSON.parse(dataString);
        // 不同event参数，处理不同程序
        switch (data.event) {

            case "join": //新用户（本用户）加入
                user = data.name;
                if (allUsers[user]) {
                    //用户名重复时
                    sendTo(socket, {
                        "event": "join",
                        "message": "该用户名已存在, 请重新输入",
                        "success": false
                    });
                } else {
                    console.log("User joined", data.name);

                    //保存用户信息
                    allUsers[user] = true; //true表示未通话，false表示正在通话
                    socket.name = user;// socket中增加一个name属性
                    allSockets[user] = socket;

                    sendUserInfo(allUsers);//广播发送给所有人，用户列表
                    // 向本用户发送join信息
                    sendTo(socket, {
                        "event": "join",
                        "allUsers": allUsers,
                        "success": true
                    });
                }
                break;

            case "call":// 呼叫方（本用户）发送呼叫某人指令
                var conn = allSockets[data.connectedUser];//查找被呼叫者的socket
                // 向被呼叫者发送请求通话
                sendTo(conn, {
                    "event": "call",
                    "name": socket.name// 本用户者
                });
                break;

            case "accept":// 被呼叫方（本用户）收到请求呼叫后的反馈
                var conn = allSockets[data.connectedUser];// 查找发起呼叫方的socket
                if (conn != null) {
                    if (data.accept) {
                        // 向呼叫方发送，本用户接受呼叫
                        sendTo(conn, {
                            "event": "accept",
                            "accept": true
                        });
                    } else {
                        allUsers[data.connectedUser] = true;//发起呼叫者状态，未通话
                        // 向呼叫方发送，本用户不接受呼叫
                        sendTo(conn, {
                            "event": "accept",
                            "accept": false
                        });
                    }
                }
                break;

            case "offer":// 呼叫方（本用户）发送offer 
                //for example: UserA wants to call UserB
                console.log("Sending offer to: ", data.connectedUser);
                //if UserB exists then send him offer details
                var conn = allSockets[data.connectedUser];// 查找被呼叫方
                allUsers[user] = false;// 呼叫方（本用户）状态改为正在通话
                if (conn != null) {
                    sendUserInfo(allUsers);// 广播所有用户
                    //setting that UserA connected with UserB
                    socket.otherName = data.connectedUser;
                    sendTo(conn, {
                        "event": "offer",
                        "offer": data.offer,
                        "name": socket.name
                    });
                } else {
                    sendTo(socket, {
                        "event": "msg",
                        "message": "Not found this name"
                    });
                }
                break;



            case "answer":// 被呼叫方（本用户）收到offer后，发送answer消息
                console.log("Sending answer to: ", data.connectedUser);
                //for ex. UserB answers UserA
                var conn = allSockets[data.connectedUser];
                allUsers[user] = false;
                if (conn != null) {
                    sendUserInfo(allUsers);
                    socket.otherName = data.connectedUser;// 用户连接的另一个用户的用户名
                    sendTo(conn, {
                        "event": "answer",
                        "answer": data.answer// 被呼叫方的answer消息
                    });
                }
                break;

            case "candidate":// 呼叫方（本用户）发送offer同时会发送candidate，用意交互ICE Candidate
                            // 被呼叫方（本用户）接收到呼叫方candidate，则发送candidate
                console.log("Sending candidate to:", data.connectedUser);
                var conn1 = allSockets[data.connectedUser];
                var conn2 = allSockets[socket.otherName];
                if (conn1 != null) {
                    sendTo(conn1, {
                        "event": "candidate",
                        "candidate": data.candidate
                    });
                } else {
                    sendTo(conn2, {
                        "event": "candidate",
                        "candidate": data.candidate
                    });
                }
                break;

            case "leave":// 本用户挂断，向另一端发送leave
                console.log("Disconnecting from", data.connectedUser);
                var conn = allSockets[data.connectedUser];
                allUsers[socket.name] = true;
                allUsers[data.connectedUser] = true;
                socket.otherName = null;
                //notify the other user so he can disconnect his peer connection
                if (conn != null) {
                    sendUserInfo(allUsers);
                    sendTo(conn, {
                        event: "leave"
                    });
                }
                break;
        }
    });

    // 用户断开连接时调用
    socket.on("disconnect",  () => {
        if (socket.name) {
            // 删除用户信息
            delete allUsers[socket.name];
            delete allSockets[socket.name];
            sendUserInfo(allUsers);//广播所有用户

            if (socket.otherName) {//如果本用户有连接的另一个用户
                console.log("Disconnecting from ", socket.otherName);
                var conn = allSockets[socket.otherName];
                allUsers[socket.otherName] = true;// 另一个用户改为未通话状态
                socket.otherName = null;
                if (conn != null) {
                    // 向另一端用户发送离开消息
                    sendTo(conn, {
                        type: "leave"
                    });
                }
            }
        }
    });
});

// 广播发送用户信息，这里是向所有用户发送，因为使用的是io
function sendUserInfo(allUsers) {
    sendTo(io, {
        "event": "show",
        "allUsers": allUsers,
    });
}

// 发送一个消息
function sendTo(connection, message) {
    connection.send(message);
}