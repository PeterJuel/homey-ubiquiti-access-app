'use strict';

const Homey = require('homey');
const Papertrail = require("./lib/papertrail");

class comUbiquitiAccessApp extends Homey.App {
  /**
   * onInit is called when the app is initialized.
   */
  async onInit() {
    this.log("com.ubiquiti.access has been initialized");

    // Initialize Papertrail and set up logging if Papertrail is configured
    this.initializePapertrail();

    // Listen for changes in Papertrail settings and reinitialize Papertrail
    this.homey.settings.on("set", (key) => {
      if (key === "papertrail-host" || key === "papertrail-port") {
        this.log(`Papertrail settings updated for ${key}, reinitializing...`);
        this.papertrailInitialized = false;
        this.debounceInitializePapertrail();
      }
    });

    // Hook into console logging if Papertrail is configured
    if (this.papertrail) {
      this.hookIntoConsoleLogging();
    }
  }

  // Papertrail initialization and logging hook
  initializePapertrail() {
    if (this.papertrailInitialized) {
      this.log("Papertrail is already initialized. Skipping initialization.");
      return;
    }

    const host = this.homey.settings.get("papertrail-host");
    const port = this.homey.settings.get("papertrail-port");

    if (host && port) {
      this.papertrail = new Papertrail(this.homey);
      this.papertrail.sendLogMessage(
        this.manifest.id,
        "Papertrail started successfully!"
      );

      this.hookIntoConsoleLogging();

      // Set the flag to prevent re-initialization
      this.papertrailInitialized = true;
    } else {
      this.log("Papertrail logging is not configured.");
      this.papertrail = null;
      this.papertrailInitialized = false;
    }
  }

  debounceInitializePapertrail() {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);

    this.debounceTimer = setTimeout(() => {
      this.initializePapertrail();
    }, 500);
  }

  hookIntoConsoleLogging() {
    // Ensure hooks are only set once
    if (this.consoleHooked) {
      return;
    }

    // Preserve the original log and error methods
    const originalConsoleLog = console.log;
    const originalConsoleError = console.error;

    // Send logs to Papertrail only once within this method
    const logToPapertrail = (message, pri) => {
      if (this.papertrail) {
        // Extract the relevant part of the log message by removing the timestamp
        const filteredMessage = this.extractRelevantLogMessage(message);

        // Only send to Papertrail if it's not empty
        if (filteredMessage && filteredMessage.trim() !== "") {
          this.papertrail.sendLogMessage(
            this.manifest.id,
            filteredMessage,
            pri
          );
        }
      }
    };

    // Hook into console.log and prevent double logging
    console.log = (...args) => {
      const message = args.join(" ");

      // Call the original console log first to maintain original behavior
      originalConsoleLog.apply(console, args);

      // Ensure we don't recursively log Papertrail messages
      if (!message.includes("Papertrail")) {
        logToPapertrail(message, 14); // PRI 14 for informational logs
      }
    };

    // Hook into console.error and prevent double logging
    console.error = (...args) => {
      const message = args.join(" ");

      // Call the original console error first to maintain original behavior
      originalConsoleError.apply(console, args);

      // Ensure we don't recursively log Papertrail errors
      if (!message.includes("Papertrail")) {
        logToPapertrail(message, 3); // PRI 3 for errors
      }
    };

    // Mark that hooks have been set to prevent re-hooking
    this.consoleHooked = true;
  }

  extractRelevantLogMessage(message) {
    // Regex for ISO 8601 timestamp (production format) and [log]
    const isoTimestampRegex =
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z \[log\]\s+/;

    // Regex for the earlier format (e.g., Tue Sep 24 2024 06:43:08 GMT)
    const longDateRegex =
      /^\w{3}\s\w{3}\s\d{2}\s\d{4}\s\d{2}:\d{2}:\d{2}\sGMT[^\[]+/;

    // First attempt to remove the ISO 8601 timestamp and [log]
    let cleanedMessage = message.replace(isoTimestampRegex, "").trim();

    // If the message is still unchanged, try to clean using the long date format
    if (cleanedMessage === message) {
      cleanedMessage = message.replace(longDateRegex, "").trim();
    }

    return cleanedMessage;
  }
}

module.exports = comUbiquitiAccessApp;
