const axios = require("axios");
const https = require("https");

/**
 * Helper function to get stored credentials and tokens from Homey settings.
 */
async function getAuthDetails(homey) {
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

  return { ipAddress, authCookie, csrfToken };
}

/**
 * Authenticate with Ubiquiti API to log in and store cookies and CSRF token.
 */
async function authenticate(homey, username, password) {
  const ipAddress = homey.settings.get("ip_address");

  const url = `https://${ipAddress}/api/auth/login`;

  const payload = {
    username: username,
    password: password,
    token: "",
    rememberMe: false,
  };

  try {
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
    }

    if (csrfToken) {
      homey.settings.set("csrfToken", csrfToken);
    }

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
  const username = homey.settings.get("username");
  const password = homey.settings.get("password");

  if (!username || !password) {
    throw new Error("Username or password is missing from settings.");
  }

  await authenticate(homey, username, password);
}

module.exports = {
  authenticate,
  reLogin,
  getAuthDetails,
};
