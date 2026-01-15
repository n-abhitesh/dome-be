/**
 * Production configuration constants
 */

export const CONFIG = {
  // Message size limits
  MAX_MESSAGE_SIZE: parseInt(process.env.MAX_MESSAGE_SIZE || '10485760', 10), // 10MB default
  MAX_CODE_SIZE: parseInt(process.env.MAX_CODE_SIZE || '5242880', 10), // 5MB default
  
  // Rate limiting
  RATE_LIMIT_MESSAGES: parseInt(process.env.RATE_LIMIT_MESSAGES || '100', 10), // messages per window
  RATE_LIMIT_WINDOW_MS: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10), // 1 minute
  
  // Connection limits
  MAX_CONNECTIONS_PER_ROOM: parseInt(process.env.MAX_CONNECTIONS_PER_ROOM || '50', 10),
  MAX_TOTAL_CONNECTIONS: parseInt(process.env.MAX_TOTAL_CONNECTIONS || '1000', 10),
  
  // Room ID validation
  ROOM_ID_MIN_LENGTH: 6,
  ROOM_ID_MAX_LENGTH: 20,
  ROOM_ID_PATTERN: /^[a-zA-Z0-9_-]+$/,
  
  // Server
  PORT: parseInt(process.env.PORT || '3001', 10),
  HOST: process.env.HOST || '0.0.0.0',
  
  // Graceful shutdown timeout
  SHUTDOWN_TIMEOUT_MS: parseInt(process.env.SHUTDOWN_TIMEOUT_MS || '10000', 10), // 10 seconds
};

/**
 * Validates configuration values
 */
export function validateConfig() {
  const errors = [];
  
  if (CONFIG.MAX_MESSAGE_SIZE <= 0 || CONFIG.MAX_MESSAGE_SIZE > 100 * 1024 * 1024) {
    errors.push('MAX_MESSAGE_SIZE must be between 1 and 100MB');
  }
  
  if (CONFIG.MAX_CODE_SIZE <= 0 || CONFIG.MAX_CODE_SIZE > 50 * 1024 * 1024) {
    errors.push('MAX_CODE_SIZE must be between 1 and 50MB');
  }
  
  if (CONFIG.RATE_LIMIT_MESSAGES <= 0 || CONFIG.RATE_LIMIT_MESSAGES > 10000) {
    errors.push('RATE_LIMIT_MESSAGES must be between 1 and 10000');
  }
  
  if (CONFIG.MAX_CONNECTIONS_PER_ROOM <= 0 || CONFIG.MAX_CONNECTIONS_PER_ROOM > 1000) {
    errors.push('MAX_CONNECTIONS_PER_ROOM must be between 1 and 1000');
  }
  
  if (CONFIG.PORT < 1 || CONFIG.PORT > 65535) {
    errors.push('PORT must be between 1 and 65535');
  }
  
  if (errors.length > 0) {
    throw new Error(`Configuration errors: ${errors.join(', ')}`);
  }
}
