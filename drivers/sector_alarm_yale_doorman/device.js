'use strict';

const Homey = require('homey');

const SETTINGS = {
  LOCKCODE: 'lockcode',
  POLLINTERVAL: 'pollinterval',
};
const DEFAULTPOLLTIME = 30000;

class MyDevice extends Homey.Device {

  async onInit() {
    this.homey.app.updateLog('Yale Doorman device has been initialized');
    this.homey.app.updateLog(`LOCK_ID: ${this.getData().id}`);

    this.pollInterval = this.homey.settings.get(SETTINGS.POLLINTERVAL) * 1000;
    this.lockCode = this.homey.settings.get(SETTINGS.LOCKCODE);

    this.CheckPollInterval();

    try {
      await this.homey.app.connectToSite();
      this._pollInterval = setInterval(this.pollLockStatus.bind(this), this.pollInterval);
    } catch(error) {
      this.homey.app.updateLog("yd get site Err y1: " + error, 0);
      this.setUnavailable(error);
    };

    await this.setInitState();
    this.registerCapabilityListener('locked', this.onCapabilityChanged.bind(this));
    // this.registerFlowCardCondition();
    // this.registerFlowCardAction();
  }

  async onAdded() {
    this.homey.app.updateLog('Yale Doorman device has been added');
  }

  async setInitState() {
    try {
      const lock = await this.homey.app.locks(this.getData().id)
      this.homey.app.updateLog(`Set initial lock state to: ${lock.state}`);
      this.setCapabilityValue('locked', lock.state === 'locked');
      this.setAvailable();
    } catch (error) {
      this.homey.app.updateLog(error, 0);
      this.setUnavailable(error);
    }
  }

  async pollLockStatus() {
    try {
      this.homey.app.updateLog(`pollinterval: ${this.pollInterval}`, 2);
      this.CheckSettings();
      const lock = await this.homey.app.locks(this.getData().id)
      this.onLockUpdate(JSON.parse(lock)[0]);
      this.setAvailable();
    } catch (error) {
      this.homey.app.updateLog(error, 0);
      this.setUnavailable(error);
    }
  }

  CheckSettings() {
    const tempPollInterval = this.pollInterval;
    this.pollInterval = this.homey.settings.get(SETTINGS.POLLINTERVAL) * 1000;
    this.lockCode = this.homey.settings.get(SETTINGS.LOCKCODE);

    if (!(tempPollInterval === this.pollInterval)) {
      this.homey.app.updateLog(`Change poll insterval to: ${Number(this.pollInterval) / 1000} seconds`);
      this.CheckPollInterval();
      clearInterval(this._pollInterval);
      this._pollInterval = setInterval(this.pollLockStatus.bind(this), this.pollInterval);
    }
  }

  CheckPollInterval() {
    if (this.pollInterval < DEFAULTPOLLTIME) {
      this.pollInterval = DEFAULTPOLLTIME;
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
            this.setUnavailable(error);
          });
      }
    } catch (error) {
      this.homey.app.updateLog(error, 0);
      this.setUnavailable(error);
    }
  }

  async onCapabilityChanged(value, opts) {
    this.homey.app.updateLog(`onCapabilityChanged, set locked to: ${value}`);

    if (value) {
      await this.homey.app.lock(this.getData().id, this.lockCode)
        .then(messag => {
          this.homey.app.updateLog(messag);
          return Promise.resolve();
        })
        .catch(error => {
          this.homey.app.updateLog(error, 0);
          this.setUnavailable(error);
          return Promise.reject(new Error('Failed to lock the door.'));
        });
    } else {
      await this.homey.app.unlock(this.getData().id, this.lockCode)
        .then(message => {
          this.homey.app.updateLog(message);
          return Promise.resolve();
        })
        .catch(error => {
          this.homey.app.updateLog(error, 0);
          this.setUnavailable(error);
          return Promise.reject(new Error('Failed to unlock the door.'));
        });
    }
  }

}

module.exports = MyDevice;
