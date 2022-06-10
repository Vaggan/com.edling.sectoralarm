/* eslint-disable node/no-unsupported-features/node-builtins */
/* eslint-disable global-require */

'use strict';

const Homey = require('homey');
const nodemailer = require('nodemailer');
const { Log } = require('homey-log');
const sectoralarm = require('sectoralarm');
const Mutex = require('async-mutex').Mutex;

const SETTINGS = {
  USERNAME: 'username',
  PASSWORD: 'password',
  SITEID: 'siteid',
  LOCKCODE: 'lockcode',
  POLLINTERVAL: 'pollinterval',
};

if (process.env.DEBUG === '1') {
  require('inspector').open(9229, '0.0.0.0', false);
}

class MyApp extends Homey.App {

  onInit() {
    this.homeyLog = new Log({ homey: this.homey });
    this.updateLog('MyApp is running...');
    this.homey.settings.set('diagLog', '');
    this.homey.settings.set('sendLog', '');
    this.mutex = new Mutex();
    this._site = null;
    this._password = null;
    this._username = null;
    this._siteid = null;
    this._MaxRetryLoginCount = 10;
    this._retryLoginCount = this._MaxRetryLoginCount;

    this.homey.settings.on('set', setting => {
      if (setting === 'diagLog') return;
      this.log(`Setting "${setting}" has changed`);
      const diagLog = this.homey.settings.get('diagLog');
      const sendLog = this.homey.settings.get('sendLog');
      if (setting === 'sendLog' && (sendLog === 'send') && (diagLog !== '')) {
        this.sendLog();
      }
    });
  }

  updateLog(newMessage, ignoreSetting = 1) {
    let logLevel = this.homey.settings.get('logLevel');
    if (!logLevel || logLevel === '') {
      logLevel = 1;
    }
    if (ignoreSetting > logLevel) {
      return;
    }

    this.log(newMessage);

    let oldText = this.homey.settings.get('diagLog') || '';
    if (oldText.length > 10000) {
      // Remove the first 5000 characters.
      oldText = oldText.substring(5000);
      const n = oldText.indexOf('\n');
      if (n >= 0) {
        // Remove up to and including the first \n so the log starts on a whole line
        oldText = oldText.substring(n + 1);
      }
    }

    const nowTime = new Date(Date.now());

    if (oldText.length === 0) {
      oldText = 'Log ID: ';
      oldText += nowTime.toJSON();
      oldText += '\r\n';
      oldText += 'App version ';
      oldText += Homey.manifest.version;
      oldText += '\r\n\r\n';
      this.logLastTime = nowTime;
    }

    if (this.logLastTime === undefined) {
      this.logLastTime = nowTime;
    }

    // const dt = new Date(nowTime.getTime() - this.logLastTime.getTime());
    this.logLastTime = nowTime;

    oldText += '+';
    oldText += nowTime.getHours();
    oldText += ':';
    oldText += nowTime.getMinutes();
    oldText += ':';
    oldText += nowTime.getSeconds();
    oldText += '.';

    const milliSeconds = nowTime.getMilliseconds().toString();
    if (milliSeconds.length === 2) {
      oldText += '0';
    } else if (milliSeconds.length === 1) {
      oldText += '00';
    }

    oldText += milliSeconds;
    oldText += ': ';
    oldText += newMessage;
    oldText += '\r\n';

    this.homey.settings.set('diagLog', oldText);
    this.homeyLog.setExtra({
      diagLog: this.homey.settings.get('diagLog'),
    });
    this.homey.settings.set('sendLog', '');
  }

  async sendLog() {
    let tries = 5;

    while (tries-- > 0) {
      try {
        this.updateLog('Sending log', 0);
        // create reusable transporter object using the default SMTP transport
        const transporter = nodemailer.createTransport(
          {
            host: Homey.env.MAIL_HOST, // Homey.env.MAIL_HOST,
            port: 587,
            ignoreTLS: false,
            secure: false, // true for 465, false for other ports
            auth:
            {
              user: Homey.env.MAIL_USER, // generated ethereal user
              pass: Homey.env.MAIL_SECRET, // generated ethereal password
            },
            tls:
            {
              // do not fail on invalid certs
              rejectUnauthorized: false,
            },
          },
        );

        // send mail with defined transport object
        const info = await transporter.sendMail(
          {
            from: `"Homey User" <${Homey.env.MAIL_USER}>`, // sender address
            to: Homey.env.MAIL_RECIPIENT, // list of receivers
            subject: 'Sector Alarm log', // Subject line
            text: this.homey.settings.get('diagLog'), // plain text body
          },
        );

        this.updateLog(`Message sent: ${info.messageId}`);

        // Preview only available when sending through an Ethereal account
        this.log('Preview URL: ', nodemailer.getTestMessageUrl(info));
        return '';
      } catch (err) {
        this.updateLog(`Send log error: ${err.stack}`, 0);
      }
    }
    this.updateLog('Send log FAILED', 0);
    return '';
  }

}



