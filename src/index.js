import { WebSocketServer } from "ws";
import { RoomManager } from "./roomManager.js";
import { MESSAGE_TYPES } from "./types.js";
import { validateMessage, log } from "./utils.js";
import { CONFIG, validateConfig } from "./config.js";
import { RateLimiter } from "./rateLimiter.js";
import { ConnectionManager } from "./connectionManager.js";

// Validate configuration
try {
  validateConfig();
} catch (error) {
  log(`Configuration error: ${error.message}`, "error");
  process.exit(1);
}

const wss = new WebSocketServer({ 
  port: CONFIG.PORT,
  host: CONFIG.HOST,
  maxPayload: CONFIG.MAX_MESSAGE_SIZE,
});

const rooms = new RoomManager();
const rateLimiter = new RateLimiter(CONFIG.RATE_LIMIT_MESSAGES, CONFIG.RATE_LIMIT_WINDOW_MS);
const connectionManager = new ConnectionManager(CONFIG.MAX_TOTAL_CONNECTIONS);

log(`DOME WebSocket server running on ws://${CONFIG.HOST}:${CONFIG.PORT}`);
log(`Max message size: ${CONFIG.MAX_MESSAGE_SIZE / 1024 / 1024}MB, Max code size: ${CONFIG.MAX_CODE_SIZE / 1024 / 1024}MB`);

// Health check server (optional, for Railway and monitoring)
if (process.env.ENABLE_HEALTH_CHECK !== 'false') {
  import('./health.js').then(({ createHealthCheckServer }) => {
    const healthPort = parseInt(process.env.HEALTH_CHECK_PORT || String(CONFIG.PORT + 1), 10);
    createHealthCheckServer(healthPort);
  }).catch((error) => {
    log(`Health check server not started: ${error.message}`, 'warn');
  });
}

/**
 * Handles WebSocket connection lifecycle
 * @param {WebSocket} ws - WebSocket connection
 * @param {IncomingMessage} req - HTTP request
 */
wss.on("connection", (ws, req) => {
  // Check total connection limit
  if (!connectionManager.canAcceptConnection()) {
    log("Connection rejected: max connections reached", "warn");
    ws.close(1008, "Server at capacity");
    return;
  }

  const roomId = extractRoomId(req.url);
  
  if (!roomId) {
    log("Connection rejected: invalid room ID", "warn");
    ws.close(1008, "Invalid room ID");
    return;
  }

  // Check room connection limit
  const currentRoomSize = rooms.getPresence(roomId);
  if (currentRoomSize >= CONFIG.MAX_CONNECTIONS_PER_ROOM) {
    log(`Connection rejected: room ${roomId} at capacity (${currentRoomSize})`, "warn");
    ws.close(1008, "Room at capacity");
    return;
  }

  ws.roomId = roomId;
  connectionManager.addConnection();

  try {
    const room = rooms.joinRoom(roomId, ws);
    log(`Client connected to room: ${roomId} (${rooms.getPresence(roomId)}/${CONFIG.MAX_CONNECTIONS_PER_ROOM})`);

    // Send existing code to new user
    sendMessage(ws, {
      type: MESSAGE_TYPES.SYNC_CODE,
      payload: { code: room.code },
    });

    // Broadcast presence update
    broadcastPresence(roomId);
  } catch (error) {
    log(`Error joining room ${roomId}: ${error.message}`, "error");
    connectionManager.removeConnection();
    ws.close(1011, "Server error");
    return;
  }

  ws.on("message", (data) => {
    handleMessage(ws, roomId, data);
  });

  ws.on("error", (error) => {
    log(`WebSocket error in room ${roomId}: ${error.message}`, "error");
  });

  ws.on("close", (code, reason) => {
    log(`Client disconnected from room ${roomId} (code: ${code})`);
    rooms.leaveRoom(roomId, ws);
    connectionManager.removeConnection();
    broadcastPresence(roomId);
  });
});

/**
 * Extracts and validates room ID from URL path
 * @param {string} url - Request URL
 * @returns {string|null} Room ID or null if invalid
 */
function extractRoomId(url) {
  if (!url) return null;
  const parts = url.split("/").filter(Boolean);
  const roomId = parts.length > 0 ? parts[parts.length - 1] : null;
  
  if (!roomId) return null;
  
  // Validate room ID format and length
  if (
    roomId.length >= CONFIG.ROOM_ID_MIN_LENGTH &&
    roomId.length <= CONFIG.ROOM_ID_MAX_LENGTH &&
    CONFIG.ROOM_ID_PATTERN.test(roomId)
  ) {
    return roomId;
  }
  
  return null;
}

