'use strict';

const { Device } = require('homey');
const tools = require('../../lib/tools');
const ecovacsDeebot = require('ecovacs-deebot');
const EcoVacsAPI = ecovacsDeebot.EcoVacsAPI;
const SYNC_INTERVAL = 1000 * 5;  // 5 seconds

class VacuumDevice extends Device {

	async onInit() {

		this.log('Device ' + this.getName() + ' has been initialized');

		let appdebug = this.homey.settings.get('appdebug') || true;
		let libdebug = this.homey.settings.get('libdebug') || false;
		let verbose = this.homey.settings.get('verbose') || false;
		let wrap = this.homey.settings.get('wrap') || false;
		let autorefresh = this.homey.settings.get('autorefresh') || true;

		this.homey.settings.on('set', (function (dynamicVariableName) {
			eval(dynamicVariableName + ' = this.homey.settings.get(dynamicVariableName)');
		}).bind(this));

		let api = global.DeviceAPI;
		if (api == null) {
			this.log('System reboot, reconnecting');
			this.driver.onRepair(null, this);
		} else {
			this.log('New device, congratulations!');
		}

		//this.registerCapabilityListener('onoff', this.onCapabilityOnoff.bind(this));
		this.registerCapabilityListener('alarm_tamper', this.onCapabilityAlert.bind(this));
		this.registerCapabilityListener('AutoClean', this.onCapabilityAutoClean.bind(this));
		this.registerCapabilityListener('PauseCleaning', this.onCapabilityPauseCleaning.bind(this));
		this.registerCapabilityListener('ReturnDock', this.onCapabilityReturnDock.bind(this));
		this.registerCapabilityListener('AutoEmpty', this.onCapabilityAutoEmpty.bind(this));
		this.registerCapabilityListener('VacuumPower', this.onCapabilityVacuumPower.bind(this));
		this.registerCapabilityListener('CleanCount', this.onCapabilityCleanCount.bind(this));
		this.registerCapabilityListener('WaterFlowLevel', this.onCapabilityWaterFlowLevel.bind(this));
		this.registerCapabilityListener('ScrubbingType', this.onCapabilityScrubbingType.bind(this));
		this.registerCapabilityListener('AromaMode', this.onCapabilityAromaMode.bind(this));

		this.setStoreValue('flowTokens', []).catch((error) => { this.error('Error: ' + error); });

		const actionAutoClean = this.homey.flow.getActionCard('AutoClean');
		actionAutoClean.registerRunListener(async (args, state) => {
			if (this.appdebug) { this.log('Cmd: vacbot.clean()'); }
			this.vacbot.clean();
		});

		const actionRetunrDock = this.homey.flow.getActionCard('ReturnDock');
		actionRetunrDock.registerRunListener(async (args, state) => {
			this.setCapabilityValue('ReturnDock', true).catch((error) => { this.error('Error: ' + error); });
			if (this.appdebug) { this.log('Cmd: vacbot.charge()'); }
			this.vacbot.charge();
		});

		const actionEmptyDustBin = this.homey.flow.getActionCard('EmptyDustBin');
		actionEmptyDustBin.registerRunListener(async (args, state) => {
			if (this.appdebug) { this.log('Cmd: vacbot.run(EmptyDustBin)'); }
			this.vacbot.run('EmptyDustBin');
		});

		const actionPauseCleaning = this.homey.flow.getActionCard('PauseCleaning');
		actionPauseCleaning.registerRunListener(async (args, state) => {
			this.setCapabilityValue('PauseCleaning', true).catch((error) => { this.error('Error: ' + error); });
			if (this.appdebug) { this.log('Cmd: vacbot.pause()'); }
			this.vacbot.pause();
		});

		const actionResumeCleaning = this.homey.flow.getActionCard('ResumeCleaning');
		actionResumeCleaning.registerRunListener(async (args, state) => {
			this.setCapabilityValue('PauseCleaning', false).catch((error) => { this.error('Error: ' + error); });
			if (this.appdebug) { this.log('Cmd: vacbot.resume()'); }
			this.vacbot.resume();
		});

		const actionSpotArea = this.homey.flow.getActionCard('SpotArea');
		actionSpotArea.registerArgumentAutocompleteListener('zone', this.flowAutocompleteactionSpotArea.bind(this));
		actionSpotArea.registerRunListener(async (args, state) => {
			if (args.zone) {
				if (this.appdebug) { this.log('Cmd: vacbot.spotArea(' + args.zone.id + ')'); }
				this.vacbot.spotArea(args.zone.id);
			}
		});

		const actionSpotAreas = this.homey.flow.getActionCard('SpotAreas');
		actionSpotAreas.registerRunListener(async (args, state) => {
			if (args.zones) {
				var currentMap = this.getStoreValue('currentMap');
				let Zones = [];
				if (args.zones.includes('[')) {
					// Asume flowtokens are being user, but remove anything that is not in the [x:y] format
					let ZoneTokens = args.zones.match(/\[(.*?)\]/g);
					if (ZoneTokens) {
						ZoneTokens.forEach(ZoneToken => {
							let floorRoom = ZoneToken.split(':');
							let Floor = parseInt(floorRoom[0].replace(/[\[\]]/g, ''));
							let Zone = parseInt(floorRoom[1].replace(/[\[\]]/g, ''));
							if (!isNaN(Floor) && !isNaN(Zone)) { Zones.push({ Floor: Floor, Zone: Zone }); }
						});
					}
				} else {
					// Asume roomnumbers (seperated by a comma) are being used, but remove anything other then numbers and commas
					let Rooms = args.zones.replace(/\[.*?\]/g, '').replace(/\s/g, '').split(',');
					Rooms.forEach(Room => {
						if (/^\d+$/.test(Room)) {
							let Zone = parseInt(Room);
							if (!isNaN(Zone)) { Zones.push({ Floor: currentMap.mapIndex, Zone: Zone }); }
						}
					});
				}
				// If you want to filter rooms on the current floor, uncomment the line below
				// Zones = Zones.filter(Zone => Zone.Floor === currentMap.mapIndex);
				let CleaningZones = Zones.map(Zone => Zone.Zone).join(',');
				this.log('Clean zones: ' + CleaningZones);
				this.vacbot.spotArea(CleaningZones);
				if (this.appdebug) { this.log('Cmd: vacbot.spotArea(' + CleaningZones + ')'); }
			}
		});

		const actionRawCommand = this.homey.flow.getActionCard('RawCommand');
		actionRawCommand.registerRunListener(async (args, state) => {
			if (this.appdebug) { this.log('Cmd: vacbot.run(' + args.command + ')'); }
			this.vacbot.run(args.command);
		});

		const conditionMoppingModule = this.homey.flow.getConditionCard('MoppingModule');
		conditionMoppingModule.registerRunListener(async (args, state) => {
			const MoppingModule = await this.getCapabilityValue('MopStatus');
			return MoppingModule;
		});

		const conditionAutoEmptyState = this.homey.flow.getConditionCard('AutoEmptyState');
		conditionAutoEmptyState.registerRunListener(async (args, state) => {
			const AutoEmptyState = await this.getCapabilityValue('AutoEmpty');
			return AutoEmptyState;
		});

		const conditionCurrentMap = this.homey.flow.getConditionCard('CurrentMap');
		conditionCurrentMap.registerRunListener(async (args, state) => {
			return this.getStoreValue('currentMap').mapID == args.mapname.mapid;
		});

		conditionCurrentMap.registerArgumentAutocompleteListener('mapname', async (query, args) => {
			var filtered = this.getStoreValue('mapnames').filter((element) => {
				return element.name.toLowerCase().includes(query.toLowerCase());
			});
			return filtered;
		});

	}

