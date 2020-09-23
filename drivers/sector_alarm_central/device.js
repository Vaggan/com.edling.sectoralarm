'use strict';

const Homey = require('homey');
const sectoralarm = require('sectoralarm');

const POLL_INTERVAL = 30000; // 30 seconds
const ALARMSTATE = {
  ARMED: 'armed',
  DISARMED: 'disarmed',
  PARTIALYARMED: {
    SECTOR: 'partialArmed',
    HOMEY: 'partially_armed',
  },
};
const settings = {
  USERNAME: 'username',
  PASSWORD: 'password',
  SITEID: 'siteid',
  CODE: 'code',
};

class MyDevice extends Homey.Device {

  async onInit() {
    this.log('MyDevice has been inited');

    const username = this.homey.settings.get(settings.USERNAME);
    const password = this.homey.settings.get(settings.PASSWORD);
    const siteid = this.homey.settings.get(settings.SITEID);

    await sectoralarm.connect(username, password, siteid, null)
      .then(site => {
        this._site = site;
      })
      .catch(error => {
        this.log(`Error: ${error}`);
      });
    try {
      this._pollAlarmInterval = setInterval(this.pollAlarmStatus.bind(this), POLL_INTERVAL);
    } catch (e) {
      this.log(e.message);
    }

    await this.setInitState();
    this.registerCapabilityListener('homealarm_state', this.onCapabilityChanged.bind(this));
    await this.registerFlowCardCondition();
    await this.registerFlowCardAction();
  }

  async setInitState() {
    this._site.status()
      .then(async status => {
        let armedState = ALARMSTATE.DISARMED;
        switch (JSON.parse(status).armedStatus) {
          case ALARMSTATE.PARTIALYARMED.SECTOR:
            armedState = ALARMSTATE.PARTIALYARMED.HOMEY;
            break;
          default:
            armedState = JSON.parse(status).armedStatus;
        }
        this.setCapabilityValue('homealarm_state', armedState);
      })
      .catch(error => {
        this.log(`Error: ${error}`);
      });
  }

  async registerFlowCardCondition() {
    const alarmStateCondition = this.homey.flow.getConditionCard('homealarm_state_is');
    alarmStateCondition
      .registerRunListener(async (args, state) => {
        this._site.status()
          .then(async status => {
            switch (state) {
              case ALARMSTATE.PARTIALYARMED.SECTOR:
                return this.getCapabilityValue('homealarm_state') === ALARMSTATE.PARTIALYARMED.HOMEY;
              default:
                return this.getCapabilityValue('homealarm_state') === state;
            }
          })
          .catch(error => {
            this.log(`Error: ${error}`);
          });
      });
  }

  async registerFlowCardAction() {
    const code = this.homey.settings.get(settings.CODE);
    const alarmStateAction = this.homey.flow.getActionCard('set_homealarm_state');
    alarmStateAction
      .registerRunListener(async (args, state) => {
        switch (state) {
          case ALARMSTATE.ARMED:
            this._site.arm(code);
            break;
          case ALARMSTATE.DISARMED:
            this._site.disarm(code);
            break;
          case ALARMSTATE.PARTIALYARMED.HOMEY:
            this._site.partialArm(code);
            break;
          default:
            break;
        }
      });
  }

  pollAlarmStatus() {
    try {
      this._site.status()
        .then(async status => {
          this.onAlarmUpdate(status);
          Promise.resolve().catch(this.log);
        })
        .catch(error => {
          if (error.code === 'ERR_INVALID_SESSION') {
            this.log('Info: Invalid session, logging back in.');
            this._site.login()
              .then(() => this.pollAlarmStatus());
          } else {
            this.error(`Error: ${error}`);
          }
        });
    } catch (e) {
      this.error(e);
    }
  }

  onAlarmUpdate(status) {
    try {
      let armedState = ALARMSTATE.DISARMED;
      switch (JSON.parse(status).armedStatus) {
        case ALARMSTATE.PARTIALYARMED.SECTOR:
          armedState = ALARMSTATE.PARTIALYARMED.HOMEY;
          break;
        default:
          armedState = JSON.parse(status).armedStatus;
          break;
      }
      if (armedState !== this.getCapabilityValue('homealarm_state')) {
        this.setCapabilityValue('homealarm_state', armedState);
        this.triggerFlow(armedState);
      }
    } catch (e) {
      this.log(e.message);
    }
  }

  triggerFlow(triggeredState) {
    try {
      const state = { state: triggeredState };
      const stateChangedTrigger = this.homey.flow.getTriggerCard('homealarm_state_changed');
      stateChangedTrigger
        .trigger(null, state)
        .then(this.log(`homealarm_state_changed trigger: ${triggeredState}`))
        .catch(error => {
          this.log(`Error: ${error}`);
        });
    } catch (e) {
      this.log(e.message);
    }
  }

  onAdded() {
    try {
      this.pollAlarmStatus();
    } catch (e) {
      this.log(e.message);
    }
  }

  onCapabilityChanged(value, opts) {
    const code = this.homey.settings.get(settings.CODE);
    if (code === '') {
      Promise.reject();
    }
    switch (value) {
      case ALARMSTATE.ARMED:
        this._site.arm(code).catch(error => {
          this.log(`Error: ${error.code} Message: ${error.message}`);
        });
        break;
      case ALARMSTATE.DISARMED:
        this._site.disarm(code).catch(error => {
          this.log(`Error: ${error.code} Message: ${error.message}`);
        });
        break;
      case ALARMSTATE.PARTIALYARMED.HOMEY:
        this._site.partialArm(code).catch(error => {
          this.log(`Error: ${error.code} Message: ${error.message}`);
        });
        break;
      default:
        break;
    }
    Promise.resolve();
  }

}

module.exports = MyDevice;
