'use strict';

const Homey = require('homey');
const sectoralarm = require('sectoralarm');

const POLL_INTERVAL = 30000; // 30 seconds
let LOCK_ID;

const SETTINGS = {
  USERNAME: 'username',
  PASSWORD: 'password',
  SITEID: 'siteid',
  CODE: 'code',
  LOCKCODE: 'lockcode',
};

class MyDevice extends Homey.Device {

  async onInit() {
    this.log('Yale Doorman device has been initialized');

    LOCK_ID = this.getData().id;
    this.log(`LOCK_ID: ${LOCK_ID}`);

    const username = this.homey.settings.get(SETTINGS.USERNAME);
    const password = this.homey.settings.get(SETTINGS.PASSWORD);
    const siteid = this.homey.settings.get(SETTINGS.SITEID);

    await sectoralarm.connect(username, password, siteid, null)
      .then(site => {
        this._site = site;
      })
      .catch(error => {
        this.error(error);
      });

    try {
      this._pollInterval = setInterval(this.pollLockStatus.bind(this), POLL_INTERVAL);
    } catch (error) {
      this.error(error);
    }

    await this.setInitState();
    this.registerCapabilityListener('locked', this.onCapabilityChanged.bind(this));
    // this.registerFlowCardCondition();
    // this.registerFlowCardAction();
  }

  async onAdded() {
    this.log('Yale Doorman device has been added');
  }

  async setInitState() {
    this._site.locks(LOCK_ID)
      .then(lock => {
        this.setCapabilityValue('locked', lock.state === 'locked');
      })
      .catch(error => {
        this.error(error);
      });
  }

  pollLockStatus() {
    try {
      this.log('pollLockState');
      this._site.locks(LOCK_ID)
        .then(async lock => {
          this.log('Before onLockUpdate');
          this.onLockUpdate(JSON.parse(lock)[0]);
          this.log('After onLockUpdate');
        })
        .catch(error => {
          this.log('Catch');
          if (error.code === 'ERR_INVALID_SESSION') {
            this.log('Info: Invalid session, logging back in.');
            this._site.login()
              .then(() => this.pollLockStatus());
          } else {
            this.error(error);
          }
        });
    } catch (error) {
      this.log('Error');
      this.error(error);
    }
  }

  onLockUpdate(lock) {
    try {
      this.log('onLockUpdate');
      this.log(`Lock: ${JSON.stringify(lock)}`);
      if (lock && lock.status !== this.getCapabilityValue('locked')) {
        this.setCapabilityValue('locked', lock.status === 'locked')
          .then(() => {
            this.log('Capability value set');
            // this.triggerFlow(lock.state);
          })
          .catch(new Error('Could not change lock state'));
      }
    } catch (error) {
      this.error(error);
    }
  }

  async onCapabilityChanged(value, opts) {
    const lockCode = this.homey.settings.get(SETTINGS.LOCKCODE);
    return new Promise((resolve, reject) => {
      this.log(`onCapabilityChanged value: ${value}`);
      if (value) {
        this._site.lock(LOCK_ID, lockCode)
          .then(resolve)
          .catch(reject(new Error('Failed to lock the door.')));
      } else {
        this._site.unlock(LOCK_ID, lockCode)
          .then(resolve)
          .catch(reject(new Error('Failed to unlock the door.')));
      }
    });
  }

}

module.exports = MyDevice;