// *****************************************************************************
// ***                WRAPPER FUNCTIONS FOR SECTOR_ALARM API                 ***
// *****************************************************************************

// Private function to get and refresh SectorAlarm connection
async function private_connectToSite(app) {
  const username = await app.homey.settings.get(SETTINGS.USERNAME);
  const password = await app.homey.settings.get(SETTINGS.PASSWORD);
  const siteid = await app.homey.settings.get(SETTINGS.SITEID);
  if (app._site === null ||
    app._password != password ||
    app._username != username ||
    app._siteid   != siteid) {

    const settings = await sectoralarm.createSettings();
    settings.numberOfRetries = 2;
    settings.retryDelayInMs = 3000;
    app._password = password
    app._username = username
    app._siteid = siteid

    await sectoralarm.connect(username, password, siteid, settings)
    .then(site => {
      app.updateLog("private_connectToSite -> Got connection")
      app._site = site;
      return true;
    })
    .catch(error => {
      app.updateLog("private_connectToSite -> Error: No connection", 0)
      throw(error);
    });
  } else {
    return true;
  }
}


// Private wraper function to enforce retrying all sectoralarm api calls upon errors
// Any parameters after the "functioncall" variable will be passed on to "functioncall"
// when it is called
async function private_sectoralarmWrapper(functioncall) {
  // Make sure there is a connection first and refresh it if broken
  try {
    await private_connectToSite(this);
  } catch(error) {
    this.updateLog("private_sectoralarmWrapper -> reconnect err", 0);
    throw(error);
  }
  // Try to execute the api call
  try {
    const args = Array.prototype.slice.call(arguments, 1); // Only pass on arguments that belong to the function call
    const retval = await functioncall.apply(this._site, args);
    this._retryLoginCount = this._MaxRetryLoginCount;
    this.updateLog("private_sectoralarmWrapper -> Success: " + String(retval));
    return retval;
  } catch (error) {
    // Upon error retry until we get positive api call response or retry limit is reached
    if (error.code === 'ERR_INVALID_SESSION') {
      this.updateLog('private_sectoralarmWrapper Info: Invalid session, logging back in.');
      var session_id;
      try {
        session_id = await this._site.login();
      } catch(innerError) {
        this.updateLog("private_sectoralarmWrapper Unable to log in: " + innerError, 0);
        throw(innerError);
      }
      if (session_id.match(/(?<=ASPXAUTH=).+(?=;)/)) {
        // A valid session id was returned
        if (this._retryLoginCount > 0) {
          this.updateLog("private_sectoralarmWrapper -> Retry communication (" + String(this._retryLoginCount) + ")");
          this._retryLoginCount--;
          return private_sectoralarmWrapper.apply(this, arguments);
        } else {
          this.updateLog("private_sectoralarmWrapper -> number of login retries exceeded");
          throw(error);
        }
      } else {
        // Unable to obtain session cookie, most likely because the user has been blocked
        throw("Unable to log in. Please check that the user has not been blocked and that the user/password and pin codes are correct");
      }
    } else {
      // Pass on errors
      this.updateLog("private_sectoralarmWrapper -> outer err code was: " + String(error.code), 0);
      throw(error);
    }
  }
}

// Wrap all sectoralarm function calls inside mutex-protected promises
async function private_sectoralarmProtectedWrapper(functioncall) {
  return new Promise(async (resolve, reject) => {
    await this.mutex.runExclusive( async() => {
      try {
        const value = await private_sectoralarmWrapper.apply(this, arguments);
        resolve (value);
      } catch (error) {
        reject(error);
      }
    })
  })
}


// Create prototype functions for all sectoralarm API calls that need to be handled
// by the wrapper functions above

MyApp.prototype.connectToSite = async function() {
  await this.mutex.runExclusive( async() => {
    return await private_connectToSite(this)
  })
}

MyApp.prototype.status = async function() {
  return private_sectoralarmProtectedWrapper.call(this, this._site.status);
}

MyApp.prototype.locks = async function(lock_id) {
  return private_sectoralarmProtectedWrapper.call(this, this._site.locks, lock_id);
}

MyApp.prototype.lock = async function(lock_id, code) {
  return private_sectoralarmProtectedWrapper.call(this, this._site.lock, lock_id, code);
}

MyApp.prototype.unlock = async function(lock_id, code) {
  return private_sectoralarmProtectedWrapper.call(this, this._site.unlock, lock_id, code);
}

MyApp.prototype.arm = async function(code) {
  return private_sectoralarmProtectedWrapper.call(this, this._site.arm, code);
}

MyApp.prototype.disarm = async function(code) {
  return private_sectoralarmProtectedWrapper.call(this, this._site.disarm, code);
}

MyApp.prototype.partialArm = async function(code) {
  return private_sectoralarmProtectedWrapper.call(this, this._site.partialArm, code);
}

module.exports = MyApp;
