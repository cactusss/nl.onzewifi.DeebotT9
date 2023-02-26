'use strict';

const Homey = require('homey');
const Logger = require('./settings/captureLogs.js');
global.DeviceAPI = null;

class Deebot extends Homey.App {

	async onInit() {
		if (!this.logger) this.logger = new Logger({ homey: this.homey, length: 500 });

		global.appdebug		= this.homey.settings.get('appdebug')		|| false;
		global.libdebug		= this.homey.settings.get('libdebug')		|| false;
		global.verbose		= this.homey.settings.get('verbose')		|| false;
		global.wrap			= this.homey.settings.get('wrap')			|| false;
		global.autorefresh	= this.homey.settings.get('autorefresh')	|| false;
				
		process.on('unhandledRejection', (error) => {
			this.error('unhandledRejection! ', error);
		});

		process.on('uncaughtException', (error) => {
			this.error('uncaughtException! ', error);
		});

		this.log(`${Homey.manifest.id} V${Homey.manifest.version} is running...`);
		this.log(`Ecovacs Deebot is started`)

		if (libdebug) { 
			process.env.NODE_ENV = 'development'
		} else {
			process.env.NODE_ENV = 'production'
		}

		if (appdebug) { this.log('Settings:')}
		if (appdebug) { this.log('- appdebug: ' + appdebug) }
		if (appdebug) { this.log('- libdebug: ' + libdebug) }
		if (appdebug) { this.log('- verbose: ' + verbose) }
		if (appdebug) { this.log('- wrap: ' + wrap) }
		if (appdebug) { this.log('- autorefresh: ' + autorefresh) }

		this.homey.on('unload', () => {
			this.log(`${Homey.manifest.id} V${Homey.manifest.version} is stopping...`);
			this.log(`Ecovacs Deebot has stopped`)
			this.logger.saveLogs();
		})

		this.homey.settings.on('set', (function (dynamicVariableName) {
			eval(dynamicVariableName + " = this.homey.settings.get(dynamicVariableName)");
			if (appdebug) { this.log('Settings changed: ' + dynamicVariableName + ' set to ' + this.homey.settings.get(dynamicVariableName)) }
			if (dynamicVariableName = 'libdebug') {
				if (this.homey.settings.get('libdebug')) {
					process.env.NODE_ENV = 'development'
				} else {
					process.env.NODE_ENV = 'production'
				}
			}
		}).bind(this));

	}

	deleteLogs() {
		return this.logger.deleteLogs();
	}

	getLogs() {
		return this.logger.logArray;
	}
}

module.exports = Deebot;