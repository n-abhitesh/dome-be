/**
 * Manages connection limits and tracking
 */
export class ConnectionManager {
  constructor(maxTotalConnections) {
    this.maxTotalConnections = maxTotalConnections;
    this.totalConnections = 0;
  }

  /**
   * Checks if a new connection can be accepted
   * @returns {boolean} True if connection can be accepted
   */
  canAcceptConnection() {
    return this.totalConnections < this.maxTotalConnections;
  }

  /**
   * Registers a new connection
   */
  addConnection() {
    this.totalConnections++;
  }

  /**
   * Unregisters a connection
   */
  removeConnection() {
    if (this.totalConnections > 0) {
      this.totalConnections--;
    }
  }

  /**
   * Gets current connection count
   * @returns {number} Current connection count
   */
  getConnectionCount() {
    return this.totalConnections;
  }
}