	async onAdded() {
		this.log('Vacuum has been added');

		let data = this.getData();
		let api = global.DeviceAPI;
		let init = true;
		let createTokens = true;

		this.setStoreValue('areas', []).catch((error) => { this.error('Error: ' + error); });
		this.setStoreValue('mapnames', []).catch((error) => { this.error('Error: ' + error); });
		this.setStoreValue('flowTokens', []).catch((error) => { this.error('Error: ' + error); });

		this.log('Deebot ApiVersion : ', api.getVersion());
		this.vacbot = api.getVacBot(api.uid, EcoVacsAPI.REALM, api.resource, api.user_access_token, data.vacuum, data.geo);

		this.vacbot.on('ready', async (event) => {

			this.log('Model information');
			this.log('- Name: ' + this.vacbot.getName());
			this.log('- Model: ' + this.vacbot.deviceModel);
			this.log('- Image url: ' + this.vacbot.deviceImageURL);
			this.log('- Is fully supported model: ' + this.vacbot.isSupportedDevice());
			this.log('- Is a at least partly supported model: ' + this.vacbot.isKnownDevice());
			this.log('- Is legacy model: ' + this.vacbot.isLegacyModel());
			this.log('- Is 950 type model: ' + this.vacbot.is950type());
			this.log('- V2 commands are implemented: ' + this.vacbot.is950type_V2());
			this.log('- Communication protocol: ' + this.vacbot.getProtocol());
			this.log('- Main brush: ' + this.vacbot.hasMainBrush());
			this.log('- Mapping capabilities: ' + this.vacbot.hasMappingCapabilities());
			this.log('- Edge cleaning mode: ' + this.vacbot.hasEdgeCleaningMode());
			this.log('- Spot cleaning mode: ' + this.vacbot.hasSpotCleaningMode());
			this.log('- Spot area cleaning mode: ' + this.vacbot.hasSpotAreaCleaningMode());
			this.log('- Custom area cleaning mode: ' + this.vacbot.hasCustomAreaCleaningMode());
			this.log('- Mopping system: ' + this.vacbot.hasMoppingSystem());
			this.log('- Voice reports: ' + this.vacbot.hasVoiceReports());
			this.log('- Auto empty station: ' + this.vacbot.hasAutoEmptyStation());
			this.log('- Canvas module available: ' + api.getCanvasModuleIsAvailable());
			this.log('- Using country: ' + api.getCountryName());
			this.log('- Using continent code: ' + api.getContinent());
			this.setAvailable();
			this.log('Device is ready');

			this.setSettings({
				username: data.username,
				password: data.password,
			});

			const changeChargeStateTrigger = this.homey.flow.getDeviceTriggerCard('ChargeState');
			const changeOperationTrigger = this.homey.flow.getDeviceTriggerCard('Operation');
			const changeZoneTrigger = this.homey.flow.getDeviceTriggerCard('LocationReport');
			const cleanReportTrigger = this.homey.flow.getDeviceTriggerCard('CleanReport');
			const errorReportTrigger = this.homey.flow.getDeviceTriggerCard('ErrorReport');

			const CleanLogTriggerImage = await this.homey.images.createImage();
			CleanLogTriggerImage.setPath('/userdata/latestCleanLog_(' + data.id + ').png');

			if (this.appdebug) { this.log('vacbot.run(GetMaps)'); } this.vacbot.run('GetMaps');
			if (this.appdebug) { this.log('vacbot.run(GetWaterBoxInfo)'); } this.vacbot.run('GetWaterBoxInfo');
			if (this.appdebug) { this.log('vacbot.run(GetCleanCount)'); } this.vacbot.run('GetCleanCount');
			if (this.appdebug) { this.log('vacbot.run(GetCleanSpeed)'); } this.vacbot.run('GetCleanSpeed');
			if (this.appdebug) { this.log('vacbot.run(GetWaterLevel)'); } this.vacbot.run('GetWaterLevel');
			if (this.appdebug) { this.log('vacbot.run(GetAutoEmpty)'); } this.vacbot.run('GetAutoEmpty');
			if (this.appdebug) { this.log('vacbot.run(GetBatteryState)'); } this.vacbot.run('GetBatteryState');
			if (this.appdebug) { this.log('vacbot.run(GetCleanState)'); } this.vacbot.run('GetCleanState');
			if (this.appdebug) { this.log('vacbot.run(GetCleanLogs)'); } this.vacbot.run('GetCleanLogs');

			// this.vacbot.run('GetAromaMode'); Not working (yet?)

			this.vacbot.on('WaterBoxInfo', (level) => {
				this.setCapabilityValue('MopStatus', Boolean(level)).catch((error) => { this.error('Error: ' + error); });
				if (this.appdebug) { this.log('setCapabilityValue(MopStatus, ' + Boolean(level) + ')'); }
			});

			this.vacbot.on('CleanCount', (mode) => {
				this.setCapabilityValue('CleanCount', Boolean((mode - 1))).catch((error) => { this.error('Error: ' + error); });
				if (this.appdebug) { this.log('setCapabilityValue(CleanCount, ' + Boolean((mode - 1)) + ')'); }
			});

			this.vacbot.on('CleanSpeed', (level) => {
				this.setCapabilityValue('VacuumPower', level.toString()).catch((error) => { this.error('Error: ' + error); });
				if (this.appdebug) { this.log('setCapabilityValue(VacuumPower, ' + level.toString() + ')'); }
			});

			this.vacbot.on('WaterLevel', (level) => {
				this.setCapabilityValue('WaterFlowLevel', level.toString()).catch((error) => { this.error('Error: ' + error); });
				if (this.appdebug) { this.log('setCapabilityValue(WaterFlowLevel, ' + level.toString() + ')'); }
			});

			this.vacbot.on('AutoEmpty', (mode) => {
				this.setCapabilityValue('AutoEmpty', Boolean(mode)).catch((error) => { this.error('Error: ' + error); });
				if (this.appdebug) { this.log('setCapabilityValue(AutoEmpty, ' + Boolean(mode) + ')'); }
			});

			this.vacbot.on('AromaMode', (mode) => {
				this.setCapabilityValue('AromaMode', Boolean(mode)).catch((error) => { this.error('Error: ' + error); });
				if (this.appdebug) { this.log('setCapabilityValue(AromaMode, ' + Boolean(mode) + ')'); }
			});

			this.vacbot.on('BatteryInfo', (battery) => {
				this.setCapabilityValue('measure_battery', Math.round(battery)).catch((error) => { this.error('Error: ' + error); });
				if (this.appdebug) { this.log('setCapabilityValue(measure_battery, ' + Math.round(battery) + ')'); }
			});

			this.vacbot.on('WaterBoxScrubbingType', (mode) => {
				this.setCapabilityValue('ScrubbingType', Boolean(mode - 1)).catch((error) => { this.error('Error: ' + error); });
				if (this.appdebug) { this.log('setCapabilityValue(ScrubbingType, ' + Boolean(mode - 1) + ')'); }
			});

			this.vacbot.on('CleanLog', async (object) => {
				if (this.appdebug) { this.log('vacbot.on(CleanLog, ' + object + ')'); }
				try {
					this.vacbot.downloadSecuredContent(object[0].imageUrl, '/userdata/latestCleanLog_(' + data.id + ').png').catch((error) => { this.error('Error: ' + error); });
					if (init) {
						const latestCleanLogImage = await this.homey.images.createImage();
						latestCleanLogImage.setPath('/userdata/latestCleanLog_(' + data.id + ').png');
						this.setCameraImage('Lastest Cleanlog', 'Lastest Cleanlog', latestCleanLogImage);
					}
				}
				catch (error) {
					this.error('error: ' + error)
					this.error('object: ' + JSON.stringify(object))
				}
				try {
					this.vacbot.downloadSecuredContent(object[1].imageUrl, '/userdata/previousCleanLog_(' + data.id + ').png').catch((error) => { this.error('Error: ' + error); });;
					if (init) {
						const previousCleanLogImage = await this.homey.images.createImage();
						previousCleanLogImage.setPath('/userdata/previousCleanLog_(' + data.id + ').png');
						this.setCameraImage('Previous Cleanlog', 'Previous Cleanlog', previousCleanLogImage);
					}
				}
				catch (error) {
					this.error('error: ' + error)
					this.error('object: ' + JSON.stringify(object))
				}
				var stopReason = -1;
				switch ((object[0].stopReason - 1).toString()) {
					case '0': stopReason = 'CLEAN_SUCCESSFUL'; break;
					case '1': stopReason = 'BATTERY_LOW'; break;
					case '2': stopReason = 'STOPPED_BY_APP'; break;
					case '3': stopReason = 'STOPPED_BY_IR'; break;
					case '4': stopReason = 'STOPPED_BY_BUTTON'; break;
					case '5': stopReason = 'STOPPED_BY_WARNING'; break;
					case '6': stopReason = 'STOPPED_BY_NO_DISTURB'; break;
					case '7': stopReason = 'STOPPED_BY_CLEARMAP'; break;
					case '8': stopReason = 'STOPPED_BY_NO_PATH'; break;
					case '9': stopReason = 'STOPPED_BY_NOT_IN_MAP'; break;
					case '10': stopReason = 'STOPPED_BY_VIRTUAL_WALL'; break;
					case '11': stopReason = 'WIRE_CHARGING'; break;
					case '12': stopReason = 'STOPPED_BY_AIR_SPOT'; break;
					case '13': stopReason = 'STOPPED_BY_AIR_AUTO'; break;
					default: stopReason = 'UNKNOWN';
				}
				const tokens = {
					image: CleanLogTriggerImage,
					date: object[0].date.toString(),
					type: object[0].type.toString(),
					stopReason: stopReason,
					mopped: this.getCapabilityValue('MopStatus')
				};

				if (!init) {
					this.log('New CleanLog was received');
					cleanReportTrigger.trigger(this, tokens);
				} else {
					init = false;
				}
			});

			this.vacbot.on('CleanReport', (status) => {
				if (this.appdebug) { this.log('vacbot.on(CleanReport, ' + status + ')'); }
				if (status !== this.getCapabilityValue('Operation')) {
					this.log('Current Operation: ' + status);
					this.setCapabilityValue('alarm_tamper', false).catch((error) => { this.error('Error: ' + error); });
					switch (status) {
						case 'idle':
							this.setCapabilityValue('AutoClean', false).catch((error) => { this.error('Error: ' + error); });
							this.setCapabilityValue('ReturnDock', false).catch((error) => { this.error('Error: ' + error); });
							this.setCapabilityValue('PauseCleaning', false).catch((error) => { this.error('Error: ' + error); });
							this.vacbot.run('GetCleanLogs');
							break;
						case 'auto':
							this.setCapabilityValue('AutoClean', true).catch((error) => { this.error('Error: ' + error); });
							this.setCapabilityValue('ReturnDock', false).catch((error) => { this.error('Error: ' + error); });
							this.setCapabilityValue('PauseCleaning', false).catch((error) => { this.error('Error: ' + error); });
							break;
						case 'returning':
							this.setCapabilityValue('AutoClean', false).catch((error) => { this.error('Error: ' + error); });
							this.setCapabilityValue('ReturnDock', true).catch((error) => { this.error('Error: ' + error); });
							this.setCapabilityValue('PauseCleaning', false).catch((error) => { this.error('Error: ' + error); });
							break;
						case 'pause':
							this.setCapabilityValue('PauseCleaning', true).catch((error) => { this.error('Error: ' + error); });
							break;
						case 'alert':
							this.setCapabilityValue('alarm_tamper', true).catch((error) => { this.error('Error: ' + error); });
							break;
						default:
							this.setCapabilityValue('ReturnDock', false).catch((error) => { this.error('Error: ' + error); });
							this.setCapabilityValue('AutoClean', false).catch((error) => { this.error('Error: ' + error); });
							this.setCapabilityValue('PauseCleaning', false).catch((error) => { this.error('Error: ' + error); });
					}
				}
				if (typeof status !== "undefined") {
					this.setCapabilityValue('Operation', status).catch((error) => { this.error('Error: ' + error); });
					changeOperationTrigger.trigger(this, { operation: status });
				}
			});

			this.vacbot.on('ChargeState', (status) => {
				if (this.appdebug) { this.log('vacbot.on(ChargeState, ' + status + ')'); }
				let oldStatus = this.getCapabilityValue('Charge');
				
				switch (status) {
					case 'idle':
						this.setCapabilityValue('Charge', 'Discharging').catch((error) => { this.error('Error: ' + error); });
						break;
					case 'charging':
						if (this.getCapabilityValue('measure_battery') !== 100) {
							this.setCapabilityValue('Charge', 'Charging').catch((error) => { this.error('Error: ' + error); });
						} else {
							this.setCapabilityValue('Charge', 'Fully charged').catch((error) => { this.error('Error: ' + error); });
						}
						break;
					default:
						this.setCapabilityValue('Charge', 'Unknown').catch((error) => { this.error('Error: ' + error); });
				}

				if (oldStatus && (oldStatus != status)) {
					try {
						changeChargeStateTrigger.trigger(this, { state: this.getCapabilityValue('Charge') });
					}
					catch (error) {
						this.error('trigger error: ', error);
					}
				}
			});

			this.vacbot.on('Maps', async (maps) => {
				if (this.appdebug) { this.log('vacbot.on(Maps, ' + maps + ')'); }
				this.log('Updating Maps')
				var mapnames = [];
				for (const map of maps['maps']) {
					mapnames.push(
						{
							'mapid': map['mapID'],
							'mapIndex': map['mapIndex'],
							'name': map['mapName'],
							'mapStatus': map['mapStatus'],
							'mapIsCurrentMap': map['mapIsCurrentMap']
						}
					);
					this.setStoreValue('mapnames', mapnames).catch((error) => { this.error('Error: ' + error); });
					const mapID = map['mapID'];
					const mapIndex = map['mapIndex'];
					if (map['mapIsCurrentMap']) {
						this.setStoreValue('currentMap', { 'mapID': mapID, 'MapIndex': mapIndex }).catch((error) => { this.error('Error: ' + error); });
					}
					this.log('-Updating Floor ' + map['mapName'])
					await this.vacbot.run('GetSpotAreas', mapID);
					// await new Promise(resolve => setTimeout(resolve, 2000));
				}
			});

			this.vacbot.on('MapSpotAreas', async (spotAreas) => {
				if (this.appdebug) { this.log('vacbot.on(MapSpotAreas, ' + spotAreas + ')'); }
				for (const spotArea of spotAreas['mapSpotAreas']) {
					const spotAreaID = spotArea['mapSpotAreaID'];
					await this.vacbot.run('GetSpotAreaInfo', spotAreas['mapID'], spotAreaID);
				}
			});

			this.vacbot.on('MapSpotAreaInfo', async (area) => {
				if (this.appdebug) { this.log('vacbot.on(MapSpotAreaInfo, ' + area + ')'); }
				var tableAreas = this.getStoreValue('areas');
				const index = tableAreas.findIndex(element => element.id === area.mapSpotAreaID);
				if (index !== -1) { tableAreas.splice(index, 1); }
				if (!tableAreas.find(o => o.id == area.mapSpotAreaID)) {
					this.log('--Updating Zone ' + area.mapSpotAreaName)
					tableAreas.push(
						{
							mapid: area.mapID,
							name: area.mapSpotAreaName,
							id: area.mapSpotAreaID,
							toto: area.mapSpotAreaBoundaries,
							boundaries: this.convertBoundaries(area.mapSpotAreaBoundaries),
						}
					);
					this.setStoreValue('areas', tableAreas).catch((error) => { this.error('Error: ' + error); });
					createTokens = true;
				}

			});

			this.vacbot.on('DeebotPosition', (values) => {
				let CurrentZone = 'unknown';
				let OldZone = this.getCapabilityValue('CurrentZone');
				let currentMap = this.getStoreValue('currentMap');
				var tableAreas = this.getStoreValue('areas');
				tableAreas.forEach(function (area) {
					let coord = values.split(',');
					if (tools.pointInPolygon(area.boundaries, [Number(coord[0]), Number(coord[1])]) && area.mapid == currentMap.mapID) {
						CurrentZone = area.name;
					}
				});
				this.setCapabilityValue('CurrentZone', CurrentZone).catch((error) => { this.error('Error: ' + error); });
				if (OldZone && (OldZone != CurrentZone)) {
					try {
						this.setCapabilityValue('PauseCleaning', false).catch((error) => { this.error('Error: ' + error); });
						changeZoneTrigger.trigger(this, { zone: CurrentZone });
					}
					catch (error) {
						this.error('trigger error: ', error);
					}
				}
			});

			this.vacbot.on('ErrorCode', (errorcode) => {
				if (parseInt(errorcode) !== 0 && parseInt(errorcode) !== 100) {
					var error = this.homey.__("Deebot.Error" + errorcode)
					this.error('trigger error: ', error + " (errorcode " + errorcode + ")");
					errorReportTrigger.trigger(this, { error: error, errorcode: parseInt(errorcode) });
				}
			});
		});

		this.vacbot.connect();

		setInterval(async function () {
			if (createTokens) {
				createTokens = await this.createTokens().catch((error) => { this.error('Error: ' + error); });
			}
		}.bind(this), SYNC_INTERVAL);

	}

