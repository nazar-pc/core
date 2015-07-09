/*
 * Copyright (c) 2015
 *
 * This file is licensed under the Affero General Public License version 3
 * or later.
 *
 * See the COPYING-README file.
 *
 */

(function(OC) {

	var FileInfo = function(data) {
		if (!_.isUndefined(data.id)) {
			this.id = parseInt(data.id, 10);
		}

		// TODO: normalize path
		this.path = data.path || '';
		this.name = data.name;

		this.mtime = data.mtime;
		this.etag = data.etag;
		this.permissions = data.permissions;
		this.size = data.size;
		this.mimeType = data.mimeType || 'application/octet-stream';
		this.mountType = data.mountType;
		this.icon = data.icon;
		this.isPreviewAvailable = data.isPreviewAvailable;
		this._props = data._props;

		if (data.type) {
			this.type = data.type;
		} else if (this.mimeType === 'httpd/unix-directory') {
			this.type = 'dir';
		} else {
			this.type = 'file';
		}

		if (!this.mimeType) {
			if (this.type === 'dir') {
				this.mimeType = 'httpd/unix-directory';
			} else {
				this.mimeType = 'application/octet-stream';
			}
		}

		if (_.isUndefined(this.isPreviewAvailable)) {
			this.isPreviewAvailable = (this.type === 'file' && !this.icon);
		}
	};

	FileInfo.prototype = {
		/**
		 * File id
		 *
		 * @type int
		 */
		id: null,

		/**
		 * File name
		 *
		 * @type String
		 */
		name: null,

		/**
		 * Path leading to the file, without the file name.
		 *
		 * @type String
		 */
		path: null,

		/**
		 * Mime type
		 *
		 * @type String
		 */
		mimetype: null,

		/**
		 * Icon URL.
		 *
		 * Can be used to override the mime type icon.
		 *
		 * @type String
		 */
		icon: null,

		/**
		 * File type. 'file'  for files, 'dir' for directories.
		 *
		 * @type String
		 * @deprecated rely on mimetype instead
		 */
		type: 'file',

		/**
		 * Permissions.
		 *
		 * @see OC#PERMISSION_ALL for permissions
		 * @type int
		 */
		permissions: null,

		/**
		 * Modification time
		 *
		 * @type int
		 */
		mtime: null,

		/**
		 * Etag
		 *
		 * @type String
		 */
		etag: null,

		/**
		 * Mount type.
		 *
		 * One of null, "external-root", "shared" or "shared-root"
		 *
		 * @type string
		 */
		mountType: null,

		/**
		 * Whether previews are supported for this file's mime type
		 *
		 * @type boolean
		 * @deprecated infer from mime type
		 */
		isPreviewAvailable: false,

		/**
		 * URL path to the mime type icon
		 *
		 * @deprecated infer from the mime type
		 */
		icon: null
	};

	if (!OC.Files) {
		/**
		 * @namespace OC.Files
		 */
		OC.Files = {};
	}
	OC.Files.FileInfo = FileInfo;
})(OC);

