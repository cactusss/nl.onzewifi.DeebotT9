module.exports = {
	// retrieve logs
	async getLogs({ homey }) {
		const result = await homey.app.getLogs();
		return result;
	},
	// delete logs
	async deleteLogs({ homey }) {
		const result = await homey.app.deleteLogs();
		return result;
	},
	async node_env({ homey }) {
		console.log('Huh?')
		const result = await homey.app.node_env();
		return result;
	},
};