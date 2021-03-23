'use strict';

const Homey = require('homey');
const sectoralarm = require('sectoralarm');

class MyDriver extends Homey.Driver {

  async onInit() {
    this.homey.app.updateLog('Yale Doorman driver has been initialized');
  }

  async onPairListDevices() {
    const username = this.homey.settings.get('username');
    const password = this.homey.settings.get('password');
    if (username === '' || password === '') {
      this.homey.app.updateLog('No credentials, please enter credentials in settings.');
      throw new Error('No credentials, please enter credentials in settings.');
    }

    const devices = [];
    await sectoralarm.connect(username, password, null, null)
      .then(async site => {
        await site.info()
          .then(async info => {
            this.log(`Status ${info}`);
            const infoObject = JSON.parse(info);
            if (this.homey.settings.get('siteid') === '') {
              this.homey.settings.set('siteid', infoObject.siteId);
            }
            if (infoObject.locks) {
              infoObject.locks.forEach(lock => {
                devices.push(
                  {
                    name: lock.name,
                    data: { id: lock.lockId },
                  },
                );
              });
            }
          })
          .catch(innerError => {
            this.homey.app.updateLog(innerError, 0);
          });
      })
      .catch(innerError => {
        this.homey.app.updateLog(innerError, 0);
      });
    return devices;
  }

}

module.exports = MyDriver;
