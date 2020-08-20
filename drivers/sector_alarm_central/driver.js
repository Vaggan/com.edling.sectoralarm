'use strict';

const Homey = require('homey');
const sectoralarm = require('sectoralarm');

class MyDriver extends Homey.Driver {

  onInit() {
    this.log('MyDriver has been inited');
  }

  onPairListDevices(data, callback) {
    const username = Homey.ManagerSettings.get('username');
    const password = Homey.ManagerSettings.get('password');

    if (username === '' || password === '') {
      callback(null, null);
    }

    sectoralarm.connect(username, password, null, null)
      .then(async site => {
        await site.status()
          .then(async status => {
            if (Homey.ManagerSettings.get('siteid') === '') {
              Homey.ManagerSettings.set('siteid', JSON.parse(status).siteId);
            }

            const devices = [
              {
                name: JSON.parse(status).name,
                data: { id: JSON.parse(status).siteId },
              },
            ];
            callback(null, devices);
          });
      });

    callback(null, null);
  }

}

module.exports = MyDriver;
