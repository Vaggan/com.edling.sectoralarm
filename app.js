/* eslint-disable node/no-unsupported-features/node-builtins */
/* eslint-disable global-require */

'use strict';

const Homey = require('homey');
const nodemailer = require('nodemailer');
const { Log } = require('homey-log');

if (process.env.DEBUG === '1') {
  require('inspector').open(9229, '0.0.0.0', false);
}

class MyApp extends Homey.App {

  onInit() {
    this.updateLog('MyApp is running...');
    this.homeyLog = new Log({ homey: this.homey });
    this.homey.settings.set('diagLog', '');
    this.homey.settings.set('sendLog', '');

    this.homey.settings.on('set', setting => {
      if (setting === 'diagLog') return;
      this.log(`Setting "${setting}" has chenged`);
      const diagLog = this.homey.settings.get('diagLog');
      const sendLog = this.homey.settings.get('sendLog');
      if (setting === 'sendLog' && (sendLog === 'send') && (diagLog !== '')) {
        this.sendLog();
      }
    });
  }

  updateLog(newMessage, ignoreSetting = 1) {
    if (ignoreSetting > this.homey.settings.get('logLevel')) {
      return;
    }

    this.log(newMessage);

    let oldText = this.homey.settings.get('diagLog');
    if (oldText.length > 30000) {
      // Remove the first 5000 characters.
      oldText = oldText.substring(1000);
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

    const dt = new Date(nowTime.getTime() - this.logLastTime.getTime());
    this.logLastTime = nowTime;

    oldText += '+';
    oldText += dt.getHours();
    oldText += ':';
    oldText += dt.getMinutes();
    oldText += ':';
    oldText += dt.getSeconds();
    oldText += '.';

    const milliSeconds = dt.getMilliseconds().toString();
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

module.exports = MyApp;
