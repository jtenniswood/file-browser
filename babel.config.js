module.exports = {
	plugins: [
		['babel-plugin-polyfill-corejs3', { method: 'entry-global' }],
	],
	presets: [
		'@vue/cli-plugin-babel/preset',
		'@babel/preset-env',
		['@babel/preset-typescript', { ignoreExtensions: true }],
	],
}
