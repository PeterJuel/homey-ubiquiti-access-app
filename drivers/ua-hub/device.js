"use strict";

const Homey = require("homey");
const Handler = require("../../lib/handlers");
const { updateLockStatus } = require("../../lib/api");

class uaHubDevice extends Homey.Device {
  async onInit() {
    this.log("Device initialized:", this.getName());
    this.warningTimeout = null;

    // Create an instance of the handler class
    this.handler = new Handler(this);

    // Set up a listener for the "locked" capability
    this.registerCapabilityListener("locked", async (value) => {
      if (value) {
        this.log("Lock command received");
        await this.handler.handleLock();
      } else {
        this.log("Unlock command received");
        await this.handler.handleUnlock();
      }
      return Promise.resolve();
    });

    // Set the initial lock status
    await updateLockStatus(this, this.homey);

    // Start polling the lock status every 1 minute
    this.startPollingLockStatus();
  }

  async startPollingLockStatus() {
    this.pollingInterval = setInterval(async () => {
      await updateLockStatus(this, this.homey);
    }, 60 * 1000); // Poll every 60 seconds
  }

  async onDeleted() {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
    }
    this.log("Device deleted:", this.getName());
  }
}

module.exports = uaHubDevice;
