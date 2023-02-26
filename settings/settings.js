/* eslint-disable no-unused-vars */
/* eslint-disable no-undef */
function displayLogs(lines) {
	$('#loglines').html(lines);
}

function refreshLogs() {
	try {
		Homey.api('GET', 'getlogs/', null, (err, result) => {
			if (!err) {
				let lines = '';
				if (document.getElementById("verbose").checked) {
					result
						.reverse()
						.forEach((line) => {
							const logLine = line
							lines += `${logLine}<br />`;
						});
				} else {
					result
						.reverse()
						.forEach((line) => {
							const logLine = line
								.replace('[Deebot] ', '')
								.replace('[ManagerDrivers] ', '')
								.replace('[Driver:Deebot] ', '')
								.replace('[Libraries] ', '')
								.replace(/\[Device:.*\]/g, '');
							lines += `${logLine}<br />`;

						});
				}
				document.getElementById("loglines").innerHTML = lines;
			} else {
				displayLogs(err);
			}
		});
	} catch (e) {
		displayLogs(e);
	}
}

function deleteLogs() {
	Homey.confirm(Homey.__('settings.deleteWarning'), 'warning', (error, result) => {
		if (result) {
			Homey.api('GET', 'deletelogs/', null, (err) => {
				if (err) {
					Homey.alert(err.message, 'error'); // [, String icon], Function callback )
				} else {
					Homey.alert(Homey.__('settings.deleted'), 'info');
					refreshLogs();
				}
			});
		}
	});
}

function openSettings() {
	document.getElementById('div-log').classList.toggle('blur-filter');
	document.getElementById('div-buttons').classList.toggle('blur-filter');
	document.getElementById('btn_update').disabled = true
	document.getElementById('btn_delete').disabled = true
	document.getElementById('btn_settings').disabled = true
	document.getElementById('settings').classList.toggle('hidden');
}

function closeSettings() {
	document.getElementById('div-log').classList.toggle('blur-filter');
	document.getElementById('div-buttons').classList.toggle('blur-filter');
	document.getElementById('btn_update').disabled = false
	document.getElementById('btn_delete').disabled = false
	document.getElementById('btn_settings').disabled = false
	document.getElementById('settings').classList.toggle('hidden');
}

function checkboxAppDebug(checkbox) {
	console.log('checkboxAppDebug:' + checkbox.checked)
	Homey.set("appdebug", checkbox.checked, function (err) {
		if (err) return Homey.alert(err);
	});
};

function checkboxLibDebug(checkbox) {
	console.log('checkboxAppDebug:' + checkbox.checked)
	Homey.set("libdebug", checkbox.checked, function (err) {
		if (err) return Homey.alert(err);
	});
};

function checkboxVerbose(checkbox) {
	console.log('checkboxLibDebug:' + checkbox.checked)
	Homey.set("verbose", checkbox.checked, function (err) {
		if (err) return Homey.alert(err);
	});
	refreshLogs();
};

function checkboxWrap(checkbox) {
	console.log('checkboxWrap:' + checkbox.checked)
	Homey.set("wrap", checkbox.checked, function (err) {
		if (err) return Homey.alert(err);
	});
	document.getElementById('loglines').classList.toggle('nowrap')
};

function checkboxAutoRefresh(checkbox) {
	console.log('checkboxAutoRefresh:' + checkbox.checked)
	Homey.set("autorefresh", checkbox.checked, function (err) {
		if (err) return Homey.alert(err);
	});
	if (checkbox.checked) {
		if (window.refreshInterval) {
			clearInterval(window.refreshInterval);
		}
		console.log('Starting autoRefresh...')
		window.refreshInterval = setInterval(function () { refreshLogs() }, 5000);
	} else {
		console.log('Stopping autoRefresh...')
		clearInterval(window.refreshInterval);
	}
};

function onHomeyReady(Homey) {
	//Homey = homeyReady;
	document.getElementsByTagName("link")[1].remove();
	Homey.ready();

	Homey.get("appdebug", function (err, appdebug) {
		if (err) return Homey.alert(err);
		document.getElementById("appdebug").checked = appdebug
	});

	Homey.get("libdebug", function (err, libdebug) {
		if (err) return Homey.alert(err);
		document.getElementById("libdebug").checked = libdebug
	});

	Homey.get("verbose", function (err, verbose) {
		if (err) return Homey.alert(err);
		document.getElementById("verbose").checked = verbose;
	});

	Homey.get("wrap", function (err, wrap) {
		if (err) return Homey.alert(err);
		document.getElementById("wrap").checked = wrap;
		if (wrap) {
			//default is nowrap, so toggle nowrap
			document.getElementById('loglines').classList.toggle('nowrap');
		}
	});

	Homey.get("autorefresh", function (err, autorefresh) {
		if (err) return Homey.alert(err);
		document.getElementById("autorefresh").checked = autorefresh;
		if (autorefresh) { var refreshInterval = setInterval(function () { refreshLogs() }, 5000) }
	});

	document.getElementById("savesettings").addEventListener("click", function (e) {
		closeSettings();
	});
	
	refreshLogs();
}
