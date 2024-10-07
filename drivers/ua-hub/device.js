"use strict";

const Homey = require("homey");
const Handler = require("../../lib/handlers");
const { getDeviceById } = require("../../lib/api");

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
    await this.updateLockStatus();

    // Start polling the lock status every 1 minute
    this.startPollingLockStatus();
  }

  async startPollingLockStatus() {
    this.pollingInterval = setInterval(async () => {
      await this.updateLockStatus();
    }, 60 * 1000); // Poll every 60 seconds
  }

  async updateLockStatus() {
    try {
      const uniqueId = this.getData().unique_id;
      const device = await getDeviceById(this.homey, uniqueId);

      if (device) {
        const lockState = device.configs.find(
          (config) => config.key === "input_state_rly-lock_dry"
        );

        if (lockState) {
          const isLocked = lockState.value === "off";
          this.log(`Polled lock status: ${isLocked ? "Locked" : "Unlocked"}`);

          // Update the capability status if needed
          if (this.getCapabilityValue("locked") !== isLocked) {
            await this.setCapabilityValue("locked", isLocked);
          }
        }
      }
    } catch (error) {
      this.log("Error updating lock status:", error.message);
    }
  }

  async onDeleted() {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
    }
    this.log("Device deleted:", this.getName());
  }
}

module.exports = uaHubDevice;
