const axios = require("axios");
const { getAuthDetails, retryOnFailure } = require("./auth");
const https = require("https");

/**
 * Makes an authenticated GET request to the Ubiquiti API
 */
async function getDevices(homey) {
  try {
    // Get IP address, authentication cookie, and CSRF token
    const { ipAddress, authCookie, csrfToken } = await getAuthDetails(homey);

    // Define the Ubiquiti API endpoint
    const url = `https://${ipAddress}/proxy/access/api/v2/devices`;

    // Make the GET request to the Ubiquiti API with the necessary headers
    const response = await axios.get(url, {
      headers: {
        Cookie: authCookie,
        "X-CSRF-Token": csrfToken,
      },
      httpsAgent: new https.Agent({ rejectUnauthorized: false }), // Bypass SSL issues for self-signed certs
    });

    // Return the devices data from the Ubiquiti API response
    return response.data.data; // This will return the array of devices
  } catch (error) {
    // Retry once on failure
    console.error(`Error during API call: ${error.message}`);
    if (error.response && error.response.status === 401) {
      // If the error is 401 Unauthorized, retry
      return await retryOnFailure(homey, getDevices, homey);
    } else {
      // Throw error for non-auth-related issues
      throw new Error(`Error fetching devices: ${error.message}`);
    }
  }
}

/**
 * Find device by unique ID.
 */
async function getDeviceById(homey, uniqueId) {
  const devices = await getDevices(homey); // Fetch all devices
  return devices.find((device) => device.unique_id === uniqueId);
}

/**
 * Unlock a specific device (door) by setting a temporary lock rule with a custom hold time.
 */
async function unlockDevice(homey, deviceId, holdTime) {
  try {
    const { ipAddress, authCookie, csrfToken } = await getAuthDetails(homey);

    // Set the lock rule API endpoint
    const url = `https://${ipAddress}/proxy/access/api/v2/device/${deviceId}/lock_rule?get_result=true`;

    // Prepare the payload to send the hold time in seconds
    const payload = {
      type: "custom",
      interval: Math.ceil(holdTime / 60), // Convert seconds to minutes
    };

    // Make the PUT request to set the temporary unlock rule with the specified hold time
    const response = await axios.put(url, payload, {
      headers: {
        Cookie: authCookie,
        "X-CSRF-Token": csrfToken,
        "Content-Type": "application/json",
      },
      httpsAgent: new https.Agent({ rejectUnauthorized: false }),
    });

    // Check if the status is not 200 and throw an error
    if (response.status !== 200) {
      console.error("Failed to unlock the device. Response:", response);
      throw new Error(
        `Failed to unlock the device, status code: ${response.status}`
      );
    }

    return response.data;
  } catch (error) {
    console.error(`Error during unlock: ${error.message}`);
    if (error.response && error.response.status === 401) {
      // Retry on 401 Unauthorized error
      return await retryOnFailure(homey, unlockDevice, homey, deviceId, holdTime);
    } else {
      console.error(`Error during unlock: ${error.message}`);
      if (error.response && error.response.status === 401) {
        // Retry on 401 Unauthorized error
        return await retryOnFailure(
          homey,
          unlockDevice,
          homey,
          deviceId,
          holdTime
        );
      } else {
        throw new Error(`Error unlocking device: ${error.message}`);
      }
    }
  }
}

/**
 * Lock a specific device (door).
 */
async function lockDevice(homey, deviceId) {
  try {
    const { ipAddress, authCookie, csrfToken } = await getAuthDetails(homey);

    const url = `https://${ipAddress}/proxy/access/api/v2/device/${deviceId}/lock_rule?get_result=true`;
    const response = await axios.put(
      url,
      {
        type: "reset", // Reset will lock the door according to the API documentation
      },
      {
        headers: {
          Cookie: authCookie,
          "X-CSRF-Token": csrfToken,
        },
        httpsAgent: new https.Agent({ rejectUnauthorized: false }), // Ignore SSL issues
      }
    );

    if (response.status !== 200) {
      throw new Error(`Failed to lock the device, status code: ${response.status}`);
    }

    return response.data;
  } catch (error) {
    console.error(`Error during lock attempt: ${error.message}`);
    if (error.response && error.response.status === 401) {
      // Retry on 401 Unauthorized error
      return await retryOnFailure(homey, lockDevice, homey, deviceId);
    } else {
      throw new Error(`Error locking device: ${error.message}`);
    }
  }
}

/**
 * Update the lock status for a device.
 * @param {Homey.Device} device - The device instance to update.
 * @param {Homey} homey - The Homey instance.
 */
async function updateLockStatus(device, homey) {
  try {
    const uniqueId = device.getData().unique_id;
    const deviceData = await getDeviceById(homey, uniqueId);

    if (deviceData) {
      const lockState = deviceData.configs.find(
        (config) => config.key === "input_state_rly-lock_dry"
      );

      if (lockState) {
        const isLocked = lockState.value === "off";
        homey.log(`Polled lock status: ${isLocked ? "Locked" : "Unlocked"}`);

        // Update the capability status if needed
        if (device.getCapabilityValue("locked") !== isLocked) {
          await device.setCapabilityValue("locked", isLocked);
        }
      }
    }
  } catch (error) {
    homey.log("Error updating lock status:", error.message);
  }
}


module.exports = {
  getDevices,
  getDeviceById,
  unlockDevice,
  lockDevice,
  updateLockStatus,
};
