/* DSH 办公室 —— Marvis 风格多智能体可视化（注入版）
   数据源：dsh RPC session.list（真实会话 = 员工）
   事件语义：running=工作中 / 有历史=已完成 / 0 turn=待命
*/
(function(){
  'use strict';
  if (window.__DSH_OFFICE__) return;
  window.__DSH_OFFICE__ = true;

  var API = '/api/session.list';
  var POLL_MS = 2500;
  var state = { items: [], last: {}, events: [], seen: {}, open: false, t: 0 };

  // ---------- 角色分配：把会话稳定映射到 office 里的座位/角色 ----------
  var ROLES = [
    { key:'ceo',  label:'总指挥', color:'#c02020', emoji:'👔' },
    { key:'dev',  label:'研发',   color:'#2b7de9', emoji:'💻' },
    { key:'dev2', label:'研发B',  color:'#1f9d8f', emoji:'🛠️' },
    { key:'qa',   label:'测试',   color:'#d97706', emoji:'🔍' },
    { key:'doc',  label:'文档',   color:'#7c3aed', emoji:'📝' },
    { key:'ops',  label:'运维',   color:'#0ea5e9', emoji:'⚙️' },
    { key:'vis',  label:'视觉',   color:'#db2777', emoji:'👁️' },
    { key:'etc',  label:'后勤',   color:'#64748b', emoji:'📦' }
  ];

  function roleFor(i){ return ROLES[i % ROLES.length]; }

  function shortTitle(s){
    var t = (s.title || '').trim();
    if (t) return t.length > 14 ? t.slice(0,14)+'…' : t;
    var cwd = (s.cwd || '').split(/[\\/]/).filter(Boolean).pop() || '';
    if (cwd) return cwd.length > 14 ? cwd.slice(0,14)+'…' : cwd;
    return (s.sessionId||'').slice(0,12);
  }

  // ---------- RPC ----------
  async function rpc(method, payload){
    var body = { type:'client-request', rpcId:'office-'+Math.random().toString(36).slice(2), method:method, payload:payload||{} };
    var res = await fetch('/api/'+method, { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify(body) });
    var j = await res.json();
    return j && j.result && j.result.ok ? j.result.value : null;
  }

  function pushEvent(kind, text, color){
    state.events.unshift({ kind:kind, text:text, color:color||'#8b949e', at: Date.now() });
    if (state.events.length > 60) state.events.length = 60;
    renderEvents();
  }

  async function poll(){
    var v = null;
    try { v = await rpc('session.list', {}); } catch(e){ }
    if (!v || !v.items) return;
    var items = v.items.slice().sort(function(a,b){ return (b.updatedAt||0) - (a.updatedAt||0); });
    state.all = items;
    state.items = items.slice(0, 12);

    // diff：检测 running 变化 & steps 增长 → 生成事件
    items.forEach(function(s){
      var id = s.sessionId;
      var st = s.projections && s.projections.values && s.projections.values.sessionStats || {};
      var prev = state.last[id];
      var nowRun = !!s.running;
      var steps = st.steps || 0;
      if (!prev){
        state.last[id] = { run:nowRun, steps:steps };
        if (nowRun) pushEvent('start', shortTitle(s)+' 正在工作', '#2b7de9');
        return;
      }
      if (!prev.run && nowRun) pushEvent('start', shortTitle(s)+' 开始工作', '#2b7de9');
      if (prev.run && !nowRun) pushEvent('done', shortTitle(s)+' 完成一轮', '#238636');
      if (steps > prev.steps){
        var d = steps - prev.steps;
        var key = 'step:'+id;
        var lastEv = state.lastEv && state.lastEv[key];
        var now = Date.now();
        if (lastEv && now - lastEv.at < 12000){
          // 12 秒内合并，累加步数
          lastEv.n += d; lastEv.at = now;
          lastEv.text = shortTitle(s) + ' 执行了 ' + lastEv.n + ' 步';
          lastEv.merged = true;
          renderEvents();
        } else {
          var ev = { kind:'step', text: shortTitle(s)+' 执行了 '+d+' 步', color:'#8b949e', at: now, n: d };
          state.events.unshift(ev);
          if (state.events.length > 60) state.events.length = 60;
          state.lastEv = state.lastEv || {}; state.lastEv[key] = ev;
          renderEvents();
        }
      }
      prev.run = nowRun; prev.steps = steps;
    });
    render();
  }

  // ---------- 渲染 ----------
  var root, cv, ctx, evBox, statBox, panelEl;
  var CW = 900, CH = 470, dpr = Math.min(2, window.devicePixelRatio||1);

  function h(html){ var d = document.createElement('div'); d.innerHTML = html.trim(); return d.firstChild; }

  function buildPanel(){
    panelEl = document.createElement('div');
    panelEl.id = 'dshOfficePanel';
    panelEl.innerHTML = ''
      + '<div class="dso-head">'
      +   '<span class="dso-title">🏢 DSH 办公室</span>'
      +   '<span class="dso-sub" id="dsoSub">连接中…</span>'
      +   '<span class="dso-spacer"></span>'
      +   '<button class="dso-x" id="dsoClose">✕</button>'
      + '</div>'
      + '<div class="dso-body">'
      +   '<div class="dso-canvas-wrap"><canvas id="dsoCanvas"></canvas></div>'
      +   '<div class="dso-side">'
      +     '<div class="dso-sec"><div class="dso-sech">📊 出勤统计</div><div id="dsoStats" class="dso-stats"></div></div>'
      +     '<div class="dso-sec dso-flex"><div class="dso-sech">📡 实时事件</div><div id="dsoEvents" class="dso-events"></div></div>'
      +   '</div>'
      + '</div>';
    document.body.appendChild(panelEl);
    cv = panelEl.querySelector('#dsoCanvas');
    ctx = cv.getContext('2d');
    evBox = panelEl.querySelector('#dsoEvents');
    statBox = panelEl.querySelector('#dsoStats');
    panelEl.querySelector('#dsoClose').addEventListener('click', function(){ toggle(false); });
    layoutCanvas();
    window.addEventListener('resize', layoutCanvas);
    loop();
  }

  function layoutCanvas(){
    if (!cv) return;
    var wrap = cv.parentElement;
    var w = wrap.clientWidth || CW;
    var availH = wrap.clientHeight || 0;
    if (availH < 120 && panelEl){ availH = Math.max(320, panelEl.clientHeight - 62 - 24); }
    CW = w;
    CH = availH > 120 ? availH : Math.max(320, Math.round(w * 0.52));
    cv.width = Math.round(CW * dpr); cv.height = Math.round(CH * dpr);
    cv.style.width = '100%'; cv.style.height = CH + 'px';
  }

  // 办公室布局：8 个工位 + 会议室 + 门
  function seats(){
    var out = [];
    var cols = 4, rows = 3;              // 12 个工位，铺满画布
    var padX = CW*0.06, padY = 58;
    var gw = (CW - padX*2) / cols;
    var gh = (CH - padY*2) / rows;
    for (var r=0;r<rows;r++) for (var c=0;c<cols;c++){
      out.push({ x: padX + gw*c + gw/2, y: padY + gh*r + gh/2 });
    }
    return out;
  }

  function draw(){
    if (!ctx) return;
    var W = CW, H = CH;
    ctx.setTransform(dpr,0,0,dpr,0,0);
    ctx.clearRect(0,0,W,H);

    // 背景
    var g = ctx.createLinearGradient(0,0,0,H);
    g.addColorStop(0,'#11161d'); g.addColorStop(1,'#0b0f14');
    ctx.fillStyle = g; ctx.fillRect(0,0,W,H);

    // 地板网格
    ctx.strokeStyle = 'rgba(255,255,255,0.035)'; ctx.lineWidth = 1;
    for (var x=0;x<W;x+=42){ ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,H); ctx.stroke(); }
    for (var y=0;y<H;y+=42){ ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(W,y); ctx.stroke(); }

    var st = seats();
    var n = Math.min(state.items.length, st.length);

    // 工位
    st.forEach(function(s, i){
      var active = i < n;
      var it = active ? state.items[i] : null;
      var running = it && it.running;
      var role = roleFor(i);
      // 桌子
      ctx.fillStyle = running ? 'rgba(43,125,233,0.10)' : 'rgba(255,255,255,0.03)';
      roundRect(s.x-58, s.y-30, 116, 78, 10); ctx.fill();
      ctx.strokeStyle = running ? 'rgba(43,125,233,0.45)' : 'rgba(255,255,255,0.07)';
      ctx.lineWidth = running ? 1.6 : 1; roundRect(s.x-58, s.y-30, 116, 78, 10); ctx.stroke();

      if (!active) return;

      // 小人
      var bob = running ? Math.sin(state.t/9 + i)*1.8 : 0;
      var cy = s.y - 4 + bob;
      ctx.fillStyle = role.color;
      ctx.beginPath(); ctx.arc(s.x, cy, 11, 0, 6.2832); ctx.fill();   // 头
      ctx.fillStyle = running ? role.color : 'rgba(255,255,255,0.28)';
      roundRect(s.x-10, cy+12, 20, 18, 5); ctx.fill();                 // 身体

      // 状态灯
      ctx.fillStyle = running ? '#3fb950' : 'rgba(255,255,255,0.2)';
      ctx.beginPath(); ctx.arc(s.x+26, cy-8, 3.5, 0, 6.2832); ctx.fill();
      if (running){ ctx.globalAlpha = 0.25 + 0.25*Math.sin(state.t/12); ctx.beginPath(); ctx.arc(s.x+26, cy-8, 7, 0, 6.2832); ctx.fill(); ctx.globalAlpha = 1; }

      // 标签
      ctx.fillStyle = 'rgba(255,255,255,0.88)';
      ctx.font = '600 11px system-ui,Segoe UI,sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(role.emoji + ' ' + role.label, s.x, s.y+22);
      ctx.fillStyle = 'rgba(255,255,255,0.42)'; ctx.font = '10px system-ui,Segoe UI,sans-serif';
      var t = shortTitle(it);
      ctx.fillText(t, s.x, s.y+36);

      // 键盘敲击动画（工作中）
      if (running){
        ctx.fillStyle = 'rgba(63,185,80,' + (0.35 + 0.35*Math.abs(Math.sin(state.t/5))) + ')';
        roundRect(s.x-16, cy+34, 32, 5, 2); ctx.fill();
      }
    });
  }

  function roundRect(x,y,w,hh,r){
    ctx.beginPath();
    ctx.moveTo(x+r,y); ctx.lineTo(x+w-r,y); ctx.quadraticCurveTo(x+w,y,x+w,y+r);
    ctx.lineTo(x+w,y+hh-r); ctx.quadraticCurveTo(x+w,y+hh,x+w-r,y+hh);
    ctx.lineTo(x+r,y+hh); ctx.quadraticCurveTo(x,y+hh,x,y+hh-r);
    ctx.lineTo(x,y+r); ctx.quadraticCurveTo(x,y,x+r,y); ctx.closePath();
  }

  function render(){
    var running = state.items.filter(function(s){ return s.running; }).length;
    var total = (state.all || state.items).length;
    var sub = document.getElementById('dsoSub');
    if (sub) sub.textContent = running + ' 人在岗 / 共 ' + total + ' 会话';
    if (statBox){
      var all = state.all || state.items;
      var steps = all.reduce(function(a,s){ var p=s.projections&&s.projections.values&&s.projections.values.sessionStats; return a + ((p&&p.steps)||0); }, 0);
      var toks = all.reduce(function(a,s){ var p=s.projections&&s.projections.values&&s.projections.values.tokenUsage; if(!p) return a; return a + ((p.uncachedInputTokens||0)+(p.outputTokens||0)+(p.cacheReadTokens||0)); }, 0);
      statBox.innerHTML = ''
        + row('在岗', running, '#3fb950')
        + row('会话总数', total, '#58a6ff')
        + row('累计步数', steps.toLocaleString(), '#d29922')
        + row('Token', toks ? (toks>1000000 ? (toks/1000000).toFixed(2)+'M' : toks.toLocaleString()) : '—', '#a371f7');
    }
  }
  function row(k,v,c){
    return '<div class="dso-row"><span class="dso-k">'+k+'</span><span class="dso-v" style="color:'+c+'">'+v+'</span></div>';
  }

  function renderEvents(){
    if (!evBox) return;
    if (!state.events.length){
      var rn = (state.all||[]).filter(function(s){ return s.running; }).length;
      evBox.innerHTML = '<div class="dso-empty">' + (rn ? '监控中…' : '所有会话空闲，等待新活动…') + '</div>';
      return;
    }
    evBox.innerHTML = state.events.slice(0,40).map(function(e){
      var d = new Date(e.at); var hh = String(d.getHours()).padStart(2,'0'), mm = String(d.getMinutes()).padStart(2,'0'), ss = String(d.getSeconds()).padStart(2,'0');
      var icon = e.kind==='start' ? '▶' : e.kind==='done' ? '✓' : '·';
      return '<div class="dso-ev"><span class="dso-ev-t">'+hh+':'+mm+':'+ss+'</span><span class="dso-ev-i" style="color:'+e.color+'">'+icon+'</span><span class="dso-ev-x">'+esc(e.text)+'</span></div>';
    }).join('');
  }
  function esc(s){ return String(s).replace(/[&<>"]/g, function(c){ return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'})[c]; }); }

  // ---------- 循环 ----------
  function loop(){
    state.t++;
    draw();
    requestAnimationFrame(loop);
  }

  // ---------- 入口按钮 ----------
  var btn;
  function buildButton(){
    if (document.getElementById('dshOfficeBtn')) return;
    btn = document.createElement('button');
    btn.id = 'dshOfficeBtn';
    btn.innerHTML = '🏢 <span>办公室</span>';
    btn.title = 'DSH 办公室：实时查看各会话（员工）的工作状态';
    btn.addEventListener('click', function(e){ e.preventDefault(); e.stopPropagation(); toggle(); });
    document.body.appendChild(btn);
  }

  function positionButton(){
    if (!btn || state.open) return;
    btn.style.margin = '0';
    btn.style.width = 'auto'; btn.style.height = 'auto';
    var bar = document.getElementById('dshRoutesBar');
    if (bar){
      var r = bar.getBoundingClientRect();
      btn.style.top = Math.max(6, r.top) + 'px';
      btn.style.bottom = 'auto';
      btn.style.left = Math.max(6, r.left - (btn.offsetWidth||110) - 10) + 'px';
      btn.style.right = 'auto';
    } else {
      btn.style.top = 'auto'; btn.style.left = 'auto';
      btn.style.right = '14px'; btn.style.bottom = '86px';
    }
  }

  function toggle(force){
    var want = (typeof force === 'boolean') ? force : !state.open;
    state.open = want;
    if (!panelEl) buildPanel();
    panelEl.classList.toggle('dso-open', want);
    if (btn){ btn.classList.toggle('dso-on', want); btn.style.display = want ? 'none' : ''; }
    if (want){
      layoutCanvas(); render(); renderEvents();
      requestAnimationFrame(function(){ layoutCanvas(); });
      setTimeout(layoutCanvas, 220);
    }
  }

  window.__dshOfficeToggle = toggle;

  function boot(){
    if (!document.body) { setTimeout(boot, 300); return; }
    buildButton();
    positionButton();
    setInterval(positionButton, 900);
    poll();
    setInterval(poll, POLL_MS);
    renderEvents();
    // 快捷键 Ctrl+Shift+O
    document.addEventListener('keydown', function(e){
      if (e.ctrlKey && e.shiftKey && (e.key === 'O' || e.key === 'o')){ e.preventDefault(); toggle(); }
    }, true);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
