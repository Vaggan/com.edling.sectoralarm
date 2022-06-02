'use strict';

const Homey = require('homey');

const ALARMSTATE = {
  ARMED: 'armed',
  DISARMED: 'disarmed',
  PARTIALYARMED: {
    SECTOR: 'partialArmed',
    HOMEY: 'partially_armed',
  },
};
const SETTINGS = {
  CODE: 'alarmcode',
  POLLINTERVAL: 'pollinterval',
};
const DEFAULTPOLLTIME = 30000;

class MyDevice extends Homey.Device {

  async onInit() {
    this.homey.app.updateLog('Function onInit start', 2);
    this.homey.app.updateLog('Control panel device has been inited');

    this.pollInterval = this.homey.settings.get(SETTINGS.POLLINTERVAL) * 1000;
    this.code = this.homey.settings.get(SETTINGS.CODE);

    this.CheckPollInterval();

    try {
      await this.homey.app.connectToSite();
      this.homey.app.updateLog(`Set up polling for alarm central. Interval ${Number(this.pollInterval) / 1000} seconds`);
      this._pollAlarmInterval = setInterval(this.pollAlarmStatus.bind(this), this.pollInterval);
    } catch (error) {
      this.homey.app.updateLog(error, 0);
      this.setUnavailable(error);
    }

    await this.setInitState();
    this.registerCapabilityListener('homealarm_state', this.onCapabilityChanged.bind(this));
    this.registerFlowCardCondition();
    this.registerFlowCardAction();
    this.homey.app.updateLog('Function onInit end', 2);
  }

  async setInitState() {
    await this.homey.app.updateLog('Function setInitState start', 2);
    try {
      const new_status = await this.homey.app.status()
      let armedState;
      this.homey.app.updateLog(`Alarm state from Sector Alarm ${JSON.parse(new_status).armedStatus}`, 2);
      switch (JSON.parse(new_status).armedStatus) {
        case ALARMSTATE.PARTIALYARMED.SECTOR:
          armedState = ALARMSTATE.PARTIALYARMED.HOMEY;
          break;
        default:
          armedState = JSON.parse(new_status).armedStatus;
      }
      this.homey.app.updateLog(`Set initial alarm state to ${armedState}`);
      this.setCapabilityValue('homealarm_state', armedState);
    } catch (error) {
      this.homey.app.updateLog(error, 0);
      this.setUnavailable(error);
    }
    this.homey.app.updateLog('Function setInitState end', 2);
  }

  async registerFlowCardCondition() {
    this.homey.app.updateLog('Function registerFlowCardCondition start', 2);
    const alarmStateCondition = this.homey.flow.getConditionCard('homealarm_state_is');

    alarmStateCondition
      .registerRunListener(async (args, state) => {
        await this.homey.app.status()
          .then(async status => {
            this.homey.app.updateLog(`State ${state}`);
            this.homey.app.updateLog(`Status ${JSON.parse(status).armedStatus}`);
            this.homey.app.updateLog(`Alarm state is ${this.getCapabilityValue('homealarm_state')}`);
            switch (state) {
              case ALARMSTATE.PARTIALYARMED.SECTOR:
                return this.getCapabilityValue('homealarm_state') === ALARMSTATE.PARTIALYARMED.HOMEY;
              default:
                return this.getCapabilityValue('homealarm_state') === state;
            }
          })
          .catch(error => {
            this.homey.app.updateLog(error, 0);
            this.setUnavailable(error);
          });
      });
    this.homey.app.updateLog('Function registerFlowCardCondition end', 2);
  }

  async registerFlowCardAction() {
    this.homey.app.updateLog('Function registerFLowCardAction start', 2);
    const alarmStateAction = this.homey.flow.getActionCard('set_homealarm_state');
    alarmStateAction
      .registerRunListener(async (args, state) => {
        switch (state) {
          case ALARMSTATE.ARMED:
            this.homey.app.updateLog('Arming');
            this.homey.app.arm(this.code);
            break;
          case ALARMSTATE.DISARMED:
            this.homey.app.updateLog('Disarming');
            this.homey.app.disarm(this.code);
            break;
          case ALARMSTATE.PARTIALYARMED.HOMEY:
            this.homey.app.updateLog('Arming perimeter');
            this.homey.app.partialArm(this.code);
            break;
          default:
            this.homey.app.updateLog('No action taken');
            break;
        }
      });
    this.homey.app.updateLog('Function registerFLowCardAction end', 2);
  }

  async pollAlarmStatus() {
    this.homey.app.updateLog('Function pollAlarmStatus start', 2);
    try {
      await this.CheckSettings();
      this.homey.app.updateLog(`Polling at interval: ${Number(this.pollInterval) / 1000} seconds`, 2);

      const new_status = await this.homey.app.status();
      this.homey.app.updateLog(`Current alarm state ${JSON.parse(new_status).armedStatus}`);
      this.onAlarmUpdate(new_status);
      Promise.resolve().catch(this.homey.app.updateLog); // TODO: Where did this code line come from, it looks fishy
      this.setAvailable();
    } catch (error) {
      this.homey.app.updateLog(error, 0);
      this.setUnavailable(error);
    }
    this.homey.app.updateLog('Function pollAlarmStatus end', 2);
  }

  async CheckSettings() {
    this.homey.app.updateLog('Function CheckSettings start', 2);
    const tempPollInterval = this.pollInterval;
    this.pollInterval = this.homey.settings.get(SETTINGS.POLLINTERVAL) * 1000;
    this.code = this.homey.settings.get(SETTINGS.CODE);

    if (!(tempPollInterval === this.pollInterval)) {
      this.homey.app.updateLog(`Poll interval old: ${tempPollInterval} new: ${this.pollInterval}`);
      this.CheckPollInterval();
      this.homey.app.updateLog('Restart poll timer', 2);
      clearInterval(this._pollAlarmInterval);
      this._pollAlarmInterval = setInterval(this.pollAlarmStatus.bind(this), this.pollInterval);
    }
    this.homey.app.updateLog('Function CheckSettings end', 2);
  }

