'use strict';

const Homey = require('homey');
const sectoralarm = require('sectoralarm');

class MyDriver extends Homey.Driver {

  onInit() {
    this.homey.app.updateLog('Control panel driver has been initialized');
  }

  async onPairListDevices() {
    const username = this.homey.settings.get('username');
    const password = this.homey.settings.get('password');
    if (username === '' || password === '') {
      throw new Error('No credentials, please enter credentials in settings.');
    }

    let devices;
    await sectoralarm.connect(username, password, null, null)
      .then(async site => {
        await site.status()
          .then(async status => {
            if (this.homey.settings.get('siteid') === '') {
              this.homey.settings.set('siteid', JSON.parse(status).siteId);
            }
            devices = [
              {
                name: JSON.parse(status).name,
                data: { id: JSON.parse(status).siteId },
              },
            ];
          });
      });

    return devices;
  }

}

module.exports = MyDriver;
