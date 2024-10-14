"use strict";

const {
  getDeviceById,
  unlockDevice,
  lockDevice,
  updateLockStatus,
} = require("./api");

class Handler {
  constructor(device) {
    this.device = device;
    this.homey = device.homey;
  }

  /**
   * Handle the door unlocking logic.
   * @param {number} [duration] - Optional duration in minutes for unlocking.
   */
  async handleUnlock(duration) {
    try {
      this.homey.log("handleUnlock called");
      // Ensure getDeviceById is correctly referenced from the imported functions
      const deviceData = await getDeviceById(
        this.homey,
        this.device.getData().unique_id
      );

      // Get the hold relay time in seconds from the device configuration
      const holdRelaySeconds = this.getConfigValue(
        deviceData,
        "hold_relay_seconds"
      );
      this.homey.log("Hold relay seconds:", holdRelaySeconds);

      let holdTime = holdRelaySeconds ? parseInt(holdRelaySeconds, 10) : 60; // Default to 60 seconds if not available

      // Convert holdTime from seconds to minutes
      holdTime = Math.ceil(holdTime / 60);

      // Override holdTime if a specific duration is provided by the user
      if (duration) {
        holdTime = duration;
      }

      this.homey.log(`Hold relay time (minutes): ${holdTime}`);

      // Locale and timezone settings for logging and capability values
      const systemLocale = Intl.DateTimeFormat().resolvedOptions().locale;
      const timezone = this.homey.clock.getTimezone();

      const currentDate = new Date();

      // Calculate the forced unlock duration based on `holdRelaySeconds` to prevent locking within this period
      const unlockUntilDate = new Date(
        currentDate.getTime() + holdRelaySeconds * 1000
      );
      // Calculate the next lock time using the user-defined `holdTime` (in minutes)
      const nextLockDate = new Date(
        currentDate.getTime() + holdTime * 60 * 1000
      );

      this.homey.log("Unlock until date:", unlockUntilDate);
      this.homey.log("Next lock date:", nextLockDate);

      // Format the dates for logging and UI purposes
      const formattedUnlockUntilDate = unlockUntilDate.toLocaleString(
        systemLocale,
        { timeZone: timezone }
      );
      const formattedNextLockTime = nextLockDate.toLocaleString(systemLocale, {
        timeZone: timezone,
      });

      // Store the calculated times for forced open and next lock
      this.device.setStoreValue(
        "forced_open_time",
        unlockUntilDate.toISOString()
      );
      this.device.setStoreValue("next_lock_time", nextLockDate.toISOString());

      // Set the capabilities for UI updates
      this.device.setCapabilityValue("forced_open", formattedUnlockUntilDate);
      this.device.setCapabilityValue("next_lock", formattedNextLockTime);

      this.homey.log(`Forced open set until: ${formattedUnlockUntilDate}`);
      this.homey.log(`Next lock set to: ${formattedNextLockTime}`);

      // Unlock the device for the duration specified by `holdTime`
      await unlockDevice(this.homey, deviceData.unique_id, holdTime);

      this.homey.log("Device unlocked");

      // Schedule the capability unlock using the provided durations
      this.scheduleCapabilityUnlock(holdRelaySeconds, nextLockDate);
    } catch (error) {
      this.homey.log("Error during unlock handling:", error.message);
    }
  }

  /**
   * Schedule capability update for re-locking after a set number of seconds.
   * @param {number} holdRelaySeconds - Time in seconds during which the door is forced open and cannot be locked.
   * @param {Date} nextLockDate - The date when the door should be locked.
   */
  scheduleCapabilityUnlock(holdRelaySeconds, nextLockDate) {
    this.homey.log("scheduleCapabilityUnlock called");
    if (this.device.unlockTimer) {
      clearTimeout(this.device.unlockTimer);
      this.homey.log("Cleared existing unlock timer");
    }

    this.device.setCapabilityValue("locked", false);
    this.homey.log("Capability 'locked' set to false");

    // Set a timeout for when the forced open period expires (using `holdRelaySeconds`)
    const forcedOpenTimeout = setTimeout(() => {
      this.device.setCapabilityValue("forced_open", ""); 
      this.device.setStoreValue("forced_open_time", "");
      this.homey.log("Forced open time expired, capability set to blank");
    }, holdRelaySeconds * 1000);

    // Set a timeout for clearing the `next_lock` capability after the `nextLockDate`
    const nextLockTimeout = setTimeout(() => {
      this.device.setCapabilityValue("next_lock", "");
      this.device.setStoreValue("next_lock_time", "");
      this.homey.log("Next lock time expired, capability set to blank");
    }, nextLockDate.getTime() - Date.now());

    this.homey.log("Timeouts set for forced open and next lock clearance");

    // Set a timer for locking the door after the entire duration (`nextLockDate`)
    this.device.unlockTimer = setTimeout(() => {
      this.device.setCapabilityValue("locked", true);
      this.homey.log(`Status updated to 'locked'`);

      clearTimeout(forcedOpenTimeout); // Clear forced_open timer if it hasn't triggered
      clearTimeout(nextLockTimeout); // Clear next_lock timer if it hasn't triggered
    }, nextLockDate.getTime() - Date.now());

    this.homey.log(
      "Unlock timer set to lock the door after specified duration"
    );
  }

  /**
   * Handle the door locking logic.
   */
  async handleLock() {
    try {
      this.homey.log("handleLock called");
      const deviceData = await getDeviceById(
        this.homey,
        this.device.getData().unique_id
      );

      const forcedOpenTime = new Date(
        this.device.getStoreValue("forced_open_time")
      );
      const currentTime = new Date();

      // If the current time is before the forced open time, lock is restricted
      if (currentTime < forcedOpenTime) {
        const warningMessage = `Locking is restricted until: ${forcedOpenTime.toLocaleString()}`;
        this.homey.log(warningMessage);

        // Set the warning and make sure to update the locked capability to false
        await this.device.setWarning(warningMessage);
        this.homey.log("Warning set:", warningMessage);

        // Explicitly set 'locked' to false
        this.device.setCapabilityValue("locked", false);
        this.homey.log("Capability 'locked' set to false due to restriction");

        // Adding a small delay to ensure UI reflects the change
        await new Promise((resolve) => setTimeout(resolve, 200));

        // Double check if 'locked' is still false
        const lockedValue = this.device.getCapabilityValue("locked");
        this.homey.log(
          "Capability 'locked' current value after update:",
          lockedValue
        );

        // Set a timeout to unset the warning after 3 seconds
        setTimeout(async () => {
          await this.device.setWarning(null);
          await updateLockStatus(this.device, this.homey);
          this.homey.log("Warning cleared after 3 seconds");
        }, 3000);

        return;
      }

      // If restriction is over, proceed with locking the device
      this.homey.log(`Attempting to lock device: ${deviceData.unique_id}`);
      const response = await lockDevice(this.homey, deviceData.unique_id);

      if (response && response.code === 1) {
        this.device.setCapabilityValue("locked", true);
        this.device.setCapabilityValue("next_lock", "");
        this.device.setStoreValue("next_lock_time", "");
        this.device.setCapabilityValue("forced_open", ""); 
        this.device.setStoreValue("forced_open_time", "");
        this.homey.log("Device locked successfully.");
      } else {
        this.device.setCapabilityValue("locked", false);
        this.homey.log("Failed to lock the device.");
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
}

module.exports = Handler;
