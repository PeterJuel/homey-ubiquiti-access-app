"use strict";

const { getDeviceById, unlockDevice, lockDevice } = require("./api");

class Handler {
  constructor(device) {
    this.device = device;
    this.homey = device.homey;
  }

  /**
   * Handle the door unlocking logic.
   */
  async handleUnlock() {
    try {
      // Ensure getDeviceById is correctly referenced from the imported functions
      const deviceData = await getDeviceById(
        this.homey,
        this.device.getData().unique_id
      );

      const holdRelaySeconds = this.getConfigValue(
        deviceData,
        "hold_relay_seconds"
      );
      let holdTime = holdRelaySeconds ? parseInt(holdRelaySeconds, 10) : 60;
      holdTime = Math.ceil(holdTime / 60);

      this.homey.log(`Hold relay time (minutes): ${holdTime}`);

      const systemLocale = Intl.DateTimeFormat().resolvedOptions().locale;
      const timezone = this.homey.clock.getTimezone();

      const currentDate = new Date();

      const unlockUntilDate = new Date(
        currentDate.getTime() + holdRelaySeconds * 1000
      );
      const nextLockDate = new Date(
        currentDate.getTime() + holdTime * 60 * 1000
      );

      const formattedUnlockUntilDate = unlockUntilDate.toLocaleString(
        systemLocale,
        { timeZone: timezone }
      );
      const formattedNextLockTime = nextLockDate.toLocaleString(systemLocale, {
        timeZone: timezone,
      });

      this.device.setStoreValue(
        "forced_open_time",
        unlockUntilDate.toISOString()
      );
      this.device.setStoreValue("next_lock_time", nextLockDate.toISOString());

      this.device.setCapabilityValue("forced_open", formattedUnlockUntilDate);
      this.device.setCapabilityValue("next_lock", formattedNextLockTime);

      this.homey.log(`Forced open set until: ${formattedUnlockUntilDate}`);
      this.homey.log(`Next lock set to: ${formattedNextLockTime}`);

      await unlockDevice(this.homey, deviceData.unique_id, holdTime);
      this.scheduleCapabilityUnlock(holdRelaySeconds, nextLockDate);
    } catch (error) {
      this.homey.log("Error during unlock handling:", error.message);
    }
  }

  /**
   * Handle the door locking logic.
   */
  async handleLock() {
    try {
      const deviceData = await getDeviceById(
        this.homey,
        this.device.getData().unique_id
      );

      const forcedOpenTime = new Date(
        this.device.getStoreValue("forced_open_time")
      );
      const currentTime = new Date();
      const systemLocale = Intl.DateTimeFormat().resolvedOptions().locale;
      const timezone = this.homey.clock.getTimezone();

      if (currentTime < forcedOpenTime) {
        const warningMessage = `Locking is restricted until: ${forcedOpenTime.toLocaleString(
          systemLocale,
          { timeZone: timezone }
        )}`;
        await this.device.setWarning(warningMessage);

        this.homey.log(warningMessage);
        this.device.setCapabilityValue("locked", false);

        await new Promise((resolve) => setTimeout(resolve, 3000));
        this.device.setCapabilityValue("locked", false);
        this.homey.log(`Re-setting 'locked' capability to false after delay`);

        this.device.warningTimeout = setTimeout(async () => {
          await this.device.setWarning(null);
          this.device.warningTimeout = null;
        }, 5000);

        return;
      }

      this.homey.log(`Attempting to lock device: ${deviceData.unique_id}`);

      const response = await lockDevice(this.homey, deviceData.unique_id);

      if (response && response.code === 1) {
        this.homey.log("Device locked successfully.");
      } else {
        this.homey.log("Failed to lock the device.");
        this.device.setCapabilityValue("locked", false);
      }
    } catch (error) {
      this.homey.log(`Error during lock handling: ${error.message}`);
      this.device.setCapabilityValue("locked", false);
    }
  }

  /**
   * Extract config value by key from the device data.
   */
  getConfigValue(deviceData, key) {
    const config = deviceData.configs.find((config) => config.key === key);
    return config ? config.value : null;
  }

  /**
   * Schedule capability update for re-locking after a set number of seconds.
   */
  scheduleCapabilityUnlock(holdRelaySeconds, nextLockDate) {
    if (this.device.unlockTimer) {
      clearTimeout(this.device.unlockTimer);
    }

    this.device.setCapabilityValue("locked", false);

    const forcedOpenTimeout = setTimeout(() => {
      this.device.setCapabilityValue("forced_open", ""); // Clear forced_open after the timer ends
      this.device.setStoreValue("forced_open_time", "");
      this.homey.log("Forced open time expired, capability set to blank");
    }, holdRelaySeconds * 1000);

    const nextLockTimeout = setTimeout(() => {
      this.device.setCapabilityValue("next_lock", ""); // Clear next_lock after the timer ends
      this.device.setStoreValue("next_lock_time", "");
      this.homey.log("Next lock time expired, capability set to blank");
    }, nextLockDate.getTime() - Date.now());

    this.device.unlockTimer = setTimeout(() => {
      this.device.setCapabilityValue("locked", true);
      this.homey.log(
        `Homey status updated to 'locked' after ${
          holdRelaySeconds / 60
        } minute(s)`
      );
      clearTimeout(forcedOpenTimeout); // Clear forced_open timer if it hasn't triggered
      clearTimeout(nextLockTimeout); // Clear next_lock timer if it hasn't triggered
    }, holdRelaySeconds * 1000);
  }
}

module.exports = Handler;
