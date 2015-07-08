/*
 * Copyright (c) 2015
 *
 * This file is licensed under the Affero General Public License version 3
 * or later.
 *
 * See the COPYING-README file.
 *
 */

/* global nl */

(function(OC, FileInfo) {
	/**
	 * @class Client
	 * @classdesc
	 *
	 * @param {Object} options
	 * @param {String} options.host host name
	 * @param {int} [options.port] port
	 * @param {boolean} [useHTTPS] whether to use https 
	 * @param {String} [options.root] root path
	 */
	var Client = function(options) {
		this._root = options.root;

		if (!options.port) {
			// workaround in case port is null or empty
			options.port = undefined;
		}
		this.client = new nl.sara.webdav.Client(options);
	};

	Client.NS_OWNCLOUD = 'http://owncloud.org/ns';
	Client.NS_DAV = 'DAV:';
	Client._PROPFIND_PROPERTIES = [
		/**
		 * Modified time
		 */
		[Client.NS_DAV, 'getlastmodified'],
		/**
		 * Etag
		 */
		[Client.NS_DAV, 'getetag'],
		/**
		 * Mime type
		 */
		[Client.NS_DAV, 'getcontenttype'],
		/**
		 * Resource type "collection" for folders, empty otherwise
		 */
		[Client.NS_DAV, 'resourcetype'],
		/**
		 * Compound file id, contains fileid + server instance id
		 */
		[Client.NS_OWNCLOUD, 'id'],
		/**
		 * Letter-coded permissions
		 */
		[Client.NS_OWNCLOUD, 'permissions'],
		//[Client.NS_OWNCLOUD, 'downloadURL'],
		/**
		 * Folder sizes
		 */
		[Client.NS_OWNCLOUD, 'size'],
		/**
		 * File sizes
		 */
		[Client.NS_DAV, 'getcontentlength']
	];

	/**
	 * @memberof OCA.Files
	 */
	Client.prototype = {

		/**
		 * Join path sections
		 *
		 * @param {...String} path sections
		 *
		 * @return {String} path with leading slash and no trailing slash
		 */
		_buildPath: function() {
			var path = '';
			var lastArg = arguments[arguments.length - 1];
			var trailingSlash = lastArg.charAt(lastArg.length - 1) === '/';
			_.each(arguments, function(section) {
				// trim leading slashes
				while (section.charAt(0) === '/') {
					section = section.substr(1);
				}
				// trim trailing slashes
				while (section.charAt(section.length - 1) === '/') {
					section = section.substr(0, section.length - 1);
				}

				// TODO: replace doubled slashes

				path = path + '/' + section;
			});
			if (trailingSlash) {
				// add it back
				path += '/';
			}
			return path;
		},

		/**
		 * Parse headers string into a map
		 *
		 * @param {string} headersString headers list as string
		 *
		 * @return {Object.<String,Array>} map of header name to header contents
		 */
		_parseHeaders: function(headersString) {
			var headerRows = headersString.split('\n');
			var headers = {};
			for (var i = 0; i < headerRows.length; i++) {
				var sepPos = headerRows[i].indexOf(':');
				if (sepPos < 0) {
					continue;
				}

				var headerName = headerRows[i].substr(0, sepPos);
				var headerValue = headerRows[i].substr(sepPos + 2);

				if (!headers[headerName]) {
					// make it an array
					headers[headerName] = [];
				}

				headers[headerName].push(headerValue);
			}
			return headers;
		},

		/**
		 * Parses the compound file id
		 *
		 * @param {string} compoundFileId compound file id as returned by the server
		 *
		 * @return local file id, stripped of the instance id
		 */
		_parseFileId: function(compoundFileId) {
			if (!compoundFileId || compoundFileId.length < 8) {
				return null;
			}
			return parseInt(compoundFileId.substr(0, 8), 10);
		},

		/**
		 * Parse Webdav result
		 *
		 * @param {Object} response XML object
		 *
		 * @return {Array.<FileInfo>} array of file info
		 */
		_parseFileInfo: function(response) {
			var path = response.href;
			if (path.substr(0, this._root.length) === this._root) {
				path = path.substr(this._root.length);
			}

			if (path.charAt(path.length - 1) === '/') {
				path = path.substr(0, path.length - 1);
			}

			var data = {
				id: this._parseFileId(response.getProperty(Client.NS_OWNCLOUD, 'id').getParsedValue()),
				path: decodeURIComponent(path),
				mtime: response.getProperty(Client.NS_DAV, 'getlastmodified').getParsedValue(),
				etag: response.getProperty(Client.NS_DAV, 'getetag').getParsedValue(),
				_props: response
			};

			var sizeProp = response.getProperty(Client.NS_DAV, 'getcontentlength');
			if (sizeProp && sizeProp.status === 200) {
				data.size = parseInt(sizeProp.getParsedValue(), 10);
			}

			sizeProp = response.getProperty(Client.NS_OWNCLOUD, 'size');
			if (sizeProp && sizeProp.status === 200) {
				data.size = parseInt(sizeProp.getParsedValue(), 10);
			}
			
			var contentType = response.getProperty(Client.NS_DAV, 'getcontenttype');
			if (contentType && contentType.status === 200) {
				data.mimetype = contentType.getParsedValue();
			}

			var resType = response.getProperty(Client.NS_DAV, 'resourcetype');
			var isFile = true;
			if (!data.mimetype && resType && resType.status === 200 && resType.xmlvalue) {
				var xmlvalue = resType.xmlvalue[0];
				if (xmlvalue.namespaceURI === Client.NS_DAV && xmlvalue.localName === 'collection') {
					data.mimetype = 'httpd/unix-directory';
					isFile = false;
				}
			}

			var permissionProp = response.getProperty(Client.NS_OWNCLOUD, 'permissions');
			if (permissionProp && permissionProp.status === 200) {
				var permString = permissionProp.getParsedValue();
				data.permissions = OC.PERMISSION_READ;
				for (var i = 0; i < permString.length; i++) {
					var c = permString.charAt(i);
					switch (c) {
						// FIXME: twisted permissions
						case 'C':
						case 'K':
							data.permissions |= OC.PERMISSION_CREATE;
							if (!isFile) {
								data.permissions |= OC.PERMISSION_UPDATE;
							}
							break;
						case 'W':
							if (isFile) {
								// also add create permissions
								data.permissions |= OC.PERMISSION_CREATE;
							}
							data.permissions |= OC.PERMISSION_UPDATE;
							break;
						case 'D':
							data.permissions |= OC.PERMISSION_DELETE;
							break;
						case 'R':
							data.permissions |= OC.PERMISSION_SHARE;
							break;
						case 'M':
							data.isMount = true;
							break;
						case 'S':
							data.isShared = true;
							break;
					}
				}
			}

			return new FileInfo(data);
		},

		/**
		 * Parse Webdav multistatus
		 *
		 * @param {Object} response XML object
		 */
		_parseResult: function(response) {
			var self = this;
			var result = [];
			var names = response.getResponseNames();
			_.each(names, function(name) {
				result.push(self._parseFileInfo(response.getResponse(name)));
			});
			return result;
		},

		_isSuccessStatus: function(status) {
			return status >= 200 && status <= 299;
		},

		_getPropfindProperties: function() {
			if (!this._propfindProperties) {
				this._propfindProperties = _.map(Client._PROPFIND_PROPERTIES, function(propDef) {
					var prop = new nl.sara.webdav.Property();
					prop.namespace = propDef[0];
					prop.tagname = propDef[1];
					return prop;
				});
			}
			return this._propfindProperties;
		},

		/**
		 * Lists the contents of a directory
		 *
		 * @param {String} path path to retrieve
		 * @param {Object} [options] options
		 * @param {boolean} [options.includeParent=false] set to true to keep
		 * the parent folder in the result list
		 *
		 * @return {Promise} promise 
		 */
		getFolderContents: function(path, options) {
			if (!path) {
				path = '';
			}
			var self = this;
			var deferred = $.Deferred();
			var promise = deferred.promise();

			this.client.propfind(
				this._buildPath(this._root, path),
				function(status, body) {
					if (self._isSuccessStatus(status)) {
						var results = self._parseResult(body);
						if (!options || !options.includeParent) {
							// remove root dir, the first entry
							results.shift();
						}
						deferred.resolve(status, results);
					} else {
						deferred.reject(status);
					}
				},
				1,
				this._getPropfindProperties()
			);
			return promise;
		},

		/**
		 * Returns the file info of a given path.
		 *
		 * @param {String} path path 
		 * @param {Array} [properties] list of webdav properties to
		 * retrieve
		 *
		 * @return {Promise} promise
		 */
		getFileInfo: function(path) {
			if (!path) {
				path = '';
			}
			var self = this;
			var deferred = $.Deferred();
			var promise = deferred.promise();

			this.client.propfind(
				this._buildPath(this._root, path),
				function(status, body) {
					if (self._isSuccessStatus(status)) {
						deferred.resolve(status, self._parseResult(body)[0]);
					} else {
						deferred.reject(status);
					}
				},
				0,
				this._getPropfindProperties()
			);
			return promise;
		},

		/**
		 * Returns the contents of the given file.
		 *
		 * @param {String} path path to file
		 *
		 * @return {Promise}
		 */
		getFileContents: function(path) {
			if (!path) {
				throw 'Missing argument "path"';
			}
			var self = this;
			var deferred = $.Deferred();
			var promise = deferred.promise();

			this.client.get(
				this._buildPath(this._root, path),
				function(status, body) {
					if (self._isSuccessStatus(status)) {
						deferred.resolve(status, self._parseResult(body)[0]);
					} else {
						deferred.reject(status);
					}
				}
			);
			return promise;
		},

		/**
		 * Puts the given data into the given file.
		 *
		 * @param {String} path path to file
		 *
		 * @return {Promise}
		 */
		putFileContents: function(path, body) {
			if (!path) {
				throw 'Missing argument "path"';
			}
			var self = this;
			var deferred = $.Deferred();
			var promise = deferred.promise();

			this.client.put(
				this._buildPath(this._root, path),
				function(status) {
					if (self._isSuccessStatus(status)) {
						deferred.resolve(status);
					} else {
						deferred.reject(status);
					}
				},
				body || ''
			);
			return promise;
		},
		
		_simpleCall: function(method, path) {
			if (!path) {
				throw 'Missing argument "path"';
			}

			var self = this;
			var deferred = $.Deferred();
			var promise = deferred.promise();

			this.client[method](
				this._buildPath(this._root, path),
				function(status, body, responseHeadersString) {
					if (self._isSuccessStatus(status)) {
						// TODO: handle error cases like 404
						var headers = self._parseHeaders(responseHeadersString);
						var data = {};
						if (headers['OC-FileId']) {
							data.id = self._parseFileId(headers['OC-FileId'][0]);
						}

						deferred.resolve(status, data);
					} else {
						deferred.reject(status);
					}
				}
			);
			return promise;
		},

		/**
		 * Creates a directory
		 *
		 * @param {String} path path to create
		 *
		 * @return {Promise}
		 */
		createDirectory: function(path) {
			return this._simpleCall('mkcol', path);
		},

		/**
		 * Deletes a file or directory
		 *
		 * @param {String} path path to delete
		 *
		 * @return {Promise}
		 */
		remove: function(path) {
			return this._simpleCall('remove', path);
		},

		/**
		 * Moves path to another path
		 *
		 * @param {String} path path to move
		 * @param {String} destinationPath destination path
		 * @param {boolean} [allowOverwrite=false] true to allow overwriting,
		 * false otherwise
		 *
		 * @return {Promise} promise 
		 */
		move: function(path, destinationPath, allowOverwrite) {
			if (!path) {
				throw 'Missing argument "path"';
			}
			if (!destinationPath) {
				throw 'Missing argument "destinationPath"';
			}

			var self = this;
			var deferred = $.Deferred();
			var promise = deferred.promise();

			this.client.move(
				this._buildPath(this._root, path),
				function(status) {
					if (self._isSuccessStatus(status)) {
						deferred.resolve(status);
					} else {
						deferred.reject(status);
					}
				},
				this._buildPath(this._root, destinationPath),
				allowOverwrite ? nl.sara.webdav.Client.SILENT_OVERWRITE : nl.sara.webdav.Client.FAIL_ON_OVERWRITE
			);
			return promise;
		},

	};

	if (!OC.Files) {
		/**
		 * @namespace OC.Files
		 */
		OC.Files = {};
	}
	OC.Files.Client = Client;
})(OC, OC.Files.FileInfo);

