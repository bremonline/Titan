const { io } = require('/Users/breml/Desktop/code/Titan/server/node_modules/socket.io-client');
const http = require('http');

// Create two separate socket connections for two players
const socket1 = io('http://localhost:3000');
const socket2 = io('http://localhost:3000');
let gameId = null;
let p1Id = null;
let p2Id = null;

socket1.on('connect', function() {
  // Player 1 creates the game
  socket1.emit('client:create-game', { gameId: 'battle-' + Date.now(), gameKey: 'battlekey' }, function(err, resp) {
    if (err) { console.error('CREATE error', JSON.stringify(err)); process.exit(1); }
    gameId = resp.gameId;
    console.log('✓ Created game:', gameId);

    // Player 1 adds themselves
    socket1.emit('client:add-player', { gameId: gameId, playerName: 'Attacker', playerColor: '#FF0000', towerTile: '100' }, function(err1, resp1) {
      if (err1) { console.error('ADD P1 error', JSON.stringify(err1)); process.exit(1); }
      p1Id = resp1.player.id;
      console.log('✓ Added Player 1 (Attacker):', p1Id);

      // Wait for socket2 to connect, then have Player 2 join and add
      setTimeout(function() {
        socket2.emit('client:join-game', { gameId: gameId, gameKey: 'battlekey' }, function(err2, resp2) {
          if (err2) { console.error('JOIN P2 error', JSON.stringify(err2)); process.exit(1); }
          console.log('✓ Player 2 joined game');

          socket2.emit('client:add-player', { gameId: gameId, playerName: 'Defender', playerColor: '#0000FF', towerTile: '600' }, function(err3, resp3) {
            if (err3) { console.error('ADD P2 error', JSON.stringify(err3)); process.exit(1); }
            p2Id = resp3.player.id;
            console.log('✓ Added Player 2 (Defender):', p2Id);

            // Now both players exist, start the game (must be done by gamemaster = creator = socket1)
            socket1.emit('client:start-game', { gameId: gameId }, function(err4, resp4) {
              if (err4) { console.error('START error', JSON.stringify(err4)); process.exit(1); }
              console.log('✓ Started game, phase:', resp4.phase);
              const p1Legion = resp4.players.find(p => p.id === p1Id).legions[0].id;
              const p2Legion = resp4.players.find(p => p.id === p2Id).legions[0].id;

              // Place P1 legion on tile 211
              const body1 = JSON.stringify({ legionId: p1Legion, targetTile: '211' });
              const req1 = http.request({
                hostname: 'localhost', port: 3000,
                path: '/api/admin/game/' + gameId + '/place-stack?admin=true',
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body1) }
              }, function(res1) {
                let data1 = '';
                res1.on('data', function(d) { data1 += d; });
                res1.on('end', function() {
                  if (res1.statusCode !== 200) { console.error('Place P1 failed:', data1); process.exit(1); }
                  console.log('✓ Placed Attacker legion on tile 211');

                  // Place P2 legion on same tile 211
                  const body2 = JSON.stringify({ legionId: p2Legion, targetTile: '211' });
                  const req2 = http.request({
                    hostname: 'localhost', port: 3000,
                    path: '/api/admin/game/' + gameId + '/place-stack?admin=true',
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body2) }
                  }, function(res2) {
                    let data2 = '';
                    res2.on('data', function(d) { data2 += d; });
                    res2.on('end', function() {
                      if (res2.statusCode !== 200) { console.error('Place P2 failed:', data2); process.exit(1); }
                      console.log('✓ Placed Defender legion on tile 211 (collision!)');

                      // Now force a battle between them
                      const body3 = JSON.stringify({ attackerPlayerId: p1Id, defenderPlayerId: p2Id, battleTileId: '211' });
                      const req3 = http.request({
                        hostname: 'localhost', port: 3000,
                        path: '/api/admin/game/' + gameId + '/force-battle?admin=true',
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body3) }
                      }, function(res3) {
                        let data3 = '';
                        res3.on('data', function(d) { data3 += d; });
                        res3.on('end', function() {
                          if (res3.statusCode !== 200) { console.error('Force battle failed:', data3); process.exit(1); }
                          const result = JSON.parse(data3);
                          console.log('✓ Battle triggered!');
                          console.log('  Game ID:', gameId);
                          console.log('  Phase:', result.state.phase);
                          console.log('  Attacker:', p1Id.substring(0, 8));
                          console.log('  Defender:', p2Id.substring(0, 8));
                          console.log('  Battle tile:', result.battleTileId);
                          console.log('\n✨ Two-player battle scenario ready for simulation!');
                          socket1.disconnect();
                          socket2.disconnect();
                          process.exit(0);
                        });
                      });
                      req3.write(body3);
                      req3.end();
                    });
                  });
                  req2.write(body2);
                  req2.end();
                });
              });
              req1.write(body1);
              req1.end();
            });
          });
        });
      }, 500);
    });
  });
});

socket2.on('connect', function() {
  // Socket 2 ready, nothing to do here yet
});

socket1.on('connect_error', function(e) { console.error('S1 connect_error:', e.message); process.exit(1); });
socket2.on('connect_error', function(e) { console.error('S2 connect_error:', e.message); process.exit(1); });
setTimeout(function() { console.error('timeout'); process.exit(1); }, 20000);
