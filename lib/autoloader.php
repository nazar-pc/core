<?php
/**
 * @author Andreas Fischer <bantu@owncloud.com>
 * @author Georg Ehrke <georg@owncloud.com>
 * @author Markus Goetz <markus@woboq.com>
 * @author Morris Jobke <hey@morrisjobke.de>
 * @author Robin Appelman <icewind@owncloud.com>
 * @author Thomas Müller <thomas.mueller@tmit.eu>
 * @author Victor Dubiniuk <dubiniuk@owncloud.com>
 *
 * @copyright Copyright (c) 2015, ownCloud, Inc.
 * @license AGPL-3.0
 *
 * This code is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License, version 3,
 * as published by the Free Software Foundation.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License, version 3,
 * along with this program.  If not, see <http://www.gnu.org/licenses/>
 *
 */

namespace OC;

class Autoloader {
	private $useGlobalClassPath = true;

	private $prefixPaths = array();

	private $classPaths = array();

	/**
	 * Optional low-latency memory cache for class to path mapping.
	 * @var \OC\Memcache\Cache
	 */
	protected $memoryCache;

	/**
	 * disable the usage of the global classpath \OC::$CLASSPATH
	 */
	public function disableGlobalClassPath() {
		$this->useGlobalClassPath = false;
	}

	/**
	 * enable the usage of the global classpath \OC::$CLASSPATH
	 */
	public function enableGlobalClassPath() {
		$this->useGlobalClassPath = true;
	}

	/**
	 * get the possible paths for a class
	 *
	 * @param string $class
	 * @return array|bool an array of possible paths or false if the class is not part of ownCloud
	 */
	public function findClass($class) {
		$class = trim($class, '\\');

		$paths = array();
		if (array_key_exists($class, $this->classPaths)) {
			$paths[] = $this->classPaths[$class];
		} else if ($this->useGlobalClassPath and array_key_exists($class, \OC::$CLASSPATH)) {
			$paths[] = \OC::$CLASSPATH[$class];
			/**
			 * @TODO: Remove this when necessary
			 * Remove "apps/" from inclusion path for smooth migration to mutli app dir
			 */
			if (strpos(\OC::$CLASSPATH[$class], 'apps/') === 0) {
				\OCP\Util::writeLog('core', 'include path for class "' . $class . '" starts with "apps/"', \OCP\Util::DEBUG);
				$paths[] = str_replace('apps/', '', \OC::$CLASSPATH[$class]);
			}
		} elseif (strpos($class, 'OC_') === 0) {
			// first check for legacy classes if underscores are used
			$paths[] = 'private/legacy/' . strtolower(str_replace('_', '/', substr($class, 3)) . '.php');
			$paths[] = 'private/' . strtolower(str_replace('_', '/', substr($class, 3)) . '.php');
		} elseif (strpos($class, 'OC\\') === 0) {
			$paths[] = 'private/' . strtolower(str_replace('\\', '/', substr($class, 3)) . '.php');
			$paths[] = strtolower(str_replace('\\', '/', substr($class, 3)) . '.php');
		} elseif (strpos($class, 'OCP\\') === 0) {
			$paths[] = 'public/' . strtolower(str_replace('\\', '/', substr($class, 4)) . '.php');
		} elseif (strpos($class, 'OCA\\') === 0) {
			list(, $app, $rest) = explode('\\', $class, 3);
			$app = strtolower($app);
			$appPath = \OC_App::getAppPath($app);
			if ($appPath && stream_resolve_include_path($appPath)) {
				$paths[] = $appPath . '/' . strtolower(str_replace('\\', '/', $rest) . '.php');
				// If not found in the root of the app directory, insert '/lib' after app id and try again.
				$paths[] = $appPath . '/lib/' . strtolower(str_replace('\\', '/', $rest) . '.php');
			}
		} elseif (strpos($class, 'Test_') === 0) {
			$paths[] = 'tests/lib/' . strtolower(str_replace('_', '/', substr($class, 5)) . '.php');
		} elseif (strpos($class, 'Test\\') === 0) {
			$paths[] = 'tests/lib/' . strtolower(str_replace('\\', '/', substr($class, 5)) . '.php');
		}
		return $paths;
	}

	/**
	 * Load the specified class
	 *
	 * @param string $class
	 * @return bool
	 */
	public function load($class) {
		$pathsToRequire = null;
		if ($this->memoryCache) {
			$pathsToRequire = $this->memoryCache->get($class);
		}

		if (!is_array($pathsToRequire)) {
			// No cache or cache miss
			$pathsToRequire = array();
			foreach ($this->findClass($class) as $path) {
				$fullPath = stream_resolve_include_path($path);
				if ($fullPath) {
					$pathsToRequire[] = $fullPath;
				}
			}

			if ($this->memoryCache) {
				$this->memoryCache->set($class, $pathsToRequire, 60); // cache 60 sec
			}
		}

		foreach ($pathsToRequire as $fullPath) {
			require_once $fullPath;
		}

		return false;
	}

	/**
	 * Sets the optional low-latency cache for class to path mapping.
	 * @param \OC\Memcache\Cache $memoryCache Instance of memory cache.
	 */
	public function setMemoryCache(\OC\Memcache\Cache $memoryCache = null) {
		$this->memoryCache = $memoryCache;
	}
}
