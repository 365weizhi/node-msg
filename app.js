var io = require('socket.io').listen(3000);

var dbUrl = 'mongodb://localhost/chats_dev';
var mongoskin = require('mongoskin');
var noop = function () {};
var db = mongoskin.db(dbUrl);
db.bind('users');
db.bind('chats');
db.bind('notice');
db.chats.ensureIndex({ finished: 1 }, noop);
db.notice.ensureIndex({ finished: 1 }, noop);
db.users.ensureIndex({ finished: 1}, noop);


io.sockets.on('connection', function (socket) {
	var user_id;
	
	/**
	 * 先到数据库搜索是否有登陆记录，然后更新登陆信息，
	 */
	socket.on('user-connect', function(data){
		user_id = data.user_id;
		db.users.findOne({ id: user_id }, function(err, _data){
			if(_data)
				db.users.update({ id: user_id }, {$set: {socket_id: socket.id}}, true, false);
			else {
				db.users.save({ id: user_id, socket_id: socket.id },
					function(err, row) {
						if(err) socket.emit('error', {code: "failed", msg: "chat room error"});
					}
				);
			}
		});
	});
	
	/**
	 * 如果disconnect则从数据库删除记录
	 */
	socket.on('disconnect', function () {
		db.users.remove({id:user_id});
		socket.emit('disconnect', {code: "success", msg: "in room"});
		console.log("disconnect");
  });
	
	/**
	 * 获取历史聊天记录
	 */
	socket.on('chat-history-request', function (data) {
		var id = "";
		if(data.user_id-data.fellow_id>0)
			id = data.fellow_id+"&"+data.user_id;
		else 
			id = data.user_id+"&"+data.fellow_id;
			
		db.chats.findOne({ id: id },
			function (err, _data) {
				if(_data)
					socket.emit('chat-history-response', {code: "success", history: _data});
				else 
					socket.emit('chat-history-response', {code: "failed"});
			}
		);
	});
	
	/**
	 * 如果已经有聊天记录就更新，如果没有就保存 
	 */
	socket.on('chat-send-request', function(data){
		if(data.message == "")
			socket.emit('chat-send-response', {code: "failed", msg: "empty"});
		var id = "";
		var inc = {};
		var new_n = 1;
		if(data.user_id-data.fellow_id>0){
			id = data.fellow_id+"&"+data.user_id;
			inc['new_2'] = 1;
			inc['total_2'] = 1;
		}
		else {
			id = data.user_id+"&"+data.fellow_id;
			inc['new_1'] = 1;
			inc['total_1'] = 1;
		}
		
		var time = new Date().getTime();
		
		var rt_obj = {};
		rt_obj[data.user_id + ":" + time] = data.message;
		
		// data.id 为类似 3&6 的字符串，表示3和6的聊天记录
		db.chats.findOne({ id: id },
			function (err, _data) {
				if(_data){
					if(data.user_id-data.fellow_id>0)
						new_n = _data['new_2'];
					else 
						new_n = _data['new_1'];
						
					db.chats.update({ id: id }, {$push: {content: rt_obj}, $inc: inc}, false, false);
					socket.emit('chat-send-response', {code: "success", msg: "send success", message: rt_obj });
					notice(data.user_id, data.fellow_id, new_n, rt_obj);
				}
				else {
					var arr = Array();arr.push(rt_obj);
					db.chats.save({ id: id , content: arr, new_1: 0, new_2: 0, total_1: 0, total_2: 0 },
						function(err, row) {
							if(err) 
								socket.emit('chat-send-response', {code: "failed", msg: "save failed"});
							else {
								socket.emit('chat-send-response', {code: "success", msg: "send success" , message: rt_obj });
								notice(data.user_id, data.fellow_id, new_n, rt_obj);
							}
						}
					);
				}
			}
		);
	});
	
	/**
	 * 如果用户收到了信息，标记为已读，然后刷新数据库
	 */
	socket.on('chat-notice-response', function(data){
		var inc = {};
		if(data.user_id - data.fellow_id > 0){
			id = data.fellow_id+"&"+data.user_id;
			inc['new_1'] = 0;
		}
		else {
			id = data.user_id+"&"+data.fellow_id;
			inc['new_2'] = 0;
		}
		db.chats.update({ id: id }, {$set: inc}, false, false);
		
		db.users.findOne({ id: data.fellow_id }, function(err, _data){
			if(_data)	//当用户在线的时候才发送信息
				io.sockets.sockets[_data.socket_id].emit('chat-notice-response', {user_id: data.user_id, fellow_id: data.fellow_id});
		});
	});
});

function notice(user_id, fellow_id, new_n, rt_obj){
	db.users.findOne({ id: fellow_id }, function(err, _data){
		if(_data) {
			io.sockets.sockets[_data.socket_id].emit('chat-notice-request', { from: user_id, new_n:new_n , message: rt_obj});
		}
	});
}
/*
	socket.on('chat-status-request', function(data){
		db.chats.find({user_id:"2", new: {$gt: 0}}, {new:''}).toArray(function(err, data){
			var num = 0;
			for(var i in data){
				num += data[i].new;
			}
			db.users.find({}, {id:''}).toArray(function(err,data){
				socket.emit('chat-status-response', {count: num, });
				console.log(data);
			});
		});
	});
db.chats.findOne({ id: "3&4" }, { content: {$slice: 3}},
	function (err, _data) {
		for(var row in _data.content){
			console.log(_data.content[row]);
			
			for(var msg in _data.content[row]){
				console.log(msg);
				console.log(_data.content[row][msg]);
			}
		}
		
		_data.content.push({ '4:1362294027619': 'testttt' });
		console.log(_data);
		
		var time = new Date().getTime();
		var user_id = "1";
		var rt_obj = {};
		rt_obj[user_id + ":" + time] = "tes";
		db.chats.update({ id: "3&4" }, {$push: {content: rt_obj}, $inc: {new: 1}}, true, false);
		var arr = Array();
		arr.push(rt_obj);
		db.chats.save({
				id: "1&3",
				content: arr,
				new: 1,
			},
			function(err, row) {
			}
		);
	}
);
*/