	async ready() {
		this.log('device:ready');
	}

	onDiscoveryResult(discoveryResult) {
		this.log('onDiscoveryResult');
		return discoveryResult.id === this.getData().id;
	}

	onDiscoveryAvailable(discoveryResult) {
		this.log('onDiscoveryAvailable', discoveryResult);
		//this.setStoreValue('address', discoveryResult.address);
	}

	onDiscoveryAddressChanged(discoveryResult) {
		this.log('onDiscoveryAddressChanged', discoveryResult);
		// todo set in store
	}

	onDiscoveryLastSeenChanged(discoveryResult) {
		this.log('onLastSeenChanged', discoveryResult);
	}

	async onSettings({ oldSettings, newSettings, changedKeys }) {
		this.log('MyDevice settings where changed', oldSettings, newSettings, changedKeys);
	}

	async onRenamed(name) {
		this.log('Device was renamed to' + this.getName());
	}

	async onDeleted() {
		this.log('Device ' + this.getName() + 'has been deleted');
		this.vacbot.disconnect();
	}

	async onCapabilityVacuumPower(value, opts) {
		this.vacbot.run('SetCleanSpeed', Number(value));
	}

	async onCapabilityCleanCount(boolean, opts) {
		this.log('onCapabilityCleanCount: ' + (Number(boolean) + 1));
		this.vacbot.run('SetCleanCount', (Number(boolean) + 1));
	}

