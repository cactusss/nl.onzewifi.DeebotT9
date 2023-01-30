/*
Copyright 2018 - 2020, Robin de Gruijter (gruijter@hotmail.com)
This file is part of com.gruijter.clusterlights.
com.gruijter.clsterlights is free software: you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.
com.gruijter.clusterlights is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU General Public License for more details.
You should have received a copy of the GNU General Public License
along with com.gruijter.clusterlights. If not, see <http://www.gnu.org/licenses/>.
*/

'use strict';

const StdOutFixture = require('fixture-stdout');
const fs = require('fs');

class captureLogs {

	constructor(opts) {
		this.homey = opts.homey;
		this.logName = opts.name || 'log';
		this.logLength = opts.length || 1000;
		this.logFile = `/userdata/${this.logName}.json`;
		this.logArray = [];
		this.captureStdOut();
		this.captureStdErr();
		this.getLogs();
	}


	getLogs() {
		try {
			const log = fs.readFileSync(this.logFile, 'utf8');
			this.logArray = JSON.parse(log);
			return this.logArray;
		} catch (error) {
			if (error.message.includes('ENOENT')) return [];
			console.log('[err] error parsing logfile: ', error.message);
			return [];
		}
	}

	saveLogs() {
		try {
			fs.writeFileSync(this.logFile, JSON.stringify(this.logArray));
			return true;
		} catch (error) {
			console.log('[err] error writing logfile: ', error.message);
			return false;
		}
	}

	deleteLogs() {
		try {
			this.logArray = [];
			fs.writeFileSync(this.logFile, JSON.stringify(this.logArray), { encoding: 'utf8', flag: 'w' })
			return true;
		} catch (error) {
			if (error.message.includes('ENOENT')) return false;
			console.log('[err] error deleting logfile: ', error.message);
			return false;
		}
	}

	captureStdOut() {
		this.captureStdout = new StdOutFixture({ stream: process.stdout });
		this.captureStdout.capture((string) => {
			if (string.substring(0, 5) !== '[log]') {
				string = '[log] ' + this.formatDate(new Date()) + ' [Libraries] ' + string
			}
			if (this.logArray.length >= this.logLength) {
				this.logArray.shift();
			}
			this.logArray.push(string);
		});
	}

	captureStdErr() {
		this.captureStderr = new StdOutFixture({ stream: process.stderr });
		this.captureStderr.capture((string) => {
			if (string.substring(0, 5) !== '[err]') {
				string = '[err] ' + this.formatDate(new Date()) + ' [Libraries] ' + string
			}
			if (this.logArray.length >= this.logLength) {
				this.logArray.shift();
			}
			this.logArray.push(string);
		});
	}

	releaseStdOut() {
		this.captureStdout.release();
	}

	releaseStdErr() {
		this.captureStderr.release();
	}

	padTo2Digits(num) {
		return num.toString().padStart(2, '0');
	}

	formatDate(date) {
		return (
			[
				date.getFullYear(),
				this.padTo2Digits(date.getMonth() + 1),
				this.padTo2Digits(date.getDate()),
			].join('-') +
			' ' +
			[
				this.padTo2Digits(date.getHours()),
				this.padTo2Digits(date.getMinutes()),
				this.padTo2Digits(date.getSeconds()),
			].join(':')
		);
	}

}

module.exports = captureLogs;