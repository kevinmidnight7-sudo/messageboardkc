/* =================================================
   KC WORLD — Territory Conquest  |  kc-world.js
   Phase 1/4: Constants · State · Helpers · MapGen
================================================= */
(function () {
  'use strict';

  /* ── Constants ───────────────────────────────── */
  var MAP_W = 40, MAP_H = 25;
  var TICK_MS = 3000;   /* 3 s ticks — 33% bandwidth reduction vs 2 s */
  var WIN_PCT = 0.75;
  var TROOP_CAP = 999;
  var PLAYER_COLORS = ['#ef4444','#3b82f6','#22c55e','#f59e0b','#a855f7','#ec4899'];

  /* ── State ───────────────────────────────────── */
  var st = {
    overlay: null, canvas: null, ctx: null,
    roomRef: null, roomCode: null,
    isHost: false, mySlot: 0, myUid: null, myName: 'Player', discordId: null,
    players: {},
    mapStatic: null,
    gameState: null,
    selectedTile: null,
    tickTimer: null, renderFrame: null,
    listeners: [],
    phase: 'closed',
    bots: [], botCount: 1,
    spectating: false,
    _clickHandler: null, _resizeHandler: null, _ctxHandler: null, _touchHandler: null
  };

  /* ── Helpers ─────────────────────────────────── */
  function tileIdx(x, y)  { return y * MAP_W + x; }
  function tileXY(idx)    { return { x: idx % MAP_W, y: Math.floor(idx / MAP_W) }; }
  function genCode()      { return Math.random().toString(36).substring(2, 8).toUpperCase(); }
  function getDb()        { return window.firebase && window.firebase.database(); }
  function toast(m, t)    { window.showToast && window.showToast(m, t || 'info', 4000); }
  function esc(s)         {
    return String(s)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;')
      .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function lookupDiscordId(uid) {
    if (typeof window.getDiscordIdFromKcUid === 'function') {
      return window.getDiscordIdFromKcUid(uid);
    }
    return getDb().ref('users/' + uid + '/discordId').once('value').then(function(s) {
      return s.val() || (window.currentUserData && window.currentUserData.discordId) || null;
    }).catch(function() { return null; });
  }

  /* ── Map Generator ───────────────────────────── */
  var MapGen = {
    generate: function(playerCount) {
      var n = MAP_W * MAP_H;
      var terrain = new Array(n).fill('L');

      /* water blobs */
      for (var w = 0; w < 6; w++) {
        var cx = 3 + Math.floor(Math.random() * (MAP_W - 6));
        var cy = 2 + Math.floor(Math.random() * (MAP_H - 4));
        for (var dy = -2; dy <= 2; dy++) {
          for (var dx = -3; dx <= 3; dx++) {
            if (Math.random() < 0.55) {
              var nx = cx + dx, ny = cy + dy;
              if (nx >= 0 && nx < MAP_W && ny >= 0 && ny < MAP_H)
                terrain[tileIdx(nx, ny)] = 'W';
            }
          }
        }
      }

      /* mountain ridges */
      for (var m = 0; m < 10; m++) {
        var mx = Math.floor(Math.random() * MAP_W);
        var my = Math.floor(Math.random() * MAP_H);
        var len = 3 + Math.floor(Math.random() * 6);
        var horiz = Math.random() < 0.5;
        for (var i = 0; i < len; i++) {
          if (mx >= 0 && mx < MAP_W && my >= 0 && my < MAP_H)
            terrain[tileIdx(mx, my)] = 'M';
          if (Math.random() < 0.4) {
            var side = horiz ? tileIdx(mx, Math.min(MAP_H-1, my+1)) : tileIdx(Math.min(MAP_W-1, mx+1), my);
            terrain[side] = 'M';
          }
          if (horiz) mx++; else my++;
        }
      }

      /* spawn positions — 4 corners + 2 mid-edge for 6p */
      var allSpawns = [
        [2, 2], [MAP_W-3, 2], [2, MAP_H-3], [MAP_W-3, MAP_H-3],
        [Math.floor(MAP_W/2), 2], [Math.floor(MAP_W/2), MAP_H-3]
      ];
      var spawns = allSpawns.slice(0, playerCount);

      /* clear 3×3 around each spawn */
      spawns.forEach(function(sp) {
        for (var sy = -2; sy <= 2; sy++) {
          for (var sx = -2; sx <= 2; sx++) {
            var x = sp[0]+sx, y = sp[1]+sy;
            if (x >= 0 && x < MAP_W && y >= 0 && y < MAP_H)
              terrain[tileIdx(x, y)] = 'L';
          }
        }
      });

      /* city tiles (bonus income) */
      var cities = 0, attempts = 0;
      while (cities < 10 && attempts < 500) {
        attempts++;
        var cx2 = 3 + Math.floor(Math.random() * (MAP_W-6));
        var cy2 = 2 + Math.floor(Math.random() * (MAP_H-4));
        var idx = tileIdx(cx2, cy2);
        if (terrain[idx] === 'L') {
          var nearSpawn = spawns.some(function(sp) {
            return Math.abs(cx2-sp[0]) < 5 && Math.abs(cy2-sp[1]) < 5;
          });
          if (!nearSpawn) { terrain[idx] = 'C'; cities++; }
        }
      }

      return { w: MAP_W, h: MAP_H, terrain: terrain.join(''), spawns: spawns };
    }
  };

  /* =================================================
     Phase 2/4: Renderer
  ================================================= */
  var Renderer = {
    ts: 16,

    resize: function() {
      if (!st.canvas) return;
      var wrap = st.canvas.parentElement;
      if (!wrap) return;
      st.canvas.width  = wrap.clientWidth;
      st.canvas.height = wrap.clientHeight;
      this.ts = Math.min(
        Math.floor(st.canvas.width  / MAP_W),
        Math.floor(st.canvas.height / MAP_H)
      );
      if (this.ts < 4) this.ts = 4;
    },

    draw: function() {
      if (!st.canvas || !st.ctx || !st.mapStatic) return;
      var ctx     = st.ctx;
      var ts      = this.ts;
      var terrain = st.mapStatic.terrain;
      var tiles   = (st.gameState && st.gameState.tiles) || {};

      /* center the map */
      var totalW = MAP_W * ts, totalH = MAP_H * ts;
      var offX = Math.floor((st.canvas.width  - totalW) / 2);
      var offY = Math.floor((st.canvas.height - totalH) / 2);

      ctx.clearRect(0, 0, st.canvas.width, st.canvas.height);
      ctx.fillStyle = '#080c14';
      ctx.fillRect(0, 0, st.canvas.width, st.canvas.height);

      for (var y = 0; y < MAP_H; y++) {
        for (var x = 0; x < MAP_W; x++) {
          var idx  = tileIdx(x, y);
          var t    = terrain[idx];
          var dyn  = tiles[idx] || { o: 0, t: 0 };
          var px   = offX + x * ts;
          var py   = offY + y * ts;

          /* base fill */
          var fill;
          if (t === 'W') {
            fill = '#0d2240';
          } else if (t === 'M') {
            fill = '#1c2231';
          } else if (dyn.o > 0) {
            var owner = null;
            var pkeys = Object.keys(st.players);
            for (var pi = 0; pi < pkeys.length; pi++) {
              if (st.players[pkeys[pi]].slot === dyn.o) { owner = st.players[pkeys[pi]]; break; }
            }
            fill = owner ? owner.color + 'b0' : '#55555580';
          } else {
            fill = (t === 'C') ? '#2a1f0e' : '#18202e';
          }

          ctx.fillStyle = fill;
          ctx.fillRect(px, py, ts, ts);

          /* grid line */
          ctx.strokeStyle = 'rgba(0,0,0,0.45)';
          ctx.lineWidth = 0.5;
          ctx.strokeRect(px + 0.25, py + 0.25, ts - 0.5, ts - 0.5);

          /* mountain */
          if (t === 'M') {
            ctx.fillStyle = '#2e3a4a';
            ctx.fillRect(px + ts*0.25, py + ts*0.2, ts*0.5, ts*0.3);
            ctx.fillStyle = '#3d4f60';
            ctx.fillRect(px + ts*0.35, py + ts*0.07, ts*0.3, ts*0.16);
          }

          /* water glint */
          if (t === 'W' && ts >= 10) {
            ctx.fillStyle = 'rgba(96,165,250,0.07)';
            ctx.fillRect(px+2, py + Math.floor(ts*0.5)-1, ts-4, 2);
          }

          /* city star */
          if (t === 'C' && ts >= 10) {
            ctx.fillStyle = dyn.o > 0 ? 'rgba(255,215,60,0.9)' : 'rgba(255,180,40,0.4)';
            var fs = Math.max(7, Math.min(ts - 4, 13));
            ctx.font = 'bold ' + fs + 'px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            var starY = (dyn.t > 0 && ts >= 16) ? py + ts*0.32 : py + ts*0.5;
            ctx.fillText('\u2605', px + ts*0.5, starY);
          }

          /* fort shield */
          if (dyn.b === 2 && dyn.o > 0 && ts >= 12) {
            var fx = px + ts*0.5, fy = py + ts*0.26;
            var fw = ts * 0.32, fh = ts * 0.42;
            ctx.fillStyle = 'rgba(148,163,184,0.88)';
            ctx.beginPath();
            ctx.moveTo(fx - fw/2, fy);
            ctx.lineTo(fx + fw/2, fy);
            ctx.lineTo(fx + fw/2, fy + fh*0.58);
            ctx.quadraticCurveTo(fx + fw/2, fy + fh, fx, fy + fh);
            ctx.quadraticCurveTo(fx - fw/2, fy + fh, fx - fw/2, fy + fh*0.58);
            ctx.closePath();
            ctx.fill();
          }

          /* troop count */
          if (t !== 'W' && t !== 'M' && dyn.t > 0 && ts >= 14) {
            ctx.fillStyle = dyn.o > 0 ? '#ffffff' : '#6b7280';
            var tfs = Math.max(6, Math.min(ts - 5, 11));
            ctx.font = 'bold ' + tfs + 'px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            var textY = (t === 'C' && ts >= 14) ? py + ts*0.72 : py + ts*0.5;
            ctx.fillText(dyn.t > 999 ? '999' : dyn.t, px + ts*0.5, textY);
          }

          /* selection */
          if (st.selectedTile === idx) {
            ctx.strokeStyle = 'rgba(255,255,255,0.9)';
            ctx.lineWidth = 2;
            ctx.strokeRect(px+1, py+1, ts-2, ts-2);
            ctx.strokeStyle = 'rgba(255,255,255,0.2)';
            ctx.lineWidth = 5;
            ctx.strokeRect(px-1, py-1, ts+2, ts+2);
          }
        }
      }

      /* ── Territory border pass ───────────────── */
      var playersBySlot = {};
      Object.keys(st.players).forEach(function(uid) {
        var p = st.players[uid]; playersBySlot[p.slot] = p;
      });
      ctx.lineWidth = 2;
      for (var by = 0; by < MAP_H; by++) {
        for (var bx = 0; bx < MAP_W; bx++) {
          var bidx = tileIdx(bx, by);
          var bdyn = tiles[bidx] || { o: 0, t: 0 };
          if (bdyn.o <= 0) continue;
          var bowner = playersBySlot[bdyn.o];
          if (!bowner) continue;
          ctx.strokeStyle = bowner.color;
          var bpx = offX + bx * ts, bpy = offY + by * ts;
          /* right edge */
          if (bx + 1 < MAP_W && (tiles[tileIdx(bx+1,by)]||{o:0}).o !== bdyn.o) {
            ctx.beginPath(); ctx.moveTo(bpx+ts-1,bpy); ctx.lineTo(bpx+ts-1,bpy+ts); ctx.stroke();
          }
          /* left edge */
          if (bx > 0 && (tiles[tileIdx(bx-1,by)]||{o:0}).o !== bdyn.o) {
            ctx.beginPath(); ctx.moveTo(bpx+1,bpy); ctx.lineTo(bpx+1,bpy+ts); ctx.stroke();
          }
          /* bottom edge */
          if (by + 1 < MAP_H && (tiles[tileIdx(bx,by+1)]||{o:0}).o !== bdyn.o) {
            ctx.beginPath(); ctx.moveTo(bpx,bpy+ts-1); ctx.lineTo(bpx+ts,bpy+ts-1); ctx.stroke();
          }
          /* top edge */
          if (by > 0 && (tiles[tileIdx(bx,by-1)]||{o:0}).o !== bdyn.o) {
            ctx.beginPath(); ctx.moveTo(bpx,bpy+1); ctx.lineTo(bpx+ts,bpy+1); ctx.stroke();
          }
        }
      }
    },

    getClickTile: function(clientX, clientY) {
      if (!st.canvas || !st.mapStatic) return null;
      var rect   = st.canvas.getBoundingClientRect();
      var scaleX = st.canvas.width  / rect.width;
      var scaleY = st.canvas.height / rect.height;
      var mx     = (clientX - rect.left) * scaleX;
      var my     = (clientY - rect.top)  * scaleY;
      var ts     = this.ts;
      var offX   = Math.floor((st.canvas.width  - MAP_W*ts) / 2);
      var offY   = Math.floor((st.canvas.height - MAP_H*ts) / 2);
      var tx     = Math.floor((mx - offX) / ts);
      var ty     = Math.floor((my - offY) / ts);
      if (tx < 0 || tx >= MAP_W || ty < 0 || ty >= MAP_H) return null;
      return { x: tx, y: ty, idx: tileIdx(tx, ty) };
    },

    startLoop: function() {
      var self = this;
      function loop() {
        self.draw();
        st.renderFrame = requestAnimationFrame(loop);
      }
      loop();
    },

    stopLoop: function() {
      if (st.renderFrame) { cancelAnimationFrame(st.renderFrame); st.renderFrame = null; }
    }
  };

  /* =================================================
     Phase 3/4: Engine · FirebaseSync · Input
  ================================================= */
  var Engine = {
    resolveAttack: function(tiles, fromIdx, toIdx, percent, attackerSlot) {
      var from = tiles[fromIdx];
      if (!from || from.o !== attackerSlot || from.t < 2) return;
      var sending = Math.max(1, Math.floor(from.t * percent / 100));
      from.t -= sending;
      var to = tiles[toIdx] || { o: 0, t: 0 };
      if (to.o === 0 || to.o === attackerSlot) {
        tiles[toIdx] = { o: attackerSlot, t: (to.t || 0) + sending, b: to.b || 0 };
      } else {
        var defMul = (to.b === 2) ? 2 : 1;   /* fort doubles effective defense */
        var effDef = to.t * defMul;
        if (sending > effDef) {
          /* attacker wins; fort is destroyed on capture */
          tiles[toIdx] = { o: attackerSlot, t: Math.max(1, sending - to.t), b: 0 };
        } else {
          if (!tiles[toIdx]) tiles[toIdx] = { o: to.o, t: to.t, b: to.b || 0 };
          tiles[toIdx].t = Math.max(1, to.t - Math.floor(sending / defMul));
        }
      }
      if (from.t < 0) from.t = 0;
    },

    genTroops: function(tiles, terrain) {
      var keys = Object.keys(tiles);
      for (var i = 0; i < keys.length; i++) {
        var tile = tiles[keys[i]];
        if (tile.o > 0) {
          tile.t += 1;
          if (terrain[parseInt(keys[i])] === 'C') tile.t += 2;
          if (tile.t > TROOP_CAP) tile.t = TROOP_CAP;
        }
      }
    },

    getStats: function(tiles) {
      var stats = {};
      var keys = Object.keys(tiles);
      for (var i = 0; i < keys.length; i++) {
        var o = tiles[keys[i]].o;
        if (o > 0) stats[o] = (stats[o] || 0) + 1;
      }
      return stats;
    },

    checkWin: function(tiles, terrain) {
      var land = 0;
      for (var i = 0; i < terrain.length; i++) {
        if (terrain[i] !== 'W' && terrain[i] !== 'M') land++;
      }
      var stats = this.getStats(tiles);
      var slots = Object.keys(stats);
      /* last player standing wins outright */
      if (slots.length === 1) return parseInt(slots[0]);
      for (var j = 0; j < slots.length; j++) {
        if (stats[slots[j]] / land >= WIN_PCT) return parseInt(slots[j]);
      }
      return null;
    }
  };

  var FBSync = {
    /* Host: push only changed tiles + small metadata — NOT the full tile map */
    pushDelta: function(prevTiles, newGs) {
      if (!st.roomRef) return;
      var updates = {};
      var newTiles = newGs.tiles;
      /* diff tiles */
      Object.keys(newTiles).forEach(function(k) {
        var p = prevTiles[k], c = newTiles[k];
        if (!p || p.o !== c.o || p.t !== c.t || (p.b||0) !== (c.b||0)) {
          updates['gameState/tiles/' + k] = c;
        }
      });
      /* always push lightweight metadata */
      updates['gameState/tick']        = newGs.tick;
      updates['gameState/playerStats'] = newGs.playerStats || null;
      updates['gameState/winner']      = newGs.winner || null;
      st.roomRef.update(updates);
    },

    /* Clients: listen to tile diffs — only changed tiles arrive, not the full map */
    listenTiles: function(cb) {
      if (!st.roomRef) return;
      var ref = st.roomRef.child('gameState/tiles');
      var addFn = ref.on('child_added',   function(s) { cb(s.key, s.val()); });
      var chgFn = ref.on('child_changed', function(s) { cb(s.key, s.val()); });
      st.listeners.push(function() {
        ref.off('child_added',   addFn);
        ref.off('child_changed', chgFn);
      });
    },

    /* Clients: listen to tick/playerStats/winner as separate tiny fields */
    listenMeta: function(cb) {
      if (!st.roomRef) return;
      ['tick','playerStats','winner'].forEach(function(field) {
        var ref = st.roomRef.child('gameState/' + field);
        var fn  = ref.on('value', function(s) { cb(field, s.val()); });
        st.listeners.push(function() { ref.off('value', fn); });
      });
    },

    /* Lobby / status listeners (unchanged — small payloads) */
    listen: function(path, cb) {
      if (!st.roomRef) return;
      var ref = st.roomRef.child(path);
      var fn = ref.on('value', function(snap) { cb(snap.val()); });
      st.listeners.push(function() { ref.off('value', fn); });
    }
  };

  function handleClick(e) {
    if (st.phase !== 'playing') return;
    var hit = Renderer.getClickTile(e.clientX, e.clientY);
    if (!hit) return;
    var terrain = st.mapStatic && st.mapStatic.terrain;
    if (!terrain) return;
    var t = terrain[hit.idx];
    if (t === 'W' || t === 'M') return;
    var dyn = (st.gameState && st.gameState.tiles && st.gameState.tiles[hit.idx]) || { o: 0, t: 0 };
    if (dyn.o === st.mySlot) {
      st.selectedTile = (st.selectedTile === hit.idx) ? null : hit.idx;
    } else if (st.selectedTile !== null) {
      var from = tileXY(st.selectedTile);
      if (Math.abs(hit.x - from.x) <= 1 && Math.abs(hit.y - from.y) <= 1) {
        KCWorld._submitAttack(st.selectedTile, hit.idx, 60);
        st.selectedTile = null;
      } else {
        st.selectedTile = null;
      }
    } else {
      st.selectedTile = null;
    }
  }

  var BOT_NAMES = ['General Ryze','Commander Nova','Baron Kessler','Marshal Quinn','Captain Zeta'];

  var Bot = {
    think: function(tiles, terrain, botSlot) {
      var attacks = [];
      var keys = Object.keys(tiles).filter(function(k) {
        return tiles[k].o === botSlot && tiles[k].t > 6;
      });
      keys.sort(function() { return Math.random() - 0.5; });
      var found = 0;
      for (var i = 0; i < keys.length && found < 2; i++) {
        var fromIdx = parseInt(keys[i]);
        var pos = tileXY(fromIdx);
        var neighbors = [];
        if (pos.x > 0)       neighbors.push(tileIdx(pos.x-1, pos.y));
        if (pos.x < MAP_W-1) neighbors.push(tileIdx(pos.x+1, pos.y));
        if (pos.y > 0)       neighbors.push(tileIdx(pos.x,   pos.y-1));
        if (pos.y < MAP_H-1) neighbors.push(tileIdx(pos.x,   pos.y+1));
        neighbors.sort(function() { return Math.random() - 0.5; });
        for (var j = 0; j < neighbors.length; j++) {
          var toIdx = neighbors[j];
          var t = terrain[toIdx];
          if (t === 'W' || t === 'M') continue;
          var toTile = tiles[toIdx] || { o: 0, t: 0 };
          if (toTile.o === botSlot) continue;
          if (toTile.o === 0 || tiles[keys[i]].t > toTile.t * 1.3) {
            attacks.push({ from: fromIdx, to: toIdx, percent: 70, attacker: botSlot });
            found++; break;
          }
        }
      }
      return attacks;
    }
  };

  function hostTick() {
    if (!st.isHost || !st.gameState || !st.mapStatic) return;
    st.roomRef.child('attacks').once('value').then(function(snap) {
      var raw = snap.val() || {};
      var attacks = Object.values(raw).sort(function(a,b){ return (a.ts||0)-(b.ts||0); });
      if (Object.keys(raw).length) st.roomRef.child('attacks').remove();

      var srcTiles = st.gameState.tiles || {};
      /* snapshot prev state for delta diff */
      var prevTiles = {};
      Object.keys(srcTiles).forEach(function(k) { prevTiles[k] = Object.assign({}, srcTiles[k]); });
      var tiles = {};
      Object.keys(srcTiles).forEach(function(k) { tiles[k] = Object.assign({}, srcTiles[k]); });

      attacks.forEach(function(atk) {
        if (atk.type === 'fort') {
          /* build fort: deduct troops, set b=2 */
          var tile = tiles[atk.from];
          if (tile && tile.o === atk.attacker && tile.t >= 15 && tile.b !== 2) {
            tile.t -= 15;
            tile.b  = 2;
          }
        } else {
          Engine.resolveAttack(tiles, atk.from, atk.to, atk.percent, atk.attacker);
        }
      });
      /* bot moves */
      st.bots.forEach(function(botSlot) {
        Bot.think(tiles, st.mapStatic.terrain, botSlot).forEach(function(atk) {
          Engine.resolveAttack(tiles, atk.from, atk.to, atk.percent, atk.attacker);
        });
      });
      Engine.genTroops(tiles, st.mapStatic.terrain);

      var stats  = Engine.getStats(tiles);
      var winner = Engine.checkWin(tiles, st.mapStatic.terrain);

      var newGs = {
        tick: (st.gameState.tick || 0) + 1,
        winner: winner || null,
        tiles: tiles,
        playerStats: stats
      };
      st.gameState = newGs;
      FBSync.pushDelta(prevTiles, newGs);   /* send only changed tiles */
      if (winner) { clearInterval(st.tickTimer); st.tickTimer = null; }
    });
  }

  function cleanupGame() {
    Renderer.stopLoop();
    if (st.tickTimer) { clearInterval(st.tickTimer); st.tickTimer = null; }
    if (st.canvas) {
      if (st._clickHandler)    st.canvas.removeEventListener('click',       st._clickHandler);
      if (st._ctxHandler)      st.canvas.removeEventListener('contextmenu', st._ctxHandler);
      if (st._touchHandler)    st.canvas.removeEventListener('touchstart',  st._touchHandler);
      if (st._touchEndHandler) st.canvas.removeEventListener('touchend',    st._touchEndHandler);
    }
    if (st._resizeHandler) window.removeEventListener('resize', st._resizeHandler);
    /* dismiss any open build popup */
    var pop = document.getElementById('kcw-build-popup');
    if (pop) pop.remove();
    st.listeners.forEach(function(off){ off(); });
    st.listeners = [];
    st.canvas = null; st.ctx = null; st.selectedTile = null; st.spectating = false;
    st._clickHandler = null; st._resizeHandler = null; st._ctxHandler = null;
    st._touchHandler = null; st._touchEndHandler = null;
  }

  /* =================================================
     Phase 4/4: UI Screens · Public API
  ================================================= */
  function content() { return document.getElementById('kcw-content'); }

  function showMenu() {
    st.phase = 'menu';
    var c = content(); if (!c) return;
    c.innerHTML = '<div class="kcw-menu">' +
      '<div class="kcw-title-big">KC WORLD</div>' +
      '<div class="kcw-subtitle">Territory Conquest &middot; Multiplayer</div>' +
      '<button class="kcw-btn kcw-btn-primary" onclick="KCWorld.createRoom()">Create Room</button>' +
      '<div class="kcw-join-row">' +
        '<input type="text" id="kcw-code-in" placeholder="Room code" maxlength="6" class="kcw-input"' +
          ' onkeydown="if(event.key===\'Enter\')KCWorld.joinRoom(this.value)" />' +
        '<button class="kcw-btn kcw-btn-secondary kcw-btn-sm"' +
          ' onclick="KCWorld.joinRoom(document.getElementById(\'kcw-code-in\').value)">Join</button>' +
      '</div>' +
      '<div class="kcw-rules"><b>How to play</b><br>' +
        'Click <b>your territory</b> then an adjacent tile to attack.<br>' +
        'Troops grow every 2s. Cities give bonus income.<br>' +
        'First to <b>75%</b> of the map wins!<br>' +
        'Win: <b>+75 pts</b> &nbsp;&middot;&nbsp; Participate: <b>+10 pts</b>' +
      '</div></div>';
  }

  function renderLobby() {
    if (st.phase !== 'lobby') return;
    var c = content(); if (!c) return;
    var count = Object.keys(st.players).length;
    var rows = Object.keys(st.players).map(function(uid) {
      var p = st.players[uid];
      return '<div class="kcw-player-row" style="border-left-color:' + p.color + '">' +
        '<span class="kcw-player-name">' + esc(p.name) + (uid === st.myUid ? ' <span style="color:#475569;font-size:.7rem">(you)</span>' : '') + '</span>' +
        '<span class="kcw-player-ready' + (p.ready ? ' ready' : '') + '">' + (p.ready ? '&#10003; Ready' : 'Waiting&hellip;') + '</span>' +
      '</div>';
    }).join('');
    var myP = st.players[st.myUid] || {};
    var actions = (!myP.ready
      ? '<button class="kcw-btn kcw-btn-secondary" onclick="KCWorld._setReady(true)">Mark Ready</button>'
      : '<button class="kcw-btn kcw-btn-secondary" onclick="KCWorld._setReady(false)">Cancel Ready</button>');
    if (st.isHost) {
      actions += '<button class="kcw-btn kcw-btn-start" onclick="KCWorld.startGame()"' +
        (count < 1 ? ' disabled' : '') + '>\u25b6 Start Game</button>';
    } else {
      actions += '<div class="kcw-waiting">Waiting for host to start\u2026</div>';
    }
    c.innerHTML = '<div class="kcw-lobby">' +
      '<div class="kcw-lobby-header">' +
        '<div>' +
          '<div class="kcw-lobby-code">Room <span class="kcw-code">' + esc(st.roomCode) + '</span></div>' +
          '<div class="kcw-lobby-sub">' + count + ' of 6 players</div>' +
        '</div>' +
        '<button class="kcw-btn kcw-btn-secondary kcw-btn-sm"' +
          ' onclick="navigator.clipboard.writeText(\'' + esc(st.roomCode) + '\')' +
          '.then(function(){window.showToast&&window.showToast(\'Code copied!\',\'success\',2000)})">Copy Code</button>' +
      '</div>' +
      '<div class="kcw-player-list">' + (rows || '<div style="color:#334155;font-size:.8rem;padding:8px">No players yet&hellip;</div>') + '</div>' +
      '<div class="kcw-lobby-actions">' + actions + '</div>' +
      (st.isHost
        ? '<div class="kcw-bot-row">' +
            '<span class="kcw-bot-label">\uD83E\uDD16 AI Bots</span>' +
            '<div class="kcw-bot-controls">' +
              '<button class="kcw-bot-btn" onclick="KCWorld._setBots(Math.max(0,st.botCount-1))">\u2212</button>' +
              '<span class="kcw-bot-count">' + (st.botCount || 0) + '</span>' +
              '<button class="kcw-bot-btn" onclick="KCWorld._setBots(' + (st.botCount||0) + '+1)">\u002b</button>' +
            '</div>' +
          '</div>'
        : '')  +
      '<div class="kcw-map-label">\uD83D\uDDFA Map 40\xd725 &middot; Troops every 2s &middot; Win at 75%</div>' +
    '</div>';
  }

  function showGame() {
    st.phase = 'playing';
    var c = content(); if (!c) return;
    var myColor = PLAYER_COLORS[(st.mySlot || 1) - 1];
    c.innerHTML = '<div class="kcw-game">' +
      '<div class="kcw-hud">' +
        '<div class="kcw-hud-left">' +
          '<div class="kcw-hud-item">Tick <span id="kcw-tick">0</span></div>' +
          '<div class="kcw-hud-item">Territory <span id="kcw-pct">0%</span></div>' +
          '<div class="kcw-hud-item">Troops <span id="kcw-troops">0</span></div>' +
        '</div>' +
        '<div class="kcw-hud-players" id="kcw-phud"></div>' +
      '</div>' +
      '<div class="kcw-canvas-wrap"><canvas id="kcw-canvas"></canvas></div>' +
      '<div class="kcw-game-tip">Click <span style="color:' + myColor + '">\u25a0 your territory</span> then an adjacent tile to attack</div>' +
    '</div>';

    var canvas = document.getElementById('kcw-canvas');
    st.canvas = canvas;
    st.ctx = canvas.getContext('2d');
    Renderer.resize();
    st._resizeHandler = function() { Renderer.resize(); };
    window.addEventListener('resize', st._resizeHandler);
    Renderer.startLoop();
    st._clickHandler = handleClick;
    canvas.addEventListener('click', st._clickHandler);

    /* right-click → build fort popup */
    st._ctxHandler = function(e) {
      e.preventDefault();
      if (st.spectating) return;
      var hit = Renderer.getClickTile(e.clientX, e.clientY);
      if (!hit) return;
      var tile = (st.gameState && st.gameState.tiles && st.gameState.tiles[hit.idx]) || { o: 0, t: 0 };
      if (tile.o !== st.mySlot || tile.t < 15 || tile.b === 2) return;
      KCWorld._showBuildPopup(hit.idx, e.clientX, e.clientY);
    };
    canvas.addEventListener('contextmenu', st._ctxHandler);

    /* touch → forward as click */
    st._touchHandler = function(e) {
      if (e.touches.length > 0) e.preventDefault();
    };
    st._touchEndHandler = function(e) {
      var t = e.changedTouches[0];
      if (t) handleClick({ clientX: t.clientX, clientY: t.clientY });
    };
    canvas.addEventListener('touchstart', st._touchHandler,    { passive: false });
    canvas.addEventListener('touchend',   st._touchEndHandler, { passive: true  });

    /* tile diffs — only changed/added tiles arrive each tick (~0.5 KB vs 28 KB) */
    FBSync.listenTiles(function(key, val) {
      if (!st.gameState) st.gameState = { tiles: {}, tick: 0, winner: null, playerStats: {} };
      if (!st.gameState.tiles) st.gameState.tiles = {};
      st.gameState.tiles[key] = val;
    });

    /* tiny metadata — tick, playerStats, winner */
    FBSync.listenMeta(function(field, val) {
      if (!st.gameState) st.gameState = { tiles: {}, tick: 0, winner: null, playerStats: {} };
      st.gameState[field] = val;
      if (field === 'playerStats') updateHUD();
      if (field === 'winner' && val && st.phase === 'playing') showResult(val);
    });

    if (st.isHost) st.tickTimer = setInterval(hostTick, TICK_MS);
  }

  function updateHUD() {
    var gs = st.gameState; if (!gs) return;
    var terrain   = (st.mapStatic && st.mapStatic.terrain) || '';
    var landCount = 0;
    for (var i = 0; i < terrain.length; i++) { if (terrain[i] !== 'W' && terrain[i] !== 'M') landCount++; }
    if (!landCount) landCount = 1;
    var myCount = (gs.playerStats && gs.playerStats[st.mySlot]) || 0;
    var pct = Math.round(myCount / landCount * 100);
    var myTroops = 0;
    var keys = Object.keys(gs.tiles || {});
    for (var j = 0; j < keys.length; j++) {
      var tile = gs.tiles[keys[j]];
      if (tile.o === st.mySlot) myTroops += (tile.t || 0);
    }
    /* elimination check */
    if (!st.spectating && myCount === 0 && (gs.tick || 0) > 4 && !gs.winner) {
      st.spectating = true;
      toast('You\'ve been eliminated \u2014 watching as spectator', 'error');
      var tip = document.querySelector('.kcw-game-tip');
      if (tip) tip.innerHTML = '<span style="color:#ef4444">\u2694\uFE0F Eliminated \u2014 Spectating</span>';
    }
    var el;
    el = document.getElementById('kcw-tick');    if (el) el.textContent = gs.tick || 0;
    el = document.getElementById('kcw-pct');     if (el) el.textContent = pct + '%';
    el = document.getElementById('kcw-troops');  if (el) el.textContent = myTroops;
    var phud = document.getElementById('kcw-phud');
    if (phud) {
      phud.innerHTML = Object.keys(st.players).map(function(uid) {
        var p = st.players[uid];
        var cnt  = (gs.playerStats && gs.playerStats[p.slot]) || 0;
        var pct2 = Math.round(cnt / landCount * 100);
        return '<div class="kcw-hud-player">' +
          '<span class="kcw-hud-dot" style="background:' + p.color + '"></span>' +
          esc(p.name) + ' ' + pct2 + '%</div>';
      }).join('');
    }
  }

  function showResult(winnerSlot) {
    if (st.phase === 'done') return;
    st.phase = 'done';
    cleanupGame();

    var winner = null;
    var pkeys = Object.keys(st.players);
    for (var i = 0; i < pkeys.length; i++) {
      if (st.players[pkeys[i]].slot === winnerSlot) { winner = st.players[pkeys[i]]; break; }
    }
    var isWinner = (winnerSlot === st.mySlot);
    var pts = isWinner ? 75 : 10;

    if (st.discordId) {
      getDb().ref('userEconomy/' + st.discordId).transaction(function(eco) {
        if (!eco) eco = {};
        eco.points = (eco.points || 0) + pts;
        if (!eco.gameStats) eco.gameStats = {};
        if (!eco.gameStats.kcworld) eco.gameStats.kcworld = { wins: 0, losses: 0, games: 0 };
        eco.gameStats.kcworld.games += 1;
        if (isWinner) eco.gameStats.kcworld.wins += 1;
        else eco.gameStats.kcworld.losses += 1;
        return eco;
      });
    }

    var c = content(); if (!c) return;
    c.innerHTML = '<div class="kcw-result">' +
      '<div class="kcw-result-icon">' + (isWinner ? '\uD83D\uDC51' : '\u2694\uFE0F') + '</div>' +
      '<div class="kcw-result-title">' + (isWinner ? 'VICTORY!' : 'DEFEATED') + '</div>' +
      '<div class="kcw-result-sub">' + esc((winner && winner.name) || 'Unknown') + ' conquered KC World</div>' +
      '<div class="kcw-result-pts">+' + pts + ' pts</div>' +
      '<button class="kcw-btn kcw-btn-primary" onclick="KCWorld._playAgain()">Play Again</button>' +
      '<button class="kcw-btn kcw-btn-secondary" onclick="KCWorld.destroy()">Exit</button>' +
    '</div>';

    if (window.addFeedItem) window.addFeedItem({
      id: 'kcworld_' + st.roomCode + '_' + Date.now(),
      type: 'game_result',
      title: isWinner ? 'Conquered KC World!' : 'Played KC World',
      user: window.currentUser && window.currentUser.displayName,
      uid:  window.currentUser && window.currentUser.uid,
      detail: isWinner ? 'Seized 75% of the map' : 'Lost to ' + ((winner && winner.name) || 'Unknown'),
      color: isWinner ? '#f59e0b' : '#6b7280',
      icon:  isWinner ? '\uD83D\uDC51' : '\u2694\uFE0F',
      timestamp: Date.now()
    });

    if (st.isHost) setTimeout(function() { st.roomRef && st.roomRef.remove(); }, 60000);
  }

  /* ── Public API ──────────────────────────────── */
  var KCWorld = {
    openLobby: function() {
      if (!window.currentUser) { toast('Sign in to play KC World', 'error'); return; }
      st.myUid  = window.currentUser.uid;
      st.myName = (window.currentUser.displayName) ||
                  (window.currentUserData && window.currentUserData.displayName) || 'Player';
      var self = this;
      lookupDiscordId(st.myUid).then(function(did) {
        st.discordId = did;
        var el = document.getElementById('kc-world-overlay');
        if (el) el.remove();
        var overlay = document.createElement('div');
        overlay.id = 'kc-world-overlay';
        overlay.innerHTML =
          '<div class="kcw-header">' +
            '<div class="kcw-logo">\uD83C\uDF0D KC WORLD</div>' +
            '<button class="kcw-close" onclick="KCWorld.destroy()">\u2715</button>' +
          '</div>' +
          '<div id="kcw-content" style="flex:1;display:flex;flex-direction:column;overflow:hidden;min-height:0"></div>';
        document.body.appendChild(overlay);
        st.overlay = overlay;
        showMenu();
      });
    },

    createRoom: function() {
      var self = this;
      var code = genCode();
      st.roomRef  = getDb().ref('kcworld_rooms/' + code);
      st.roomCode = code;
      st.isHost   = true;
      st.mySlot   = 1;
      var myPlayer = { name: st.myName, color: PLAYER_COLORS[0], slot: 1, ready: false, alive: true };
      st.roomRef.set({
        host: st.myUid,
        hostBeat: window.firebase.database.ServerValue.TIMESTAMP,
        status: 'lobby', code: code,
        settings: { winPercent: 75, maxPlayers: 6 },
        players: {},
        createdAt: window.firebase.database.ServerValue.TIMESTAMP
      }).then(function() {
        return st.roomRef.child('players/' + st.myUid).set(myPlayer);
      }).then(function() {
        st.players = {}; st.players[st.myUid] = myPlayer;
        st.phase = 'lobby';
        renderLobby();
        FBSync.listen('players', function(players) {
          st.players = players || {}; renderLobby();
        });
        FBSync.listen('status', function(status) {
          if (status === 'playing' && st.phase === 'lobby') {
            st.roomRef.once('value').then(function(s) {
              var r = s.val(); if (!r) return;
              st.mapStatic = r.mapStatic; st.gameState = r.gameState;
              showGame();
            });
          }
        });
      });
    },

    joinRoom: function(rawCode) {
      var code = (rawCode || '').trim().toUpperCase();
      if (code.length < 4) { toast('Enter a valid room code', 'error'); return; }
      getDb().ref('kcworld_rooms/' + code).once('value').then(function(snap) {
        var room = snap.val();
        if (!room) { toast('Room not found', 'error'); return; }
        if (room.status !== 'lobby') { toast('Game already in progress', 'error'); return; }
        var used = Object.values(room.players || {}).map(function(p){ return p.slot; });
        var mySlot = [1,2,3,4,5,6].find(function(s){ return used.indexOf(s) === -1; });
        if (!mySlot) { toast('Room is full', 'error'); return; }
        st.roomRef  = getDb().ref('kcworld_rooms/' + code);
        st.roomCode = code; st.isHost = false; st.mySlot = mySlot;
        var myPlayer = { name: st.myName, color: PLAYER_COLORS[mySlot-1], slot: mySlot, ready: false, alive: true };
        st.roomRef.child('players/' + st.myUid).set(myPlayer).then(function() {
          st.players = Object.assign({}, room.players); st.players[st.myUid] = myPlayer;
          st.phase = 'lobby';
          renderLobby();
          FBSync.listen('players', function(players) {
            st.players = players || {}; renderLobby();
          });
          FBSync.listen('status', function(status) {
            if (status === 'playing' && st.phase === 'lobby') {
              st.roomRef.once('value').then(function(s) {
                var r = s.val(); if (!r) return;
                st.mapStatic = r.mapStatic; st.gameState = r.gameState;
                showGame();
              });
            }
          });
        });
      }).catch(function() { toast('Could not connect to room', 'error'); });
    },

    startGame: function() {
      if (!st.isHost) return;
      var playerList = Object.keys(st.players).map(function(uid){ return [uid, st.players[uid]]; });
      /* add bot players */
      st.bots = [];
      var botUpdates = {};
      for (var bi = 0; bi < (st.botCount || 0) && playerList.length < 6; bi++) {
        var usedSlots = playerList.map(function(e){ return e[1].slot; });
        var botSlot = [1,2,3,4,5,6].find(function(s){ return usedSlots.indexOf(s) === -1; });
        if (!botSlot) break;
        var botUid = 'bot_' + botSlot;
        var botP = { name: BOT_NAMES[bi % BOT_NAMES.length], color: PLAYER_COLORS[botSlot-1], slot: botSlot, ready: true, alive: true, isBot: true };
        playerList.push([botUid, botP]);
        st.players[botUid] = botP;
        botUpdates['players/' + botUid] = botP;
        st.bots.push(botSlot);
      }
      var mapStatic  = MapGen.generate(playerList.length);
      var initTiles  = {};
      playerList.forEach(function(entry, i) {
        var player = entry[1];
        var sx = mapStatic.spawns[i][0], sy = mapStatic.spawns[i][1];
        for (var dy = -1; dy <= 1; dy++) {
          for (var dx = -1; dx <= 1; dx++) {
            var nx = sx+dx, ny = sy+dy;
            if (nx>=0 && nx<MAP_W && ny>=0 && ny<MAP_H) {
              initTiles[tileIdx(nx,ny)] = { o: player.slot, t: (dx===0&&dy===0)?10:3, b: 0 };
            }
          }
        }
      });
      var initGs = { tick: 0, winner: null, tiles: initTiles, playerStats: {} };
      var roomUpdate = Object.assign({ status: 'playing', mapStatic: mapStatic, gameState: initGs, bots: st.bots }, botUpdates);
      st.roomRef.update(roomUpdate).then(function() {
        st.mapStatic = mapStatic; st.gameState = initGs;
        showGame();
      });
    },

    _setReady: function(ready) {
      if (st.roomRef) st.roomRef.child('players/' + st.myUid + '/ready').set(ready);
    },

    _setBots: function(n) {
      var humanCount = Object.keys(st.players).filter(function(k){ return !st.players[k].isBot; }).length;
      st.botCount = Math.max(0, Math.min(6 - humanCount, n));
      renderLobby();
    },

    _submitAttack: function(fromIdx, toIdx, percent) {
      if (!st.roomRef || st.phase !== 'playing') return;
      st.roomRef.child('attacks').push({
        from: fromIdx, to: toIdx, percent: percent,
        attacker: st.mySlot, uid: st.myUid,
        tick: (st.gameState && st.gameState.tick) || 0,
        ts: window.firebase.database.ServerValue.TIMESTAMP
      });
    },

    _showBuildPopup: function(tileIdx, cx, cy) {
      var existing = document.getElementById('kcw-build-popup');
      if (existing) existing.remove();
      var wrap = document.querySelector('.kcw-canvas-wrap');
      if (!wrap) return;
      var rect = wrap.getBoundingClientRect();
      var pop = document.createElement('div');
      pop.id = 'kcw-build-popup';
      pop.className = 'kcw-build-popup';
      pop.style.left = Math.min(cx - rect.left, rect.width - 180) + 'px';
      pop.style.top  = Math.max(cy - rect.top  - 110, 8) + 'px';
      pop.innerHTML =
        '<div class="kcw-build-title">\uD83D\uDEE1 Build Fort</div>' +
        '<div class="kcw-build-sub">Doubles defense &middot; costs 15 troops</div>' +
        '<button class="kcw-btn kcw-btn-primary kcw-btn-sm" style="width:100%" onclick="KCWorld._confirmBuild(' + tileIdx + ')">Build &minus;15 troops</button>' +
        '<button class="kcw-btn kcw-btn-secondary kcw-btn-sm" style="width:100%;margin-top:6px" onclick="KCWorld._dismissBuild()">Cancel</button>';
      wrap.appendChild(pop);
      /* auto-dismiss on next click anywhere */
      setTimeout(function() {
        document.addEventListener('click', KCWorld._dismissBuild, { once: true });
      }, 10);
    },

    _confirmBuild: function(tileIdx) {
      this._dismissBuild();
      if (!st.roomRef || st.phase !== 'playing') return;
      st.roomRef.child('attacks').push({
        type: 'fort', from: tileIdx,
        attacker: st.mySlot, uid: st.myUid,
        ts: window.firebase.database.ServerValue.TIMESTAMP
      });
    },

    _dismissBuild: function() {
      var pop = document.getElementById('kcw-build-popup');
      if (pop) pop.remove();
    },

    _playAgain: function() {
      if (st.roomRef) st.roomRef.child('players/' + st.myUid).remove();
      st.roomRef = null; st.roomCode = null;
      st.isHost = false; st.mySlot = 0;
      st.players = {}; st.mapStatic = null; st.gameState = null;
      showMenu();
    },

    destroy: function() {
      cleanupGame();
      if (st.phase === 'lobby' && st.roomRef) st.roomRef.child('players/' + st.myUid).remove();
      if (st.overlay) { st.overlay.remove(); st.overlay = null; }
      st = {
        overlay:null, canvas:null, ctx:null,
        roomRef:null, roomCode:null,
        isHost:false, mySlot:0, myUid:null, myName:'Player', discordId:null,
        players:{}, mapStatic:null, gameState:null, selectedTile:null,
        tickTimer:null, renderFrame:null, listeners:[], phase:'closed',
        bots:[], botCount:1, spectating:false,
        _clickHandler:null, _resizeHandler:null, _ctxHandler:null, _touchHandler:null, _touchEndHandler:null
      };
    }
  };

  window.KCWorld = KCWorld;
})();
