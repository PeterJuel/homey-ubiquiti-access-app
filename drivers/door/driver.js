"use strict";

const Homey = require("homey");
const axios = require("axios");

class MyDriver extends Homey.Driver {
  /**
   * onInit is called when the driver is initialized.
   */
  async onInit() {
    this.log("MyDriver has been initialized");
  }

  /**
   * onPair is called when a user starts pairing a device.
   * Use session to handle specific steps during the pairing process.
   */ 
  onPair(session) {
    // Handler for the login credentials
    session.setHandler("login", async () => {
      // Hardcoded credentials
      const username = "homey123";
      const password = "DEWFT3NLm!DEWFT3NLm!";

      // Perform the login via the Ubiquiti API
      try {
        const response = await this.authenticate(username, password);

        // Log the response headers
        this.log("Response Headers:", response.headers);

        // Extract and store the cookie in Homey's settings
        const cookies = response.headers["set-cookie"];
        if (cookies && cookies.length > 0) {
          const authCookie = cookies[0]; // Assuming the first cookie is the one we need
          this.homey.settings.set("authCookie", authCookie);
          this.log("Auth cookie saved to settings:", authCookie);
        } else {
          this.log("No cookies found in response");
        }

        return { success: true };
      } catch (err) {
        this.log("Login failed:", err.message);
        throw new Error("Login failed");
      }
    });

    // Handler for listing devices after successful login
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
   * authenticate sends a POST request to the Ubiquiti API to login.
   */
  async authenticate(username, password) {
    const url = "https://192.168.1.1/api/auth/login";

    const payload = {
      username: username,
      password: password,
      token: "",
      rememberMe: false,
    };

    // Make the POST request to the Ubiquiti API
    try {
      const response = await axios.post(url, payload, {
        headers: {
          "Content-Type": "application/json",
        },
        httpsAgent: new (require("https").Agent)({ rejectUnauthorized: false }), // Ignore SSL issues (self-signed cert)
      });

      return response;
    } catch (error) {
      // Log the error and rethrow it
      this.log("Error authenticating:", error.message);
      throw new Error("Failed to authenticate with Ubiquiti API");
    }
  }

  /**
   * listDevices makes a GET request to list all devices.
   * If the response status is not 200, it will attempt to log in again and retry.
   */
  async listDevices(retry = true) {
    const url = "https://192.168.1.1/proxy/access/api/v2/devices";
    const authCookie = this.homey.settings.get("authCookie");

    try {
      const response = await axios.get(url, {
        headers: {
          Cookie: authCookie,
        },
        httpsAgent: new (require("https").Agent)({ rejectUnauthorized: false }), // Ignore SSL issues (self-signed cert)
      });

      // Check if the response is not 200, log error and throw an exception
      if (response.status !== 200) {
        this.log(`Received non-200 response: ${response.status}`);
        throw new Error(
          `Failed to fetch devices, status code: ${response.status}`
        );
      }

      // Return the desired device data with everything in `data` object
      const devices = response.data.data.map((device) => ({
        name: device.alias, 
        data: {
          unique_id: device.unique_id,
          name: device.name,
          alias: device.alias,
          device_type: device.device_type,
          location_id: device.location_id,
        },
      }));

      return devices;
    } catch (error) {
      this.log("Error fetching devices:", error.message);

      // Retry login only once
      if (retry) {
        this.log("Attempting to re-authenticate...");
        await this.reLogin();
        return await this.listDevices(false); // Retry after re-login, but only once
      } else {
        throw new Error("Failed to fetch devices after re-authentication");
      }
    }
  }

  /**
   * reLogin logs in again and sets a new cookie.
   */
  async reLogin() {
    // Hardcoded credentials (can be customized)
    const username = "homey123";
    const password = "DEWFT3NLm!DEWFT3NLm!";

    const response = await this.authenticate(username, password);

    // Extract and store the new cookie
    const cookies = response.headers["set-cookie"];
    if (cookies && cookies.length > 0) {
      const authCookie = cookies[0];
      this.homey.settings.set("authCookie", authCookie);
      this.log("New auth cookie saved to settings:", authCookie);
    } else {
      this.log("No cookies found in response");
    }
  }
}

module.exports = MyDriver;
