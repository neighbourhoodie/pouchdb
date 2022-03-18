"use strict";
console.log('node-setup being required');
// throw an error if any EventEmitter adds too many listeners
require('throw-max-listeners-error');

var seedrandom = require('seedrandom');
var seed = (process.env.SEED || Date.now()) + "";
console.log('Seeded with: ' + seed);
seedrandom(seed, { global: true });

var testsDir = process.env.TESTS_DIR || './tmp';
var exec = require('child_process').exec;
function cleanup() {
  // Remove test databases
  exec('rm -r ' + testsDir);
}
exec('mkdir -p ' + testsDir, function () {
  process.on('SIGINT', cleanup);
  process.on('exit', cleanup);
});
global.testUtils = require('./utils.js');
global.PouchDB = testUtils.loadPouchDB();
var chai = require('chai');
chai.use(require('chai-as-promised'));
global.should = chai.should();
global.assert = chai.assert;
require('mkdirp').sync('./tmp');

// if (process.env.PLUGINS && !process.env.COVERAGE) {
//   // in coverage, these plugins are explicitly included
//   // in pouchdb-for-coverage
//   process.env.PLUGINS.split(',').forEach(function (plugin) {
//     PouchDB.plugin(require('../../packages/node_modules/' + plugin));
//   });
// }

// console.log('running node setup with env', process.env);
// if (process.env.ADAPTERS) {
//   console.log('has adapters', process.env.ADAPTERS);
//   process.env.ADAPTERS.split(',').forEach(function (adapter) {
//     console.log('loading adapter', adapter);
//     PouchDB.plugin(require('../../packages/node_modules/pouchdb-adapter-' + adapter));
//     console.log('loading adapter', adapter, 'done');

//   });
// }
