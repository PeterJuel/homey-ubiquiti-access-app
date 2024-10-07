'use strict';

const Homey = require('homey');

class comUbiquitiAccessApp extends Homey.App {

  /**
   * onInit is called when the app is initialized.
   */
  async onInit() {
    this.log("com.ubiquiti.access has been initialized");
  }

}

module.exports = comUbiquitiAccessApp;
