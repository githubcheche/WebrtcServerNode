var express = require('express');
var app = express();
var http = require('http');
var fs = require('fs');
var IO = require('socket.io');

var server = http.createServer(app).listen(3000);
console.log("The HTTPS server is up and running");

var io = IO(server);
console.log("Socket Secure server is up and running.");