"use strict";

const net = require("net");

class Papertrail {
  constructor(homey) {
    this.homey = homey;
    this.host = this.homey.settings.get("papertrail-host");
    this.port = this.homey.settings.get("papertrail-port");
  }

  /**
   * Sends a log message to Papertrail over Syslog (TCP).
   * @param {string} [appName="Default"] - The name of the app sending the log, defaults to 'Blank'.
   * @param {string} [message="Blank"] - The log message to be sent, defaults to 'Blank'.
   * @param {number} [pri=14] - The priority value (PRI) for the Syslog message, defaults to 14 (informational).
   * @param {string} [hostname="Homey"] - The system/hostname for the log, defaults to 'Homey'.
   */
  sendLogMessage(
    appName = "Default",
    message = "Blank",
    pri = 14,
    hostname = "Homey"
  ) {
    if (!this.host || !this.port) {
      this.homey.log("Host or port is missing. Cannot send log message.");
      return;
    }

    const timestamp = new Date().toISOString(); // ISO format timestamp

    // Construct the Syslog message in RFC 5424 format
    const syslogMessage = `<${pri}>1 ${timestamp} ${hostname} ${appName} - - - ${message}`;

    const client = net.createConnection(this.port, this.host, () => {
      //this.homey.log("Connected to Papertrail. Sending log message...");
      client.write(`${syslogMessage}\n`); // Send the message
      client.end();
    });

    client.on("end", () => {
      //this.homey.log("Disconnected from Papertrail");
    });

    client.on("error", (err) => {
      this.homey.error(`Error sending log to Papertrail: ${err.message}`);
    });
  }
}

module.exports = Papertrail;