	async onCapabilityWaterFlowLevel(value, opts) {
		this.vacbot.run('SetWaterLevel', Number(value), (Number(this.getCapabilityValue('ScrubbingType')) + 1));
	}

	async onCapabilityAutoEmpty(boolean, opts) {
		this.vacbot.run('SetAutoEmpty', Number(boolean));
	}

	async onCapabilityScrubbingType(boolean, opts) {
		this.vacbot.run('SetWaterLevel', this.getCapabilityValue('WaterFlowLevel'), (Number(boolean) + 1));
	}

	async onCapabilityAromaMode(value, opts) {
		//
	}

	async onCapabilityAlert(boolean, opts) {
		//
	}

	async onCapabilityAutoClean(value, opts) {
		if (value) {
			this.vacbot.clean();
		} else {
			this.vacbot.stop();
		}
	}

	async onCapabilityPauseCleaning(value, opts) {
		if (value) {
			if (this.getCapabilityValue('Operation') !== 'idle') {
				this.vacbot.run('Pause');
			} else {
				setTimeout(() => {
					this.log('Operation not idle, no need to pause');
					this.setCapabilityValue('PauseCleaning', false).catch((error) => { this.error('Error: ' + error); });
				}, 1000);
			}
		} else {
			this.vacbot.run('Resume');
		}
	}

