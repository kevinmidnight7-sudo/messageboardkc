/* =============================================================
   kc-bg.js — Shared KC NOW animated background system
   Self-initialises on DOMContentLoaded.  No config needed —
   just include the script and add <div id="bg-canvas"></div>
   as the first child of <body>.
   ============================================================= */
(function () {
    if (window.KCBgInitialized) return;
    window.KCBgInitialized = true;

    /* ── State ── */
    var backgroundPrefs = (function () {
        try { return JSON.parse(localStorage.getItem('kc-background-prefs') || 'null') || { preset: 'default', reducedMotion: false }; }
        catch (e) { return { preset: 'default', reducedMotion: false }; }
    })();
    var backgroundScene = null, backgroundAnimationId = null;
    var mouseParallax = { x: 0, y: 0, tx: 0, ty: 0 };
    var bgAutoDrift = { x: 0, y: 0, time: 0 };
    var bgShapesCanvas = null, bgShapesCtx = null, bgShapes = [];

    /* ── Apply graphics quality class immediately (before paint) ── */
    var gfxMode = localStorage.getItem('kc_graphics');
    if (gfxMode) document.documentElement.classList.add(gfxMode === 'low' ? 'graphics-low' : 'graphics-high');
    if (/Android|iPhone|iPad|iPod/i.test(navigator.userAgent)) document.documentElement.classList.add('android-mobile');

    /* ── Preset data ── */
    var BACKGROUND_PRESETS = {
        default:   { theme: { accent: '#3b82f6',  rgb: '59,130,246',   glow: '#2dd4bf' } },
        aurora:    { theme: { accent: '#2dd4bf',  rgb: '45,212,191',   glow: '#38bdf8' } },
        void:      { theme: { accent: '#6366f1',  rgb: '99,102,241',   glow: '#818cf8' } },
        prism:     { theme: { accent: '#a855f7',  rgb: '168,85,247',   glow: '#f472b6' } },
        starlight: { theme: { accent: '#818cf8',  rgb: '129,140,248',  glow: '#c4b5fd' } },
        sunrise:   { theme: { accent: '#f59e0b',  rgb: '245,158,11',   glow: '#f97316' } },
        deepsea:   { theme: { accent: '#06b6d4',  rgb: '6,182,212',    glow: '#8b5cf6' } },
        snake:     { theme: { accent: '#22c55e',  rgb: '34,197,94',    glow: '#84cc16' } },
        bloodmoon: { theme: { accent: '#ef4444',  rgb: '239,68,68',    glow: '#dc2626' } },
        cyber:     { theme: { accent: '#22d3ee',  rgb: '34,211,238',   glow: '#a855f7' } },
        golden:    { theme: { accent: '#fbbf24',  rgb: '251,191,36',   glow: '#f59e0b' } },
        sakura:    { theme: { accent: '#f472b6',  rgb: '244,114,182',  glow: '#fb7185' } },
        lava:      { theme: { accent: '#f97316',  rgb: '249,115,22',   glow: '#ef4444' } },
        arctic:    { theme: { accent: '#7dd3fc',  rgb: '125,211,252',  glow: '#bae6fd' } },
        amethyst:  { theme: { accent: '#a78bfa',  rgb: '167,139,250',  glow: '#8b5cf6' } },
        matrix:    { theme: { accent: '#22c55e',  rgb: '34,197,94',    glow: '#4ade80' } },
        cosmos:    { theme: { accent: '#8b5cf6',  rgb: '139,92,246',   glow: '#10b981' } },
    };

    var BG_SHAPE_TYPES = {
        default:   ['ring','circle','ring','bubble','ring','circle'],
        sunrise:   ['triangle','diamond','triangle','triangle','diamond'],
        deepsea:   ['bubble','bubble','bubble','circle','bubble','bubble'],
        snake:     ['snake','snake','snake','snake','snake','snake'],
        bloodmoon: ['crescent','crescent','ring','crescent','crescent','ring'],
        cyber:     ['lightning','lightning','rect','lightning','lightning'],
        aurora:    ['ring','circle','ring','bubble','ring','circle'],
        void:      ['ring','ring','ring','ring','ring'],
        prism:     ['triangle','diamond','triangle','diamond','triangle'],
        starlight: ['star','meteor','star','star','meteor','star'],
        golden:    ['star','diamond','star','star','diamond'],
        sakura:    ['droplet','droplet','droplet','droplet','droplet'],
        lava:      ['bubble','circle','bubble','bubble','circle','bubble'],
        arctic:    ['snowflake','snowflake','snowflake','snowflake','snowflake'],
        amethyst:  ['diamond','diamond','hexagon','diamond','diamond'],
        matrix:    ['rect','rect','rect','rect','rect','rect'],
        cosmos:    ['meteor','ring','meteor','meteor','ring','meteor'],
    };

    var BG_SHAPE_PALETTES = {
        default:   ['rgba(59,130,246,',  'rgba(45,212,191,', 'rgba(99,102,241,',  'rgba(14,165,233,',  'rgba(56,189,248,'],
        aurora:    ['rgba(45,212,191,',  'rgba(56,189,248,', 'rgba(34,211,238,',  'rgba(16,185,129,',  'rgba(96,165,250,'],
        sunrise:   ['rgba(251,113,133,', 'rgba(253,186,116,','rgba(251,191,36,',  'rgba(249,115,22,',  'rgba(244,63,94,'],
        deepsea:   ['rgba(6,182,212,',   'rgba(8,145,178,',  'rgba(14,116,144,',  'rgba(56,189,248,',  'rgba(103,232,249,'],
        void:      ['rgba(99,102,241,',  'rgba(129,140,248,','rgba(167,139,250,', 'rgba(76,29,149,',   'rgba(192,132,252,'],
        prism:     ['rgba(236,72,153,',  'rgba(245,158,11,', 'rgba(34,211,238,',  'rgba(239,68,68,',   'rgba(168,85,247,'],
        starlight: ['rgba(165,180,252,', 'rgba(196,181,253,','rgba(147,197,253,', 'rgba(253,230,138,', 'rgba(224,231,255,'],
        snake:     ['rgba(74,222,128,',  'rgba(34,197,94,',  'rgba(21,128,61,',   'rgba(5,150,105,',   'rgba(163,230,53,'],
        bloodmoon: ['rgba(239,68,68,',   'rgba(220,38,38,',  'rgba(185,28,28,',   'rgba(248,113,113,', 'rgba(252,165,165,'],
        cyber:     ['rgba(34,211,238,',  'rgba(6,182,212,',  'rgba(168,85,247,',  'rgba(139,92,246,',  'rgba(232,121,249,'],
        golden:    ['rgba(251,191,36,',  'rgba(245,158,11,', 'rgba(253,224,71,',  'rgba(253,230,138,', 'rgba(217,119,6,'],
        sakura:    ['rgba(244,114,182,', 'rgba(236,72,153,', 'rgba(251,207,232,', 'rgba(249,168,212,', 'rgba(253,164,175,'],
        lava:      ['rgba(249,115,22,',  'rgba(234,88,12,',  'rgba(239,68,68,',   'rgba(251,146,60,',  'rgba(253,186,116,'],
        arctic:    ['rgba(186,230,253,', 'rgba(147,197,253,','rgba(56,189,248,',  'rgba(224,242,254,', 'rgba(204,251,241,'],
        amethyst:  ['rgba(167,139,250,', 'rgba(196,181,253,','rgba(124,58,237,',  'rgba(216,180,254,', 'rgba(232,121,249,'],
        matrix:    ['rgba(34,197,94,',   'rgba(74,222,128,', 'rgba(16,185,129,',  'rgba(52,211,153,',  'rgba(163,230,53,'],
        cosmos:    ['rgba(139,92,246,',  'rgba(88,28,135,',  'rgba(6,95,70,',     'rgba(167,139,250,', 'rgba(16,185,129,'],
    };

    var BG_PRESET_BEHAVIORS = {
        default:   { countMul:0.8, speedMul:0.5,  vy_bias: 0,     rotMul:0.2, sizeMul:1.6, opacityMul:0.8  },
        aurora:    { countMul:0.6, speedMul:0.35, vy_bias:-0.03,  rotMul:0.1, sizeMul:2.0, opacityMul:0.65 },
        sunrise:   { countMul:1.2, speedMul:1.2,  vy_bias:-0.06,  rotMul:2.0, sizeMul:0.9, opacityMul:1.2  },
        deepsea:   { countMul:1.4, speedMul:0.3,  vy_bias:-0.08,  rotMul:0.0, sizeMul:1.1, opacityMul:0.7  },
        void:      { countMul:0.7, speedMul:0.4,  vy_bias: 0,     rotMul:0.0, sizeMul:2.2, opacityMul:0.55 },
        prism:     { countMul:1.3, speedMul:1.4,  vy_bias: 0,     rotMul:3.0, sizeMul:0.75,opacityMul:1.2  },
        starlight: { countMul:1.0, speedMul:0.6,  vy_bias: 0.04,  rotMul:0.0, sizeMul:1.3, opacityMul:0.8  },
        snake:     { countMul:1.6, speedMul:1.5,  vy_bias: 0,     rotMul:0.05,sizeMul:1.2, opacityMul:1.0  },
        bloodmoon: { countMul:0.8, speedMul:0.5,  vy_bias: 0,     rotMul:0.15,sizeMul:1.6, opacityMul:1.0, pulse:true },
        cyber:     { countMul:1.6, speedMul:1.6,  vy_bias: 0.08,  rotMul:0.0, sizeMul:0.8, opacityMul:1.4  },
        golden:    { countMul:1.2, speedMul:0.7,  vy_bias: 0.05,  rotMul:3.5, sizeMul:0.9, opacityMul:1.1  },
        sakura:    { countMul:1.8, speedMul:0.35, vy_bias: 0.09,  rotMul:1.2, sizeMul:0.7, opacityMul:0.9  },
        lava:      { countMul:1.0, speedMul:0.45, vy_bias:-0.14,  rotMul:0.2, sizeMul:1.5, opacityMul:1.0  },
        arctic:    { countMul:1.4, speedMul:0.25, vy_bias: 0.05,  rotMul:0.1, sizeMul:1.2, opacityMul:0.7  },
        amethyst:  { countMul:1.0, speedMul:0.7,  vy_bias: 0,     rotMul:4.0, sizeMul:1.0, opacityMul:1.0  },
        matrix:    { countMul:1.8, speedMul:0.9,  vy_bias: 0.3,   rotMul:0.0, sizeMul:0.7, opacityMul:1.3  },
        cosmos:    { countMul:0.8, speedMul:0.55, vy_bias: 0.02,  rotMul:0.4, sizeMul:1.8, opacityMul:0.8  },
    };

    /* ── Shape seeding ── */
    function _initBgShapes(preset) {
        bgShapes = [];
        var palette    = BG_SHAPE_PALETTES[preset]  || BG_SHAPE_PALETTES.default;
        var shapeTypes = BG_SHAPE_TYPES[preset]     || BG_SHAPE_TYPES.default;
        var beh        = BG_PRESET_BEHAVIORS[preset] || BG_PRESET_BEHAVIORS.default;
        var w = window.innerWidth * 1.2, h = window.innerHeight * 1.2;
        var isSnake  = preset === 'snake';
        var isMatrix = preset === 'matrix';
        var baseCount = isSnake
            ? Math.max(22, Math.min(42, Math.floor(w * h / 28000)))
            : Math.max(16, Math.min(32, Math.floor(w * h / 40000)));
        var count = Math.round(baseCount * (beh.countMul || 1));
        for (var i = 0; i < count; i++) {
            var z = Math.pow(Math.random(), 0.7);
            var vx, vy, rot, rotSpeed, size, opacity;
            if (isSnake) {
                rot = Math.random() * Math.PI * 2;
                var spd = (0.25 + Math.random() * 0.35 + z * 0.2) * beh.speedMul;
                vx = Math.cos(rot) * spd; vy = Math.sin(rot) * spd;
                rotSpeed = (Math.random() - 0.5) * 0.003;
                size = (30 + z * 55 + Math.random() * 25) * beh.sizeMul;
                opacity = (0.06 + z * 0.14) * beh.opacityMul;
            } else if (isMatrix) {
                rot = 0; vx = (Math.random() - 0.5) * 0.04;
                vy = (0.15 + Math.random() * 0.4 + z * 0.25) * beh.speedMul;
                rotSpeed = 0;
                size = (12 + z * 40 + Math.random() * 20) * beh.sizeMul;
                opacity = (0.06 + z * 0.16) * beh.opacityMul;
            } else {
                rot = Math.random() * Math.PI * 2;
                var bs = beh.speedMul * 0.18;
                vx = (Math.random() - 0.5) * bs;
                vy = (Math.random() - 0.5) * bs * 0.7 + beh.vy_bias;
                rotSpeed = (Math.random() - 0.5) * 0.004 * beh.rotMul;
                size = (18 + z * 70 + Math.random() * 35) * beh.sizeMul;
                opacity = (0.04 + z * 0.09) * beh.opacityMul;
            }
            var shape = {
                x: Math.random() * w, y: Math.random() * h, z: z,
                vx: vx, vy: vy, rot: rot, rotSpeed: rotSpeed, size: size,
                type: shapeTypes[Math.floor(Math.random() * shapeTypes.length)],
                colorBase: palette[Math.floor(Math.random() * palette.length)],
                opacity: opacity, baseOpacity: opacity,
                pFactor: 0.3 + z * 0.7, preset: preset,
            };
            if (beh.pulse) { shape.pulsePhase = Math.random() * Math.PI * 2; shape.pulseSpeed = 0.012 + Math.random() * 0.016; }
            bgShapes.push(shape);
        }
    }

    /* ── Shape drawing ── */
    function _drawBgShape(ctx, s) {
        ctx.save();
        ctx.translate(s.x, s.y);
        ctx.rotate(s.rot);
        ctx.fillStyle   = s.colorBase + s.opacity + ')';
        ctx.strokeStyle = s.colorBase + Math.min(s.opacity * 3, 0.35) + ')';
        ctx.lineWidth   = 0.8 + s.z * 1.2;
        var r = s.size;
        ctx.beginPath();
        switch (s.type) {
            case 'triangle':
                ctx.moveTo(0,-r); ctx.lineTo(r*0.866,r*0.5); ctx.lineTo(-r*0.866,r*0.5); break;
            case 'hexagon':
                for (var i=0;i<6;i++){var a=(i*Math.PI)/3-Math.PI/6;i===0?ctx.moveTo(r*Math.cos(a),r*Math.sin(a)):ctx.lineTo(r*Math.cos(a),r*Math.sin(a));} break;
            case 'circle':
                ctx.arc(0,0,r*0.65,0,Math.PI*2); break;
            case 'rect': {
                var hw=r*0.85,hh=r*0.5,rad=r*0.22;
                ctx.moveTo(-hw+rad,-hh);ctx.arcTo(hw,-hh,hw,hh,rad);ctx.arcTo(hw,hh,-hw,hh,rad);ctx.arcTo(-hw,hh,-hw,-hh,rad);ctx.arcTo(-hw,-hh,hw,-hh,rad); break;
            }
            case 'diamond':
                ctx.moveTo(0,-r);ctx.lineTo(r*0.58,0);ctx.lineTo(0,r);ctx.lineTo(-r*0.58,0); break;
            case 'star': {
                var or=r,ir=r*0.42,pts=5;
                for (var i=0;i<pts*2;i++){var a=(i*Math.PI)/pts-Math.PI/2;var rd=i%2===0?or:ir;i===0?ctx.moveTo(rd*Math.cos(a),rd*Math.sin(a)):ctx.lineTo(rd*Math.cos(a),rd*Math.sin(a));} break;
            }
            case 'ring': {
                ctx.restore();ctx.save();ctx.translate(s.x,s.y);ctx.rotate(s.rot);
                ctx.strokeStyle=s.colorBase+Math.min(s.opacity*4,0.4)+')';ctx.lineWidth=r*0.22+s.z*3;
                ctx.beginPath();ctx.arc(0,0,r*0.72,0,Math.PI*2);ctx.stroke();ctx.restore();return;
            }
            case 'snake': {
                ctx.restore();ctx.save();ctx.translate(s.x,s.y);ctx.rotate(s.rot);
                var segs=16,tlen=r*5.5,amp=r*0.58+s.z*r*0.22;
                var phase=(s.x*0.030+s.y*0.022)%(Math.PI*2),freq=(Math.PI*2.4)/segs,bw=r*0.30*(0.55+s.z*0.75);
                var pp=[];
                for(var i=0;i<=segs;i++){var t=i/segs;pp.push({x:-tlen*0.5+t*tlen,y:Math.sin(phase+i*freq)*amp*(0.55+0.45*t)});}
                ctx.beginPath();ctx.moveTo(pp[0].x,pp[0].y);
                for(var i=1;i<pp.length-1;i++){var mx=(pp[i].x+pp[i+1].x)*0.5,my=(pp[i].y+pp[i+1].y)*0.5;ctx.quadraticCurveTo(pp[i].x,pp[i].y,mx,my);}
                ctx.lineTo(pp[pp.length-1].x,pp[pp.length-1].y);
                var grd=ctx.createLinearGradient(pp[0].x,0,pp[pp.length-1].x,0);
                grd.addColorStop(0,s.colorBase+(s.opacity*0.25)+')');grd.addColorStop(0.5,s.colorBase+(s.opacity*1.8)+')');grd.addColorStop(1,s.colorBase+Math.min(s.opacity*3.5,0.55)+')');
                ctx.strokeStyle=grd;ctx.lineWidth=bw;ctx.lineCap='round';ctx.lineJoin='round';ctx.stroke();
                var head=pp[pp.length-1],neck=pp[pp.length-2],hAngle=Math.atan2(head.y-neck.y,head.x-neck.x);
                ctx.save();ctx.translate(head.x,head.y);ctx.rotate(hAngle);ctx.beginPath();ctx.ellipse(r*0.18,0,r*0.30,r*0.21,0,0,Math.PI*2);ctx.fillStyle=s.colorBase+Math.min(s.opacity*4.5,0.60)+')';ctx.fill();
                ctx.fillStyle='rgba(0,0,0,0.6)';ctx.beginPath();ctx.arc(r*0.28,-r*0.09,r*0.055,0,Math.PI*2);ctx.arc(r*0.28,r*0.09,r*0.055,0,Math.PI*2);ctx.fill();
                ctx.strokeStyle=s.colorBase+Math.min(s.opacity*5.5,0.70)+')';ctx.lineWidth=bw*0.18;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(r*0.44,0);ctx.lineTo(r*0.66,-r*0.13);ctx.moveTo(r*0.44,0);ctx.lineTo(r*0.66,r*0.13);ctx.stroke();
                ctx.restore();ctx.restore();return;
            }
            case 'snowflake': {
                ctx.restore();ctx.save();ctx.translate(s.x,s.y);ctx.rotate(s.rot);
                ctx.strokeStyle=s.colorBase+Math.min(s.opacity*5,0.55)+')';ctx.lineWidth=r*0.08+s.z*1.5;ctx.lineCap='round';
                for(var arm=0;arm<6;arm++){ctx.save();ctx.rotate((arm*Math.PI)/3);ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(0,-r);ctx.stroke();
                    for(var b=1;b<=3;b++){var bLen=r*(0.35-b*0.08),bY=-r*(b*0.25+0.1);ctx.beginPath();ctx.moveTo(0,bY);ctx.lineTo(bLen,bY-bLen*0.55);ctx.stroke();ctx.beginPath();ctx.moveTo(0,bY);ctx.lineTo(-bLen,bY-bLen*0.55);ctx.stroke();}
                ctx.restore();}
                ctx.fillStyle=s.colorBase+Math.min(s.opacity*6,0.6)+')';ctx.beginPath();ctx.arc(0,0,r*0.12,0,Math.PI*2);ctx.fill();ctx.restore();return;
            }
            case 'droplet': {
                ctx.restore();ctx.save();ctx.translate(s.x,s.y);ctx.rotate(s.rot);
                ctx.fillStyle=s.colorBase+s.opacity+')';ctx.strokeStyle=s.colorBase+Math.min(s.opacity*2.5,0.35)+')';ctx.lineWidth=0.6;
                ctx.beginPath();ctx.moveTo(0,-r*0.85);ctx.bezierCurveTo(r*0.7,-r*0.6,r*0.6,r*0.5,0,r*0.85);ctx.bezierCurveTo(-r*0.6,r*0.5,-r*0.7,-r*0.6,0,-r*0.85);ctx.closePath();ctx.fill();ctx.stroke();
                ctx.strokeStyle=s.colorBase+Math.min(s.opacity*1.5,0.25)+')';ctx.lineWidth=0.5;ctx.beginPath();ctx.moveTo(0,-r*0.7);ctx.lineTo(0,r*0.7);ctx.stroke();ctx.restore();return;
            }
            case 'crescent': {
                ctx.restore();ctx.save();ctx.translate(s.x,s.y);ctx.rotate(s.rot);
                ctx.fillStyle=s.colorBase+s.opacity+')';ctx.beginPath();ctx.arc(0,0,r*0.7,0,Math.PI*2);ctx.arc(r*0.38,0,r*0.52,0,Math.PI*2,true);ctx.fill('evenodd');ctx.restore();return;
            }
            case 'lightning': {
                ctx.restore();ctx.save();ctx.translate(s.x,s.y);ctx.rotate(s.rot);
                ctx.strokeStyle=s.colorBase+Math.min(s.opacity*5.5,0.65)+')';ctx.fillStyle=s.colorBase+s.opacity+')';ctx.lineWidth=r*0.12;ctx.lineJoin='miter';ctx.lineCap='butt';
                var lh=r*1.6;ctx.beginPath();ctx.moveTo(r*0.22,-lh*0.5);ctx.lineTo(-r*0.08,0);ctx.lineTo(r*0.24,0);ctx.lineTo(-r*0.22,lh*0.5);ctx.lineTo(r*0.08,r*0.08);ctx.lineTo(-r*0.24,r*0.08);ctx.closePath();ctx.fill();ctx.stroke();ctx.restore();return;
            }
            case 'meteor': {
                ctx.restore();ctx.save();ctx.translate(s.x,s.y);ctx.rotate(s.rot);
                var mLen=r*3.2;var grd=ctx.createLinearGradient(-mLen*0.5,0,mLen*0.5,0);
                grd.addColorStop(0,s.colorBase+'0)');grd.addColorStop(0.5,s.colorBase+(s.opacity*0.5)+')');grd.addColorStop(1,s.colorBase+Math.min(s.opacity*4,0.6)+')');
                ctx.strokeStyle=grd;ctx.lineWidth=r*0.18*(0.5+s.z*0.7);ctx.lineCap='round';ctx.beginPath();ctx.moveTo(-mLen*0.5,0);ctx.lineTo(mLen*0.5,0);ctx.stroke();
                var hg=ctx.createRadialGradient(mLen*0.5,0,0,mLen*0.5,0,r*0.5);hg.addColorStop(0,s.colorBase+Math.min(s.opacity*5,0.7)+')');hg.addColorStop(1,s.colorBase+'0)');ctx.fillStyle=hg;ctx.beginPath();ctx.arc(mLen*0.5,0,r*0.5,0,Math.PI*2);ctx.fill();ctx.restore();return;
            }
            case 'bubble': {
                ctx.restore();ctx.save();ctx.translate(s.x,s.y);var br=r*0.65;
                ctx.strokeStyle=s.colorBase+Math.min(s.opacity*4,0.45)+')';ctx.lineWidth=br*0.06+s.z;ctx.beginPath();ctx.arc(0,0,br,0,Math.PI*2);ctx.stroke();
                var hg=ctx.createRadialGradient(-br*0.28,-br*0.32,0,-br*0.28,-br*0.32,br*0.42);hg.addColorStop(0,'rgba(255,255,255,'+Math.min(s.opacity*4,0.35)+')');hg.addColorStop(1,'rgba(255,255,255,0)');ctx.fillStyle=hg;ctx.beginPath();ctx.arc(0,0,br,0,Math.PI*2);ctx.fill();ctx.restore();return;
            }
        }
        ctx.closePath();ctx.fill();ctx.stroke();ctx.restore();
    }

    /* ── Tick / move shapes ── */
    function _tickBgShapes(ts) {
        if (!bgShapesCtx || !bgShapesCanvas) return;
        var ctx = bgShapesCtx;
        var w = parseFloat(bgShapesCanvas.style.width)  || bgShapesCanvas.width;
        var h = parseFloat(bgShapesCanvas.style.height) || bgShapesCanvas.height;
        ctx.clearRect(0, 0, w, h);
        var reduce = backgroundPrefs.reducedMotion;
        var pmx = reduce ? 0 : mouseParallax.x;
        var pmy = reduce ? 0 : mouseParallax.y;
        var dx  = reduce ? 0 : bgAutoDrift.x * 28;
        var dy  = reduce ? 0 : bgAutoDrift.y * 18;
        var margin = 80;
        for (var i = 0; i < bgShapes.length; i++) {
            var s = bgShapes[i];
            if (!reduce) {
                s.x += s.vx; s.y += s.vy; s.rot += s.rotSpeed;
                if (s.x < -margin) s.x = w + margin;
                else if (s.x > w + margin) s.x = -margin;
                if (s.y < -margin) s.y = h + margin;
                else if (s.y > h + margin) s.y = -margin;
                if (s.pulsePhase !== undefined) { s.pulsePhase += s.pulseSpeed; s.opacity = s.baseOpacity * (0.55 + 0.55 * Math.sin(s.pulsePhase)); }
                if (s.preset === 'sakura') { s.vx = Math.sin(s.pulsePhase || (s.x * 0.01)) * 0.06; if (!s.pulsePhase) s.pulsePhase = Math.random() * Math.PI * 2; s.pulsePhase += 0.018; }
                if (s.preset === 'arctic') { s.vy = 0.04 + s.z * 0.08 + Math.sin((s.pulsePhase || 0) + s.x * 0.005) * 0.015; if (!s.pulsePhase) s.pulsePhase = Math.random() * Math.PI * 2; s.pulsePhase += 0.008; }
            }
            var ox = s.x, oy = s.y;
            s.x += pmx * -55 * s.pFactor + dx * s.pFactor;
            s.y += pmy * -40 * s.pFactor + dy * s.pFactor;
            _drawBgShape(ctx, s);
            s.x = ox; s.y = oy;
        }
    }

    /* ── Apply preset: update CSS vars + scene class ── */
    function applyBackgroundPreset(presetKey) {
        var preset = BACKGROUND_PRESETS[presetKey] ? presetKey : 'default';
        var t = BACKGROUND_PRESETS[preset].theme;
        if (t) {
            var root = document.documentElement;
            root.style.setProperty('--theme-accent', t.accent);
            root.style.setProperty('--theme-accent-rgb', t.rgb);
            root.style.setProperty('--theme-glow', t.glow);
            root.style.setProperty('--accent-blue', t.accent);
        }
        if (backgroundScene) {
            backgroundScene.className = 'kc-bg-scene ' + preset;
            _initBgShapes(preset);
        }
    }

    /* ── Destroy ── */
    function destroyDynamicBackground() {
        if (backgroundAnimationId) cancelAnimationFrame(backgroundAnimationId);
        backgroundAnimationId = null;
        bgShapesCanvas = null; bgShapesCtx = null; bgShapes = [];
        var container = document.getElementById('bg-canvas');
        if (container) container.innerHTML = '';
    }

    /* ── Main init ── */
    function initDynamicBackground() {
        var container = document.getElementById('bg-canvas');
        if (!container) return;
        destroyDynamicBackground();
        var preset = backgroundPrefs.preset || 'default';
        container.innerHTML =
            '<div id="bg-3d-root" class="kc-bg-scene ' + preset + '">' +
            '<div class="kc-bg-layer kc-bg-far"></div>' +
            '<div class="kc-bg-layer kc-bg-mid"></div>' +
            '<div class="kc-bg-layer kc-bg-near"></div>' +
            '<div class="kc-bg-layer kc-bg-glow"></div>' +
            '</div>';
        backgroundScene = document.getElementById('bg-3d-root');
        applyBackgroundPreset(preset);

        if (document.documentElement.classList.contains('graphics-low')) return;

        var _cw = Math.ceil(window.innerWidth * 1.2), _ch = Math.ceil(window.innerHeight * 1.2);
        var _dpr = window.devicePixelRatio || 1;
        bgShapesCanvas = document.createElement('canvas');
        bgShapesCanvas.id = 'bg-shapes-canvas';
        bgShapesCanvas.style.cssText = 'position:absolute;top:-10%;left:-10%;width:120%;height:120%;pointer-events:none;';
        bgShapesCanvas.width  = Math.ceil(_cw * _dpr);
        bgShapesCanvas.height = Math.ceil(_ch * _dpr);
        bgShapesCanvas.style.width  = _cw + 'px';
        bgShapesCanvas.style.height = _ch + 'px';
        bgShapesCtx = bgShapesCanvas.getContext('2d');
        bgShapesCtx.scale(_dpr, _dpr);
        container.appendChild(bgShapesCanvas);
        _initBgShapes(preset);

        var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches || backgroundPrefs.reducedMotion;
        if (!reduceMotion && window.innerWidth > 640) {
            window.addEventListener('mousemove', function(e) {
                mouseParallax.tx = (e.clientX / window.innerWidth) - 0.5;
                mouseParallax.ty = (e.clientY / window.innerHeight) - 0.5;
            }, { passive: true });
            window.addEventListener('resize', function() {
                if (!bgShapesCanvas) return;
                var dpr = window.devicePixelRatio || 1;
                var cw = Math.ceil(window.innerWidth * 1.2), ch = Math.ceil(window.innerHeight * 1.2);
                bgShapesCanvas.width  = Math.ceil(cw * dpr);
                bgShapesCanvas.height = Math.ceil(ch * dpr);
                bgShapesCanvas.style.width  = cw + 'px';
                bgShapesCanvas.style.height = ch + 'px';
                bgShapesCtx = bgShapesCanvas.getContext('2d');
                bgShapesCtx.scale(dpr, dpr);
                _initBgShapes(backgroundPrefs.preset || 'default');
            }, { passive: true });
        }
        startBackgroundLoop();
    }

    /* ── Animation loop ── */
    function startBackgroundLoop() {
        var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches || backgroundPrefs.reducedMotion;
        function tick(ts) {
            if (!backgroundScene) return;
            bgAutoDrift.time = ts * 0.0001;
            bgAutoDrift.x = Math.sin(bgAutoDrift.time) * 0.25 + Math.sin(bgAutoDrift.time * 0.41) * 0.08;
            bgAutoDrift.y = Math.cos(bgAutoDrift.time * 0.7) * 0.20 + Math.cos(bgAutoDrift.time * 0.33) * 0.06;
            mouseParallax.x += (mouseParallax.tx - mouseParallax.x) * 0.08;
            mouseParallax.y += (mouseParallax.ty - mouseParallax.y) * 0.08;
            var motionX = reduceMotion ? bgAutoDrift.x : (mouseParallax.x * 0.8 + bgAutoDrift.x);
            var motionY = reduceMotion ? bgAutoDrift.y : (mouseParallax.y * 0.8 + bgAutoDrift.y);
            backgroundScene.style.setProperty('--mx', motionX.toFixed(6));
            backgroundScene.style.setProperty('--my', motionY.toFixed(6));
            backgroundScene.style.setProperty('--drift', Math.sin(bgAutoDrift.time).toFixed(4));
            if (!reduceMotion) {
                var glowLayer = backgroundScene.querySelector('.kc-bg-glow');
                if (glowLayer) glowLayer.style.opacity = (Math.sin(ts * 0.0008) * 0.15 + 0.55).toFixed(3);
            }
            _tickBgShapes(ts);
            backgroundAnimationId = requestAnimationFrame(tick);
        }
        backgroundAnimationId = requestAnimationFrame(tick);
    }

    /* ── Auto-init ── */
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initDynamicBackground);
    } else {
        initDynamicBackground();
    }

    /* ── Public API ── */
    window.KCBg = { applyBackgroundPreset: applyBackgroundPreset, init: initDynamicBackground, destroy: destroyDynamicBackground };
})();
