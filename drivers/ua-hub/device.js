"use strict";

const { getDeviceById, unlockDevice } = require("../../lib/api");
const Homey = require("homey");

class uaHubDevice extends Homey.Device {
  async onInit() {
    this.log("Device initialized:", this.getName());

    // Set up a listener for the "locked" capability
    this.registerCapabilityListener("locked", async (value) => {
      if (value === false) {
        // Door is being unlocked
        this.log("Door is being unlocked");
        await this.handleUnlock();
      }
    });
  }

  /**
   * Handle the door unlocking logic.
   */
  async handleUnlock() {
    
    try {
      // Fetch full device data to get config values
      const deviceData = await getDeviceById(
        this.homey,
        this.getData().unique_id
      );

      // Extract the hold_relay_seconds value from the configs
      const holdRelaySeconds = this.getConfigValue(
        deviceData,
        "hold_relay_seconds"
      );
      const holdTime = holdRelaySeconds ? parseInt(holdRelaySeconds, 10) : 30; // Default to 30 seconds if not found

      this.log(`Hold relay time (in seconds): ${holdTime}`);

      // Unlock the device via API
      await unlockDevice(this.homey, deviceData.location_id);

      // Schedule capability re-lock after the hold time
      this.scheduleCapabilityUnlock(holdTime);
    } catch (error) {
      this.log("Error during unlock handling:", error.message);
    }
  }

  /**
   * Extract config value by key.
   */
  getConfigValue(deviceData, key) {
    const config = deviceData.configs.find((config) => config.key === key);
    return config ? config.value : null;
  }

  /**
   * Schedule capability update for re-locking after a set number of seconds.
   * This only updates Homey's locked status, not the physical lock.
   */
  scheduleCapabilityUnlock(holdRelaySeconds) {
    // Clear existing timer if there is one
    if (this.unlockTimer) {
      clearTimeout(this.unlockTimer);
    }

    // Set the capability to unlocked
    this.setCapabilityValue("locked", false);

    // Schedule re-locking the capability after holdRelaySeconds
    this.unlockTimer = setTimeout(() => {
      this.setCapabilityValue("locked", true); // Update Homey to indicate the door is locked
      this.log(
        `Homey status updated to 'locked' after ${holdRelaySeconds} seconds`
      );
    }, holdRelaySeconds * 1000); // Convert to milliseconds
  }
}

module.exports = uaHubDevice;