	async onCapabilityReturnDock(value, opts) {
		if (value) {
			if (this.getCapabilityValue('Charge') !== 'charging') {
				this.vacbot.run('Charge');
			} else {
				setTimeout(() => {
					this.log('Deebot already docked, no need to return');
					this.setCapabilityValue('ReturnDock', false).catch((error) => { this.error('Error: ' + error); });
				}, 1000);
			}
		}
	}

	async flowAutocompleteactionSpotArea(query, args) {
		var tableAreas = this.getStoreValue('areas');
		var filtered = tableAreas.filter((element) => {
			return element.name.toLowerCase().includes(query.toLowerCase());
		});
		return filtered;
	}
	// async flowactionSpotArea(args, state) {
	// 	var mapID = this.getStoreValue('currentMap');
	// 	// Only able to start spotcleaning if on the right map
	// 	if (mapID != args.zone.mapid) {
	// 		this.homey.notifications.createNotification({ excerpt: 'Wrong Map! The zone you selected is on mapid ' + args.zone.mapid + ' while the Deebot is currently located on map ' + mapID });
	// 		this.log('Wrong Map! Selected zone on mapid ' + args.zone.mapid + ', Deebot is currently located on map ' + mapID)
	// 	}
	// }

	// async flowRechargeAction(args, state) {
	// 	this.log('Return to recharge');
	// 	// args.zone.name ; args.zone.id
	// 	this.vacbot.charge();
	// }


