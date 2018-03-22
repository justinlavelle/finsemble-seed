
var helpers = require('./helpers');
var pathMatch = helpers.pathMatch;
var io = require('socket.io')();

function webpackHotMiddleware(compiler, opts) {
	opts = opts || {};
	opts.log = typeof opts.log === 'undefined' ? console.log.bind(console) : opts.log;

	opts.heartbeat = opts.heartbeat || 10 * 1000;
	return setupHttpReload(compiler, opts);
}
//Makes our hot reloading use sockets
function webpackSocketHotMiddleware(compiler, opts) {
	opts = opts || {};
	opts.log = typeof opts.log === 'undefined' ? console.log.bind(console) : opts.log;
	opts.heartbeat = opts.heartbeat || 10 * 1000;
	return setupSocketReload(compiler, opts);

}

function setupHttpReload(compiler, opts) {
	var eventStream = createEventStream(opts.heartbeat);
	var latestStats = null;
	compiler.plugin("compile", function () {
		latestStats = null;

		if (opts.log) { opts.log("webpack building..."); }
		eventStream.publish({ action: "building" });
	});
	compiler.plugin("done", function (statsResult) {
		// Keep hold of latest stats so they can be propagated to new clients
		latestStats = statsResult;
		publishStats("built", latestStats, eventStream, opts.log);
	});

	opts.path = opts.path || '/__webpack_hmr';
	var middleware = function (req, res, next) {
		if (!pathMatch(req.url, opts.path)) { return next(); }
		eventStream.handler(req, res);
		if (latestStats) {
			// Explicitly not passing in `log` fn as we don't want to log again on
			// the server
			publishStats("sync", latestStats, eventStream);
		}
	};
	middleware.publish = eventStream.publish;
	return middleware;
}

function setupSocketReload(compiler, opts) {
	var eventStream = createSocketStream(opts);
	compiler.plugin("compile", function () {
		latestStats = null;
		if (opts.log) { opts.log("webpack building..."); }
		eventStream.publish({ action: "building" });
	});
	compiler.plugin("done", function (statsResult) {
		// Keep hold of latest stats so they can be propagated to new clients
		console.log("Webpack built, socket reload");
		latestStats = statsResult;
		publishStats("built", latestStats, eventStream, opts.log);
	});
	return eventStream;
}

function createEventStream(heartbeat) {
	var clientId = 0;
	var clients = {};
	function everyClient(fn) {
		Object.keys(clients).forEach(function (id) {
			fn(clients[id]);
		});
	}
	setInterval(function heartbeatTick() {
		everyClient(function (client) {
			client.write("data: \uD83D\uDC93\n\n");
		});
	}, heartbeat).unref();
	return {
		handler: function (req, res) {
			req.socket.setKeepAlive(true);
			res.writeHead(200, {
				'Access-Control-Allow-Origin': '*',
				'Content-Type': 'text/event-stream;charset=utf-8',
				'Cache-Control': 'no-cache, no-transform',
				'Connection': 'keep-alive',
				// While behind nginx, event stream should not be buffered:
				// http://nginx.org/docs/http/ngx_http_proxy_module.html#proxy_buffering
				'X-Accel-Buffering': 'no'
			});
			res.write('\n');
			var id = clientId++;
			clients[id] = res;
			req.on("close", function () {
				delete clients[id];
			});
		},
		publish: function (payload) {
			everyClient(function (client) {
				client.write("data: " + JSON.stringify(payload) + "\n\n");
			});
		}
	};
}


function createSocketStream(opts) {
	var clientId = 0;
	var clients = {};
	function everyClient(fn) {
		Object.keys(clients).forEach(function (id) {
			fn(clients[id]);
		});
	}
	if (opts.socketServer) {
		var io = opts.socketServer;
	} else {
		var io = require('socket.io').listen(opts.server);
	}
	io.on('connection', function (socket) {
		var id = clientId++;
		socket.on('disconnect', function () {
			delete clients[id];
		});
		clients[clientId] = socket;
	});


	setInterval(function heartbeatTick() {
		everyClient(function (client) {
			client.emit("data: \uD83D\uDC93\n\n");
		});
	}, opts.heartbeat).unref();
	return {

		publish: function (payload) {
			everyClient(function (client) {
				client.emit("data", JSON.stringify(payload));
			});
		}
	};
}

function publishStats(action, statsResult, eventStream, log) {
	// For multi-compiler, stats will be an object with a 'children' array of stats
	var bundles = extractBundles(statsResult.toJson({ errorDetails: false }));
	bundles.forEach(function (stats) {
		if (log) {
			//log("webpack built " + (stats.name ? stats.name + " " : "") +
			// stats.hash + " in " + stats.time + "ms");
		}
		eventStream.publish({
			name: stats.name,
			action: action,
			time: stats.time,
			hash: stats.hash,
			warnings: stats.warnings || [],
			errors: stats.errors || [],
			modules: buildModuleMap(stats.modules)
		});
	});
}

function extractBundles(stats) {
	// Stats has modules, single bundle
	if (stats.modules) { return [stats]; }

	// Stats has children, multiple bundles
	if (stats.children && stats.children.length) { return stats.children; }

	// Not sure, assume single
	return [stats];
}

function buildModuleMap(modules) {
	var map = {};
	modules.forEach(function (module) {
		map[module.id] = module.name;
	});
	return map;
}

module.exports = {
	webpackHotMiddleware: webpackHotMiddleware,
	webpackSocketHotMiddleware: webpackSocketHotMiddleware
};