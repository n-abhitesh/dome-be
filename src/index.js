import http from "http";
import { WebSocketServer } from "ws";
import { RoomManager } from "./roomManager.js";
import { MESSAGE_TYPES } from "./types.js";
import { validateMessage, log } from "./utils.js";
import { CONFIG, validateConfig } from "./config.js";
import { RateLimiter } from "./rateLimiter.js";
import { ConnectionManager } from "./connectionManager.js";

/* -------------------- CONFIG VALIDATION -------------------- */

try {
  validateConfig();
} catch (error) {
  log(`Configuration error: ${error.message}`, "error");
  process.exit(1);
}

/* -------------------- HTTP SERVER (REQUIRED) -------------------- */

const PORT = process.env.PORT || CONFIG.PORT;

const server = http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("DOME WebSocket Server");
});

/* -------------------- WEBSOCKET SERVER -------------------- */

const wss = new WebSocketServer({
  server,
  path: "/dome",
  maxPayload: CONFIG.MAX_MESSAGE_SIZE,
});

const rooms = new RoomManager();
const rateLimiter = new RateLimiter(
  CONFIG.RATE_LIMIT_MESSAGES,
  CONFIG.RATE_LIMIT_WINDOW_MS
);
const connectionManager = new ConnectionManager(
  CONFIG.MAX_TOTAL_CONNECTIONS
);

server.listen(PORT, () => {
  log(`🔥 DOME WebSocket server running on port ${PORT}`);
});

/* -------------------- CONNECTION HANDLING -------------------- */

wss.on("connection", (ws, req) => {
  if (!connectionManager.canAcceptConnection()) {
    ws.close(1008, "Server at capacity");
    return;
  }

  const roomId = extractRoomId(req.url);

  if (!roomId) {
    ws.close(1008, "Invalid room ID");
    return;
  }

  if (rooms.getPresence(roomId) >= CONFIG.MAX_CONNECTIONS_PER_ROOM) {
    ws.close(1008, "Room at capacity");
    return;
  }

  ws.roomId = roomId;
  connectionManager.addConnection();

  try {
    const room = rooms.joinRoom(roomId, ws);

    sendMessage(ws, {
      type: MESSAGE_TYPES.SYNC_CODE,
      payload: { code: room.code },
    });

    broadcastPresence(roomId);
  } catch (error) {
    connectionManager.removeConnection();
    ws.close(1011, "Server error");
    return;
  }

  ws.on("message", (data) => handleMessage(ws, roomId, data));

  ws.on("close", () => {
    rooms.leaveRoom(roomId, ws);
    connectionManager.removeConnection();
    broadcastPresence(roomId);
  });
});

/* -------------------- HELPERS -------------------- */

function extractRoomId(url) {
  if (!url) return null;
  const parts = url.split("/").filter(Boolean);
  const roomId = parts[parts.length - 1];

  if (
    roomId &&
    roomId.length >= CONFIG.ROOM_ID_MIN_LENGTH &&
    roomId.length <= CONFIG.ROOM_ID_MAX_LENGTH &&
    CONFIG.ROOM_ID_PATTERN.test(roomId)
  ) {
    return roomId;
  }

  return null;
}

function handleMessage(ws, roomId, data) {
  if (!rateLimiter.check(ws)) {
    ws.close(1008, "Rate limit exceeded");
    return;
  }

  let message;
  try {
    message = JSON.parse(data.toString());
  } catch {
    return;
  }

  if (!validateMessage(message)) return;

  if (message.type === MESSAGE_TYPES.CODE_CHANGE) {
    const code = message.payload?.code;
    if (typeof code !== "string") return;

    if (Buffer.byteLength(code, "utf8") > CONFIG.MAX_CODE_SIZE) {
      sendMessage(ws, {
        type: MESSAGE_TYPES.ERROR,
        payload: { message: "Code too large" },
      });
      return;
    }

    rooms.setCode(roomId, code);
    rooms.broadcast(roomId, ws, JSON.stringify(message));
  }
}

function broadcastPresence(roomId) {
  rooms.broadcast(
    roomId,
    null,
    JSON.stringify({
      type: MESSAGE_TYPES.PRESENCE,
      payload: { count: rooms.getPresence(roomId) },
    })
  );
}

function sendMessage(ws, message) {
  if (ws.readyState !== ws.OPEN) return;
  ws.send(JSON.stringify(message));
}

/* -------------------- GRACEFUL SHUTDOWN -------------------- */

function gracefulShutdown() {
  log("Shutting down...", "warn");

  wss.clients.forEach((ws) => ws.close(1001));
  wss.close(() => process.exit(0));

  setTimeout(() => process.exit(1), CONFIG.SHUTDOWN_TIMEOUT_MS);
}

process.on("SIGTERM", gracefulShutdown);
process.on("SIGINT", gracefulShutdown);
