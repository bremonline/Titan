import express, { Express, Request, Response } from "express";
import http from "http";
import path from "path";
import { fileURLToPath } from "url";
import { Server as SocketIOServer, Socket } from "socket.io";
import { GameEngine } from "./game/engine.js";
import { SocketHandlers } from "./sockets/handlers.js";
import { SOCKET_EVENTS } from "./types.js";
import { getValidDestinations } from "./game/movementRules.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 3000;

const app: Express = express();
const server = http.createServer(app);

const io = new SocketIOServer(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

const engine = new GameEngine();
const socketHandlers = new SocketHandlers(engine, io);

// ============================================================================
// MIDDLEWARE
// ============================================================================

app.use(express.json());

// Serve the Titan board and client assets from the project root
const publicDir = path.resolve(__dirname, "../..");
const socketIoClientDir = path.resolve(__dirname, "../node_modules/socket.io-client/dist");

app.use(
  "/vendor/socket.io-client",
  express.static(socketIoClientDir, { index: false })
);
app.use(express.static(publicDir, { index: "index.html" }));

// ============================================================================
// REST API ENDPOINTS
// ============================================================================

/**
 * Health check endpoint
 */
app.get("/health", (_req: Request, res: Response) => {
  res.json({ status: "ok", timestamp: Date.now() });
});

/**
 * List active (not yet started) games.
 */
app.get("/api/games", (_req: Request, res: Response) => {
  res.json(engine.listActiveGames());
});

/**
 * Get game state (for debugging/UI sync)
 */
app.get("/api/game/:gameId", (req: Request, res: Response) => {
  const game = engine.getGame(req.params.gameId);
  if (!game) {
    return res.status(404).json({ error: "Game not found" });
  }
  res.json(engine.serializeGame(game));
});

/**
 * Get game action log
 */
app.get("/api/game/:gameId/log", (req: Request, res: Response) => {
  const game = engine.getGame(req.params.gameId);
  if (!game) {
    return res.status(404).json({ error: "Game not found" });
  }
  res.json(game.log);
});

/**
 * Get valid movement destinations for a source tile and die roll.
 */
app.get("/api/movement/:fromTile/:dieRoll", (req: Request, res: Response) => {
  const fromTile = String(req.params.fromTile || "").trim();
  const dieRoll = Number.parseInt(String(req.params.dieRoll || ""), 10);

  if (!/^\d{3}$/.test(fromTile)) {
    return res.status(400).json({ error: "fromTile must be a 3-digit tile id" });
  }

  if (!Number.isInteger(dieRoll) || dieRoll < 1 || dieRoll > 6) {
    return res.status(400).json({ error: "dieRoll must be an integer from 1 to 6" });
  }

  const destinations = getValidDestinations(fromTile as any, dieRoll);
  return res.json({ fromTile, dieRoll, destinations });
});

app.post("/api/admin/games/clear", (req: Request, res: Response) => {
  if (req.query.admin !== "true") {
    return res.status(403).json({ error: "Admin mode required" });
  }

  const cleared = engine.clearAllGames();
  res.json({ cleared });
});

// ============================================================================
// SOCKET.IO SETUP
// ============================================================================

io.on(SOCKET_EVENTS.CONNECT, (socket: Socket) => {
  console.log(`[Socket] Client connected: ${socket.id}`);

  const clientId = socketHandlers["ensureClientId"](socket);

  // Register all event handlers for this socket
  socketHandlers.registerHandlers(socket);

  // Send initial connection confirmation
  socket.emit("connected", { socketId: socket.id, clientId, timestamp: Date.now() });
});

// ============================================================================
// ERROR HANDLING
// ============================================================================

app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: "Not found" });
});

app.use((err: Error, _req: Request, res: Response) => {
  console.error("[Error]", err);
  res.status(500).json({ error: "Internal server error" });
});

// ============================================================================
// START SERVER
// ============================================================================

server.listen(PORT, () => {
  console.log(`[Server] Titan game server listening on port ${PORT}`);
  console.log(`[Server] Ready for WebSocket connections`);
});

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("[Server] SIGTERM received, shutting down gracefully");
  server.close(() => {
    console.log("[Server] HTTP server closed");
    process.exit(0);
  });
});

export { server, io, engine };
