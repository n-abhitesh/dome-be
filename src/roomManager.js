import { nanoid } from "nanoid";

/**
 * Manages WebSocket rooms and their state
 */
export class RoomManager {
  constructor() {
    /** @type {Map<string, Room>} */
    this.rooms = new Map();
  }

  /**
   * Creates a new room with a unique ID
   * @returns {string} Room ID
   */
  createRoom() {
    const roomId = nanoid(6);
    this.rooms.set(roomId, {
      clients: new Set(),
      code: "",
      createdAt: Date.now(),
    });
    return roomId;
  }

  /**
   * Adds a client to a room, creating it if it doesn't exist
   * @param {string} roomId - Room identifier
   * @param {WebSocket} ws - WebSocket connection
   * @returns {Room} Room object
   * @throws {Error} If roomId is invalid
   */
  joinRoom(roomId, ws) {
    if (!roomId || typeof roomId !== "string") {
      throw new Error("Invalid room ID");
    }

    if (!this.rooms.has(roomId)) {
      this.rooms.set(roomId, {
        clients: new Set(),
        code: "",
        createdAt: Date.now(),
      });
    }

    const room = this.rooms.get(roomId);
    if (!room) {
      throw new Error("Failed to create or retrieve room");
    }

    room.clients.add(ws);
    return room;
  }

  /**
   * Removes a client from a room and cleans up empty rooms
   * @param {string} roomId - Room identifier
   * @param {WebSocket} ws - WebSocket connection
   */
  leaveRoom(roomId, ws) {
    if (!roomId) return;

    const room = this.rooms.get(roomId);
    if (!room) return;

    room.clients.delete(ws);

    // Clean up empty rooms
    if (room.clients.size === 0) {
      this.rooms.delete(roomId);
    }
  }

  /**
   * Broadcasts a message to all clients in a room except the sender
   * @param {string} roomId - Room identifier
   * @param {WebSocket|null} sender - Sender WebSocket (excluded from broadcast)
   * @param {string} message - Message string to send
   */
  broadcast(roomId, sender, message) {
    if (!roomId || !message) return;

    const room = this.rooms.get(roomId);
    if (!room) return;

    let sentCount = 0;
    let errorCount = 0;

    for (const client of room.clients) {
      if (client === sender) continue;

      if (client.readyState === 1) {
        try {
          client.send(message);
          sentCount++;
        } catch (error) {
          errorCount++;
        }
      }
    }

    if (errorCount > 0) {
      console.warn(`Broadcast errors in room ${roomId}: ${errorCount}`);
    }
  }

  /**
   * Gets the number of active clients in a room
   * @param {string} roomId - Room identifier
   * @returns {number} Number of clients
   */
  getPresence(roomId) {
    if (!roomId) return 0;
    const room = this.rooms.get(roomId);
    return room ? room.clients.size : 0;
  }

  /**
   * Updates the code content for a room
   * @param {string} roomId - Room identifier
   * @param {string} code - Code content
   */
  setCode(roomId, code) {
    if (!roomId) return;
    const room = this.rooms.get(roomId);
    if (room && typeof code === "string") {
      room.code = code;
    }
  }

  /**
   * Gets the code content for a room
   * @param {string} roomId - Room identifier
   * @returns {string} Code content
   */
  getCode(roomId) {
    if (!roomId) return "";
    return this.rooms.get(roomId)?.code || "";
  }

  /**
   * Gets room statistics
   * @returns {object} Statistics object
   */
  getStats() {
    return {
      totalRooms: this.rooms.size,
      totalClients: Array.from(this.rooms.values()).reduce(
        (sum, room) => sum + room.clients.size,
        0
      ),
    };
  }
}
