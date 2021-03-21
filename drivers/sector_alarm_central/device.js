'use strict';

const Homey = require('homey');
const sectoralarm = require('sectoralarm');

const ALARMSTATE = {
  ARMED: 'armed',
  DISARMED: 'disarmed',
  PARTIALYARMED: {
    SECTOR: 'partialArmed',
    HOMEY: 'partially_armed',
  },
};
const SETTINGS = {
  USERNAME: 'username',
  PASSWORD: 'password',
  SITEID: 'siteid',
  CODE: 'code',
  POLLINTERVAL: 'pollinterval',
};
const DEFAULTPOLLTIME = 30000;

let pollInterval = '';
let username = '';
let password = '';
let siteid = '';
let code = '';

let retryLogin = true;

class MyDevice extends Homey.Device {

  async onInit() {
    this.homey.app.updateLog('Function onInit start', 2);
    this.homey.app.updateLog('Control panel device has been inited');

    pollInterval = this.homey.settings.get(SETTINGS.POLLINTERVAL) * 1000;
    username = this.homey.settings.get(SETTINGS.USERNAME);
    password = this.homey.settings.get(SETTINGS.PASSWORD);
    siteid = this.homey.settings.get(SETTINGS.SITEID);
    code = this.homey.settings.get(SETTINGS.CODE);

    this.CheckPollInterval();

    await sectoralarm.connect(username, password, siteid, null)
      .then(site => {
        this._site = site;
      })
      .catch(error => {
        this.homey.app.updateLog(error, 0);
      });
    try {
      this.homey.app.updateLog(`Set up polling for alarm central. Interval ${Number(pollInterval) / 1000} seconds`);
      this._pollAlarmInterval = setInterval(this.pollAlarmStatus.bind(this), pollInterval);
    } catch (error) {
      this.homey.app.updateLog(error, 0);
    }

    await this.setInitState();
    this.registerCapabilityListener('homealarm_state', this.onCapabilityChanged.bind(this));
    this.registerFlowCardCondition();
    this.registerFlowCardAction();
    this.homey.app.updateLog('Function onInit end', 2);
  }

  async setInitState() {
    this.homey.app.updateLog('Function setInitState start', 2);
    this._site.status()
      .then(async status => {
        let armedState;
        this.homey.app.updateLog(`Alarm state from Sector Alarm ${JSON.parse(status).armedStatus}`, 2);
        switch (JSON.parse(status).armedStatus) {
          case ALARMSTATE.PARTIALYARMED.SECTOR:
            armedState = ALARMSTATE.PARTIALYARMED.HOMEY;
            break;
          default:
            armedState = JSON.parse(status).armedStatus;
        }
        this.homey.app.updateLog(`Set initial alarm state to ${armedState}`);
        this.setCapabilityValue('homealarm_state', armedState);
      })
      .catch(error => {
        this.homey.app.updateLog(error, 0);
      });
    this.homey.app.updateLog('Function setInitState end', 2);
  }

