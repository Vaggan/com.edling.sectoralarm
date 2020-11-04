/* eslint-disable node/no-unsupported-features/node-builtins */
/* eslint-disable global-require */

'use strict';

const Homey = require('homey');

if (process.env.DEBUG === '1') {
  require('inspector').open(9229, '0.0.0.0', false);
}

const { Log } = require('homey-log');

class MyApp extends Homey.App {

  onInit() {
    this.log('MyApp is running...');
    this.homeyLog = new Log({ homey: this.homey });
  }

}

module.exports = MyApp;
