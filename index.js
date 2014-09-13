var express = require('express')
,	router = express.Router()

module.exports = function REST (collection, options, debug) {
	
	// Set defaults
	var defaults = {
		// Only listed methods will be routed
		methods: ['get', 'post', 'put', 'delete'],
		// Called before quering the database
		validate: function (method, req, res, debug) {
			/*
				Filter the req.body, check for some session
				variable or whatever.
			*/
			if (req.accepts('json')) {
				if (debug)
					console.log(method, 'validated')
				return true
			} else {
				if (debug) {
					res.json({error: 'validation error'})
					console.log(method, 'validation error')
				} else {
					res.statusCode(400).json({error: 'bad request'})
				}
				return false
			}
		},
		// Called when the query is completed
		success: function (method, data, req, res, debug) {
			res.json({data: data})
			res.end()
			if (debug)
				console.log(method, 'success', data)
		},
		// Called if there is any nedb error
		error: function (method, err, req, res, debug) {
			if (debug) {
				res.json({error: err, method: method, type: 'nedb error'})
				console.log(method, 'nedb error', err)
			} else {
				res.statusCode(500).json({error: 'internal error'})
			}
		},
		// All the querying is in a try-catch block. If any error is thrown this function is called
		internalError: function (method, err, req, res, debug) {
			if (debug) {
				res.json({error: err, method: method, type: 'internal error'})
				console.log(method, 'internal error',err)
			} else {
				res.statusCode(500).json({error: 'internal error'})
			}
		}
	}

	// Validate options
	if (!options || typeof options != 'object') {
		// Just set defaults
		options = defaults
	} else {
		// Set mising defaults
		Object.keys(defaults).forEach(function (key) {
			if (!options[key])
				options[key] = defaults[key]
		})
	}

	function fixRegex (query) {
		// Set $regex fields to a real RegExp instance
		if (query) {
			Object.keys(query).forEach(function (k) {
				if (typeof(query[k]) == 'object') {
					Object.keys(query[k]).forEach(function (subK) {
						if (subK == '$regex')
							query[k][subK] = new RegExp(query[k][subK])
					})
				}
			})
		}
		
		return query
	}
	
	// Interface functions
	function get (req, res) {
		req.query.query = fixRegex(req.query.query)
		
		if (req.query.count) {
			collection.count(req.query.query || {}, function (err, count) {
				console.log('get callback', err, count)
				if (err) {
					options.error('get', err, req, res, debug)
				} else {
					options.success('get', count, req, res, debug)
				}
			})
		} else {
			var cursor = null
			
			// Projection
			if (options.projection || req.query.projection) {
				var projection = {}
				
				if (options.projection && req.query.projection) {
					// Override any projection set on options
					Object.keys(req.query.projection, function (rKey) {
						var val = req.query.projection[rKey]
						Object.keys(opts.projection, function (oKey) {
							if (rKey == oKey)
								val = opts.projection[oKey]
						})
						projection[rKey] = val
					})
				} else if (req.query.projection){
					projection = req.query.projection
				} else {
					projection = options.projection
				}
			
			// Setup the cursor
				cursor = collection.find(req.query.query || {}, projection)
			} else {
				cursor = collection.find(req.query.query || {})
			}

			// Skip
			if (req.query.skip)
				cursor = cursor.skip(req.query.skip)

			// Limit
			if (options.limit || req.query.limit) {
				var limit = 0
				// options.limit always have to be greater than the req.limit
				// otherwise it's overrided
				if (options.limit && req.query.limit) {
					if (options.limit < req.query.limit) {
						limit = options.limit
					} else {
						limit = req.limit
					}
				} else {
					if (options.limit) {
						limit = options.limit
					} else {
						limit = req.limit
					}
				}
				cursor = cursor.limit(limit)
			}

			// Sort
			if (req.query.sort)
				cursor = cursor.sort(req.query.sort)

			// Execute the query
			cursor.exec(function (err, docs) {
				if (err) {
					options.error('get', err, req, res, debug)
				} else {
					options.success('get', docs, req, res, debug)
				}
			})
		}
	}

	function post (req, res) {
		console.log('post process', req.body)
		collection.insert(req.body.query, function (err, newDoc) {
			if (err) {
				options.error('post', err, req, res, debug)
			} else {
				options.success('post', newDoc, req, res, debug)
			}
		})
	}

	function put (req, res) {
		var putopts = {}
		
		req.body.query = fixRegex(req.body.query)
		
		if (req.body.upsert)
			putopts.upsert = true
			
		if (req.body.multi)
			putopts.multi = true
			
		collection.update(req.body.query || {}, req.body.update, putopts, function (err, count, newDoc) {
			if (err) {
				options.error('post', err, req, res)
			} else {
				if (newDoc) {
					data.newDoc = newDoc
					options.success('put', {count: count, newDoc: newDoc}, req, res, debug)
				} else {
					options.success('put', count, req, res, debug)
				}
			}
		})
	}

	function del (req, res) {
		var delopts = {}
		
		if (req.body.multi)
			delopts.multi = true;
			
		collection.remove(req.body.query, delopts, function (err, count) {
			if (err) {
				options.error('delete', err, req, res, debug)
			} else {
				options.success('delete', count, req, res, debug)
			}
		})
	}

	// method to action map
	var methodToAction = [
		{method: 'get', action: get},
		{method: 'post', action: post},
		{method: 'put', action: put},
		{method: 'delete', action: del}
	]

	// Setup routes
	methodToAction.filter(function (o) {
		var available = false
		
		options.methods.forEach(function (method) {
			if (method == o.method)
				available = true
		})
		
		return available
	}).forEach(function (o) {
		router[o.method]('/', function (req, res) {
			try {
				// Handle get/delete
				if (o.method == 'get') {
					req.query = JSON.parse(req.query.json)
					req.body = req.query
				} else {
					req.body = JSON.parse(req.body.json)
				}

				if (options.validate(o.method, req, res, debug))
					o.action(req, res)
			} catch (err) {
				options.internalError(o.method, err, req, res, debug)
			}
		})
	})
	
	return router	
}
