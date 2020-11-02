'use strict';

const Homey = require('homey');
const sectoralarm = require('sectoralarm');

let LOCK_ID;

const SETTINGS = {
  USERNAME: 'username',
  PASSWORD: 'password',
  SITEID: 'siteid',
  CODE: 'code',
  LOCKCODE: 'lockcode',
  POLLINTERVAL: 'pollinterval',
};

let pollInterval = '';
let username = '';
let password = '';
let siteid = '';
let lockCode = '';

let retryLogin = true;

class MyDevice extends Homey.Device {

  async onInit() {
    this.log('Yale Doorman device has been initialized');

    LOCK_ID = this.getData().id;
    this.log(`LOCK_ID: ${LOCK_ID}`);

    // ((a < b) ? 'minor' : 'major')
    pollInterval = this.homey.settings.get(SETTINGS.POLLINTERVAL) * 1000;
    username = this.homey.settings.get(SETTINGS.USERNAME);
    password = this.homey.settings.get(SETTINGS.PASSWORD);
    siteid = this.homey.settings.get(SETTINGS.SITEID);
    lockCode = this.homey.settings.get(SETTINGS.LOCKCODE);

    await sectoralarm.connect(username, password, siteid, null)
      .then(site => {
        this._site = site;
      })
      .catch(error => {
        this.error(error);
      });

    try {
      this._pollInterval = setInterval(this.pollLockStatus.bind(this), pollInterval);
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
      this.log(`pollinterval: ${pollInterval}`);
      this.CheckSettings();
      this._site.locks(LOCK_ID)
        .then(async lock => {
          this.onLockUpdate(JSON.parse(lock)[0]);
        })
        .catch(async error => {
          if (error.code === 'ERR_INVALID_SESSION') {
            this.log('Info: Invalid session, logging back in.');
            if (retryLogin) {
              retryLogin = false;
              await this._site.login()
                .then(() => {
                  retryLogin = true;
                  this.pollLockStatus();
                });
            } else {
              this.error(error);
            }
          }
        });
    } catch (error) {
      this.error(error);
    }
  }

  CheckSettings() {
    const tempPollInterval = pollInterval;
    pollInterval = this.homey.settings.get(SETTINGS.POLLINTERVAL) * 1000;
    username = this.homey.settings.get(SETTINGS.USERNAME);
    password = this.homey.settings.get(SETTINGS.PASSWORD);
    siteid = this.homey.settings.get(SETTINGS.SITEID);
    lockCode = this.homey.settings.get(SETTINGS.LOCKCODE);

    if (!(tempPollInterval === pollInterval)) {
      clearTimeout(this._pollInterval);
      this._pollInterval = setInterval(this.pollLockStatus.bind(this), pollInterval);
    }
  }

  onLockUpdate(lock) {
    try {
      this.log(`onLockUpdate, current state: ${JSON.stringify(lock)}`);
      if (lock && lock.status !== this.getCapabilityValue('locked')) {
        this.setCapabilityValue('locked', lock.status === 'locked')
          .then(() => {
            this.log(`Capability value 'locked' changed to: ${lock.status}`);
            // this.triggerFlow(lock.state);
          })
          .catch(new Error(`Could not change lock state to ${lock.status}`));
      }
    } catch (error) {
      this.error(error);
    }
  }

  async onCapabilityChanged(value, opts) {
    this.log(`onCapabilityChanged, set locked to: ${value}`);

    if (value) {
      await this._site.lock(LOCK_ID, lockCode)
        .then(messag => {
          this.log(messag);
          return Promise.resolve();
        })
        .catch(error => {
          this.error(error);
          return Promise.reject(new Error('Failed to lock the door.'));
        });
    } else {
      await this._site.unlock(LOCK_ID, lockCode)
        .then(messag => {
          this.log(messag);
          return Promise.resolve();
        })
        .catch(error => {
          this.error(error);
          return Promise.reject(new Error('Failed to unlock the door.'));
        });
    }
  }

}

module.exports = MyDevice;
