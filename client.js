// Titan Game Client UI with Socket.IO
(function() {
  const panelContent = document.getElementById('panel-content');
  let socket = null;
  let activeGames = [];
  let currentGame = null;
  let playerName = null;
  let playerColor = null;
  
  // Initialize Socket.IO connection
  function initSocket() {
    socket = io();
    
    socket.on('connect', () => {
      showStatus('Connected to server ✓', 'success');
      loadGames();
    });
    
    socket.on('disconnect', () => {
      showStatus('Disconnected from server', 'error');
    });
    
    socket.on('error', (err) => {
      showStatus(`Server error: ${err}`, 'error');
    });
    
    socket.on('server:game-created', (game) => {
      currentGame = game;
      renderGameUI(game);
      showStatus(`Game created! ID: ${game.gameId}`, 'success');
    });
    
    socket.on('server:player-joined', (data) => {
      if (currentGame) {
        currentGame = data.game || data;
        renderGameUI(currentGame);
        showStatus(`${data.playerName} joined the game`, 'info');
      }
    });
    
    socket.on('server:game-started', (game) => {
      currentGame = game;
      renderGameUI(game);
      showStatus(`Game started!`, 'success');
    });
    
    socket.on('server:error', (error) => {
      showStatus(`Error: ${error.message || error}`, 'error');
    });
  }
  
  // Render lobby UI
  function renderGameLobby() {
    panelContent.innerHTML = `
      <div class="tabs">
        <button class="tab-button active" onclick="switchTab('lobby')">Lobby</button>
        <button class="tab-button" onclick="switchTab('game')">Game</button>
      </div>
      
      <div id="lobby-tab">
        <div class="panel-section">
          <h3>Create Game</h3>
          <div class="form-group">
            <label for="player-name">Player Name</label>
            <input type="text" id="player-name" placeholder="Enter your name" />
          </div>
          <div class="form-group">
            <label for="player-color">Color</label>
            <select id="player-color">
              <option value="#FF0000">Red</option>
              <option value="#00FF00">Green</option>
              <option value="#0000FF">Blue</option>
              <option value="#FFFF00">Yellow</option>
              <option value="#FF00FF">Magenta</option>
              <option value="#00FFFF">Cyan</option>
            </select>
          </div>
          <button class="primary" onclick="createGame()">Create Game</button>
        </div>
        
        <div class="panel-section">
          <h3>Available Games</h3>
          <div id="games-list" class="game-list">
            <div style="text-align: center; color: #888; padding: 1rem;">Loading games...</div>
          </div>
        </div>
      </div>
      
      <div id="status" class="status" style="display: none;"></div>
    `;
  }
  
  // Render game UI
  function renderGameUI(game) {
    panelContent.innerHTML = `
      <div class="panel-section">
        <h3>Game: ${game.gameId}</h3>
        <div style="font-size: 0.85rem; color: #999; margin-bottom: 0.5rem;">
          Phase: <strong>${game.phase}</strong>
        </div>
        <div style="font-size: 0.85rem; color: #999; margin-bottom: 1rem;">
          Players: ${game.players.length}
        </div>
        
        <div style="max-height: 120px; overflow-y: auto; border: 1px solid #555; border-radius: 4px; padding: 0.5rem; margin-bottom: 1rem;">
          <ul style="list-style: none; padding: 0; margin: 0;">
            ${game.players.map(p => `
              <li style="padding: 0.3rem; color: #ccc; font-size: 0.85rem;">
                ${p.playerName} 
                <span style="color: ${p.playerColor || '#999'};">●</span>
              </li>
            `).join('')}
          </ul>
        </div>
        
        ${game.phase === 'LOBBY' ? `
          <button class="primary" onclick="startGame()">Start Game</button>
        ` : `
          <div class="status" style="display: block; margin-bottom: 0;">
            Waiting for phase: ${game.phase}
          </div>
        `}
      </div>
      
      <div id="status" class="status" style="display: none;"></div>
    `;
  }
  
  function showStatus(msg, type = 'info') {
    const statusEl = document.getElementById('status');
    if (!statusEl) return;
    statusEl.textContent = msg;
    statusEl.className = `status ${type}`;
    statusEl.style.display = 'block';
  }
  
  window.switchTab = function(tab) {
    // Tab switching logic would go here
  };
  
  window.createGame = function() {
    const nameInput = document.getElementById('player-name');
    const colorSelect = document.getElementById('player-color');
    
    if (!nameInput || !colorSelect) return;
    
    playerName = nameInput.value.trim();
    playerColor = colorSelect.value;
    
    if (!playerName) {
      showStatus('Please enter a player name', 'error');
      return;
    }
    
    if (!socket) {
      showStatus('Not connected to server', 'error');
      return;
    }
    
    socket.emit('client:create-game', {
      playerName,
      playerColor
    }, (response) => {
      if (response && response.error) {
        showStatus(`Error: ${response.error}`, 'error');
      }
    });
  };
  
  window.startGame = function() {
    if (!currentGame) return;
    if (!socket) return;
    
    socket.emit('client:start-game', {
      gameId: currentGame.gameId
    }, (response) => {
      if (response && response.error) {
        showStatus(`Error: ${response.error}`, 'error');
      }
    });
  };
  
  window.joinGame = function(gameId) {
    const nameInput = document.getElementById('player-name');
    if (!nameInput) return;
    
    playerName = nameInput.value.trim();
    
    if (!playerName) {
      showStatus('Please enter a player name', 'error');
      return;
    }
    
    if (!socket) {
      showStatus('Not connected to server', 'error');
      return;
    }
    
    socket.emit('client:join-game', {
      gameId,
      playerName,
      playerColor: '#FFFFFF'
    }, (response) => {
      if (response && response.error) {
        showStatus(`Error: ${response.error}`, 'error');
      }
    });
  };
  
  async function loadGames() {
    try {
      const response = await fetch('/api/games');
      const games = await response.json();
      activeGames = games;
      
      const gamesList = document.getElementById('games-list');
      if (!gamesList) return;
      
      if (games.length === 0) {
        gamesList.innerHTML = `
          <div style="text-align: center; color: #888; padding: 1rem;">
            No games available. Create one to start!
          </div>
        `;
      } else {
        gamesList.innerHTML = games.map(game => `
          <div class="game-list-item">
            <div>
              <div style="font-weight: bold; color: #f0e055;">${game.gameId}</div>
              <div style="font-size: 0.8rem; color: #999;">${game.players.length} players</div>
            </div>
            <button style="padding: 0.4rem 0.8rem; font-size: 0.8rem;" onclick="joinGame('${game.gameId}')">
              Join
            </button>
          </div>
        `).join('');
      }
      
      // Refresh games list every 3 seconds
      setTimeout(loadGames, 3000);
    } catch (err) {
      console.error('Error loading games:', err);
      setTimeout(loadGames, 3000);
    }
  }
  
  // Initialize when DOM is ready
  document.addEventListener('DOMContentLoaded', () => {
    renderGameLobby();
    initSocket();
  });
})();
