const axios = require("axios");
const { getAuthDetails, reLogin } = require("./auth");
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
    throw new Error(`Error fetching devices: ${error.message}`);
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
 * Unlock a specific device (door).
 */
async function unlockDevice(homey, locationId) {
  try {
    const { ipAddress, authCookie, csrfToken } = await getAuthDetails(homey);

    const url = `https://${ipAddress}/proxy/access/api/v2/location/${locationId}/unlock`;
    const response = await axios.put(url, null, {
      headers: {
        Cookie: authCookie,
        "X-CSRF-Token": csrfToken,
      },
      httpsAgent: new https.Agent({ rejectUnauthorized: false }),
    });

    if (response.status !== 200) {
      throw new Error(
        `Failed to unlock the device, status code: ${response.status}`
      );
    }

    return response.data;
  } catch (error) {
    throw new Error(`Error unlocking device: ${error.message}`);
  }
}

module.exports = {
  getDevices,
  getDeviceById,
  unlockDevice,
};
