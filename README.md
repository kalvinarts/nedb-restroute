#nedb-restroute

###Automatic REST [express](https://github.com/strongloop/express) routing for [nedb](https://github.com/louischatriot/nedb) DataStores

###Contents
* [Description](#description)
* [Installation](#installation)
* [Usage](#usage)
* [Examples](#examples)
* [Options](#options)
	* [Default options](#default-options)
	* [Additional options](#additional-options)
	* [Debug flag](#debug-flag)
* [Querying the REST interface](#querying-the-rest-interface)
	* [GET (find, count)](#get-find-count)
	* [POST (insert)](#post-insert)
	* [PUT (update)](#put-update)
	* [DELETE (remove)](#delete-remove)
* [Notes](#notes)
	* [Design decisions](#design-decisions)
	* [ToDo](#todo)
	* [NotToDo](#nottodo)
	* [MongoDB](#mongodb)
	* [Related modules](#related-modules)
	* [Contributions](#contributions)
* [License](#license)

---

##Description

__nedb-restroute__ automatically creates a __REST API__ by mapping __[express](https://github.com/strongloop/express) HTTP methods__ to __[nedb](https://github.com/louischatriot/nedb) DataStore__ functions.

HTTP	| DataStore
---		| ---
GET		| find, count
POST	| insert
PUT		| update
DELETE	| remove

---

##Installation

```
cd node_modules
git clone https://github.com/kalvinarts/nedb-restroute
```

_Sorry no npm yet_

---

##Usage

__nedb-restroute__ returns an express.Router object. For more information see the [express.Router documentation](http://expressjs.com/api#router).

`new REST(nedbDataStore, options, debug)`

_Note that there is not any option passed to the express.Router when the new instance is created._

Arguments:

* __nedbDataStore:__ a nedb DataStore for which to create the REST interface
* __options:__ see the [options section of this document](#options)
* __debug:__ see the [Debug flag section of this document](#debug-flag)

---

##Examples

The best way to understand anything ;)

A simple one:

```javascript
var app = require('express')
,	DataStore = require('nedb')
,	documents = new DataStore({filename: '/path/to/documents.db', autoload: true})
,	REST = require('nedb-restroute')

app.use('/api/documents', new REST(documents))
```

A more advanced example that creates two routers, one for client querying and another for administration purposes:

```javascript
var app = require('express')
,	DataStore = require('nedb')
,	documents = new DataStore({filename: '/path/to/documents.db', autoload: true})
,	REST = require('nedb-restroute')

app.use('/documents', new REST(documents, {
	methods: ['get'], 		// Only the GET (find, count) method
	limit: 100,				// Limit results to 100
	projection: {_id: 0}	// Exclude the '_id' field from the results
}))
app.use('/admin/documents', new REST(documents, { 
	validate: function (method, req, res) {
		if (req.is('json')) {
			if (req.session.isAdmin) {
				return true
			} else {
				res.statusCode(550).json({error: 'Permision denied.'})
			}
		} else {
			res.statusCode(400).json({error: 'Bad request.'})
		}
		return false
	}
}))
```

---

##Options

###Default options

* __methods:__ _(Array)_ List of the HTTP methods to be automatically implemented.
* __validate:__ _(Function)_ Check anything you want and return false if the request don't pass your validation.
* __success:__ _(Function)_ Called after the a succesful query.
* __error:__ _(Function)_ Called if nedb returns an error.
* __internalError:__ _(Function)_ Called if any javascript error is thrown.

The default options can be overriden passing an options object as a second argument.

Any missing options will fall back to the defaults which are:

```javascript
{
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
```

###Additional options

The following additional options default to `undefined` if not set:

* __limit:__ _(Nubmer)_ Limits the number of returned documents
* __projection:__ _(Object)_ Filters fields in the returned documents (see the [nedb documentation](https://github.com/louischatriot/nedb#projections))

###Debug flag

If you pass a third value to nedb-restroute function a `true` __debug__ argument will be set to the _validate_, _success_, _error_ and _internalError_ functions. 

---

##Querying the REST interface

To query the REST interface for your DataStore send a JSON object with the following format:

```json
{
	"json": "JSON_stringifyied_options"
}
```

The value of the `json` property will be a stringifyied JSON of the __options__ object to query the DataStore ([You can read the explanation of this design decision below](#design-decisions)). All the examples below will omit the first level object with the `json` property and focus on its value, the __options__ object.

The response of all queries will be a JSON object with the query results set on a `data` property and errors set on an `error`property. This can be changed overriding the default options with custom functions. [See above](#default-options)

###GET (find, count)

####Options
* __query:__ _(Object)_ The query to be matched
* __count:__ _(Boolean)_ Returns a count of the matched documents instead of the results array

The following options will __not__ take effect if the `count` option is set and will be executed in the same order as listed here:

* __projection:__ _(Object)_ Filters document fields \* \*\*
* __limit:__ _(Number)_ Limits the number of results \*
* __skip:__ _(Number)_ Skip _n_ results
* __sort:__ _(Object)_ Sorts by field

_\* Overriden by the server side option with same name if set._

_\*\* Will only be overriden if the `limit` is greater than the server side `limit` option._

To understand how these options work see the [nedb documentation](https://github.com/louischatriot/nedb#sorting-and-paginating)

All the nedb [operators](https://github.com/louischatriot/nedb#operators-lt-lte-gt-gte-in-nin-ne-exists-regex) and [logical operators](https://github.com/louischatriot/nedb#logical-operators-or-and-not-where) can be used with the only exception of the `$where` logical operator, to avoid evaluation of any javacsript code submited to the interface.

####Examples
Get the number of people older than 18:
```json

{
	"query": {
		"age": {"$gt": 18}
	},
	"count": true
}
```

Get the names of the people younger than 30 an limit output to 50 filtering out the `_id` field:
```json
{
	"query": {
		"age": {"$lt": 30}
	},
	"projection": {"_id": 0},
	"limit": 50
}
``` 

###POST (insert)

####Options
* __query:__ _(Object)_ The document/documents to be inserted

####Expamples
Put the document to be inserted in the query property:

```json
{
	"query": {
		"name": "Kalvin",
		"age": 30
	}
}
```

Or for multiple documents:

```json
{
	"query": [
		{
			"name": "Pau",
			"age": 28
		},
		{
			"name": "Tamara",
			"age": 30
		}
	]
}
```

###PUT (update)

####Options
* __query:__ _(Object)_ The query to be matched
* __update:__ _(Object)_ The object with the update to apply to the documents matched by the query object
* __multi:__ _(Boolean)_ Update more than one document
* __upsert:__ _(Boolean)_ Insert if the query is not matched


####Example
```json
{
	"query" : {
		"age": {"$gt": 18}
	},
	"update": {
		"$set": {"canDrink": true}
	},
	"multi": true
}
```

See the [nedb documentation](https://github.com/louischatriot/nedb#updating-documents) if you are not sure of how updates work.

###DELETE (remove)

####Options
* __query:__ _(Object)_ The query to be matched
* __multi:__ (Boolean) Remove more than one document


####Example
```json
{
	"query": {
		"party": "PP"
	},
	multi: true
}
````

---

##Notes

This is a work in progress experimental module. Expect some changes and things not working properly.

If you think that something on this documentation is unclear or not well explained open an issue to discuss it.

###Design decisions

After some testing I found out that all `Number` values where casted to `String` by the express bodyParser so I decided to stringify the __options__ object and parse it on the server to avoid this issue.

It's a real shame because I wanted to keep the querying as simple as posible from the begining... :(

By the moment I have some work done on browser and server modules to make as simple as posible the querying of the REST interface. When done will be added to the [Related modules](#related-modules) section.

###MongoDB

As far as I know the [nedb](https://github.com/louischatriot/nedb) API mimics a subset of the [MongoDB Node.JS driver](https://github.com/mongodb/node-mongodb-native) (only json primitives), and maybe you can pass a MongoDB collection instead of a nedb DataStore to be RESTifyed ;)

I haven't tested it yet... let me know if you do!

###ToDo

* A lot of testing to ensure everything works.
* Submit to NPM.
* I'm not sure but maybe I will add a `router` parameter to the constructor and remove the express dependency.

###NotToDo

* Extend this module to work with MongoDB non-JSON primitives or with parts of the API not covered by the [nedb](https://github.com/louischatriot/nedb) API. If you fork the project to add this feature let me know ;)

###Related modules

* (nedb)[https://github.com/louischatriot/nedb]: The awesome work that motivated all this project

###Contributions

If you want to contribute, any bug found, issue fix and/or bitcoin sent to

>1CfxjtyqukDEsfxkdmXZpSLghXpDFK8Q9i

will be very much apreciated ;)

---
 
##License

```
The MIT License (MIT)

Copyright (c) 2014 Albert Calbet Martínez

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

