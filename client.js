// Titan Game Client UI with Socket.IO
(function() {
  const panelContent = document.getElementById('panel-content');
  let socket = null;
  let activeGames = [];
  let currentGame = null;
  let playerName = null;
  let playerColor = null;
  let gameKey = null;
  const TOWERS = ["100", "200", "300", "400", "500", "600"];
  
  // Generate a random key for games
  function generateKey() {
    return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
  }
  
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
    
    socket.on('server:game-created', (data) => {
      currentGame = data.state || data;
      showStatus(`Game created! Select your tower.`, 'success');
      renderTowerSelection();
    });
    
    socket.on('server:player-added', (data) => {
      currentGame = data.state || data;
      renderGameUI(currentGame);
      showStatus(`Player added to game!`, 'success');
    });
    
    socket.on('server:player-joined', (data) => {
      currentGame = data.state || data;
      renderGameUI(currentGame);
      showStatus(`${data.playerName} joined the game`, 'info');
    });
    
    socket.on('server:game-started', (data) => {
      currentGame = data.state || data;
      renderGameUI(currentGame);
      showStatus(`Game started!`, 'success');
    });
    
    socket.on('server:state-snapshot', (data) => {
      if (data.state) {
        currentGame = data.state;
        if (document.getElementById('tower-selection-panel')) {
          renderTowerSelection();
        } else if (document.getElementById('game-ui-panel')) {
          renderGameUI(currentGame);
        }
      }
    });
    
    socket.on('server:error', (error) => {
      showStatus(`Error: ${error.message || error}`, 'error');
    });
  }
  
  // Render lobby UI
  function renderGameLobby() {
    panelContent.innerHTML = `
      <div class="tabs">
        <button class="tab-button active">Lobby</button>
        <button class="tab-button">Game</button>
      </div>
      
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
        <div class="form-group">
          <label for="game-key">Game Key</label>
          <input type="text" id="game-key" placeholder="Enter game key" />
        </div>
        <button class="primary" onclick="createGame()">Create Game</button>
      </div>
      
      <div class="panel-section">
        <h3>Available Games</h3>
        <div id="games-list" class="game-list">
          <div style="text-align: center; color: #888; padding: 1rem;">Loading games...</div>
        </div>
      </div>
      
      <div id="status" class="status" style="display: none;"></div>
    `;
  }
  
  // Render tower selection UI
  function renderTowerSelection() {
    const usedTowers = currentGame.players ? 
      currentGame.players.map(p => p.towerTile).filter(t => t) : [];
    
    panelContent.innerHTML = `
      <div id="tower-selection-panel" class="panel-section">
        <h3>Select Your Tower</h3>
        <p style="font-size: 0.85rem; color: #999; margin-bottom: 1rem;">
          Choose one of the six towers around the board.
        </p>
        <div class="tower-grid" style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 0.5rem;">
          ${TOWERS.map(tower => `
            <button 
              class="tower-button ${usedTowers.includes(tower) ? 'taken' : ''}"
              onclick="selectTower('${tower}')"
              ${usedTowers.includes(tower) ? 'disabled' : ''}
            >
              <div class="tower-id">Tower ${tower}</div>
              <div class="tower-status">${usedTowers.includes(tower) ? 'Taken' : 'Available'}</div>
            </button>
          `).join('')}
        </div>
      </div>
      
      <div id="status" class="status" style="display: none;"></div>
    `;
  }
  
  // Render game UI
  function renderGameUI(game) {
    if (!game) return;
    
    panelContent.innerHTML = `
      <div id="game-ui-panel" class="panel-section">
        <h3>Game: ${game.gameId}</h3>
        <div style="font-size: 0.85rem; color: #999; margin-bottom: 0.5rem;">
          Phase: <strong>${game.phase}</strong>
        </div>
        <div style="font-size: 0.85rem; color: #999; margin-bottom: 1rem;">
          Players: ${game.players ? game.players.length : 0}
        </div>
        
        <div style="max-height: 120px; overflow-y: auto; border: 1px solid #555; border-radius: 4px; padding: 0.5rem; margin-bottom: 1rem;">
          <ul style="list-style: none; padding: 0; margin: 0;">
            ${game.players ? game.players.map(p => `
              <li style="padding: 0.3rem; color: #ccc; font-size: 0.85rem;">
                <span style="color: ${p.playerColor || '#999'};">●</span>
                ${p.playerName}
                ${p.towerTile ? ` (Tower ${p.towerTile})` : ''}
              </li>
            `).join('') : ''}
          </ul>
        </div>
        
        ${game.phase === 'LOBBY' ? `
          <button class="primary" onclick="startGame()">Start Game</button>
        ` : `
          <div class="status" style="display: block; margin-bottom: 0; border: 1px solid #555;">
            Phase: ${game.phase}
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
  
  window.createGame = function() {
    const nameInput = document.getElementById('player-name');
    const colorSelect = document.getElementById('player-color');
    const keyInput = document.getElementById('game-key');
    
    if (!nameInput || !colorSelect) return;
    
    playerName = nameInput.value.trim();
    playerColor = colorSelect.value;
    
    if (!playerName) {
      showStatus('Please enter a player name', 'error');
      return;
    }
    
    if (!socket || !socket.connected) {
      showStatus('Not connected to server', 'error');
      return;
    }
    
    // Generate game ID and key
    const gameId = `game_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    gameKey = keyInput && keyInput.value.trim() ? keyInput.value.trim() : generateKey();
    
    socket.emit('client:create-game', {
      gameId,
      gameKey
    }, (error, response) => {
      if (error) {
        showStatus(`Error: ${error.message || error}`, 'error');
      } else {
        currentGame = response;
        renderTowerSelection();
        showStatus('Game created. Share your game key with other players.', 'info');
      }
    });
  };
  
  window.selectTower = function(tower) {
    if (!socket || !socket.connected) {
      showStatus('Not connected to server', 'error');
      return;
    }
    
    if (!currentGame) {
      showStatus('No game selected', 'error');
      return;
    }
    
    socket.emit('client:add-player', {
      gameId: currentGame.gameId,
      playerName,
      playerColor,
      towerTile: tower
    }, (error, response) => {
      if (error) {
        showStatus(`Error: ${error.message || error}`, 'error');
      }
    });
  };
  
  window.startGame = function() {
    if (!currentGame || !socket || !socket.connected) {
      showStatus('Not connected to server', 'error');
      return;
    }
    
    socket.emit('client:start-game', {
      gameId: currentGame.gameId
    }, (error, response) => {
      if (error) {
        showStatus(`Error: ${error.message || error}`, 'error');
      }
    });
  };

  window.onPlayerPickChange = function(selectEl) {
    const opt = selectEl.options[selectEl.selectedIndex];
    if (!opt || !opt.value) return; // "New Player" — don't overwrite
    const nameInput = document.getElementById('player-name');
    const colorSelect = document.getElementById('player-color');
    if (nameInput) nameInput.value = opt.dataset.name || '';
    if (colorSelect) {
      // Try to match an existing option; if none, set directly
      const match = Array.from(colorSelect.options).find(o => o.value === opt.dataset.color);
      if (match) match.selected = true;
    }
  };

  window.joinGame = function(gameId, playerPickEl) {
    const nameInput = document.getElementById('player-name');
    const keyInput = document.getElementById('game-key');
    if (!nameInput) return;

    // If a specific player was chosen from the dropdown, use their name/color
    let pickedPlayerName = null;
    let pickedPlayerColor = null;
    if (playerPickEl && playerPickEl.value) {
      const opt = playerPickEl.options[playerPickEl.selectedIndex];
      pickedPlayerName = opt.dataset.name || null;
      pickedPlayerColor = opt.dataset.color || null;
    }

    playerName = pickedPlayerName || nameInput.value.trim();
    playerColor = pickedPlayerColor || document.getElementById('player-color')?.value || '#FFFFFF';

    if (!playerName) {
      showStatus('Please enter a player name', 'error');
      return;
    }
    
    if (!socket || !socket.connected) {
      showStatus('Not connected to server', 'error');
      return;
    }
    
    gameKey = keyInput && keyInput.value.trim() ? keyInput.value.trim() : '';
    if (!gameKey) {
      showStatus('Enter the game key to join', 'error');
      return;
    }
    
    socket.emit('client:join-game', {
      gameId,
      gameKey,
      playerName,
      playerColor
    }, (error, response) => {
      if (error) {
        showStatus(`Error: ${error.message || error}`, 'error');
      } else {
        currentGame = response.game || response;
        if (currentGame.phase === 'LOBBY' && !response.playerId) {
          renderTowerSelection();
        } else {
          renderGameUI(currentGame);
        }
        showStatus('Joined game successfully', 'success');
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
        const hasInProgress = games.some(g => g.phase !== 'LOBBY');
        gamesList.innerHTML = `
          ${hasInProgress ? `<div style="font-size: 0.76rem; color: #aaa; margin-bottom: 0.6rem; padding: 0.5rem; border: 1px solid #444; border-radius: 4px; background: rgba(255,255,255,0.04);">
            To rejoin an active game: enter your player name, color, and game key above, then click Rejoin.
          </div>` : ''}
          ${games.map(game => {
            const inProgress = game.phase !== 'LOBBY';
            const players = game.playerList || [];
            const playerOptions = [
              `<option value="">-- New Player --</option>`,
              ...players.map((p, i) =>
                `<option value="${i}" data-name="${p.name.replace(/"/g,'&quot;')}" data-color="${p.color}">${p.name}</option>`
              )
            ].join('');
            return `
            <div class="game-list-item" style="${inProgress ? 'border-left: 3px solid #f0e055; padding-left: 0.5rem;' : ''} flex-direction: column; align-items: stretch; gap: 0.4rem;">
              <div style="display: flex; justify-content: space-between; align-items: center;">
                <div>
                  <div style="font-weight: bold; color: #f0e055;">${game.gameId}</div>
                  <div style="font-size: 0.8rem; color: #999;">${game.players} player${game.players !== 1 ? 's' : ''} &middot; <span style="color: ${inProgress ? '#f0e055' : '#4caf50'}">${inProgress ? 'In progress' : 'Open'}</span></div>
                </div>
                <button style="padding: 0.4rem 0.8rem; font-size: 0.8rem;" onclick="joinGame('${game.gameId}', this.closest('.game-list-item').querySelector('.player-pick'))">
                  ${inProgress ? 'Rejoin' : 'Join'}
                </button>
              </div>
              ${players.length > 0 ? `
              <div style="display: flex; align-items: center; gap: 0.4rem;">
                <label style="font-size: 0.75rem; color: #aaa; white-space: nowrap;">Join as:</label>
                <select class="player-pick" style="flex: 1; font-size: 0.8rem; background: #2a2a2a; color: #eee; border: 1px solid #555; border-radius: 4px; padding: 0.2rem 0.4rem;"
                  onchange="onPlayerPickChange(this)">
                  ${playerOptions}
                </select>
              </div>` : ''}
            </div>`;
          }).join('')}
        `;
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
