const axios = require("axios");
const https = require("https");

/**
 * Helper function to get stored credentials and tokens from Homey settings.
 */
async function getAuthDetails(homey) {
  homey.log("Fetching stored credentials from Homey settings...");
  const ipAddress = homey.settings.get("ip_address");
  let authCookie = homey.settings.get("authCookie");
  let csrfToken = homey.settings.get("csrfToken");

  if (!ipAddress) {
    throw new Error("IP address is missing from settings.");
  }

  if (!authCookie || !csrfToken) {
    // Perform re-login if either cookie or token is missing
    await reLogin(homey);
    authCookie = homey.settings.get("authCookie");
    csrfToken = homey.settings.get("csrfToken");

    if (!authCookie || !csrfToken) {
      throw new Error("Cannot fetch devices without authentication.");
    }
  }

  homey.log("Successfully retrieved credentials.");
  return { ipAddress, authCookie, csrfToken };
}

/**
 * Authenticate with Ubiquiti API to log in and store cookies and CSRF token.
 */
async function authenticate(homey, username, password) {
  homey.log("Starting authentication with Ubiquiti API...");
  const ipAddress = homey.settings.get("ip_address");

  const url = `https://${ipAddress}/api/auth/login`;

  const payload = {
    username: username,
    password: password,
    token: "",
    rememberMe: false,
  };

  try {
    homey.log("Sending authentication request to Ubiquiti API...");
    const response = await axios.post(url, payload, {
      headers: {
        "Content-Type": "application/json",
      },
      httpsAgent: new https.Agent({ rejectUnauthorized: false }),
    });

    const cookies = response.headers["set-cookie"];
    const csrfToken =
      response.headers["x-updated-csrf-token"] ||
      response.headers["x-csrf-token"];

    if (cookies && cookies.length > 0) {
      const authCookie = cookies[0];
      homey.settings.set("authCookie", authCookie);
      homey.log("Auth cookie has been stored successfully.");
    }

    if (csrfToken) {
      homey.settings.set("csrfToken", csrfToken);
      homey.log("CSRF token has been stored successfully.");
    }

    homey.log("Authentication successful.");
    return response;
  } catch (error) {
    throw new Error(
      "Failed to authenticate with Ubiquiti API: " + error.message
    );
  }
}

/**
 * Re-login using stored credentials.
 */
async function reLogin(homey) {
  homey.log("Attempting to re-login using stored credentials...");
  const username = homey.settings.get("username");
  const password = homey.settings.get("password");

  if (!username || !password) {
    throw new Error("Username or password is missing from settings.");
  }

  await authenticate(homey, username, password);
  homey.log("Re-login successful.");
}

/**
 * Helper function to handle retry on failure.
 * It performs a re-login and retries the provided function once.
 */
async function retryOnFailure(homey, originalFunction, ...args) {
  try {
    homey.log("Retrying operation after re-login...");
    // Re-login to refresh auth tokens
    await reLogin(homey);
    // Retry the original function with the same arguments
    const result = await originalFunction(...args);
    homey.log("Retry successful.");
    return result;
  } catch (error) {
    // If the retry fails, throw an error to stop further execution
    throw new Error(`Retry failed: ${error.message}`);
  }
}

module.exports = {
  authenticate,
  reLogin,
  getAuthDetails,
  retryOnFailure,
};
