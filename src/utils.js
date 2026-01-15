/**
 * Validates WebSocket message structure
 * @param {object} message - Message to validate
 * @returns {boolean} True if valid
 */
export function validateMessage(message) {
  if (!message || typeof message !== "object") {
    return false;
  }

  if (!message.type || typeof message.type !== "string") {
    return false;
  }

  if (!message.payload || typeof message.payload !== "object") {
    return false;
  }

  return true;
}

/**
 * Simple logging utility
 * @param {string} message - Log message
 * @param {string} level - Log level (info, warn, error)
 */
export function log(message, level = "info") {
  const timestamp = new Date().toISOString();
  const prefix = `[${timestamp}]`;
  
  switch (level) {
    case "error":
      console.error(`${prefix} ERROR: ${message}`);
      break;
    case "warn":
      console.warn(`${prefix} WARN:  ${message}`);
      break;
    default:
      console.log(`${prefix} INFO:  ${message}`);
  }
}