	//////////////////////////////////////////// Utilities ///////////////////////////////////////

	convertBoundaries(areaBoundaries) {
		let tableau = areaBoundaries.split(';');
		let resultat = [];

		tableau.forEach(function (element) {
			let point = element.split(',');
			resultat.push([Number(point[0]), Number(point[1])]);
		});

		return resultat;
	}

	async createTokens() {
		this.log('Updating Flow Tokens')

		var flowTokens = this.getStoreValue('flowTokens') || [];
		var mapnames = this.getStoreValue('mapnames');
		var areas = this.getStoreValue('areas');

		for (const flowToken of flowTokens) {
			const removeToken = this.homey.flow.getToken(flowToken);
			await this.homey.flow.unregisterToken(removeToken);
		}

		while (flowTokens.length) {
			flowTokens.pop();
		}

		for (const area of areas) {
			var level = mapnames.findIndex((x) => { return x.mapid === area.mapid; });
			var mapName = mapnames.filter(obj => { return obj.mapid === area.mapid; });
			var tokenName = mapName[0].name + ' - ' + area.name;
			var tokenID = level + ':' + area.id;
			flowTokens.push(tokenID);
			const createToken = await this.homey.flow.createToken(tokenID, { type: 'string', title: tokenName }).catch((error) => { this.error('Error await this.homey.flow.createToken(tokenID, { type: "string", title: tokenName }): ' + error); });;
			await createToken.setValue('[' + level + ':' + area.id + ']');
			this.setStoreValue('flowTokens', flowTokens).catch((error) => { this.error('Error (this.setStoreValue("flowTokens", flowTokens)): ' + error); });
		};
		return false;
	}
}

module.exports = VacuumDevice;
