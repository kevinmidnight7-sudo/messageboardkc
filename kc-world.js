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
  var TROOP_CAP  = 999;
  var TROOP_WARN = 749;   /* troop count turns orange above this */
  var HIGHLAND_PCT = 0.09; /* 9% of land tiles become highland (1.5× defense) */
  var NUKE_COST    = 50;   /* troops deducted from launch tile */
  var NUKE_RADIUS  = 2;    /* tiles neutralised around impact */
  var BUNKER_COST  = 25;   /* troops to build a bunker (3× defense) */
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
    selectedTerritory: null,   /* array of tile indices for selected blob */
    tickTimer: null, renderFrame: null,
    listeners: [],
    phase: 'closed',
    bots: [], botCount: 1,
    spectating: false,
    sendPercent: 60,
    hoveredTile: null,
    lastStats: {},
    alliances: {},
    _clickHandler: null, _resizeHandler: null, _ctxHandler: null,
    _touchHandler: null, _touchEndHandler: null, _moveHandler: null,
    keyHandler: null,
    fogOfWar: false,
    nukeFlash: null,
    pings: {},
    betrayers: {}
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

      /* highland tiles — 1.5× defense; scatter across remaining land */
      for (var hli = 0; hli < terrain.length; hli++) {
        if (terrain[hli] === 'L' && Math.random() < HIGHLAND_PCT) terrain[hli] = 'H';
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
      ctx.fillStyle = '#4a8db5';   /* deep ocean border */
      ctx.fillRect(0, 0, st.canvas.width, st.canvas.height);

      /* centroid accumulators for territory labels */
      var centroids = {};

      /* precompute selected territory set for O(1) lookup */
      var selSet = {};
      if (st.selectedTerritory) {
        for (var si = 0; si < st.selectedTerritory.length; si++) {
          selSet[st.selectedTerritory[si]] = true;
        }
      }

      for (var y = 0; y < MAP_H; y++) {
        for (var x = 0; x < MAP_W; x++) {
          var idx  = tileIdx(x, y);
          var t    = terrain[idx];
          var dyn  = tiles[idx] || { o: 0, t: 0 };
          var px   = offX + x * ts;
          var py   = offY + y * ts;

          /* accumulate label data */
          if (dyn.o > 0) {
            if (!centroids[dyn.o]) centroids[dyn.o] = { sx:0, sy:0, n:0, troops:0 };
            centroids[dyn.o].sx += x;
            centroids[dyn.o].sy += y;
            centroids[dyn.o].n++;
            centroids[dyn.o].troops += (dyn.t || 0);
          }

          /* base fill — light / earthy OpenFront palette */
          var fill;
          if (t === 'W') {
            /* coastal water lighter than open ocean */
            var isCoast = (
              (x > 0       && terrain[tileIdx(x-1,y)] !== 'W' && terrain[tileIdx(x-1,y)] !== 'M') ||
              (x < MAP_W-1 && terrain[tileIdx(x+1,y)] !== 'W' && terrain[tileIdx(x+1,y)] !== 'M') ||
              (y > 0       && terrain[tileIdx(x,y-1)] !== 'W' && terrain[tileIdx(x,y-1)] !== 'M') ||
              (y < MAP_H-1 && terrain[tileIdx(x,y+1)] !== 'W' && terrain[tileIdx(x,y+1)] !== 'M')
            );
            fill = isCoast ? '#7fc4e0' : '#5a9ec7';
          } else if (t === 'M') {
            fill = '#b0bdb8';   /* gray-green mountain base */
          } else if (dyn.o > 0) {
            var owner = null;
            var pkeys = Object.keys(st.players);
            for (var pi = 0; pi < pkeys.length; pi++) {
              if (st.players[pkeys[pi]].slot === dyn.o) { owner = st.players[pkeys[pi]]; break; }
            }
            fill = owner ? owner.color + 'a8' : 'rgba(120,120,120,0.65)';
          } else {
            if (t === 'C')      fill = '#d6c87a';  /* city — sandy gold */
            else if (t === 'H') fill = '#9abb7e';  /* highland — soft green */
            else                fill = '#cabb9e';  /* neutral land — parchment */
          }

          ctx.fillStyle = fill;
          ctx.fillRect(px, py, ts, ts);
          /* no grid lines — cleaner OpenFront look */

          /* mountain — triangular peak with snow cap & shadow side */
          if (t === 'M') {
            if (ts >= 8) {
              /* shadow side */
              ctx.fillStyle = '#8c9c96';
              ctx.beginPath();
              ctx.moveTo(px + ts*0.5, py + ts*0.1);
              ctx.lineTo(px + ts*0.88, py + ts*0.78);
              ctx.lineTo(px + ts*0.5, py + ts*0.78);
              ctx.closePath();
              ctx.fill();
              /* light side */
              ctx.fillStyle = '#cad4cf';
              ctx.beginPath();
              ctx.moveTo(px + ts*0.5, py + ts*0.1);
              ctx.lineTo(px + ts*0.12, py + ts*0.78);
              ctx.lineTo(px + ts*0.5, py + ts*0.78);
              ctx.closePath();
              ctx.fill();
              /* snow cap */
              ctx.fillStyle = '#eef2f0';
              ctx.beginPath();
              ctx.moveTo(px + ts*0.5,  py + ts*0.1);
              ctx.lineTo(px + ts*0.62, py + ts*0.32);
              ctx.lineTo(px + ts*0.38, py + ts*0.32);
              ctx.closePath();
              ctx.fill();
            } else {
              ctx.fillStyle = '#b8c4be';
              ctx.fillRect(px, py, ts, ts);
            }
          }

          /* highland — soft rolling hill ellipse */
          if (t === 'H' && ts >= 8) {
            ctx.fillStyle = dyn.o > 0 ? 'rgba(80,140,50,0.28)' : 'rgba(80,140,50,0.45)';
            ctx.beginPath();
            ctx.ellipse(px + ts*0.5, py + ts*0.62, ts*0.4, ts*0.26, 0, 0, Math.PI * 2);
            ctx.fill();
          }

          /* water ripple */
          if (t === 'W' && ts >= 10) {
            ctx.strokeStyle = 'rgba(255,255,255,0.18)';
            ctx.lineWidth = 0.8;
            ctx.beginPath();
            ctx.moveTo(px + ts*0.2, py + ts*0.5);
            ctx.lineTo(px + ts*0.55, py + ts*0.5);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(px + ts*0.45, py + ts*0.66);
            ctx.lineTo(px + ts*0.78, py + ts*0.66);
            ctx.stroke();
          }

          /* city star */
          if (t === 'C' && ts >= 10) {
            ctx.fillStyle = dyn.o > 0 ? 'rgba(160,110,10,0.95)' : 'rgba(140,100,10,0.65)';
            var fs = Math.max(7, Math.min(ts - 4, 13));
            ctx.font = 'bold ' + fs + 'px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            var starY = (dyn.t > 0 && ts >= 16) ? py + ts*0.32 : py + ts*0.5;
            ctx.fillText('\u2605', px + ts*0.5, starY);
          }

          /* fort shield (b=2) */
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

          /* bunker (b=3) — thick gold walls */
          if (dyn.b === 3 && dyn.o > 0 && ts >= 12) {
            var bkx = px + ts*0.15, bky = py + ts*0.28;
            var bkw = ts * 0.7,     bkh = ts * 0.52;
            ctx.strokeStyle = 'rgba(251,191,36,0.95)';
            ctx.lineWidth = Math.max(2, ts * 0.1);
            ctx.strokeRect(bkx, bky, bkw, bkh);
            /* battlements */
            ctx.fillStyle = 'rgba(251,191,36,0.85)';
            var bmt = ts * 0.12, bmw = ts * 0.12;
            for (var bmi = 0; bmi < 3; bmi++) {
              ctx.fillRect(bkx + bmi*(bkw/3), bky - bmt, bmw, bmt);
            }
          }

          /* troop count — dark text on light bg, small drop shadow */
          if (t !== 'W' && t !== 'M' && dyn.t > 0 && ts >= 14) {
            var troopColor = dyn.o > 0 ? '#1a140a' : 'rgba(70,55,35,0.7)';
            if (dyn.o === st.mySlot) {
              if (dyn.t >= TROOP_CAP)       troopColor = '#b91c1c';
              else if (dyn.t >= TROOP_WARN) troopColor = '#92400e';
            }
            var tfs = Math.max(6, Math.min(ts - 5, 11));
            ctx.font = 'bold ' + tfs + 'px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            var textY = (t === 'C' && ts >= 14) ? py + ts*0.72 : py + ts*0.5;
            /* subtle light halo for readability */
            ctx.fillStyle = 'rgba(255,255,255,0.55)';
            ctx.fillText(dyn.t > 999 ? '999' : dyn.t, px + ts*0.5 + 0.5, textY + 0.5);
            ctx.fillStyle = troopColor;
            ctx.fillText(dyn.t > 999 ? '999' : dyn.t, px + ts*0.5, textY);
          }

          /* selection highlight — whole territory blob */
          if (selSet[idx]) {
            ctx.fillStyle = 'rgba(255,255,255,0.22)';
            ctx.fillRect(px, py, ts, ts);
            ctx.strokeStyle = 'rgba(255,255,255,0.7)';
            ctx.lineWidth = 1.5;
            ctx.strokeRect(px + 0.5, py + 0.5, ts - 1, ts - 1);
          }
        }
      }

      /* ── Territory border pass ───────────────── */
      var playersBySlot = {};
      Object.keys(st.players).forEach(function(uid) {
        var p = st.players[uid]; playersBySlot[p.slot] = p;
      });
      for (var by = 0; by < MAP_H; by++) {
        for (var bx = 0; bx < MAP_W; bx++) {
          var bidx = tileIdx(bx, by);
          var bdyn = tiles[bidx] || { o: 0, t: 0 };
          if (bdyn.o <= 0) continue;
          var bowner = playersBySlot[bdyn.o];
          if (!bowner) continue;
          var bpx = offX + bx * ts, bpy = offY + by * ts;
          var bEdges = [
            /* right */  bx + 1 < MAP_W && (tiles[tileIdx(bx+1,by)]||{o:0}).o !== bdyn.o ? [bpx+ts,bpy,bpx+ts,bpy+ts] : null,
            /* left  */  bx > 0         && (tiles[tileIdx(bx-1,by)]||{o:0}).o !== bdyn.o ? [bpx,bpy,bpx,bpy+ts]       : null,
            /* bottom*/  by + 1 < MAP_H && (tiles[tileIdx(bx,by+1)]||{o:0}).o !== bdyn.o ? [bpx,bpy+ts,bpx+ts,bpy+ts] : null,
            /* top   */  by > 0         && (tiles[tileIdx(bx,by-1)]||{o:0}).o !== bdyn.o ? [bpx,bpy,bpx+ts,bpy]       : null
          ];
          for (var ei = 0; ei < 4; ei++) {
            if (!bEdges[ei]) continue;
            var e = bEdges[ei];
            /* outer glow */
            ctx.strokeStyle = 'rgba(0,0,0,0.22)';
            ctx.lineWidth = 4;
            ctx.beginPath(); ctx.moveTo(e[0],e[1]); ctx.lineTo(e[2],e[3]); ctx.stroke();
            /* crisp coloured border */
            ctx.strokeStyle = bowner.color;
            ctx.lineWidth = 2;
            ctx.beginPath(); ctx.moveTo(e[0],e[1]); ctx.lineTo(e[2],e[3]); ctx.stroke();
          }
        }
      }

      /* ── Territory name labels ───────────────── */
      ctx.save();
      Object.keys(centroids).forEach(function(slotStr) {
        var slot = parseInt(slotStr);
        var c    = centroids[slotStr];
        var pObj = playersBySlot[slot];
        if (!c || !pObj || c.n === 0) return;
        var lx = offX + (c.sx / c.n + 0.5) * ts;
        var ly = offY + (c.sy / c.n + 0.5) * ts;
        var name = pObj.name;
        var troops = c.troops > 9999 ? (c.troops / 1000).toFixed(1) + 'K'
                   : c.troops > 999  ? (c.troops / 1000).toFixed(1) + 'K'
                   : String(c.troops);
        var nameFSize = Math.max(9, Math.min(ts - 2, 13));
        var numFSize  = Math.max(8, Math.min(ts - 3, 11));
        /* pill background */
        ctx.font = 'bold ' + nameFSize + 'px sans-serif';
        var nameW = ctx.measureText(name).width;
        ctx.font = nameFSize + 'px sans-serif';
        var numW  = ctx.measureText(troops).width;
        var pillW = Math.max(nameW, numW) + 14;
        var pillH = nameFSize + numFSize + 10;
        var pillX = lx - pillW / 2;
        var pillY = ly - pillH / 2;
        ctx.fillStyle = 'rgba(10,8,6,0.55)';
        ctx.beginPath();
        ctx.roundRect ? ctx.roundRect(pillX, pillY, pillW, pillH, 5)
                      : ctx.rect(pillX, pillY, pillW, pillH);
        ctx.fill();
        /* name */
        ctx.fillStyle = '#f5f0e8';
        ctx.font = 'bold ' + nameFSize + 'px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'alphabetic';
        ctx.fillText(name, lx, pillY + nameFSize + 3);
        /* troop count */
        ctx.fillStyle = 'rgba(220,210,195,0.9)';
        ctx.font = numFSize + 'px sans-serif';
        ctx.fillText(troops, lx, pillY + nameFSize + numFSize + 6);
      });
      ctx.restore();

      /* ── Fog of War pass ────────────────────── */
      if (st.fogOfWar && !st.spectating) {
        var visSet = {};
        Object.keys(tiles).forEach(function(vk) {
          if ((tiles[vk].o === st.mySlot)) {
            var vp = tileXY(parseInt(vk));
            for (var vdy = -1; vdy <= 1; vdy++) {
              for (var vdx = -1; vdx <= 1; vdx++) {
                var vnx = vp.x + vdx, vny = vp.y + vdy;
                if (vnx >= 0 && vnx < MAP_W && vny >= 0 && vny < MAP_H)
                  visSet[tileIdx(vnx, vny)] = true;
              }
            }
          }
        });
        ctx.fillStyle = 'rgba(0,0,0,0.74)';
        for (var fgy = 0; fgy < MAP_H; fgy++) {
          for (var fgx = 0; fgx < MAP_W; fgx++) {
            if (!visSet[tileIdx(fgx, fgy)]) {
              ctx.fillRect(offX + fgx*ts, offY + fgy*ts, ts, ts);
            }
          }
        }
      }

      /* ── Attack preview arrow (from territory centroid to hovered target) ── */
      if (st.selectedTerritory && st.selectedTerritory.length > 0 && st.hoveredTile !== null) {
        var hovTile = tiles[st.hoveredTile] || {o:0};
        if (hovTile.o !== st.mySlot) {
          /* centroid of selected territory */
          var tcx = 0, tcy = 0;
          for (var tci = 0; tci < st.selectedTerritory.length; tci++) {
            var tcp = tileXY(st.selectedTerritory[tci]);
            tcx += tcp.x; tcy += tcp.y;
          }
          tcx /= st.selectedTerritory.length;
          tcy /= st.selectedTerritory.length;
          var arsx = offX + tcx*ts + ts/2, arsy = offY + tcy*ts + ts/2;
          var ahp  = tileXY(st.hoveredTile);
          var arhx = offX + ahp.x*ts + ts/2, arhy = offY + ahp.y*ts + ts/2;
          var ang  = Math.atan2(arhy - arsy, arhx - arsx);
          var isEnemy = hovTile.o > 0 && hovTile.o !== st.mySlot;
          ctx.strokeStyle = isEnemy ? 'rgba(200,30,30,0.9)' : 'rgba(30,30,30,0.75)';
          ctx.fillStyle   = isEnemy ? 'rgba(200,30,30,0.9)' : 'rgba(30,30,30,0.75)';
          ctx.lineWidth = 2;
          ctx.setLineDash([4, 3]);
          ctx.beginPath(); ctx.moveTo(arsx, arsy); ctx.lineTo(arhx, arhy); ctx.stroke();
          ctx.setLineDash([]);
          ctx.beginPath();
          ctx.moveTo(arhx, arhy);
          ctx.lineTo(arhx - 10*Math.cos(ang-0.4), arhy - 10*Math.sin(ang-0.4));
          ctx.lineTo(arhx - 10*Math.cos(ang+0.4), arhy - 10*Math.sin(ang+0.4));
          ctx.closePath(); ctx.fill();
        }
      }

      /* ── Minimap ────────────────────────────── */
      var mmW = 160, mmH = 100, mmPad = 10;
      var mmX = st.canvas.width  - mmW - mmPad;
      var mmY = mmPad;
      var mpx = mmW / MAP_W, mpy = mmH / MAP_H;
      /* background */
      ctx.fillStyle = 'rgba(40,55,65,0.88)';
      ctx.fillRect(mmX-3, mmY-3, mmW+6, mmH+6);
      ctx.strokeStyle = 'rgba(255,255,255,0.25)';
      ctx.lineWidth = 1;
      ctx.strokeRect(mmX-3, mmY-3, mmW+6, mmH+6);
      /* tiles */
      for (var ry = 0; ry < MAP_H; ry++) {
        for (var rx = 0; rx < MAP_W; rx++) {
          var ridx = tileIdx(rx, ry);
          var rt = terrain[ridx], rdyn = tiles[ridx] || {o:0};
          var rf;
          if (rt === 'W') rf = '#5a9ec7';
          else if (rt === 'M') rf = '#8c9c96';
          else if (rdyn.o > 0) { var ro = playersBySlot[rdyn.o]; rf = ro ? ro.color : '#888'; }
          else rf = rt === 'C' ? '#c8b860' : (rt === 'H' ? '#8aad6a' : '#b8a882');
          ctx.fillStyle = rf;
          ctx.fillRect(mmX + rx*mpx, mmY + ry*mpy, Math.ceil(mpx)+0.5, Math.ceil(mpy)+0.5);
        }
      }
      /* selected territory highlight on minimap */
      if (st.selectedTerritory && st.selectedTerritory.length > 0) {
        ctx.fillStyle = 'rgba(255,255,255,0.4)';
        for (var msi = 0; msi < st.selectedTerritory.length; msi++) {
          var mstp = tileXY(st.selectedTerritory[msi]);
          ctx.fillRect(mmX + mstp.x*mpx, mmY + mstp.y*mpy, Math.ceil(mpx), Math.ceil(mpy));
        }
      }

      /* ── Pings (emoji markers, float + fade over 3.5 s) ─── */
      var nowP = Date.now();
      Object.keys(st.pings).forEach(function(pidx) {
        var ping = st.pings[pidx];
        if (!ping || nowP > ping.expiresAt) { delete st.pings[pidx]; return; }
        var pp = tileXY(parseInt(pidx));
        var age  = nowP - ping.startTime;
        var alpha = Math.max(0, 1 - age / 3500);
        var yBob  = -Math.min(age / 120, 14);
        ctx.save();
        ctx.globalAlpha = alpha;
        var pfs = Math.max(10, ts + 2);
        ctx.font = 'bold ' + pfs + 'px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(ping.emoji, offX + pp.x*ts + ts/2, offY + pp.y*ts + ts/2 + yBob);
        ctx.restore();
      });

      /* ── Nuke flash (radial gradient, 0.9 s) ──────────── */
      if (st.nukeFlash) {
        var nfAge = Date.now() - st.nukeFlash.startTime;
        if (nfAge < 900) {
          var nfAlpha = 1 - nfAge / 900;
          var nfcx = offX + st.nukeFlash.x * ts + ts / 2;
          var nfcy = offY + st.nukeFlash.y * ts + ts / 2;
          var nfr  = (NUKE_RADIUS + 2) * ts;
          ctx.save();
          var nfGrad = ctx.createRadialGradient(nfcx, nfcy, 0, nfcx, nfcy, nfr);
          nfGrad.addColorStop(0,   'rgba(255,220,60,'  + nfAlpha + ')');
          nfGrad.addColorStop(0.45,'rgba(239,68,68,'   + (nfAlpha * 0.8) + ')');
          nfGrad.addColorStop(1,   'rgba(0,0,0,0)');
          ctx.fillStyle = nfGrad;
          ctx.beginPath();
          ctx.arc(nfcx, nfcy, nfr, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        } else {
          st.nukeFlash = null;
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
    resolveAttack: function(tiles, fromIdx, toIdx, percent, attackerSlot, terrain) {
      terrain = terrain || (st.mapStatic && st.mapStatic.terrain) || '';
      var from = tiles[fromIdx];
      if (!from || from.o !== attackerSlot || from.t < 2) return;
      /* skip attacks between allies */
      var to0 = tiles[toIdx] || { o: 0, t: 0 };
      if (to0.o > 0 && to0.o !== attackerSlot) {
        var allies = st.alliances[attackerSlot];
        if (allies && allies[to0.o]) return;
      }
      /* betrayal debuff: attacker who broke an alliance fights at 80% */
      var betrayDebuff = (st.betrayers && st.betrayers[attackerSlot]) ? 0.8 : 1.0;
      var sending = Math.max(1, Math.floor(from.t * percent / 100 * betrayDebuff));
      from.t -= sending;
      var to = tiles[toIdx] || { o: 0, t: 0 };
      if (to.o === 0 || to.o === attackerSlot) {
        tiles[toIdx] = { o: attackerSlot, t: (to.t || 0) + sending, b: to.b || 0 };
      } else {
        /* defense multipliers stack */
        var defMul = 1;
        if (to.b === 2) defMul = 2;           /* fort: 2× */
        if (to.b === 3) defMul = 3;           /* bunker: 3× */
        if (terrain[toIdx] === 'H') defMul *= 1.5; /* highland: 1.5× extra */
        var effDef = to.t * defMul;
        if (sending > effDef) {
          /* attacker wins; building destroyed on capture */
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
        var ki   = parseInt(keys[i]);
        var tile = tiles[keys[i]];
        if (tile.o > 0) {
          tile.t += 1;
          var tt = terrain[ki];
          if (tt === 'C') tile.t += 2;  /* city bonus */
          if (tt === 'H') tile.t += 1;  /* highland bonus */
          /* frontage bonus: +1 per 3 adjacent enemy-border tiles */
          var pos = tileXY(ki);
          var borders = 0;
          var dirs = [[0,-1],[0,1],[-1,0],[1,0]];
          for (var di = 0; di < dirs.length; di++) {
            var nx2 = pos.x + dirs[di][0], ny2 = pos.y + dirs[di][1];
            if (nx2 >= 0 && nx2 < MAP_W && ny2 >= 0 && ny2 < MAP_H) {
              var nb = tiles[tileIdx(nx2, ny2)] || {o:0};
              if (nb.o > 0 && nb.o !== tile.o) borders++;
            }
          }
          if (borders > 0) tile.t += Math.floor(borders / 3);
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
    },

    /* Enclosure capture: BFS from map edge per player.
       Any non-water/mountain tile unreachable without crossing that
       player's territory is considered enclosed and gets captured. */
    checkEnclosure: function(tiles, terrain) {
      var n = MAP_W * MAP_H;
      var changed = false;
      var players = {};
      Object.keys(tiles).forEach(function(k) { if (tiles[k].o > 0) players[tiles[k].o] = true; });
      var dirs = [[0,-1],[0,1],[-1,0],[1,0]];
      Object.keys(players).forEach(function(slotStr) {
        var slot = parseInt(slotStr);
        var reachable = new Array(n).fill(false);
        var queue = [];
        /* seed all four map edges */
        for (var ex = 0; ex < MAP_W; ex++) {
          [tileIdx(ex,0), tileIdx(ex,MAP_H-1)].forEach(function(ei) {
            if (!reachable[ei]) { reachable[ei] = true; queue.push(ei); }
          });
        }
        for (var ey = 1; ey < MAP_H-1; ey++) {
          [tileIdx(0,ey), tileIdx(MAP_W-1,ey)].forEach(function(ei) {
            if (!reachable[ei]) { reachable[ei] = true; queue.push(ei); }
          });
        }
        for (var qi = 0; qi < queue.length; qi++) {
          var cur  = queue[qi];
          var cpos = tileXY(cur);
          for (var di = 0; di < dirs.length; di++) {
            var nx = cpos.x + dirs[di][0], ny = cpos.y + dirs[di][1];
            if (nx < 0 || nx >= MAP_W || ny < 0 || ny >= MAP_H) continue;
            var nIdx = tileIdx(nx, ny);
            if (reachable[nIdx]) continue;
            var nt = terrain[nIdx];
            if (nt === 'W' || nt === 'M') { reachable[nIdx] = true; continue; }
            var nTile = tiles[nIdx] || {o:0};
            if (nTile.o === slot) continue; /* blocked by encloser */
            reachable[nIdx] = true;
            queue.push(nIdx);
          }
        }
        /* capture any unreachable tiles not already ours */
        for (var i = 0; i < n; i++) {
          if (reachable[i]) continue;
          var t = terrain[i];
          if (t === 'W' || t === 'M') continue;
          var tile = tiles[i] || {o:0};
          if (tile.o === slot) continue;
          tiles[i] = { o: slot, t: Math.max(1, tile.t || 1), b: tile.b || 0 };
          changed = true;
        }
      });
      return changed;
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

    /* Alliance: ~50 bytes per write */
    pushAlliance: function(slotA, slotB, status) {
      if (!st.roomRef) return;
      var key = Math.min(slotA,slotB) + '_' + Math.max(slotA,slotB);
      st.roomRef.child('alliances/' + key).set(status || null);
    },
    listenAlliances: function() {
      if (!st.roomRef) return;
      var ref = st.roomRef.child('alliances');
      var fn = ref.on('value', function(snap) {
        var data = snap.val() || {};
        st.alliances = {};
        Object.keys(data).forEach(function(key) {
          if (data[key] !== 'active') return;
          var parts = key.split('_');
          var a = parseInt(parts[0]), b = parseInt(parts[1]);
          if (!st.alliances[a]) st.alliances[a] = {};
          if (!st.alliances[b]) st.alliances[b] = {};
          st.alliances[a][b] = true;
          st.alliances[b][a] = true;
        });
      });
      st.listeners.push(function() { ref.off('value', fn); });
    },

    /* Lobby / status listeners (unchanged — small payloads) */
    listen: function(path, cb) {
      if (!st.roomRef) return;
      var ref = st.roomRef.child(path);
      var fn = ref.on('value', function(snap) { cb(snap.val()); });
      st.listeners.push(function() { ref.off('value', fn); });
    },

    /* Pings — ~50 bytes per ping, displayed for 3.5 s then expire client-side */
    pushPing: function(pingIdx, emoji) {
      if (!st.roomRef) return;
      st.roomRef.child('pings/' + pingIdx).set({
        slot: st.mySlot, emoji: emoji || '\uD83D\uDCCD',
        ts: window.firebase.database.ServerValue.TIMESTAMP
      });
    },
    listenPings: function() {
      if (!st.roomRef) return;
      var ref = st.roomRef.child('pings');
      var handle = function(s) {
        var v = s.val(); if (!v) return;
        st.pings[s.key] = { emoji: v.emoji || '\uD83D\uDCCD', slot: v.slot,
          startTime: Date.now(), expiresAt: Date.now() + 3500 };
      };
      var fn1 = ref.on('child_added',   handle);
      var fn2 = ref.on('child_changed', handle);
      st.listeners.push(function() {
        ref.off('child_added',   fn1);
        ref.off('child_changed', fn2);
      });
    },

    /* Nuke flash — single value, ~30 bytes, clients animate it */
    listenNukeFlash: function() {
      if (!st.roomRef) return;
      var ref = st.roomRef.child('gameState/nukeFlash');
      var fn = ref.on('value', function(s) {
        var v = s.val();
        if (v) st.nukeFlash = { x: v.x, y: v.y, startTime: Date.now() };
      });
      st.listeners.push(function() { ref.off('value', fn); });
    },

    /* Betrayals — slot → true for alliance-breakers; debuffs their attacks */
    listenBetrayals: function() {
      if (!st.roomRef) return;
      var ref = st.roomRef.child('betrayals');
      var fn = ref.on('value', function(s) { st.betrayers = s.val() || {}; });
      st.listeners.push(function() { ref.off('value', fn); });
    }
  };

  /* BFS flood-fill: returns array of all tile indices connected to startIdx owned by slot */
  function getConnectedTiles(startIdx, slot) {
    var tiles = (st.gameState && st.gameState.tiles) || {};
    var start = tiles[startIdx];
    if (!start || start.o !== slot) return [];
    var visited = {}, queue = [startIdx];
    visited[startIdx] = true;
    var dirs = [[0,-1],[0,1],[-1,0],[1,0]];
    for (var qi = 0; qi < queue.length; qi++) {
      var cur = queue[qi], cp = tileXY(cur);
      for (var di = 0; di < dirs.length; di++) {
        var nx = cp.x + dirs[di][0], ny = cp.y + dirs[di][1];
        if (nx < 0 || nx >= MAP_W || ny < 0 || ny >= MAP_H) continue;
        var nIdx = tileIdx(nx, ny);
        if (visited[nIdx]) continue;
        if (((tiles[nIdx]) || {o:0}).o === slot) {
          visited[nIdx] = true; queue.push(nIdx);
        }
      }
    }
    return queue;
  }

  /* Submit up to 5 attacks from territory border tiles toward targetIdx */
  function submitTerritoryAttack(territory, targetIdx) {
    if (!st.roomRef || st.phase !== 'playing' || st.spectating) return;
    var tiles   = (st.gameState && st.gameState.tiles) || {};
    var terrain = st.mapStatic && st.mapStatic.terrain;
    if (!terrain) return;
    var tp = tileXY(targetIdx);
    var dirs = [[0,-1],[0,1],[-1,0],[1,0]];
    /* build territory set for fast membership test */
    var terSet = {};
    for (var ti = 0; ti < territory.length; ti++) terSet[territory[ti]] = true;
    /* collect border (from→to) pairs sorted by dist to target */
    var candidates = [];
    for (var ci = 0; ci < territory.length; ci++) {
      var fromIdx = territory[ci];
      var fromTile = tiles[fromIdx];
      if (!fromTile || fromTile.t < 2) continue;
      var fp = tileXY(fromIdx);
      for (var di = 0; di < dirs.length; di++) {
        var nx = fp.x + dirs[di][0], ny = fp.y + dirs[di][1];
        if (nx < 0 || nx >= MAP_W || ny < 0 || ny >= MAP_H) continue;
        var nIdx = tileIdx(nx, ny);
        if (terSet[nIdx]) continue;             /* within own blob */
        var nt = terrain[nIdx];
        if (nt === 'W' || nt === 'M') continue;
        var nTile = tiles[nIdx] || {o:0};
        if (nTile.o === st.mySlot) continue;    /* another of our blobs — skip */
        var dist = Math.abs(nx - tp.x) + Math.abs(ny - tp.y);
        candidates.push({ from: fromIdx, to: nIdx, dist: dist });
      }
    }
    if (!candidates.length) return;
    candidates.sort(function(a, b) { return a.dist - b.dist; });
    /* deduplicate: at most one attack per source tile, one per target tile */
    var usedFrom = {}, usedTo = {}, sent = 0;
    for (var ki = 0; ki < candidates.length && sent < 5; ki++) {
      var c = candidates[ki];
      if (usedFrom[c.from] || usedTo[c.to]) continue;
      usedFrom[c.from] = true;
      usedTo[c.to]     = true;
      KCWorld._submitAttack(c.from, c.to, st.sendPercent);
      sent++;
    }
  }

  function handleKeyboard(e) {
    if (st.phase !== 'playing') return;
    var k = e.key;
    if      (k === '1') KCWorld._setSendPct(25);
    else if (k === '2') KCWorld._setSendPct(50);
    else if (k === '3') KCWorld._setSendPct(75);
    else if (k === '4') KCWorld._setSendPct(100);
    else if (k === ' ' || k === 'Escape') {
      e.preventDefault();
      st.selectedTile = null;
      st.selectedTerritory = null;
    }
    else if (k === 'f' || k === 'F') KCWorld._toggleFog();
    else if ((k === 'n' || k === 'N') && st.selectedTile !== null) KCWorld._launchNuke(st.selectedTile);
    else if ((k === 'p' || k === 'P') && st.selectedTile !== null) KCWorld._sendPing(st.selectedTile, '\u26A0\uFE0F');
  }

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
      /* select entire connected territory blob */
      st.selectedTerritory = getConnectedTiles(hit.idx, st.mySlot);
      st.selectedTile = hit.idx;   /* kept so keyboard N/P know a tile */
    } else if (st.selectedTerritory && st.selectedTerritory.length > 0) {
      /* attack toward clicked tile from territory border */
      submitTerritoryAttack(st.selectedTerritory, hit.idx);
      st.selectedTerritory = null;
      st.selectedTile = null;
    } else {
      st.selectedTerritory = null;
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

      var nukeX = -1, nukeY = -1, hadNuke = false;
      attacks.forEach(function(atk) {
        if (atk.type === 'fort') {
          /* build fort: deduct troops, set b=2 */
          var tile = tiles[atk.from];
          if (tile && tile.o === atk.attacker && tile.t >= 15 && (tile.b === 0 || !tile.b)) {
            tile.t -= 15;
            tile.b  = 2;
          }
        } else if (atk.type === 'bunker') {
          /* build bunker: deduct troops, set b=3 */
          var bTile = tiles[atk.from];
          if (bTile && bTile.o === atk.attacker && bTile.t >= BUNKER_COST && (bTile.b === 0 || !bTile.b)) {
            bTile.t -= BUNKER_COST;
            bTile.b  = 3;
          }
        } else if (atk.type === 'nuke') {
          /* nuclear strike: cost NUKE_COST troops, neutralise radius around target */
          var nTile = tiles[atk.from];
          if (nTile && nTile.o === atk.attacker && nTile.t >= NUKE_COST) {
            nTile.t -= NUKE_COST;
            var np = tileXY(atk.from);
            nukeX = np.x; nukeY = np.y; hadNuke = true;
            for (var ndy = -NUKE_RADIUS; ndy <= NUKE_RADIUS; ndy++) {
              for (var ndx = -NUKE_RADIUS; ndx <= NUKE_RADIUS; ndx++) {
                if (Math.abs(ndx) + Math.abs(ndy) > NUKE_RADIUS * 1.6) continue; /* rough circle */
                var ntx = np.x + ndx, nty = np.y + ndy;
                if (ntx < 0 || ntx >= MAP_W || nty < 0 || nty >= MAP_H) continue;
                var ntIdx = tileIdx(ntx, nty);
                var terr  = st.mapStatic.terrain[ntIdx];
                if (terr === 'W' || terr === 'M') continue;
                var ntile = tiles[ntIdx] || {o:0};
                if (ntile.o !== atk.attacker) {
                  tiles[ntIdx] = { o: 0, t: 0, b: 0 }; /* neutralise */
                }
              }
            }
          }
        } else {
          Engine.resolveAttack(tiles, atk.from, atk.to, atk.percent, atk.attacker, st.mapStatic.terrain);
        }
      });
      /* bot moves */
      st.bots.forEach(function(botSlot) {
        Bot.think(tiles, st.mapStatic.terrain, botSlot).forEach(function(atk) {
          Engine.resolveAttack(tiles, atk.from, atk.to, atk.percent, atk.attacker, st.mapStatic.terrain);
        });
      });
      Engine.genTroops(tiles, st.mapStatic.terrain);
      Engine.checkEnclosure(tiles, st.mapStatic.terrain); /* capture enclosed territory */

      var stats  = Engine.getStats(tiles);
      var winner = Engine.checkWin(tiles, st.mapStatic.terrain);
      var nextTick = (st.gameState.tick || 0) + 1;

      var newGs = {
        tick: nextTick,
        winner: winner || null,
        tiles: tiles,
        playerStats: stats
      };
      st.gameState = newGs;
      FBSync.pushDelta(prevTiles, newGs);   /* send only changed tiles */

      /* broadcast nuke flash so all clients animate it */
      if (hadNuke) {
        st.roomRef.child('gameState/nukeFlash').set({ x: nukeX, y: nukeY, tick: nextTick });
      }
      /* clear pings every 5 ticks (they're ~50 bytes each; room deletes on game end anyway) */
      if (nextTick % 5 === 0) st.roomRef.child('pings').remove();

      if (winner) { clearInterval(st.tickTimer); st.tickTimer = null; }
    });
  }

  function cleanupGame() {
    Renderer.stopLoop();
    if (st.tickTimer) { clearInterval(st.tickTimer); st.tickTimer = null; }
    if (st.keyHandler) { window.removeEventListener('keydown', st.keyHandler); st.keyHandler = null; }
    if (st.canvas) {
      if (st._clickHandler)    st.canvas.removeEventListener('click',       st._clickHandler);
      if (st._ctxHandler)      st.canvas.removeEventListener('contextmenu', st._ctxHandler);
      if (st._moveHandler)     st.canvas.removeEventListener('mousemove',   st._moveHandler);
      if (st._touchHandler)    st.canvas.removeEventListener('touchstart',  st._touchHandler);
      if (st._touchEndHandler) st.canvas.removeEventListener('touchend',    st._touchEndHandler);
    }
    var tipEl = document.getElementById('kcw-tile-tip');
    if (tipEl) tipEl.remove();
    if (st._resizeHandler) window.removeEventListener('resize', st._resizeHandler);
    /* dismiss any open build popup */
    var pop = document.getElementById('kcw-build-popup');
    if (pop) pop.remove();
    st.listeners.forEach(function(off){ off(); });
    st.listeners = [];
    st.canvas = null; st.ctx = null; st.selectedTile = null; st.selectedTerritory = null; st.spectating = false;
    st._clickHandler = null; st._resizeHandler = null; st._ctxHandler = null;
    st._touchHandler = null; st._touchEndHandler = null;
    st.pings = {}; st.nukeFlash = null; st.betrayers = {};
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
        'Click <b>your territory</b> then <b>anywhere</b> to attack.<br>' +
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
          '<div class="kcw-hud-item">Terr <span id="kcw-pct">0%</span></div>' +
          '<div class="kcw-hud-item">Troops <span id="kcw-troops">0</span></div>' +
        '</div>' +
        '<div class="kcw-hud-sep"></div>' +
        '<div class="kcw-pct-sel" id="kcw-pct-sel">' +
          [25,50,75,100].map(function(p){
            return '<button class="kcw-pct-btn' + (p===60?' active':'') + '" onclick="KCWorld._setSendPct(' + p + ')">' + p + '%</button>';
          }).join('') +
        '</div>' +
        '<div class="kcw-hud-sep"></div>' +
        '<button id="kcw-fog-btn" class="kcw-pct-btn" onclick="KCWorld._toggleFog()" title="F \u2014 Fog of War">\uD83C\uDF2B</button>' +
        '<div class="kcw-hud-sep"></div>' +
        '<div class="kcw-hud-players" id="kcw-phud"></div>' +
      '</div>' +
      '<div class="kcw-canvas-wrap"><canvas id="kcw-canvas"></canvas></div>' +
      '<div class="kcw-game-tip">Click <span style="color:' + myColor + '">\u25a0 your territory</span> \u2192 anywhere to attack &nbsp;\u00b7&nbsp; Right-click to build/nuke/ping &nbsp;\u00b7&nbsp; Keys: 1-4 % \u00b7 F fog \u00b7 N nuke \u00b7 P ping</div>' +
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

    /* hover: tooltip + hovered tile for arrow */
    var tipEl = document.createElement('div');
    tipEl.id = 'kcw-tile-tip'; tipEl.className = 'kcw-tile-tip';
    tipEl.style.display = 'none';
    canvas.parentElement.appendChild(tipEl);
    st._moveHandler = function(e) {
      var hit = Renderer.getClickTile(e.clientX, e.clientY);
      st.hoveredTile = hit ? hit.idx : null;
      if (!hit || !st.gameState || !st.mapStatic) { tipEl.style.display = 'none'; return; }
      var t = st.mapStatic.terrain[hit.idx];
      if (t === 'W' || t === 'M') { tipEl.style.display = 'none'; return; }
      var dyn = (st.gameState.tiles && st.gameState.tiles[hit.idx]) || {o:0,t:0};
      var ow = null;
      Object.keys(st.players).forEach(function(u) { if (st.players[u].slot === dyn.o) ow = st.players[u]; });
      var rect = canvas.getBoundingClientRect();
      tipEl.style.left = (e.clientX - rect.left + 14) + 'px';
      tipEl.style.top  = (e.clientY - rect.top  - 44) + 'px';
      tipEl.style.display = 'block';
      var allied = ow && st.alliances[st.mySlot] && st.alliances[st.mySlot][ow.slot];
      var bldgTip = dyn.b === 2 ? ' \u00b7 <span style="color:#94a3b8">\uD83D\uDEE1 Fort</span>'
                  : dyn.b === 3 ? ' \u00b7 <span style="color:#fbbf24">\uD83C\uDFF0 Bunker</span>'
                  : '';
      var terrTip = t === 'C' ? ' \u00b7 <span style="color:#fbbf24">\u2605 City</span>'
                  : t === 'H' ? ' \u00b7 <span style="color:#4ade80">\u25b2 Highland</span>'
                  : '';
      tipEl.innerHTML = ow
        ? '<span style="color:' + ow.color + '">\u25a0</span> ' + esc(ow.name) +
          (allied ? ' <span style="color:#22c55e">\u2726 Ally</span>' : '') +
          ' \u00b7 ' + dyn.t + ' troops' + terrTip + bldgTip
        : (dyn.t > 0 ? dyn.t + ' troops \u00b7 ' : '') + (t === 'C' ? '\u2605 City \u00b7 neutral' : t === 'H' ? '\u25b2 Highland \u00b7 neutral' : 'Neutral');
    };
    canvas.addEventListener('mousemove', st._moveHandler);

    /* keyboard shortcuts */
    st.keyHandler = handleKeyboard;
    window.addEventListener('keydown', st.keyHandler);

    /* start alliance listener */
    FBSync.listenAlliances();

    /* right-click → build/nuke/ping popup */
    st._ctxHandler = function(e) {
      e.preventDefault();
      if (st.spectating) return;
      var hit = Renderer.getClickTile(e.clientX, e.clientY);
      if (!hit) return;
      var tile = (st.gameState && st.gameState.tiles && st.gameState.tiles[hit.idx]) || { o: 0, t: 0 };
      if (tile.o !== st.mySlot) return;
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

    /* new game-state listeners */
    FBSync.listenNukeFlash();
    FBSync.listenPings();
    FBSync.listenBetrayals();

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
    /* elimination announcements */
    var curStats = gs.playerStats || {};
    Object.keys(st.players).forEach(function(uid) {
      var p = st.players[uid];
      if (p.slot === st.mySlot) return;
      var prev = st.lastStats[p.slot] || 0;
      var curr = curStats[p.slot] || 0;
      if (prev > 0 && curr === 0) {
        toast(esc(p.name) + ' has been eliminated!', 'info');
      }
    });
    st.lastStats = Object.assign({}, curStats);

    var el;
    el = document.getElementById('kcw-tick');    if (el) el.textContent = gs.tick || 0;
    el = document.getElementById('kcw-pct');     if (el) el.textContent = pct + '%';
    el = document.getElementById('kcw-troops');  if (el) el.textContent = myTroops;

    /* sync % selector button states */
    var selEl = document.getElementById('kcw-pct-sel');
    if (selEl) {
      selEl.querySelectorAll('.kcw-pct-btn').forEach(function(btn) {
        btn.classList.toggle('active', parseInt(btn.textContent) === st.sendPercent);
      });
    }

    var phud = document.getElementById('kcw-phud');
    if (phud) {
      var sortedPlayers = Object.keys(st.players).sort(function(a,b) {
        return (curStats[st.players[b].slot]||0) - (curStats[st.players[a].slot]||0);
      });
      phud.innerHTML = sortedPlayers.map(function(uid) {
        var p = st.players[uid];
        var cnt  = curStats[p.slot] || 0;
        var pct2 = Math.round(cnt / landCount * 100);
        var elim = cnt === 0 && (gs.tick || 0) > 4;
        var allied = st.alliances[st.mySlot] && st.alliances[st.mySlot][p.slot];
        return '<div class="kcw-hud-player' + (elim ? ' elim' : '') + (allied ? ' allied' : '') + '"' +
          ' title="' + (allied ? 'Allied · ' : '') + 'Click to propose alliance"' +
          ' onclick="KCWorld._proposeAlliance(' + p.slot + ')">' +
          '<span class="kcw-hud-dot" style="background:' + p.color + '"></span>' +
          esc(p.name) + ' ' + (elim ? '<span style="color:#ef4444">☠</span>' : pct2 + '%') +
          (allied ? ' <span style="color:#22c55e;font-size:.65rem">✦</span>' : '') +
          '</div>';
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

    /* Delete room data shortly after game ends — only win records survive in userEconomy */
    if (st.isHost) setTimeout(function() { st.roomRef && st.roomRef.remove(); }, 8000);
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

    _setSendPct: function(pct) {
      st.sendPercent = pct;
      var sel = document.getElementById('kcw-pct-sel');
      if (sel) sel.querySelectorAll('.kcw-pct-btn').forEach(function(b) {
        b.classList.toggle('active', parseInt(b.textContent) === pct);
      });
    },

    _proposeAlliance: function(targetSlot) {
      if (!st.roomRef || st.phase !== 'playing' || st.spectating) return;
      if (targetSlot === st.mySlot) return;
      var allied = st.alliances[st.mySlot] && st.alliances[st.mySlot][targetSlot];
      if (allied) {
        /* break alliance — flag the breaker with a combat debuff */
        FBSync.pushAlliance(st.mySlot, targetSlot, null);
        st.roomRef.child('betrayals/' + st.mySlot).set(true);
        toast('\u26A0\uFE0F Alliance broken \u2014 your attacks are weakened', 'info');
        return;
      }
      var key = Math.min(st.mySlot,targetSlot) + '_' + Math.max(st.mySlot,targetSlot);
      /* check if other side already proposed */
      if (!st.roomRef) return;
      st.roomRef.child('alliances/' + key).once('value').then(function(snap) {
        var val = snap.val();
        if (val === 'proposed_' + targetSlot) {
          /* they proposed to us — accept */
          FBSync.pushAlliance(st.mySlot, targetSlot, 'active');
          toast('Alliance formed! \u2728', 'success');
        } else {
          /* we propose */
          FBSync.pushAlliance(st.mySlot, targetSlot, 'proposed_' + st.mySlot);
          toast('Alliance proposal sent', 'info');
        }
      });
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

    _showBuildPopup: function(idx, cx, cy) {
      var existing = document.getElementById('kcw-build-popup');
      if (existing) existing.remove();
      var wrap = document.querySelector('.kcw-canvas-wrap');
      if (!wrap) return;
      var rect = wrap.getBoundingClientRect();
      var tile = (st.gameState && st.gameState.tiles && st.gameState.tiles[idx]) || {o:0,t:0,b:0};
      var pop = document.createElement('div');
      pop.id = 'kcw-build-popup';
      pop.className = 'kcw-build-popup';
      pop.style.left = Math.min(cx - rect.left, rect.width - 190) + 'px';
      pop.style.top  = Math.max(cy - rect.top  - 10, 8) + 'px';
      var rows = '<div class="kcw-build-title">\uD83C\uDFF7 ' + tile.t + ' troops here</div>';
      var b = tile.b || 0;
      /* fort (b=2) */
      if (b === 0 && tile.t >= 15) {
        rows += '<button class="kcw-btn kcw-btn-secondary kcw-btn-sm" style="width:100%;margin-bottom:4px" onclick="KCWorld._confirmBuild(' + idx + ',\'fort\')">' +
          '\uD83D\uDEE1 Fort \u2014 2\xd7 def \u00b7 \u221215 troops</button>';
      }
      /* bunker (b=3) */
      if (b === 0 && tile.t >= BUNKER_COST) {
        rows += '<button class="kcw-btn kcw-btn-secondary kcw-btn-sm" style="width:100%;margin-bottom:4px" onclick="KCWorld._confirmBuild(' + idx + ',\'bunker\')">' +
          '\uD83C\uDFF0 Bunker \u2014 3\xd7 def \u00b7 \u2212' + BUNKER_COST + ' troops</button>';
      }
      /* nuke */
      if (tile.t >= NUKE_COST) {
        rows += '<button class="kcw-btn kcw-btn-secondary kcw-btn-sm" style="width:100%;margin-bottom:4px;color:#fbbf24" onclick="KCWorld._confirmBuild(' + idx + ',\'nuke\')">' +
          '\u2622\uFE0F Nuke \u2014 r' + NUKE_RADIUS + ' blast \u00b7 \u2212' + NUKE_COST + ' troops</button>';
      }
      /* pings */
      rows += '<div style="display:flex;gap:4px;margin-bottom:4px">' +
        ['\uD83D\uDCCD','\u26A0\uFE0F','\u2694\uFE0F','\uD83D\uDEE1','\uD83D\uDCA5'].map(function(em) {
          return '<button class="kcw-bot-btn" style="flex:1;font-size:.9rem" onclick="KCWorld._sendPing(' + idx + ',\'' + em + '\')">' + em + '</button>';
        }).join('') +
      '</div>';
      rows += '<button class="kcw-btn kcw-btn-secondary kcw-btn-sm" style="width:100%" onclick="KCWorld._dismissBuild()">Cancel</button>';
      pop.innerHTML = rows;
      wrap.appendChild(pop);
      /* auto-dismiss on next click */
      setTimeout(function() {
        document.addEventListener('click', KCWorld._dismissBuild, { once: true });
      }, 10);
    },

    _confirmBuild: function(idx, type) {
      this._dismissBuild();
      if (!st.roomRef || st.phase !== 'playing') return;
      if (type === 'nuke') { this._launchNuke(idx); return; }
      st.roomRef.child('attacks').push({
        type: type || 'fort', from: idx,
        attacker: st.mySlot, uid: st.myUid,
        ts: window.firebase.database.ServerValue.TIMESTAMP
      });
    },

    _dismissBuild: function() {
      var pop = document.getElementById('kcw-build-popup');
      if (pop) pop.remove();
    },

    _launchNuke: function(fromIdx) {
      if (!st.roomRef || st.phase !== 'playing' || st.spectating) return;
      var tile = (st.gameState && st.gameState.tiles && st.gameState.tiles[fromIdx]) || {o:0,t:0};
      if (tile.o !== st.mySlot || tile.t < NUKE_COST) {
        toast('Need ' + NUKE_COST + '+ troops to launch \u2622\uFE0F', 'error'); return;
      }
      st.roomRef.child('attacks').push({
        type: 'nuke', from: fromIdx,
        attacker: st.mySlot, uid: st.myUid,
        ts: window.firebase.database.ServerValue.TIMESTAMP
      });
      toast('\u2622\uFE0F Nuke launched!', 'info');
      st.selectedTile = null;
      st.selectedTerritory = null;
    },

    _sendPing: function(pingIdx, emoji) {
      this._dismissBuild();
      if (!st.roomRef || st.phase !== 'playing') return;
      FBSync.pushPing(pingIdx, emoji || '\uD83D\uDCCD');
    },

    _toggleFog: function() {
      st.fogOfWar = !st.fogOfWar;
      var fogBtn = document.getElementById('kcw-fog-btn');
      if (fogBtn) fogBtn.classList.toggle('active', st.fogOfWar);
      toast(st.fogOfWar ? '\uD83C\uDF2B Fog of War ON' : 'Fog of War OFF', 'info');
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
        players:{}, mapStatic:null, gameState:null, selectedTile:null, selectedTerritory:null,
        tickTimer:null, renderFrame:null, listeners:[], phase:'closed',
        bots:[], botCount:1, spectating:false, sendPercent:60,
        hoveredTile:null, lastStats:{}, alliances:{},
        _clickHandler:null, _resizeHandler:null, _ctxHandler:null,
        _touchHandler:null, _touchEndHandler:null, _moveHandler:null,
        keyHandler:null, fogOfWar:false, nukeFlash:null, pings:{}, betrayers:{}
      };
    }
  };

  window.KCWorld = KCWorld;
})();
