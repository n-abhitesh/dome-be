/**
 * Rate limiter for WebSocket connections
 */
export class RateLimiter {
  constructor(maxMessages, windowMs) {
    this.maxMessages = maxMessages;
    this.windowMs = windowMs;
    /** @type {Map<string, { count: number, resetAt: number }>} */
    this.clients = new Map();
    
    // Cleanup old entries every minute
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 60000);
  }

  /**
   * Checks if a client is within rate limits
   * @param {WebSocket} ws - WebSocket connection
   * @returns {boolean} True if within limits
   */
  check(ws) {
    const now = Date.now();
    const clientId = this.getClientId(ws);
    
    if (!this.clients.has(clientId)) {
      this.clients.set(clientId, { count: 1, resetAt: now + this.windowMs });
      return true;
    }

    const record = this.clients.get(clientId);
    
    if (now > record.resetAt) {
      record.count = 1;
      record.resetAt = now + this.windowMs;
      return true;
    }

    if (record.count >= this.maxMessages) {
      return false;
    }

    record.count++;
    return true;
  }

  /**
   * Gets a unique identifier for a client
   * @param {WebSocket} ws - WebSocket connection
   * @returns {string} Client identifier
   */
  getClientId(ws) {
    return ws.roomId ? `${ws.roomId}:${ws._socket?.remoteAddress || 'unknown'}` : 'unknown';
  }

  /**
   * Removes old entries that have expired
   */
  cleanup() {
    const now = Date.now();
    for (const [clientId, record] of this.clients.entries()) {
      if (now > record.resetAt) {
        this.clients.delete(clientId);
      }
    }
  }

  /**
   * Clears all rate limit records
   */
  clear() {
    this.clients.clear();
  }

  /**
   * Stops the cleanup interval
   */
  destroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
  }
}
