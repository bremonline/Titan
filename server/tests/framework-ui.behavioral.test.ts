// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";

type MockSocket = {
  connected: boolean;
  emitted: Array<{ event: string; data: any }>;
  handlers: Map<string, (...args: any[]) => void>;
  on: (event: string, callback: (...args: any[]) => void) => MockSocket;
  emit: (event: string, data: any, callback?: (error: any, response: any) => void) => void;
  disconnect: () => void;
};

function normalizeHtml(html: string): string {
  return html.replace(/\s+/g, " ").replace(/> </g, "><").trim();
}

function createMockSocket(responseByEvent: Record<string, any> = {}): MockSocket {
  const socket: MockSocket = {
    connected: true,
    emitted: [],
    handlers: new Map(),
    on(event, callback) {
      this.handlers.set(event, callback);
      return this;
    },
    emit(event, data, callback) {
      this.emitted.push({ event, data });
      const response = responseByEvent[event] ?? responseByEvent.default;
      callback?.(null, response);
    },
    disconnect() {
      this.connected = false;
    },
  };

  return socket;
}

async function bootstrapClient(responseByEvent: Record<string, any> = {}) {
  vi.resetModules();
  vi.unstubAllGlobals();

  document.body.innerHTML = '<div id="panel-content"></div>';

  const socket = createMockSocket(responseByEvent);
  vi.stubGlobal("io", vi.fn(() => socket));
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      json: async () => [],
    }))
  );

  await import("../../client.js");
  document.dispatchEvent(new Event("DOMContentLoaded"));

  const panelContent = document.getElementById("panel-content");
  if (!panelContent) {
    throw new Error("Expected panel-content to exist");
  }

  return { socket, panelContent };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.body.innerHTML = "";
});

describe("Titan browser client", () => {
  it("renders the lobby shell on startup", async () => {
    const { panelContent } = await bootstrapClient();

    expect(normalizeHtml(panelContent.innerHTML)).toMatchInlineSnapshot(
      `"<div class="tabs"><button class="tab-button active">Lobby</button><button class="tab-button">Game</button></div><div class="panel-section"><h3>Create Game</h3><div class="form-group"><label for="player-name">Player Name</label><input type="text" id="player-name" placeholder="Enter your name"></div><div class="form-group"><label for="player-color">Color</label><select id="player-color"><option value="#FF0000">Red</option><option value="#00FF00">Green</option><option value="#0000FF">Blue</option><option value="#FFFF00">Yellow</option><option value="#FF00FF">Magenta</option><option value="#00FFFF">Cyan</option></select></div><div class="form-group"><label for="game-key">Game Key</label><input type="text" id="game-key" placeholder="Enter game key"></div><button class="primary" onclick="createGame()">Create Game</button></div><div class="panel-section"><h3>Available Games</h3><div id="games-list" class="game-list"><div style="text-align: center; color: #888; padding: 1rem;">Loading games...</div></div></div><div id="status" class="status" style="display: none;"></div>"`
    );
  });

  it("renders tower selection after a successful create-game action", async () => {
    const { socket, panelContent } = await bootstrapClient({
      "client:create-game": {
        gameId: "game-123",
        players: [{ towerTile: "100" }],
        phase: "LOBBY",
      },
    });

    const nameInput = document.getElementById("player-name") as HTMLInputElement;
    const colorSelect = document.getElementById("player-color") as HTMLSelectElement;
    nameInput.value = "Astra";
    colorSelect.value = "#00FF00";

    (window as any).createGame();

    expect(socket.emitted[0]).toMatchObject({
      event: "client:create-game",
      data: {
        gameId: expect.stringMatching(/^game_/),
        gameKey: expect.any(String),
      },
    });

    expect(normalizeHtml(panelContent.innerHTML)).toMatchInlineSnapshot(
      `"<div id="tower-selection-panel" class="panel-section"><h3>Select Your Tower</h3><p style="font-size: 0.85rem; color: #999; margin-bottom: 1rem;"> Choose one of the six towers around the board. </p><div class="tower-grid" style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 0.5rem;"><button class="tower-button taken" onclick="selectTower('100')" disabled=""><div class="tower-id">Tower 100</div><div class="tower-status">Taken</div></button><button class="tower-button " onclick="selectTower('200')"><div class="tower-id">Tower 200</div><div class="tower-status">Available</div></button><button class="tower-button " onclick="selectTower('300')"><div class="tower-id">Tower 300</div><div class="tower-status">Available</div></button><button class="tower-button " onclick="selectTower('400')"><div class="tower-id">Tower 400</div><div class="tower-status">Available</div></button><button class="tower-button " onclick="selectTower('500')"><div class="tower-id">Tower 500</div><div class="tower-status">Available</div></button><button class="tower-button " onclick="selectTower('600')"><div class="tower-id">Tower 600</div><div class="tower-status">Available</div></button></div></div><div id="status" class="status info" style="display: block;">Game created. Share your game key with other players.</div>"`
    );
  });

  it("renders the in-game panel when a started game snapshot arrives", async () => {
    const { socket, panelContent } = await bootstrapClient();

    const startedGame = {
      gameId: "game-456",
      phase: "FIGHT",
      players: [
        { playerName: "Astra", playerColor: "#FF0000", towerTile: "100" },
        { playerName: "Boreal", playerColor: "#00FF00", towerTile: "200" },
      ],
    };

    socket.handlers.get("server:game-started")?.({ state: startedGame });

    expect(normalizeHtml(panelContent.innerHTML)).toMatchInlineSnapshot(
      `"<div id="game-ui-panel" class="panel-section"><h3>Game: game-456</h3><div style="font-size: 0.85rem; color: #999; margin-bottom: 0.5rem;"> Phase: <strong>FIGHT</strong></div><div style="font-size: 0.85rem; color: #999; margin-bottom: 1rem;"> Players: 2 </div><div style="max-height: 120px; overflow-y: auto; border: 1px solid #555; border-radius: 4px; padding: 0.5rem; margin-bottom: 1rem;"><ul style="list-style: none; padding: 0; margin: 0;"><li style="padding: 0.3rem; color: #ccc; font-size: 0.85rem;"><span style="color: #FF0000;">●</span> Astra (Tower 100) </li><li style="padding: 0.3rem; color: #ccc; font-size: 0.85rem;"><span style="color: #00FF00;">●</span> Boreal (Tower 200) </li></ul></div><div class="status" style="display: block; margin-bottom: 0; border: 1px solid #555;"> Phase: FIGHT </div></div><div id="status" class="status success" style="display: block;">Game started!</div>"`
    );
  });
});