  CheckPollInterval() {
    if (this.pollInterval < DEFAULTPOLLTIME) {
      this.pollInterval = DEFAULTPOLLTIME;
      this.homey.settings.set(SETTINGS.POLLINTERVAL, DEFAULTPOLLTIME / 1000);
      this.homey.app.updateLog(`Poll interval to low, setting it to: ${DEFAULTPOLLTIME}`);
    }
  }

  onAlarmUpdate(status) {
    this.homey.app.updateLog('Function onAlarmUpdate start', 2);
    try {
      this.homey.app.updateLog(`Incomming alarm state: ${JSON.parse(status).armedStatus}`, 2);
      this.homey.app.updateLog(`Current alarm state: ${this.getCapabilityValue('homealarm_state')}`, 2);
      let armedState;
      switch (JSON.parse(status).armedStatus) {
        case ALARMSTATE.PARTIALYARMED.SECTOR:
          armedState = ALARMSTATE.PARTIALYARMED.HOMEY;
          break;
        default:
          armedState = JSON.parse(status).armedStatus;
          break;
      }
      if (armedState !== this.getCapabilityValue('homealarm_state')) {
        this.homey.app.updateLog(`Set new alarm state to ${armedState}`);
        this.setCapabilityValue('homealarm_state', armedState)
          .then(() => {
            this.homey.app.updateLog(`Trigger flow with state: ${armedState}`);
            this.triggerFlow(armedState);
          })
          .catch(error => {
            this.homey.app.updateLog(error, 0);
            this.setUnavailable(error);
          });
      }
    } catch (error) {
      this.homey.app.updateLog(error, 0);
      this.setUnavailable(error);
    }
    this.homey.app.updateLog('Function onAlarmUpdate end', 2);
  }

  triggerFlow(triggeredState) {
    this.homey.app.updateLog('Function triggerFlow start', 2);
    try {
      const state = { state: triggeredState };
      const stateChangedTrigger = this.homey.flow.getTriggerCard('homealarm_state_changed');
      stateChangedTrigger
        .trigger(null, state)
        .then(this.homey.app.updateLog(`Flow homealarm_state_changed triggered whith state: ${triggeredState} `))
        .catch(error => {
          this.homey.app.updateLog(error, 0);
          this.setUnavailable(error);
        });
    } catch (error) {
      this.homey.app.updateLog(error, 0);
      this.setUnavailable(error);
    }
    this.homey.app.updateLog('Function triggerFlow end', 2);
  }

  onAdded() {
    this.homey.app.updateLog('Function onAdded start', 2);
    try {
      this.pollAlarmStatus();
    } catch (error) {
      this.homey.app.updateLog(error, 0);
      this.setUnavailable(error);
    }
    this.homey.app.updateLog('Function onAdded end', 2);
  }

  async onCapabilityChanged(value, opts) {
    this.homey.app.updateLog('Function onCapabilityChanged start', 2);
    this.homey.app.updateLog(`Capability changed to ${value}`);
    return new Promise((resolve, reject) => {
      switch (value) {
        case ALARMSTATE.ARMED:
          this.setAlarmState(ALARMSTATE.ARMED, this.homey.app.arm.bind(this.homey.app))
            .then(message => {
              this.homey.app.updateLog(message);
              resolve();
            })
            .catch(error => {
              this.homey.app.updateLog(error, 0);
              this.setUnavailable(error);
              reject(error);
            });
          break;
        case ALARMSTATE.DISARMED:
          this.setAlarmState(ALARMSTATE.DISARMED, this.homey.app.disarm.bind(this.homey.app))
            .then(message => {
              this.homey.app.updateLog(message);
              resolve();
            })
            .catch(error => {
              this.homey.app.updateLog(error, 0);
              this.setUnavailable(error);
              reject(error);
            });
          break;
        case ALARMSTATE.PARTIALYARMED.HOMEY:
          // eslint-disable-next-line max-len
          this.setAlarmState(ALARMSTATE.PARTIALYARMED.HOMEY, this.homey.app.partialArm.bind(this.homey.app))
            .then(message => {
              this.homey.app.updateLog(message);
              resolve();
            })
            .catch(error => {
              this.homey.app.updateLog(error, 0);
              this.setUnavailable(error);
              reject(error);
            });
          break;
        default: {
          const error = new Error('Failed to set alarm state.');
          this.setUnavailable(error);
          reject(error);
          break;
        }
      }
      this.homey.app.updateLog('Function onCapabilityChanged end', 2);
    });
  }

  async setAlarmState(state, action) {
    this.homey.app.updateLog('Function setAlarmState start', 2);
    return new Promise((resolve, reject) => {
      if (!this.code || this.code === '') {
        const error = new Error('No alarm code set');
        this.setUnavailable(error);
        reject(error);
      }

      const sleep = m => new Promise(r => setTimeout(r, m));

      action(this.code)
        .then(() => {
          this.setAvailable();
          resolve(`Successfully set the alarm to: ${state} `);
        })
        .catch(() => {
          sleep(5000).then(() => {
            action(this.code)
              .then(() => {
                resolve(`Successfully set the alarm to: ${state} `);
              })
              .catch(error => {
                reject(new Error(`Faild to set the alarm to: ${state} `));
                this.homey.app.updateLog(`Err19: ${error}`, 0);
                this.setUnavailable(error);
              });
          });
        });
      this.homey.app.updateLog('Function setAlarmState end', 2);
    });
  }

}

module.exports = MyDevice;
