/* ============ DSH 办公室 · 直接复用 Marvis 原始素材 ============
   地图 office.tmj + 瓦片集 assets.tsj + 图集 workstation.webp/agent.webp
   角色动画 spritesheet/agent/fc_*.webp（TexturePacker/PixiJS 格式）
   数据源仍是真实 dsh RPC session.list
*/
(function(){
  'use strict';
  if (window.__DSH_OFFICE__) return;
  window.__DSH_OFFICE__ = true;

  var A = '/marvis-workbench/';
  var POLL_MS = 2500;
  var state = { items:[], all:[], last:{}, lastEv:{}, events:[], open:false, t:0 };

  var ICO = {
    office: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10.5 12 4l9 6.5"/><path d="M5.5 9.5V20h13V9.5"/><path d="M9.5 20v-5h5v5"/></svg>',
    close: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    chart: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20V10"/><path d="M10 20V4"/><path d="M16 20v-7"/><path d="M21 20H3"/></svg>',
    pulse: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12h4l3 7 5-14 3 7h5"/></svg>'
  };

  /* ---------------- 素材加载 ---------------- */
  var R = { ready:false, map:null, tileset:null, ws:null, agent:null, anims:{}, errors:[] };

  function loadJSON(u){ return fetch(u, {cache:'no-store'}).then(function(r){ if(!r.ok) throw new Error(r.status+' '+u); return r.json(); }); }
  function loadImg(u){
    return new Promise(function(res, rej){
      var i = new Image();
      i.onload = function(){ res(i); };
      i.onerror = function(){ rej(new Error('img fail '+u)); };
      i.src = u;
    });
  }
  function framesSorted(json){
    var names = Object.keys(json.frames);
    names.sort(function(a,b){
      var na = a.match(/(\d+)(?=\.png$)/), nb = b.match(/(\d+)(?=\.png$)/);
      if (na && nb) return parseInt(na[1],10) - parseInt(nb[1],10);
      return a < b ? -1 : 1;
    });
    return names.map(function(n){ return json.frames[n]; });
  }

  var ANIMS = ['fc_working','fc_standby','fc_sleeping','fc_coffee','fc_walking_h','fc_walking_up',
               'fc_talking_on_seat','fc_cheer_main','fc_off_chair','fc_leaving','fc_sigh'];

  async function loadAssets(){
    try {
      var p = [];
      p.push(loadJSON(A+'office.tmj').then(function(j){ R.map = j; }));
      p.push(loadJSON(A+'assets.tsj').then(function(j){ R.tileset = j; }));
      p.push(loadJSON(A+'img/workstation.webp.json').then(function(j){ R.ws = { json:j, img:null }; }));
      p.push(loadJSON(A+'img/agent.webp.json').then(function(j){ R.agent = { json:j, img:null }; }));
      await Promise.all(p);

      var p2 = [];
      p2.push(loadImg(A+'img/workstation.webp').then(function(i){ if (R.ws) R.ws.img = i; }));
      p2.push(loadImg(A+'img/agent.webp').then(function(i){ if (R.agent) R.agent.img = i; }));
      await Promise.all(p2);

      var names = ANIMS.slice(0, 5);
      var p3 = names.map(function(n){
        return Promise.all([
          loadJSON(A+'spritesheet/agent/'+n+'.webp.json'),
          loadImg(A+'spritesheet/agent/'+n+'.webp')
        ]).then(function(r){
          R.anims[n] = { img:r[1], frames:framesSorted(r[0]) };
        }).catch(function(e){ R.errors.push(String(e)); });
      });
      await Promise.all(p3);
      R.ready = true;
    } catch(e){ R.errors.push(String(e)); }
  }

  /* ---------------- 图集绘制（含 TexturePacker rotated/trimmed） ---------------- */
  function drawSprite(ctx, img, f, dx, dy, dw, dh){
    if (!img || !f || !f.frame) return;
    var fr = f.frame;
    if (!f.rotated){
      ctx.drawImage(img, fr.x, fr.y, fr.w, fr.h, dx, dy, dw, dh);
      return;
    }
    // rotated: 图集里按顺时针 90° 存储，源区域宽高互换；绘制时逆时针还原
    ctx.save();
    ctx.translate(dx, dy);
    ctx.translate(0, dh);
    ctx.rotate(-Math.PI/2);
    ctx.drawImage(img, fr.x, fr.y, fr.h, fr.w, 0, 0, dh, dw);
    ctx.restore();
  }

  function tileImageOf(gid){
    if (!R.tileset || !R.tileset.tiles) return null;
    var local = gid - 1;   // firstgid = 1
    for (var i=0;i<R.tileset.tiles.length;i++){
      if (R.tileset.tiles[i].id === local) return R.tileset.tiles[i].image;
    }
    return null;
  }
  function frameOf(imagePath){
    if (!R.ws || !R.ws.json) return null;
    var base = imagePath.split('/').pop();
    return R.ws.json.frames[base] || null;
  }

  /* ---------------- 数据层（真实 dsh 会话） ---------------- */
  async function rpc(method, payload){
    var body = { type:'client-request', rpcId:'office-'+Math.random().toString(36).slice(2), method:method, payload:payload || {} };
    var res = await fetch('/api/' + method, { method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify(body) });
    var j = await res.json();
    return j && j.result && j.result.ok ? j.result.value : null;
  }
  function pushEvent(kind, text){
    state.events.unshift({ kind:kind, text:text, at:Date.now() });
    if (state.events.length > 60) state.events.length = 60;
    renderEvents();
  }
  function labelOf(s, i){
    var t = (s.title || '').trim();
    if (t && t !== '你好' && t !== '新会话') return t.length > 13 ? t.slice(0,13) + '…' : t;
    return '会话 #' + (i + 1);
  }
  function subOf(s){
    var p = s.agentPreset || '会话';
    var st = (s.projections && s.projections.values && s.projections.values.sessionStats) || {};
    return p + ' · ' + (st.steps || 0) + ' 步';
  }
  function nameOf(s, i){ return labelOf(s, i); }

  async function poll(){
    var v = null;
    try { v = await rpc('session.list', {}); } catch(e){ return; }
    if (!v || !v.items) return;
    var items = v.items.slice().sort(function(a,b){ return (b.updatedAt||0) - (a.updatedAt||0); });
    state.all = items;
    state.items = items.slice(0, 8);
    items.forEach(function(s){
      var id = s.sessionId;
      var st = (s.projections && s.projections.values && s.projections.values.sessionStats) || {};
      var prev = state.last[id];
      var nowRun = !!s.running, steps = st.steps || 0;
      if (!prev){
        state.last[id] = { run:nowRun, steps:steps };
        if (nowRun) pushEvent('start', nameOf(s,0) + ' 正在工作');
        return;
      }
      if (!prev.run && nowRun) pushEvent('start', nameOf(s,0) + ' 开始工作');
      if (prev.run && !nowRun) pushEvent('done', nameOf(s,0) + ' 完成一轮');
      if (steps > prev.steps){
        var d = steps - prev.steps, key = 'step:' + id, now = Date.now(), last = state.lastEv[key];
        if (last && now - last.at < 12000){ last.n += d; last.at = now; last.text = nameOf(s,0) + ' 执行了 ' + last.n + ' 步'; renderEvents(); }
        else {
          var ev = { kind:'step', text:nameOf(s,0) + ' 执行了 ' + d + ' 步', at:now, n:d };
          state.events.unshift(ev);
          if (state.events.length > 60) state.events.length = 60;
          state.lastEv[key] = ev;
          renderEvents();
        }
      }
      prev.run = nowRun; prev.steps = steps;
    });
    render();
  }

  /* ---------------- 统计 / 事件 ---------------- */
  function fmtToken(n){
    if (!n) return '0';
    if (n >= 1e9) return (n/1e9).toFixed(2) + ' B';
    if (n >= 1e6) return (n/1e6).toFixed(1) + ' M';
    if (n >= 1e3) return (n/1e3).toFixed(1) + ' K';
    return String(n);
  }
  function fmtDur(ms){
    var min = ms/60000;
    return min >= 60 ? (min/60).toFixed(1) + ' 小时' : Math.round(min) + ' 分';
  }
  function render(){
    var all = state.all || [];
    var running = all.filter(function(s){ return s.running; }).length;
    var sub = document.getElementById('dsoMeta');
    if (sub) sub.innerHTML = '<b>' + running + '</b> 人在岗 · 共 <b>' + all.length + '</b> 个会话';
    var box = document.getElementById('dsoStats');
    if (!box) return;
    var steps=0, toks=0, llm=0, today=0;
    all.forEach(function(s){
      var v = (s.projections && s.projections.values) || {};
      var p = v.sessionStats, tk = v.tokenUsage;
      steps += (p&&p.steps)||0; llm += (p&&p.llmMs)||0;
      if (tk) toks += (tk.uncachedInputTokens||0)+(tk.outputTokens||0)+(tk.cacheReadTokens||0);
      if ((s.updatedAt||0) > Date.now() - 86400000) today++;
    });
    box.innerHTML =
      row('在岗', running + ' / ' + all.length) +
      row('今日活跃', today + ' 个') +
      row('累计步数', steps.toLocaleString()) +
      row('Token 用量', fmtToken(toks)) +
      row('模型耗时', fmtDur(llm));
  }
  function row(k,v){ return '<div class="dso-row"><span class="dso-k">'+k+'</span><span class="dso-v">'+v+'</span></div>'; }
  function renderEvents(){
    var box = document.getElementById('dsoEvents');
    if (!box) return;
    if (!state.events.length){ box.innerHTML = '<div class="dso-empty">所有会话空闲，等待新活动</div>'; return; }
    box.innerHTML = state.events.slice(0,40).map(function(e){
      var d = new Date(e.at);
      var hh=('0'+d.getHours()).slice(-2), mm=('0'+d.getMinutes()).slice(-2), ss=('0'+d.getSeconds()).slice(-2);
      var cls = e.kind==='start'?'start':e.kind==='done'?'done':'';
      return '<div class="dso-ev"><span class="dso-ev-t">'+hh+':'+mm+':'+ss+'</span><span class="dso-ev-i '+cls+'"></span><span class="dso-ev-x">'+esc(e.text)+'</span></div>';
    }).join('');
  }
  function esc(s){ return String(s).replace(/[&<>"]/g,function(c){ return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'})[c]; }); }

  /* ---------------- DOM ---------------- */
  var panelEl, btn, cv, ctx;
  var CW=800, CH=500, dpr=Math.min(2, window.devicePixelRatio||1);
  var view = { sc:1, ox:0, oy:0 };
  var pendingLabels = [];

  function buildPanel(){
    panelEl = document.createElement('div');
    panelEl.id = 'dshOfficePanel';
    panelEl.innerHTML =
      '<div class="dso-head">' +
        '<span class="dso-brand"><span class="dso-ico">'+ICO.office+'</span>办公室</span>' +
        '<span class="dso-meta" id="dsoMeta">加载素材中…</span>' +
        '<span class="dso-spacer"></span>' +
        '<button class="dso-x" id="dsoClose" aria-label="关闭">'+ICO.close+'</button>' +
      '</div>' +
      '<div class="dso-body">' +
        '<div class="dso-stage"><canvas id="dsoCanvas"></canvas><div class="dso-hint" id="dsoHint">实时 · 每 2.5 秒刷新</div></div>' +
        '<div class="dso-rail">' +
          '<div class="dso-card"><div class="dso-card-h"><span class="dso-ico">'+ICO.chart+'</span>出勤</div><div class="dso-stats" id="dsoStats"></div></div>' +
          '<div class="dso-card grow"><div class="dso-card-h"><span class="dso-ico">'+ICO.pulse+'</span>实时事件</div><div class="dso-events" id="dsoEvents"></div></div>' +
        '</div>' +
      '</div>';
    document.body.appendChild(panelEl);
    cv = panelEl.querySelector('#dsoCanvas');
    ctx = cv.getContext('2d');
    panelEl.querySelector('#dsoClose').addEventListener('click', function(){ toggle(false); });
    window.addEventListener('resize', layoutCanvas);
    loop();
    loadAssets().then(function(){
      var h = document.getElementById('dsoHint');
      if (h) h.textContent = R.ready ? ('Marvis 地图 · 17×14 · ' + (R.errors.length ? '素材部分缺失' : '素材已加载')) : '素材加载失败';
      layoutCanvas();
    });
  }

  function buildButton(){
    if (document.getElementById('dshOfficeBtn')) return;
    btn = document.createElement('button');
    btn.id = 'dshOfficeBtn';
    btn.innerHTML = ICO.office + '<span>办公室</span>';
    btn.title = 'DSH 办公室 · Marvis 原始场景';
    btn.addEventListener('click', function(e){ e.preventDefault(); e.stopPropagation(); toggle(); });
    document.body.appendChild(btn);
  }
  function positionButton(){
    if (!btn || state.open) return;
    btn.style.width='auto'; btn.style.height='auto'; btn.style.margin='0';
    var bar = document.getElementById('dshRoutesBar');
    if (bar){
      var r = bar.getBoundingClientRect();
      btn.style.top = Math.max(6, r.top + (r.height - 34)/2) + 'px';
      btn.style.bottom = 'auto';
      btn.style.left = Math.max(6, r.left - btn.offsetWidth - 10) + 'px';
      btn.style.right = 'auto';
    } else { btn.style.top='auto'; btn.style.left='auto'; btn.style.right='16px'; btn.style.bottom='88px'; }
  }
  function toggle(force){
    var want = (typeof force==='boolean') ? force : !state.open;
    state.open = want;
    if (!panelEl) buildPanel();
    panelEl.classList.toggle('dso-open', want);
    if (btn){ btn.classList.toggle('dso-on', want); btn.style.display = want?'none':''; }
    if (want){ layoutCanvas(); render(); renderEvents(); requestAnimationFrame(layoutCanvas); setTimeout(layoutCanvas,240); }
  }
  window.__dshOfficeToggle = toggle;

  /* ---------------- Canvas ---------------- */
  function layoutCanvas(){
    if (!cv) return;
    var stage = cv.parentElement;
    var w = stage.clientWidth || 760, h = stage.clientHeight || 460;
    if (h < 200) h = Math.max(360, Math.round(w*0.62));
    CW=w; CH=h;
    cv.width = Math.round(CW*dpr); cv.height = Math.round(CH*dpr);
    cv.style.width='100%'; cv.style.height = CH + 'px';
  }
  function rr(x,y,w,h,r){
    r = Math.max(0, Math.min(r, Math.abs(w)/2, Math.abs(h)/2));
    ctx.beginPath();
    ctx.moveTo(x+r,y); ctx.lineTo(x+w-r,y); ctx.quadraticCurveTo(x+w,y,x+w,y+r);
    ctx.lineTo(x+w,y+h-r); ctx.quadraticCurveTo(x+w,y+h,x+w-r,y+h);
    ctx.lineTo(x+r,y+h); ctx.quadraticCurveTo(x,y+h,x,y+h-r);
    ctx.lineTo(x,y+r); ctx.quadraticCurveTo(x,y,x+r,y); ctx.closePath();
  }

  // 收集地图里所有对象（含 group），返回带类型的列表
  function collectObjects(){
    var out = [];
    if (!R.map) return out;
    function walk(layer, ox, oy){
      if (layer.type === 'group'){
        var gx = ox + (layer.x||0), gy = oy + (layer.y||0);
        (layer.layers||[]).forEach(function(l){ walk(l, gx, gy); });
      } else if (layer.type === 'objectgroup'){
        (layer.objects||[]).forEach(function(o){
          out.push({ layer:layer.name, group:null, o:o, x:(o.x||0)+ox, y:(o.y||0)+oy });
        });
      }
    }
    (R.map.layers||[]).forEach(function(l){ walk(l, 0, 0); });
    return out;
  }

  // 可走格子（block 层 data===0）
  function walkableCells(){
    var cells = [];
    if (!R.map) return cells;
    var block = null;
    (R.map.layers||[]).forEach(function(l){ if (l.name === 'block') block = l; });
    if (!block) return cells;
    var w = block.width;
    for (var i=0;i<block.data.length;i++){
      if (block.data[i] === 0){
        cells.push({ cx:i % w, cy:Math.floor(i / w) });
      }
    }
    return cells;
  }

  function draw(){
    if (!ctx) return;
    ctx.setTransform(dpr,0,0,dpr,0,0);
    ctx.clearRect(0,0,CW,CH);

    // 浅色地板（Marvis 风）
    ctx.fillStyle = '#f4f6f8';
    ctx.fillRect(0,0,CW,CH);

    if (!R.ready || !R.map){
      ctx.textAlign='center';
      ctx.font='13px -apple-system,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif';
      ctx.fillStyle='#9aa3ad';
      ctx.fillText(R.errors.length ? ('素材加载失败: ' + R.errors[0]) : '正在加载 Marvis 地图…', CW/2, CH/2);
      return;
    }

    var tw = R.map.tilewidth, th = R.map.tileheight;
    var mapW = R.map.width * tw, mapH = R.map.height * th;

    // 地图整体缩放，居中
    var pad = 18;
    var sc = Math.min((CW - pad*2) / mapW, (CH - pad*2) / mapH);
    var ox = (CW - mapW*sc)/2, oy = (CH - mapH*sc)/2;
    view.sc = sc; view.ox = ox; view.oy = oy;

    ctx.save();
    ctx.translate(ox, oy);
    ctx.scale(sc, sc);

    // 地板（用可走格子铺一层极淡色块，体现 Marvis 的房间分区）
    var cells = walkableCells();
    ctx.fillStyle = 'rgba(255,255,255,0.72)';
    cells.forEach(function(c){ ctx.fillRect(c.cx*tw, c.cy*th, tw, th); });
    ctx.strokeStyle = 'rgba(225,230,236,0.85)';
    ctx.lineWidth = 1/sc;
    cells.forEach(function(c){ ctx.strokeRect(c.cx*tw+0.5, c.cy*th+0.5, tw-1, th-1); });

    // 阻挡墙（深一档，体现房间形状）
    var block = null;
    (R.map.layers||[]).forEach(function(l){ if (l.name==='block') block = l; });
    if (block){
      ctx.fillStyle = '#eceff3';
      for (var i=0;i<block.data.length;i++){
        if (block.data[i] !== 0){
          var bx = (i % block.width)*tw, by = Math.floor(i/block.width)*th;
          ctx.fillRect(bx, by, tw, th);
        }
      }
    }

    // 对象层（按 group 内层顺序）
    var objs = collectObjects();
    objs.forEach(function(it){
      if (!it.o.gid) return;
      var imgPath = tileImageOf(it.o.gid);
      if (!imgPath) return;
      var f = frameOf(imgPath);
      if (!f) return;
      // Tiled tile object 锚点在左下角
      var dx = it.x, dy = it.y - it.o.height;
      drawSprite(ctx, R.ws.img, f, dx, dy, it.o.width, it.o.height);
    });

    // agent：按会话状态摆放
    drawAgents();

    ctx.restore();

    // 名牌（屏幕坐标）
    drawLabels();
  }

  function drawAgents(){
    var list = state.items || [];
    pendingLabels = [];
    if (!list.length) return;
    var cells = walkableCells();
    if (!cells.length) return;
    // 按行分布：每行取一个，横向居中，避免挤成一列（与 Marvis 原图一致）
    cells.sort(function(a,b){ return (a.cy - b.cy) || (a.cx - b.cx); });
    var rows = [];
    cells.forEach(function(c){
      if (!rows[c.cy]) rows[c.cy] = [];
      rows[c.cy].push(c);
    });
    var n = Math.min(list.length, 8);
    var picks = [];
    // 把整个可走区切成 n 段，每段取一个 —— 铺满全场且不重叠
    var per = Math.max(1, Math.ceil(cells.length / n));
    for (var k = 0; k < n && k * per < cells.length; k++){
      var slice = cells.slice(k * per, (k + 1) * per);
      if (slice.length) picks.push(slice[Math.floor(slice.length / 2)]);
    }

    var tw = R.map.tilewidth, th = R.map.tileheight;
    for (var i = 0; i < picks.length && i < list.length; i++){
      var s = list[i];
      var active = !!s.running;
      var key = active ? 'fc_working' : 'fc_standby';
      var anim = R.anims[key] || R.anims['fc_standby'] || R.anims['fc_working'];
      if (!anim || !anim.frames.length) continue;
      var f = anim.frames[Math.floor(state.t / 4) % anim.frames.length];
      if (!f) continue;

      var c = picks[i];
      var bx = c.cx * tw + tw / 2;
      var by = c.cy * th + th;

      var scale = 0.34;
      var sw = f.sourceSize.w * scale, sh = f.sourceSize.h * scale;
      var dx = bx - sw / 2, dy = by - sh;
      var ss = f.spriteSourceSize;
      drawSprite(ctx, anim.img, f, dx + ss.x * scale, dy + ss.y * scale, f.frame.w * scale, f.frame.h * scale);

      // 内容实际底部（地图坐标），名牌贴在这里
      var contentBottom = dy + ss.y * scale + f.frame.h * scale;
      pendingLabels.push({
        x: view.ox + bx * view.sc,
        y: view.oy + contentBottom * view.sc + 3,
        title: labelOf(s, i),
        sub: subOf(s),
        active: active
      });
    }
  }

  function drawLabels(){
    if (!pendingLabels.length) return;
    pendingLabels.forEach(function(L){
      ctx.save();
      ctx.font = '600 11px -apple-system,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif';
      var w1 = ctx.measureText(L.title).width;
      ctx.font = '10px -apple-system,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif';
      var w2 = ctx.measureText(L.sub).width;
      var w = Math.max(w1, w2) + 14, h = 30;
      var x = Math.round(L.x - w / 2), y = Math.round(L.y);

      // 底板
      ctx.fillStyle = 'rgba(255,255,255,0.94)';
      ctx.strokeStyle = L.active ? 'rgba(0,181,120,0.55)' : 'rgba(226,231,237,1)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      var r = 6;
      ctx.moveTo(x + r, y);
      ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
      ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
      ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
      ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y);
      ctx.closePath(); ctx.fill(); ctx.stroke();

      ctx.textAlign = 'center';
      ctx.font = '600 11px -apple-system,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif';
      ctx.fillStyle = L.active ? '#14171a' : '#3f4854';
      ctx.fillText(L.title, L.x, y + 13);
      ctx.font = '10px -apple-system,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif';
      ctx.fillStyle = L.active ? '#00a06b' : '#9aa3ad';
      ctx.fillText(L.sub, L.x, y + 25);
      ctx.restore();
    });
  }

  function loop(){ state.t++; draw(); requestAnimationFrame(loop); }

  /* ---------------- 启动 ---------------- */
  document.addEventListener('keydown', function(e){
    if (e.key === 'Escape' && state.open){ e.preventDefault(); toggle(false); }
    if (e.ctrlKey && e.shiftKey && (e.key==='O'||e.key==='o')){ e.preventDefault(); toggle(); }
  }, true);

  function boot(){
    if (!document.body){ setTimeout(boot,300); return; }
    buildButton();
    positionButton();
    setInterval(positionButton, 900);
    poll();
    setInterval(poll, POLL_MS);
    renderEvents();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
