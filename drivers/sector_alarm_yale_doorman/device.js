'use strict';

const Homey = require('homey');
const sectoralarm = require('sectoralarm');

const SETTINGS = {
  USERNAME: 'username',
  PASSWORD: 'password',
  SITEID: 'siteid',
  LOCKCODE: 'lockcode',
  POLLINTERVAL: 'pollinterval',
};
const DEFAULTPOLLTIME = 30000;

let pollInterval = '';
let username = '';
let password = '';
let siteid = '';
let lockCode = '';

let retryLogin = true;

class MyDevice extends Homey.Device {

  async onInit() {
    this.homey.app.updateLog('Yale Doorman device has been initialized');
    this.homey.app.updateLog(`LOCK_ID: ${this.getData().id}`);

    pollInterval = this.homey.settings.get(SETTINGS.POLLINTERVAL) * 1000;
    username = this.homey.settings.get(SETTINGS.USERNAME);
    password = this.homey.settings.get(SETTINGS.PASSWORD);
    siteid = this.homey.settings.get(SETTINGS.SITEID);
    lockCode = this.homey.settings.get(SETTINGS.LOCKCODE);

    this.CheckPollInterval();

    await sectoralarm.connect(username, password, siteid, null)
      .then(site => {
        this._site = site;
      })
      .catch(error => {
        this.homey.app.updateLog(error, 0);
      });

    try {
      this._pollInterval = setInterval(this.pollLockStatus.bind(this), pollInterval);
    } catch (error) {
      this.homey.app.updateLog(error, 0);
    }

    await this.setInitState();
    this.registerCapabilityListener('locked', this.onCapabilityChanged.bind(this));
    // this.registerFlowCardCondition();
    // this.registerFlowCardAction();
  }

  async onAdded() {
    this.homey.app.updateLog('Yale Doorman device has been added');
  }

  async setInitState() {
    this._site.locks(this.getData().id)
      .then(lock => {
        this.homey.app.updateLog(`Set initial lock state to: ${lock.state}`);
        this.setCapabilityValue('locked', lock.state === 'locked');
      })
      .catch(error => {
        this.homey.app.updateLog(error, 0);
      });
  }

  pollLockStatus() {
    try {
      this.homey.app.updateLog(`pollinterval: ${pollInterval}`, 2);
      this.CheckSettings();
      this._site.locks(this.getData().id)
        .then(async lock => {
          this.onLockUpdate(JSON.parse(lock)[0]);
        })
        .catch(async error => {
          if (error.code === 'ERR_INVALID_SESSION') {
            this.homey.app.updateLog('Info: Invalid session, logging back in.');
            if (retryLogin) {
              retryLogin = false;
              await this._site.login()
                .then(() => {
                  retryLogin = true;
                  this.pollLockStatus();
                })
                .catch(innerError => {
                  this.homey.app.updateLog(innerError, 0);
                });
            } else {
              this.homey.app.updateLog(error, 0);
            }
          }
        });
    } catch (error) {
      this.homey.app.updateLog(error, 0);
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
      this.homey.app.updateLog(`Change poll insterval to: ${Number(pollInterval) / 1000} seconds`);
      this.CheckPollInterval();
      clearTimeout(this._pollInterval);
      this._pollInterval = setInterval(this.pollLockStatus.bind(this), pollInterval);
    }
  }

  CheckPollInterval() {
    if (pollInterval < DEFAULTPOLLTIME) {
      pollInterval = DEFAULTPOLLTIME;
      this.homey.settings.set(SETTINGS.POLLINTERVAL, DEFAULTPOLLTIME / 1000);
      this.homey.app.updateLog(`Poll interval to low, setting it to: ${DEFAULTPOLLTIME}`);
    }
  }

  onLockUpdate(lock) {
    try {
      this.homey.app.updateLog(`onLockUpdate, current state: ${JSON.stringify(lock)}`);

      if (lock && ((lock.status === 'locked') !== (this.getCapabilityValue('locked')))) {
        this.setCapabilityValue('locked', lock.status === 'locked')
          .then(() => {
            this.homey.app.updateLog(`Capability value 'locked' changed to: ${lock.status}`);
            // this.triggerFlow(lock.state);
          })
          .catch(error => {
            this.homey.app.updateLog(`Could not change lock state to ${lock.status}`);
            this.homey.app.updateLog(error, 0);
          });
      }
    } catch (error) {
      this.homey.app.updateLog(error, 0);
    }
  }

  async onCapabilityChanged(value, opts) {
    this.homey.app.updateLog(`onCapabilityChanged, set locked to: ${value}`);

    if (value) {
      await this._site.lock(this.getData().id, lockCode)
        .then(messag => {
          this.homey.app.updateLog(messag);
          return Promise.resolve();
        })
        .catch(error => {
          this.homey.app.updateLog(error, 0);
          return Promise.reject(new Error('Failed to lock the door.'));
        });
    } else {
      await this._site.unlock(this.getData().id, lockCode)
        .then(messag => {
          this.homey.app.updateLog(messag);
          return Promise.resolve();
        })
        .catch(error => {
          this.homey.app.updateLog(error, 0);
          return Promise.reject(new Error('Failed to unlock the door.'));
        });
    }
  }

}

module.exports = MyDevice;