  async registerFlowCardCondition() {
    this.homey.app.updateLog('Function registerFlowCardCondition start', 2);
    const alarmStateCondition = this.homey.flow.getConditionCard('homealarm_state_is');

    alarmStateCondition
      .registerRunListener(async (args, state) => {
        this._site.status()
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
            this._site.arm(code);
            break;
          case ALARMSTATE.DISARMED:
            this.homey.app.updateLog('Disarming');
            this._site.disarm(code);
            break;
          case ALARMSTATE.PARTIALYARMED.HOMEY:
            this.homey.app.updateLog('Arming perimeter');
            this._site.partialArm(code);
            break;
          default:
            this.homey.app.updateLog('No action taken');
            break;
        }
      });
    this.homey.app.updateLog('Function registerFLowCardAction end', 2);
  }

  pollAlarmStatus() {
    this.homey.app.updateLog('Function pollAlarmStatus start', 2);
    try {
      this.CheckSettings();
      this.homey.app.updateLog(`Polling att interval: ${Number(pollInterval) / 1000} seconds`, 2);

      this._site.status()
        .then(async status => {
          retryLogin = true;
          this.homey.app.updateLog(`Current alarm state ${JSON.parse(status).armedStatus}`);
          this.onAlarmUpdate(status);
          Promise.resolve().catch(this.homey.app.updateLog);
        })
        .catch(async error => {
          if (error.code === 'ERR_INVALID_SESSION') {
            this.homey.app.updateLog('Info: Invalid session, logging back in.');
            if (retryLogin) {
              retryLogin = false;
              await this._site.login()
                .then(() => {
                  retryLogin = true;
                  this.pollAlarmStatus();
                });
            }
          } else {
            this.homey.app.updateLog(error, 0);
          }
        });
    } catch (error) {
      this.homey.app.updateLog(error, 0);
    }
    this.homey.app.updateLog('Function pollAlarmStatus end', 2);
  }

  CheckSettings() {
    this.homey.app.updateLog('Function CheckSettings start', 2);
    const tempPollInterval = pollInterval;
    pollInterval = this.homey.settings.get(SETTINGS.POLLINTERVAL) * 1000;
    username = this.homey.settings.get(SETTINGS.USERNAME);
    password = this.homey.settings.get(SETTINGS.PASSWORD);
    siteid = this.homey.settings.get(SETTINGS.SITEID);
    code = this.homey.settings.get(SETTINGS.CODE);

    if (!(tempPollInterval === pollInterval)) {
      this.homey.app.updateLog(`Poll interval old: ${tempPollInterval} new: ${pollInterval}`);
      this.CheckPollInterval();
      this.homey.app.updateLog('Restart poll timer', 2);
      clearTimeout(this._pollAlarmInterval);
      this._pollAlarmInterval = setInterval(this.pollAlarmStatus.bind(this), pollInterval);
    }
    this.homey.app.updateLog('Function CheckSettings end', 2);
  }

  CheckPollInterval() {
    if (pollInterval < DEFAULTPOLLTIME) {
      pollInterval = DEFAULTPOLLTIME;
      this.homey.settings.set(SETTINGS.POLLINTERVAL, DEFAULTPOLLTIME);
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
        this.setCapabilityValue('homealarm_state', armedState).then(() => {
          this.homey.app.updateLog(`Trigger flow with state: ${armedState}`);
          this.triggerFlow(armedState);
        });
      }
    } catch (error) {
      this.homey.app.updateLog(error, 0);
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
        });
    } catch (error) {
      this.homey.app.updateLog(error, 0);
    }
    this.homey.app.updateLog('Function triggerFlow end', 2);
  }

  onAdded() {
    this.homey.app.updateLog('Function onAdded start', 2);
    try {
      this.pollAlarmStatus();
    } catch (error) {
      this.homey.app.updateLog(error, 0);
    }
    this.homey.app.updateLog('Function onAdded end', 2);
  }

  async onCapabilityChanged(value, opts) {
    this.homey.app.updateLog('Function onCapabilityChanged start', 2);
    this.homey.app.updateLog(`Capability changed to ${value}`);
    return new Promise((resolve, reject) => {
      switch (value) {
        case ALARMSTATE.ARMED:
          this.setAlarmState(ALARMSTATE.ARMED, this._site.arm.bind(this._site))
            .then(message => {
              this.homey.app.updateLog(message);
              resolve();
            })
            .catch(error => {
              this.homey.app.updateLog(error, 0);
              reject(error);
            });
          break;
        case ALARMSTATE.DISARMED:
          this.setAlarmState(ALARMSTATE.DISARMED, this._site.disarm.bind(this._site))
            .then(message => {
              this.homey.app.updateLog(message);
              resolve();
            })
            .catch(error => {
              this.homey.app.updateLog(error, 0);
              reject(error);
            });
          break;
        case ALARMSTATE.PARTIALYARMED.HOMEY:
          // eslint-disable-next-line max-len
          this.setAlarmState(ALARMSTATE.PARTIALYARMED.HOMEY, this._site.partialArm.bind(this._site))
            .then(message => {
              this.homey.app.updateLog(message);
              resolve();
            })
            .catch(error => {
              this.homey.app.updateLog(error, 0);
              reject(error);
            });
          break;
        default:
          reject(new Error('Failed to set alarm state.'));
          break;
      }
      this.homey.app.updateLog('Function onCapabilityChanged end', 2);
    });
  }

  async setAlarmState(state, action) {
    this.homey.app.updateLog('Function setAlarmState start', 2);
    return new Promise((resolve, reject) => {
      if (code === '') {
        reject(new Error('No alarm code set'));
      }

      const sleep = m => new Promise(r => setTimeout(r, m));

      action(code)
        .then(() => {
          resolve(`Successfully set the alarm to: ${state} `);
        })
        .catch(error => {
          sleep(5000).then(() => {
            action(code)
              .then(() => {
                resolve(`Successfully set the alarm to: ${state} `);
              })
              .catch(() => {
                reject(new Error(`Faild to set the alarm to: ${state} `));
              });
          });
        });
      this.homey.app.updateLog('Function setAlarmState end', 2);
    });
  }

}

module.exports = MyDevice;