/**
 * Handles incoming WebSocket messages
 * @param {WebSocket} ws - WebSocket connection
 * @param {string} roomId - Room identifier
 * @param {Buffer|string} data - Raw message data
 */
function handleMessage(ws, roomId, data) {
  if (!data) {
    log("Received empty message", "warn");
    return;
  }

  // Check message size
  const messageSize = Buffer.isBuffer(data) ? data.length : Buffer.byteLength(data.toString(), 'utf8');
  if (messageSize > CONFIG.MAX_MESSAGE_SIZE) {
    log(`Message too large in room ${roomId}: ${messageSize} bytes (max: ${CONFIG.MAX_MESSAGE_SIZE})`, "warn");
    ws.close(1009, "Message too large");
    return;
  }

  // Check rate limit
  if (!rateLimiter.check(ws)) {
    log(`Rate limit exceeded in room ${roomId}`, "warn");
    ws.close(1008, "Rate limit exceeded");
    return;
  }

  let message;
  try {
    const text = data.toString();
    message = JSON.parse(text);
  } catch (error) {
    log(`Invalid JSON received in room ${roomId}: ${error.message}`, "warn");
    return;
  }

  if (!validateMessage(message)) {
    log(`Invalid message format in room ${roomId}`, "warn");
    return;
  }

  if (message.type === MESSAGE_TYPES.CODE_CHANGE) {
    if (typeof message.payload?.code !== "string") {
      log(`Invalid CODE_CHANGE payload in room ${roomId}`, "warn");
      return;
    }

    // Check code size
    const codeSize = Buffer.byteLength(message.payload.code, 'utf8');
    if (codeSize > CONFIG.MAX_CODE_SIZE) {
      log(`Code too large in room ${roomId}: ${codeSize} bytes (max: ${CONFIG.MAX_CODE_SIZE})`, "warn");
      sendMessage(ws, {
        type: "ERROR",
        payload: { message: `Code size exceeds limit of ${CONFIG.MAX_CODE_SIZE / 1024 / 1024}MB` },
      });
      return;
    }

    rooms.setCode(roomId, message.payload.code);
    rooms.broadcast(roomId, ws, JSON.stringify(message));
  }
}

/**
 * Broadcasts presence update to all clients in a room
 * @param {string} roomId - Room identifier
 */
function broadcastPresence(roomId) {
  const count = rooms.getPresence(roomId);
  rooms.broadcast(
    roomId,
    null,
    JSON.stringify({
      type: MESSAGE_TYPES.PRESENCE,
      payload: { count },
    })
  );
}

/**
 * Safely sends a message to a WebSocket connection
 * @param {WebSocket} ws - WebSocket connection
 * @param {object} message - Message object to send
 */
function sendMessage(ws, message) {
  if (ws.readyState === 1) {
    try {
      const messageStr = JSON.stringify(message);
      const messageSize = Buffer.byteLength(messageStr, 'utf8');
      
      if (messageSize > CONFIG.MAX_MESSAGE_SIZE) {
        log(`Cannot send message: size ${messageSize} exceeds limit`, "warn");
        return;
      }
      
      ws.send(messageStr);
    } catch (error) {
      log(`Error sending message: ${error.message}`, "error");
    }
  }
}

/**
 * Graceful shutdown handler
 */
function gracefulShutdown() {
  log("Shutdown signal received, closing server gracefully...", "warn");
  
  // Close all connections first
  wss.clients.forEach((ws) => {
    try {
      ws.close(1001, "Server shutting down");
    } catch (error) {
      // Ignore errors when closing connections
    }
  });

  // Set force shutdown timeout
  const forceShutdownTimeout = setTimeout(() => {
    log("Forced shutdown after timeout", "error");
    rateLimiter.destroy();
    process.exit(1);
  }, CONFIG.SHUTDOWN_TIMEOUT_MS);
  
  // Close server
  wss.close(() => {
    clearTimeout(forceShutdownTimeout);
    log("WebSocket server closed");
    rateLimiter.destroy();
    process.exit(0);
  });
}

// Handle graceful shutdown
process.on("SIGTERM", gracefulShutdown);
process.on("SIGINT", gracefulShutdown);

// Handle uncaught errors
process.on("uncaughtException", (error) => {
  log(`Uncaught exception: ${error.message}`, "error");
  log(error.stack, "error");
  gracefulShutdown();
});

process.on("unhandledRejection", (reason, promise) => {
  log(`Unhandled rejection at: ${promise}, reason: ${reason}`, "error");
});
