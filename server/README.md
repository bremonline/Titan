# Titan Game Server

A Node.js/TypeScript multiplayer game server for Avalon Hill's Titan using Express and Socket.IO.

## Project Structure

```
server/
├── src/
│   ├── types.ts              # Domain types, contracts, Zod schemas
│   ├── server.ts             # Express + Socket.IO setup
│   ├── game/
│   │   └── engine.ts         # Game state management and rules
│   └── sockets/
│       └── handlers.ts       # Socket.IO event handlers
├── package.json
├── tsconfig.json
└── .gitignore

client/
└── game-client.ts            # TypeScript client library for browser
```

## Getting Started

### Prerequisites
- Node.js 18+ (check with `node --version`)
- npm (comes with Node.js)

### Installation

```bash
cd server
npm install
```

### Running the Server

**Development mode** (with live reload):
```bash
npm run dev
```

**Production mode**:
```bash
npm run build
npm start
```

### Running Unit Tests

Run all tests once:
```bash
npm test
```

Run tests in watch mode:
```bash
npm run test:watch
```

The server will start on `http://localhost:3000` by default.

### API Endpoints

- `GET /health` — Health check
- `GET /api/game/:gameId` — Get game state (for debugging/sync)

### Socket.IO Events

#### Client → Server
- `client:create-game` — Create a new game
- `client:join-game` — Join an existing game
- `client:start-game` — Start the game (SETUP phase)
- `client:assign-tower` — Assign a tower (SETUP phase)
- `client:split-legion` — Split a legion (SPLIT phase)
- `client:move-legion` — Move a legion to an adjacent tile
- `client:end-phase` — End the current phase

#### Server → Client
- `server:game-created` — Game successfully created
- `server:player-joined` — Player joined the game
- `server:game-started` — Game started (SETUP phase)
- `server:tower-assigned` — Tower assigned to a player
- `server:setup-complete` — All towers assigned, moving to SPLIT phase
- `server:legion-split` — Legion successfully split
- `server:legion-moved` — Legion successfully moved
- `server:phase-ended` — Phase ended, next player's turn
- `server:state-snapshot` — Full game state (on join, state changes)
- `server:error` — Error response

## Using the Client Library

```typescript
import { TitanGameClient, SOCKET_EVENTS } from "./game-client.js";

const client = new TitanGameClient();

// Connect to server
await client.connect("http://localhost:3000");

// Create a game
const game = await client.createGame("Alice", "#FF0000");
console.log("Game created:", game.gameId);

// Listen for events
client.on(SOCKET_EVENTS.SERVER.PLAYER_JOINED, (data) => {
  console.log("Player joined:", data.playerName);
});

// Start the game
const started = await client.startGame(game.gameId);
console.log("Game phase:", started.phase); // "SETUP"

// Assign a tower
const assigned = await client.assignTower(game.gameId, client.getPlayerId(), "100");
console.log("Tower assigned:", assigned.towerTile);

// Disconnect when done
client.disconnect();
```

## Game Phases

1. **LOBBY** — Players join, waiting to start
2. **SETUP** — Players assign towers, receive initial Titan legion
3. **SPLIT** — Players split legions, recruit creatures, move
4. **RECRUIT** — (Future) Recruit creatures at towers
5. **MOVE** — (Future) Move legions
6. **FIGHT** — (Future) Combat resolution
7. **MUSTER** — (Future) End of round recovery

## Game Rules (Phase 1)

### SETUP Phase
- Each player receives a unique tower (100, 200, 300, 400, 500, 600)
- Each tower starts with a Titan (power 6, skill 6)
- Setup complete when all players have assigned towers

### SPLIT Phase
- Players take turns splitting their legions
- A split creates a new legion with a subset of creatures from the original
- Both legions must have at least 1 creature
- New legion is placed on an adjacent hex

## Type Safety

The server uses Zod for runtime validation of all incoming requests. Clients should use the provided TypeScript types for type safety.

## Example: Complete Game Flow

```typescript
// Player 1: Create game
const game = await client.createGame("Alice", "#FF0000");
const gameId = game.gameId;

// Player 2: Join game
await client.joinGame(gameId, "Bob", "#0000FF");

// Player 1: Start game → moves to SETUP
await client.startGame(gameId);

// Both players: Assign towers
await client.assignTower(gameId, player1Id, "100");
await client.assignTower(gameId, player2Id, "200");
// → Server automatically transitions to SPLIT phase

// Player 1: Split legion
await client.splitLegion(
  gameId,
  legionId,
  [titan],           // stays with original
  [cyclops, wolf],   // new legion
  "105"              // adjacent tile
);

// Player 1: End phase
await client.endPhase(gameId, player1Id);

// Player 2: Takes their turn...
```

## Development Notes

- All game state is in-memory (no persistence yet)
- Games are isolated by `gameId`
- Player turns are managed via `activePlayer`
- No combat system implemented yet
- Tile adjacency validation not yet implemented
- Terrain effects not yet implemented
