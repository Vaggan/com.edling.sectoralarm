'use strict';

const Homey = require('homey');
const sectoralarm = require('sectoralarm');

class MyDevice extends Homey.Device {

  async onInit() {
    this.log('MyDevice has been inited');

    const username = Homey.ManagerSettings.get('username');
    const password = Homey.ManagerSettings.get('password');
    const siteid = Homey.ManagerSettings.get('siteid');

    await sectoralarm.connect(username, password, siteid, null)
      .then(async site => {
        this._site = site;
      });

    const POLL_INTERVAL = 30000; // 30 seconds
    this._pollAlarmInterval = setInterval(this.pollAlarmStatus.bind(this), POLL_INTERVAL);

    this.setInitState();
    this.registerCapabilityListener('homealarm_state', this.onCapabilityChanged.bind(this));
    this.registerFlowCardCondition();
    this.registerFlowCardAction();
  }

  setInitState() {
    this._site.status()
      .then(async status => {
        let armedState = 'disarmed';
        switch (JSON.parse(status).armedStatus) {
          case 'armed':
            armedState = 'armed';
            break;
          case 'disarmed':
            armedState = 'disarmed';
            break;
          case 'partialArmed':
            armedState = 'partially_armed';
            break;
          default:
            break;
        }
        this.setCapabilityValue('homealarm_state', armedState);
      });
  }

  registerFlowCardCondition() {
    const rainingCondition = new Homey.FlowCardCondition('homealarm_state_is');
    rainingCondition
      .register()
      .registerRunListener(async (args, state) => {
        this._site.status()
          .then(async status => {
            switch (state) {
              case 'armed':
                Promise.resolve(this.getCapabilityValue('homealarm_state') === 'armed');
                break;
              case 'disarmed':
                Promise.resolve(this.getCapabilityValue('homealarm_state') === 'disarmed');
                break;
              case 'partialArmed':
                Promise.resolve(this.getCapabilityValue('homealarm_state') === 'partially_armed');
                break;
              default:
                Promise.resolve(false);
                break;
            }
          });
      });
  }

  registerFlowCardAction() {
    const code = Homey.ManagerSettings.get('code');
    const stopRainingAction = new Homey.FlowCardAction('set_homealarm_state');
    stopRainingAction
      .register()
      .registerRunListener(async (args, state) => {
        switch (state) {
          // case 'armed':
          //   this._site.arm(code);
          //   break;
          case 'disarmed':
            this._site.disarm(code);
            break;
          case 'partialArmed':
            this._site.partialArm(code);
            break;
          default:
            Promise.resolve(false);
            break;
        }
      });
    Promise.resolve(true);
  }

  pollAlarmStatus() {
    this._site.status()
      .then(async status => {
        this.onAlarmUpdate(status);
        Promise.resolve();
      });
  }

  onAlarmUpdate(status) {
    let armedState = 'disarmed';

    // this.log('---Armed status---');
    // this.log(`Curren: ${this.getCapabilityValue('homealarm_state')}`);
    // this.log(`New: ${JSON.parse(status).armedStatus}`);

    switch (JSON.parse(status).armedStatus) {
      case 'armed':
        armedState = 'armed';
        break;
      case 'disarmed':
        armedState = 'disarmed';
        break;
      case 'partialArmed':
        armedState = 'partially_armed';
        break;
      default:
        break;
    }

    if (armedState !== this.getCapabilityValue('homealarm_state')) {
      this.setCapabilityValue('homealarm_state', armedState);
      this.triggerFlow(armedState);
    }

    Promise.resolve();
  }

  triggerFlow(triggeredState) {
    const state = { state: triggeredState };
    const stateChangedTrigger = new Homey.FlowCardTrigger('homealarm_state_changed');
    stateChangedTrigger
      .register()
      .trigger(null, state)
      .catch(this.error)
      .then(this.log('homealarm_state_changed triggered'));
  }

  onAdded() {
    this.log('Device added');
    this.pollAlarmStatus();
  }

  onCapabilityChanged(value, opts, callback) {
    const code = Homey.ManagerSettings.get('code');
    if (code === '') {
      callback('error', false);
    }

    switch (value) {
      // case 'armed':
      //   this._site.arm(code).catch(error => {
      //     this.log(`Error: ${error.code} Message: ${error.message}`);
      //   });
      //   break;
      case 'disarmed':
        this._site.disarm(code).catch(error => {
          this.log(`Error: ${error.code} Message: ${error.message}`);
        });
        break;
      case 'partially_armed':
        this._site.partialArm(code).catch(error => {
          // if (error.code === 'ERR_INVALID_SESSION') {
          //   this._site.login()
          //     .then(() => this._site.partialArm(code));
          // } else {
          this.log(`Error: ${error.code} Message: ${error.message}`);
          // }
        });
        break;
      default:
        break;
    }
    callback(null, value);
  }

}

module.exports = MyDevice;
