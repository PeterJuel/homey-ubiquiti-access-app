"use strict";
const axios = require("axios");
const { getDevices } = require("../../lib/api"); // Import the API functions
const { reLogin } = require("../../lib/auth");
const Homey = require("homey");

class uaHubDriver extends Homey.Driver {
  async onInit() {
    this.log("MyDriver has been initialized");
  }

  /**
   * onPair is called when a user starts pairing a device.
   */
  onPair(session) {
    session.setHandler("list_devices", async () => {
      try {
        const devices = await this.listDevices();
        return devices;
      } catch (err) {
        this.log("Failed to list devices:", err.message);
        throw new Error("Failed to list devices");
      }
    });
  }

  /**
   * List devices makes a GET request to list all devices.
   * It filters devices by type "UAH" and only returns those devices.
   */
  async listDevices(retry = true) {
    try {
      // Fetch devices from the Ubiquiti API using the getDevices function from the API module
      const devices = await getDevices(this.homey);

      // Filter devices by type "UAH" and return only those
      return devices
        .filter((device) => device.device_type === "UAH")
        .map((device) => ({
          name: device.alias,
          data: {
            unique_id: device.unique_id,
            name: device.name,
            alias: device.alias,
            device_type: device.device_type,
            location_id: device.location_id,
          },
        }));
    } catch (error) {
      this.log("Error fetching devices:", error.message);

      // Retry re-login only once
      if (retry) {
        this.log("Attempting to re-authenticate...");
        await reLogin(this.homey); // Re-login using the reLogin function from auth.js
        return await this.listDevices(false); // Retry after re-login, but only once
      } else {
        throw new Error("Failed to fetch devices after re-authentication");
      }
    }
  }
}

module.exports = uaHubDriver;
