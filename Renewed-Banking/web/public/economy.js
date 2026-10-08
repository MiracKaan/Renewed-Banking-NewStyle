/* ===== Ekonomi Yönetim Paneli - çekirdek, grafikler, genel bakış, oyuncular ===== */
(function () {
    const ECO = (window.ECO = { page: 'overview', days: 7, cfgMeta: null, workCfg: null, dirty: false });
    const RES = typeof GetParentResourceName === 'function' ? GetParentResourceName() : 'Renewed-Banking';

    // ---------- yardımcılar ----------
    const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const $ = (s, r) => (r || document).querySelector(s);
    const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
    const PAL = ['#34d399', '#60a5fa', '#fbbf24', '#f472b6', '#a78bfa', '#f87171', '#2dd4bf', '#fb923c'];

    function money(n) {
        n = Number(n) || 0;
        if (Math.abs(n) >= 1e15) return '$' + n.toExponential(2).replace('e+', 'e');
        return (n < 0 ? '-$' : '$') + Math.abs(Math.round(n)).toLocaleString('en-US');
    }
    function compact(n) {
        n = Number(n) || 0;
        const a = Math.abs(n);
        if (a >= 1e15) return n.toExponential(1).replace('e+', 'e');
        const u = [[1e12, 'T'], [1e9, 'B'], [1e6, 'M'], [1e3, 'K']];
        for (const [v, s] of u) {
            if (a >= v) {
                let t = (n / v).toFixed(a >= v * 100 ? 0 : a >= v * 10 ? 1 : 2);
                if (t.indexOf('.') > -1) t = t.replace(/0+$/, '').replace(/\.$/, '');
                return t + s;
            }
        }
        return String(Math.round(n));
    }
    const cmoney = (n) => '$' + compact(n);
    const pad = (x) => String(x).padStart(2, '0');
    function fmtDate(ts) {
        const d = new Date(Number(ts) * 1000);
        return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    }
    const fmtDay = (ts) => { const d = new Date(Number(ts) * 1000); return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}`; };
    const fmtHour = (ts) => { const d = new Date(Number(ts) * 1000); return `${pad(d.getDate())}.${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`; };
    const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

    ECO.esc = esc; ECO.$ = $; ECO.$$ = $$; ECO.money = money; ECO.compact = compact; ECO.cmoney = cmoney;
    ECO.fmtDate = fmtDate; ECO.fmtDay = fmtDay; ECO.debounce = debounce; ECO.PAL = PAL;

    ECO.call = async function (name, data) {
        try {
            const r = await fetch(`https://${RES}/ecoCall`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, data: data || {} })
            });
            const j = await r.json();
            return j || { ok: false, error: 'Boş cevap' };
        } catch (e) {
            return { ok: false, error: String(e) };
        }
    };

    ECO.toast = function (msg, type) {
        const box = $('#eco-toasts');
        const t = document.createElement('div');
        t.className = 'eco-toast ' + (type || 'ok');
        t.textContent = msg;
        box.appendChild(t);
        setTimeout(() => t.remove(), 3200);
    };

    // ---------- modal ----------
    ECO.modal = function ({ title, msg, fields, okText, okClass }) {
        return new Promise((resolve) => {
            const bg = document.createElement('div');
            bg.className = 'eco-modal-bg';
            const fhtml = (fields || []).map((f) => {
                if (f.type === 'select') {
                    return `<label class="f" style="margin-top:10px">${esc(f.label)}<select class="sel" data-k="${f.key}">${f.options.map((o) => `<option value="${esc(o[0])}">${esc(o[1])}</option>`).join('')}</select></label>`;
                }
                return `<label class="f" style="margin-top:10px">${esc(f.label)}<input class="inp" data-k="${f.key}" type="${f.type || 'text'}" value="${esc(f.value == null ? '' : f.value)}" placeholder="${esc(f.placeholder || '')}"></label>`;
            }).join('');
            bg.innerHTML = `<div class="eco-modal"><h3>${esc(title)}</h3>${msg ? `<p>${esc(msg)}</p>` : ''}${fhtml}
                <div class="acts"><button class="btn ghost" data-x="0">Vazgeç</button><button class="btn ${okClass || 'red'}" data-x="1">${esc(okText || 'Onayla')}</button></div></div>`;
            document.body.appendChild(bg);
            const first = $('input,select', bg);
            if (first) first.focus();
            const done = (ok) => {
                const out = {};
                $$('[data-k]', bg).forEach((i) => (out[i.dataset.k] = i.value));
                bg.remove();
                resolve(ok ? out : null);
            };
            bg.addEventListener('click', (e) => {
                const x = e.target.closest('[data-x]');
                if (x) done(x.dataset.x === '1');
                else if (e.target === bg) done(false);
            });
            bg.addEventListener('keydown', (e) => { if (e.key === 'Enter') done(true); });
        });
    };
    ECO.confirm = (title, msg, okText) => ECO.modal({ title, msg, okText }).then((r) => !!r);

    // ---------- tooltip ----------
    const tip = () => $('#eco-tip');
    ECO.showTip = function (html, e) {
        const t = tip();
        t.innerHTML = html;
        t.style.display = 'block';
        const w = t.offsetWidth, h = t.offsetHeight;
        let x = e.clientX + 14, y = e.clientY + 14;
        if (x + w > window.innerWidth - 8) x = e.clientX - w - 14;
        if (y + h > window.innerHeight - 8) y = e.clientY - h - 14;
        t.style.left = x + 'px'; t.style.top = y + 'px';
    };
    ECO.hideTip = () => { tip().style.display = 'none'; };

    // ---------- grafikler ----------
    function niceTicks(min, max, n) {
        const out = [];
        for (let i = 0; i <= n; i++) out.push(min + ((max - min) * i) / n);
        return out;
    }

    ECO.lineChart = function (el, series, opt) {
        opt = opt || {};
        const pts = series.flatMap((s) => s.points);
        if (pts.length < 2 || series[0].points.length < 2) {
            el.innerHTML = `<div class="empty">Grafik için yeterli veri yok.<br>Sistem her ${opt.interval || 30} dakikada bir kayıt alır, biraz bekleyin.</div>`;
            return;
        }
        const W = el.clientWidth || 600, H = opt.h || 230, m = { l: 58, r: 14, t: 12, b: 28 };
        const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
        const minX = Math.min(...xs), maxX = Math.max(...xs);
        let minY = Math.min(...ys), maxY = Math.max(...ys);
        if (opt.zero !== false) minY = Math.min(0, minY);
        const rng = maxY - minY;
        const padY = rng === 0 ? Math.max(Math.abs(maxY) * 0.05, 1) : rng * 0.12;
        if (opt.zero === false) minY = minY >= 0 ? Math.max(0, minY - padY) : minY - padY;
        maxY += padY;
        const sx = (x) => m.l + ((x - minX) / (maxX - minX || 1)) * (W - m.l - m.r);
        const sy = (y) => H - m.b - ((y - minY) / (maxY - minY || 1)) * (H - m.t - m.b);
        const yt = niceTicks(minY, maxY, 4);
        const xt = niceTicks(minX, maxX, Math.min(5, Math.max(2, Math.floor(W / 130))));
        const yf = opt.yFmt || ((v) => compact(v));
        let svg = `<svg viewBox="0 0 ${W} ${H}" height="${H}">`;
        svg += `<defs>${series.map((s, i) => `<linearGradient id="g${opt.id || 'x'}${i}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${s.color}" stop-opacity=".28"/><stop offset="1" stop-color="${s.color}" stop-opacity="0"/></linearGradient>`).join('')}</defs>`;
        yt.forEach((v) => {
            svg += `<line x1="${m.l}" x2="${W - m.r}" y1="${sy(v)}" y2="${sy(v)}" stroke="#334155" stroke-opacity=".6" stroke-dasharray="3 4"/><text x="${m.l - 8}" y="${sy(v) + 4}" text-anchor="end" font-size="10.5" fill="#94a3b8">${esc(yf(v))}</text>`;
        });
        xt.forEach((v) => { svg += `<text x="${sx(v)}" y="${H - 8}" text-anchor="middle" font-size="10.5" fill="#94a3b8">${esc((opt.xFmt || fmtHour)(v))}</text>`; });
        series.forEach((s, i) => {
            const d = s.points.map((p, k) => (k ? 'L' : 'M') + sx(p.x).toFixed(1) + ' ' + sy(p.y).toFixed(1)).join(' ');
            if (i === 0 || opt.areaAll) svg += `<path d="${d} L${sx(s.points[s.points.length - 1].x)} ${sy(minY)} L${sx(s.points[0].x)} ${sy(minY)} Z" fill="url(#g${opt.id || 'x'}${i})"/>`;
            svg += `<path d="${d}" fill="none" stroke="${s.color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
        });
        svg += `<line id="hv" y1="${m.t}" y2="${H - m.b}" stroke="#e2e8f0" stroke-opacity=".5" style="display:none"/><g id="hd"></g>`;
        svg += `<rect x="${m.l}" y="${m.t}" width="${W - m.l - m.r}" height="${H - m.t - m.b}" fill="transparent" id="ov"/></svg>`;
        el.innerHTML = svg;
        const ov = $('#ov', el), hv = $('#hv', el), hd = $('#hd', el);
        const base = series[0].points;
        ov.addEventListener('mousemove', (e) => {
            const rect = ov.getBoundingClientRect();
            const px = ((e.clientX - rect.left) / rect.width) * (W - m.l - m.r) + m.l;
            let best = 0, bd = 1e18;
            base.forEach((p, i) => { const d = Math.abs(sx(p.x) - px); if (d < bd) { bd = d; best = i; } });
            const x = sx(base[best].x);
            hv.setAttribute('x1', x); hv.setAttribute('x2', x); hv.style.display = '';
            hd.innerHTML = series.map((s) => s.points[best] ? `<circle cx="${x}" cy="${sy(s.points[best].y)}" r="4" fill="${s.color}" stroke="#0f172a" stroke-width="2"/>` : '').join('');
            ECO.showTip(`<b>${esc((opt.xFmt || fmtHour)(base[best].x))}</b><br>` + series.map((s) => s.points[best] ? `<span style="color:${s.color}">●</span> ${esc(s.label)}: <b>${esc((opt.tipFmt || money)(s.points[best].y))}</b>` : '').join('<br>'), e);
        });
        ov.addEventListener('mouseleave', () => { hv.style.display = 'none'; hd.innerHTML = ''; ECO.hideTip(); });
    };

    ECO.barChart = function (el, items, opt) {
        opt = opt || {};
        const max = Math.max(1, ...items.map((i) => i.value));
        if (!items.length || items.every((i) => !i.value)) { el.innerHTML = '<div class="empty">Veri yok.</div>'; return; }
        const W = el.clientWidth || 400, H = opt.h || 220, m = { l: 8, r: 8, t: 22, b: 36 };
        const bw = (W - m.l - m.r) / items.length;
        let svg = `<svg viewBox="0 0 ${W} ${H}" height="${H}">`;
        items.forEach((it, i) => {
            const h = (it.value / max) * (H - m.t - m.b);
            const x = m.l + i * bw + bw * 0.14, w = bw * 0.72, y = H - m.b - h;
            const col = it.color || opt.color || PAL[1];
            svg += `<rect class="bar" data-i="${i}" x="${x}" y="${y}" width="${w}" height="${Math.max(h, it.value ? 2 : 0)}" rx="5" fill="${col}" fill-opacity=".85"/>`;
            svg += `<text x="${x + w / 2}" y="${y - 6}" text-anchor="middle" font-size="11" font-weight="700" fill="#e2e8f0">${esc(opt.vFmt ? opt.vFmt(it.value) : it.value)}</text>`;
            svg += `<text x="${x + w / 2}" y="${H - 14}" text-anchor="middle" font-size="9.5" fill="#94a3b8">${esc(it.label)}</text>`;
        });
        svg += '</svg>';
        el.innerHTML = svg;
        $$('.bar', el).forEach((b) => {
            const it = items[b.dataset.i];
            b.addEventListener('mousemove', (e) => ECO.showTip(`<b>${esc(it.label)}</b><br>${esc(opt.tFmt ? opt.tFmt(it.value) : it.value)}`, e));
            b.addEventListener('mouseleave', ECO.hideTip);
        });
    };

    ECO.donut = function (el, items, opt) {
        opt = opt || {};
        const total = items.reduce((a, b) => a + b.value, 0);
        if (!items.length || total <= 0) { el.innerHTML = '<div class="empty">Veri yok.</div>'; return; }
        const R = 62, C = 2 * Math.PI * R;
        let off = 0, segs = '';
        items.forEach((it, i) => {
            const len = (it.value / total) * C;
            it.color = it.color || PAL[i % PAL.length];
            segs += `<circle class="seg" data-i="${i}" cx="80" cy="80" r="${R}" fill="none" stroke="${it.color}" stroke-width="22" stroke-dasharray="${len} ${C - len}" stroke-dashoffset="${-off}" transform="rotate(-90 80 80)"/>`;
            off += len;
        });
        const fmt = opt.vFmt || ((v) => v);
        el.innerHTML = `<div style="display:flex;align-items:center;gap:18px;flex-wrap:wrap;justify-content:center">
            <svg viewBox="0 0 160 160" width="160" height="160">${segs}
            <text x="80" y="76" text-anchor="middle" font-size="10" fill="#94a3b8">${esc(opt.centerLabel || 'Toplam')}</text>
            <text x="80" y="95" text-anchor="middle" font-size="15" font-weight="700" fill="#fff">${esc(fmt(total))}</text></svg>
            <div class="legend" style="flex-direction:column;margin:0">${items.map((it) => `<div><i style="background:${it.color}"></i>${esc(it.label)} <b>${esc(fmt(it.value))}</b> <span style="color:#64748b">(${Math.round((it.value / total) * 100)}%)</span></div>`).join('')}</div></div>`;
        $$('.seg', el).forEach((s) => {
            const it = items[s.dataset.i];
            s.addEventListener('mousemove', (e) => ECO.showTip(`<b>${esc(it.label)}</b><br>${esc(fmt(it.value))} (${Math.round((it.value / total) * 100)}%)`, e));
            s.addEventListener('mouseleave', ECO.hideTip);
        });
    };

    ECO.hbars = function (el, items, opt) {
        opt = opt || {};
        if (!items.length) { el.innerHTML = '<div class="empty">Veri yok.</div>'; return; }
        const max = Math.max(1, ...items.map((i) => Math.abs(i.value)));
        el.innerHTML = `<div class="hb">${items.map((it, i) => `<div class="it ${it.cid ? 'click' : ''}" ${it.cid ? `data-cid="${esc(it.cid)}" style="cursor:pointer"` : ''}>
            <div class="nm" title="${esc(it.label)}">${esc(it.label)}</div>
            <div class="bar"><i style="width:${Math.max(2, (Math.abs(it.value) / max) * 100)}%;background:${it.color || opt.color || PAL[i % PAL.length]}"></i></div>
            <div class="v">${esc(opt.vFmt ? opt.vFmt(it.value) : it.value)}</div></div>`).join('')}</div>`;
        $$('.it[data-cid]', el).forEach((n) => n.addEventListener('click', () => ECO.openPlayer(n.dataset.cid)));
    };

    // ---------- kabuk ----------
    const NAV = [
        ['overview', 'fa-chart-line', 'Genel Bakış'],
        ['players', 'fa-users', 'Oyuncular'],
        ['invoices', 'fa-file-invoice-dollar', 'Faturalar'],
        ['tax', 'fa-landmark', 'Vergi Merkezi'],
        ['logs', 'fa-clipboard-list', 'Kayıtlar']
    ];

    function build() {
        if ($('#eco-root')) return;
        const root = document.createElement('div');
        root.id = 'eco-root';
        root.innerHTML = `<div class="eco-app">
            <div class="eco-top">
                <div class="eco-brand"><div class="eco-logo"><i class="fa-solid fa-scale-balanced"></i></div>
                    <div><h1>EKONOMİ YÖNETİMİ</h1><p>Hoşgeldin, <span id="eco-admin">Admin</span> · Sunucu ekonomisi, vergiler ve faturalar</p></div></div>
                <div class="eco-top-right">
                    <div class="eco-treasury"><i class="fa-solid fa-vault c-green"></i><div><small id="eco-tr-l">Devlet Hazinesi</small><b id="eco-tr-v">$0</b></div></div>
                    <button class="eco-iconbtn" id="eco-refresh" title="Yenile"><i class="fa-solid fa-rotate"></i></button>
                    <button class="eco-iconbtn close" id="eco-close" title="Kapat (ESC)"><i class="fa-solid fa-xmark"></i></button>
                </div></div>
            <div class="eco-body">
                <nav class="eco-nav" id="eco-nav">${NAV.map((n) => `<button data-p="${n[0]}"><i class="fa-solid ${n[1]}"></i>${n[2]}</button>`).join('')}<div class="sp"></div>
                    <div class="tip"><i class="fa-solid fa-circle-info"></i> Vergi oranları, muafiyetler ve fatura meslekleri <b>Vergi Merkezi</b>'nden canlı değiştirilebilir.</div></nav>
                <main class="eco-main" id="eco-main"></main>
                <div class="eco-drawer-bg" id="eco-dbg"></div><aside class="eco-drawer" id="eco-drawer"></aside>
            </div></div>`;
        document.body.appendChild(root);
        const t = document.createElement('div'); t.id = 'eco-tip'; document.body.appendChild(t);
        const ts = document.createElement('div'); ts.id = 'eco-toasts'; document.body.appendChild(ts);

        $('#eco-nav').addEventListener('click', (e) => { const b = e.target.closest('button[data-p]'); if (b) ECO.go(b.dataset.p); });
        $('#eco-close').addEventListener('click', ECO.close);
        $('#eco-refresh').addEventListener('click', () => ECO.go(ECO.page, true));
        $('#eco-dbg').addEventListener('click', ECO.closeDrawer);
        window.addEventListener('resize', debounce(() => { if (ECO.open && ECO.page === 'overview' && ECO.lastOverview) ECO.renderOverview(ECO.lastOverview); }, 250));
    }

    ECO.open = false;
    ECO.show = function (data) {
        build();
        $('#eco-root').classList.add('open');
        $('#eco-admin').textContent = (data && data.adminName) || 'Admin';
        ECO.open = true;
        ECO.workCfg = null; ECO.dirty = false;
        ECO.go('overview', true);
    };
    ECO.close = function () {
        if (!ECO.open) return;
        const proceed = () => {
            ECO.open = false; ECO.closeDrawer();
            $('#eco-root').classList.remove('open');
            fetch(`https://${RES}/closeInterface`, { method: 'POST', body: '{}' });
        };
        if (ECO.dirty) ECO.confirm('Kaydedilmemiş değişiklikler', 'Vergi ayarlarında kaydedilmemiş değişiklikler var. Yine de kapatılsın mı?', 'Kapat').then((ok) => { if (ok) { ECO.dirty = false; proceed(); } });
        else proceed();
    };

    ECO.pages = {};
    ECO.go = function (page, force) {
        if (ECO.dirty && page !== 'tax' && !force) {
            ECO.confirm('Kaydedilmemiş değişiklikler', 'Vergi Merkezi\'nde kaydedilmemiş değişiklikler var, sayfadan çıkılsın mı?', 'Çık').then((ok) => { if (ok) { ECO.dirty = false; ECO.go(page, true); } });
            return;
        }
        ECO.page = page;
        $$('#eco-nav button').forEach((b) => b.classList.toggle('active', b.dataset.p === page));
        $('#eco-main').scrollTop = 0;
        ECO.closeDrawer();
        const fn = ECO.pages[page];
        if (fn) fn(force);
    };

    ECO.loading = () => '<div class="loading"><div class="spin"></div>Yükleniyor...</div>';
    ECO.setTreasury = (kpi) => {
        if (!kpi) return;
        $('#eco-tr-v').textContent = kpi.treasuryEnabled ? money(kpi.treasury) : 'Kapalı';
    };

    // ---------- GENEL BAKIŞ ----------
    ECO.pages.overview = async function () {
        const main = $('#eco-main');
        main.innerHTML = ECO.loading();
        const r = await ECO.call('getOverview', { days: ECO.days });
        if (!r.ok) { main.innerHTML = `<div class="empty-box">${esc(r.error || 'Veri alınamadı')}</div>`; return; }
        ECO.lastOverview = r;
        ECO.renderOverview(r);
    };

    ECO.renderOverview = function (r) {
        if (ECO.page !== 'overview') return;
        const k = r.kpi, main = $('#eco-main');
        ECO.setTreasury(k);
        const kpi = (icon, color, lbl, val, note) => `<div class="card kpi"><div class="lbl"><i class="fa-solid ${icon} ${color}"></i>${lbl}</div><div class="val ${color}" title="${esc(val)}">${val}</div><div class="note">${note || '&nbsp;'}</div><i class="fa-solid ${icon} bg"></i></div>`;
        main.innerHTML = `
        <div class="eco-h"><div><h2>Genel Bakış</h2><small>Sunucudaki tüm karakterlerin anlık ekonomik durumu</small></div>
            <div class="row" style="flex:none"><div class="fix"><select class="sel sm" id="ov-days"><option value="1">Son 24 saat</option><option value="7">Son 7 gün</option><option value="30">Son 30 gün</option></select></div></div></div>
        ${k.suspicious > 0 ? `<div class="alert"><i class="fa-solid fa-triangle-exclamation"></i><span><b>${k.suspicious} oyuncunun</b> bakiyesi anormal (1 trilyon $ üstü veya negatif). Bu hesaplar istatistik ve otomatik vergiden hariç tutuldu.</span><button class="btn amber sm" id="ov-susp">Göster</button></div>` : ''}
        <div class="grid g-kpi">
            ${kpi('fa-coins', 'c-green', 'Toplam Para (Banka+Nakit)', money(k.total), `Ortalama ${cmoney(k.avg)} · Medyan ${cmoney(k.median)}`)}
            ${kpi('fa-building-columns', 'c-blue', 'Toplam Banka', money(k.totalBank))}
            ${kpi('fa-wallet', 'c-amber', 'Toplam Nakit', money(k.totalCash))}
            ${kpi('fa-vault', 'c-green', 'Devlet Hazinesi', k.treasuryEnabled ? money(k.treasury) : 'Kapalı', `Toplanan vergi: ${money(k.taxTotal)}`)}
            ${kpi('fa-users', 'c-purple', 'Karakter / Online', `${k.players} / ${k.online}`, 'Kayıtlı / şu an oyunda')}
            ${kpi('fa-car', 'c-blue', 'Toplam Araç', k.vehicles.toLocaleString('en-US'), `Toplam mülk: ${k.houses}`)}
            ${kpi('fa-file-invoice-dollar', 'c-red', 'Bekleyen Faturalar', money(k.unpaidSum), `${k.unpaidCount} ödenmemiş fatura`)}
            ${kpi('fa-scale-unbalanced', 'c-pink', 'Eşitsizlik (Gini)', k.gini.toFixed(2), k.gini > 0.7 ? 'Çok yüksek — servet birkaç kişide' : k.gini > 0.5 ? 'Yüksek' : 'Dengeli')}
        </div>
        <div class="grid g-21" style="margin-bottom:16px">
            <div class="card"><h3>Para Arzı Değişimi <span class="sub">Toplam banka + nakit</span></h3><div class="chart" id="ch-supply"></div><div class="legend" id="lg-supply"></div></div>
            <div class="card"><h3>Servet Dağılımı <span class="sub">Kaç kişi hangi aralıkta</span></h3><div class="chart" id="ch-buckets"></div></div>
        </div>
        <div class="grid g-3" style="margin-bottom:16px">
            <div class="card"><h3>En Zengin 10 Oyuncu <span class="sub">tıkla → detay</span></h3><div id="ch-top"></div></div>
            <div class="card"><h3>Vergi Gelirleri <span class="sub">Türe göre toplam</span></h3><div id="ch-taxtype"></div></div>
            <div class="card"><h3>Günlük Vergi Geliri <span class="sub">Son 14 gün</span></h3><div class="chart" id="ch-taxdaily"></div></div>
        </div>
        <div class="grid g-3" style="margin-bottom:16px">
            <div class="card"><h3>Araç Durumu</h3><div id="ch-vstate"></div></div>
            <div class="card"><h3>En Çok Sahip Olunan Modeller</h3><div id="ch-models"></div></div>
            <div class="card"><h3>Bekleyen Faturalar <span class="sub">Gönderene göre</span></h3><div id="ch-senders"></div></div>
        </div>
        <div class="grid g-2">
            <div class="card"><h3>Online Oyuncu Sayısı</h3><div class="chart" id="ch-online"></div></div>
            <div class="card"><h3>Hazine & Bekleyen Fatura Tutarı</h3><div class="chart" id="ch-treasury"></div><div class="legend"><span><i style="background:#34d399"></i>Hazine</span><span><i style="background:#f87171"></i>Bekleyen fatura</span></div></div>
        </div>`;
        $('#ov-days').value = String(ECO.days);
        $('#ov-days').addEventListener('change', (e) => { ECO.days = +e.target.value; ECO.pages.overview(); });
        const susp = $('#ov-susp');
        if (susp) susp.addEventListener('click', () => { ECO.pl.filter = 'suspicious'; ECO.go('players'); });

        const sn = r.snapshots || [];
        ECO.lineChart($('#ch-supply'), [
            { label: 'Toplam', color: '#34d399', points: sn.map((s) => ({ x: s.ts, y: s.total_bank + s.total_cash })) },
            { label: 'Banka', color: '#60a5fa', points: sn.map((s) => ({ x: s.ts, y: s.total_bank })) },
            { label: 'Nakit', color: '#fbbf24', points: sn.map((s) => ({ x: s.ts, y: s.total_cash })) }
        ], { id: 'sup', zero: false, yFmt: cmoney });
        $('#lg-supply').innerHTML = '<span><i style="background:#34d399"></i>Toplam</span><span><i style="background:#60a5fa"></i>Banka</span><span><i style="background:#fbbf24"></i>Nakit</span>';
        ECO.barChart($('#ch-buckets'), r.buckets.map((b, i) => ({ label: b.label, value: b.count, color: PAL[i % PAL.length] })), { tFmt: (v) => v + ' oyuncu' });
        ECO.hbars($('#ch-top'), r.top.map((t) => ({ label: t.name + (t.suspicious ? ' ⚠' : ''), value: t.suspicious ? 0 : t.total, cid: t.cid, color: t.suspicious ? '#f59e0b' : undefined, _raw: t })), { vFmt: cmoney });
        // şüpheli bakiye gösterimi
        $$('#ch-top .it').forEach((n, i) => { if (r.top[i] && r.top[i].suspicious) $('.v', n).textContent = cmoney(r.top[i].total); });
        ECO.donut($('#ch-taxtype'), r.taxByType.map((t) => ({ label: t.label, value: t.sum })), { vFmt: cmoney, centerLabel: 'Toplam vergi' });
        ECO.barChart($('#ch-taxdaily'), r.taxDaily.map((d) => ({ label: fmtDay(d.ts), value: d.sum, color: '#34d399' })), { vFmt: cmoney, tFmt: money, h: 200 });
        ECO.donut($('#ch-vstate'), [
            { label: 'Garajda', value: r.vehByState.garaged, color: '#34d399' },
            { label: 'Dışarıda', value: r.vehByState.out, color: '#fbbf24' },
            { label: 'Çekilmiş', value: r.vehByState.impounded, color: '#f87171' }
        ].filter((x) => x.value > 0), { centerLabel: 'Araç' });
        ECO.hbars($('#ch-models'), r.topModels.map((m) => ({ label: m.label, value: m.count })), { color: '#60a5fa' });
        ECO.hbars($('#ch-senders'), r.invSenders.map((s) => ({ label: s.label + ` (${s.count})`, value: s.sum })), { vFmt: cmoney, color: '#f87171' });
        ECO.lineChart($('#ch-online'), [{ label: 'Online', color: '#a78bfa', points: sn.map((s) => ({ x: s.ts, y: s.online })) }], { id: 'onl', h: 190, tipFmt: (v) => v + ' oyuncu', yFmt: (v) => Math.round(v) });
        ECO.lineChart($('#ch-treasury'), [
            { label: 'Hazine', color: '#34d399', points: sn.map((s) => ({ x: s.ts, y: s.treasury })) },
            { label: 'Bekleyen fatura', color: '#f87171', points: sn.map((s) => ({ x: s.ts, y: s.unpaid_sum })) }
        ], { id: 'trs', h: 190, yFmt: cmoney, areaAll: true });
    };

    // ---------- OYUNCULAR ----------
    ECO.pl = { search: '', filter: 'all', sort: 'total', dir: 'desc', page: 1 };
    const COLS = [
        ['name', 'Oyuncu'], ['cid', 'Vatandaş ID'], ['job', 'Meslek'], ['bank', 'Banka', 1], ['cash', 'Nakit', 1],
        ['total', 'Toplam', 1], ['vehicles', 'Araç', 1], ['houses', 'Ev', 1], ['invoiceSum', 'Fatura Borcu', 1], ['online', 'Durum']
    ];

    ECO.pages.players = function () {
        const main = $('#eco-main');
        main.innerHTML = `<div class="eco-h"><div><h2>Oyuncular</h2><small>Satıra tıklayarak araçlarını, faturalarını ve işlem geçmişini yönetin</small></div></div>
            <div class="toolbar">
                <input class="inp" id="pl-search" placeholder="İsim, ID veya meslek ara..." value="${esc(ECO.pl.search)}">
                <select class="sel" id="pl-filter">
                    <option value="all">Tüm oyuncular</option><option value="online">Sadece online</option><option value="debt">Faturası olanlar</option>
                    <option value="vehicles">Aracı olanlar</option><option value="exempt">Vergi muaf</option><option value="suspicious">Şüpheli bakiye</option></select>
                <button class="btn ghost" id="pl-refresh"><i class="fa-solid fa-rotate"></i> Yenile</button>
            </div><div id="pl-table"></div>`;
        $('#pl-filter').value = ECO.pl.filter;
        $('#pl-search').addEventListener('input', debounce((e) => { ECO.pl.search = e.target.value; ECO.pl.page = 1; ECO.loadPlayers(); }, 300));
        $('#pl-filter').addEventListener('change', (e) => { ECO.pl.filter = e.target.value; ECO.pl.page = 1; ECO.loadPlayers(); });
        $('#pl-refresh').addEventListener('click', () => ECO.loadPlayers(true));
        ECO.loadPlayers(true);
    };

    ECO.pager = function (el, page, pages, total, fn) {
        el.innerHTML = `<span>${total} kayıt · Sayfa ${page}/${pages}</span><div>
            <button class="btn ghost sm" data-g="1" ${page <= 1 ? 'disabled' : ''}><i class="fa-solid fa-angles-left"></i></button>
            <button class="btn ghost sm" data-g="${page - 1}" ${page <= 1 ? 'disabled' : ''}><i class="fa-solid fa-angle-left"></i></button>
            <button class="btn ghost sm" data-g="${page + 1}" ${page >= pages ? 'disabled' : ''}><i class="fa-solid fa-angle-right"></i></button>
            <button class="btn ghost sm" data-g="${pages}" ${page >= pages ? 'disabled' : ''}><i class="fa-solid fa-angles-right"></i></button></div>`;
        $$('button[data-g]', el).forEach((b) => b.addEventListener('click', () => fn(+b.dataset.g)));
    };

    ECO.loadPlayers = async function (refresh) {
        const box = $('#pl-table');
        if (!box) return;
        const r = await ECO.call('getPlayers', Object.assign({ refresh: !!refresh, pageSize: 25 }, ECO.pl));
        if (!r.ok) { box.innerHTML = `<div class="empty-box">${esc(r.error)}</div>`; return; }
        const arrow = (k) => (ECO.pl.sort === k ? (ECO.pl.dir === 'asc' ? ' ▲' : ' ▼') : '');
        box.innerHTML = `<div class="tbl-wrap"><table class="tbl"><thead><tr>${COLS.map((c) => `<th class="sortable ${c[2] ? 'num' : ''}" data-s="${c[0]}">${c[1]}${arrow(c[0])}</th>`).join('')}</tr></thead><tbody>
            ${r.rows.length ? r.rows.map((p) => `<tr class="click" data-cid="${esc(p.cid)}">
                <td><b style="color:#fff">${esc(p.name)}</b> ${p.exempt ? '<span class="badge info">MUAF</span>' : ''} ${p.suspicious ? '<span class="badge warn">ŞÜPHELİ</span>' : ''}</td>
                <td style="color:#94a3b8">${esc(p.cid)}</td><td>${esc(p.jobLabel || p.job || '-')}</td>
                <td class="num c-blue">${money(p.bank)}</td><td class="num c-amber">${money(p.cash)}</td><td class="num c-green"><b>${money(p.total)}</b></td>
                <td class="num">${p.vehicles}</td><td class="num">${p.houses}</td>
                <td class="num ${p.invoiceSum > 0 ? 'c-red' : 'c-slate'}">${p.invoiceSum > 0 ? money(p.invoiceSum) + ` (${p.invoices})` : '-'}</td>
                <td>${p.online ? `<span class="badge on">ONLINE #${p.online}</span>` : '<span class="badge off">OFFLINE</span>'}</td></tr>`).join('') : `<tr><td colspan="10" class="empty">Sonuç bulunamadı.</td></tr>`}
            </tbody></table></div><div class="pager" id="pl-pager"></div>`;
        ECO.pager($('#pl-pager'), r.page, r.pages, r.total, (pg) => { ECO.pl.page = pg; ECO.loadPlayers(); });
        $$('th[data-s]', box).forEach((th) => th.addEventListener('click', () => {
            const s = th.dataset.s;
            if (ECO.pl.sort === s) ECO.pl.dir = ECO.pl.dir === 'asc' ? 'desc' : 'asc'; else { ECO.pl.sort = s; ECO.pl.dir = 'desc'; }
            ECO.loadPlayers();
        }));
        $$('tr.click', box).forEach((tr) => tr.addEventListener('click', () => ECO.openPlayer(tr.dataset.cid)));
    };

    // ---------- OYUNCU ÇEKMECESİ ----------
    ECO.closeDrawer = function () {
        const d = $('#eco-drawer'), bg = $('#eco-dbg');
        if (d) d.classList.remove('open');
        if (bg) bg.classList.remove('open');
        ECO.curCid = null;
    };

    ECO.dtab = 'vehicles';
    ECO.openPlayer = async function (cid, keepTab) {
        const d = $('#eco-drawer');
        $('#eco-dbg').classList.add('open');
        d.classList.add('open');
        if (!keepTab) ECO.dtab = 'vehicles';
        ECO.curCid = cid;
        d.innerHTML = ECO.loading();
        const r = await ECO.call('getPlayer', { cid });
        if (!r.ok) { d.innerHTML = `<div class="empty-box">${esc(r.error)}</div>`; return; }
        ECO.cur = r;
        renderDrawer();
    };

    function renderDrawer() {
        const d = $('#eco-drawer'), r = ECO.cur, p = r.player;
        d.innerHTML = `
        <div class="dr-head"><div><h2>${esc(p.name)}</h2><p>${esc(p.cid)} · ${esc(p.jobLabel || p.job || '-')} ${p.online ? `· <span class="badge on">ONLINE #${p.online}</span>` : '· <span class="badge off">OFFLINE</span>'} ${p.exempt ? '<span class="badge info">VERGİ MUAF</span>' : ''} ${p.suspicious ? '<span class="badge warn">ŞÜPHELİ BAKİYE</span>' : ''}</p></div>
            <button class="eco-iconbtn close" id="dr-close"><i class="fa-solid fa-xmark"></i></button></div>
        <div class="mini">
            <div><small>Banka</small><b class="c-blue">${money(p.bank)}</b></div><div><small>Nakit</small><b class="c-amber">${money(p.cash)}</b></div>
            <div><small>Toplam</small><b class="c-green">${money(p.total)}</b></div><div><small>Ödediği vergi</small><b class="c-purple">${money(r.taxPaid)}</b></div>
        </div>
        <div class="grid g-2" style="margin-bottom:14px">
            <div class="card"><h3>Para İşlemi</h3>
                <div class="row" style="margin-bottom:8px"><label class="f">Hesap<select class="sel" id="dm-kind"><option value="bank">Banka</option><option value="cash">Nakit</option></select></label>
                    <label class="f">İşlem<select class="sel" id="dm-op"><option value="add">Ekle</option><option value="remove">Çıkar</option><option value="set">Ayarla (=)</option></select></label></div>
                <div class="row"><label class="f">Tutar<input class="inp" id="dm-amt" type="number" min="0" placeholder="0"></label>
                    <label class="f">Sebep<input class="inp" id="dm-reason" placeholder="Opsiyonel"></label></div>
                <button class="btn green" id="dm-go" style="margin-top:10px;width:100%;justify-content:center"><i class="fa-solid fa-check"></i> Uygula</button></div>
            <div class="card"><h3>Fatura Kes</h3>
                <div class="row" style="margin-bottom:8px"><label class="f">Tutar<input class="inp" id="di-amt" type="number" min="1" placeholder="0"></label>
                    <label class="f">Gönderen<input class="inp" id="di-sender" placeholder="Devlet Vergi Dairesi"></label></div>
                <label class="f">Açıklama<input class="inp" id="di-reason" placeholder="Fatura nedeni"></label>
                <button class="btn red" id="di-go" style="margin-top:10px;width:100%;justify-content:center"><i class="fa-solid fa-file-invoice"></i> Fatura Oluştur</button></div>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:6px">
            <button class="btn ghost sm" id="dx-exempt"><i class="fa-solid fa-shield-halved"></i> ${p.exempt ? 'Vergi muafiyetini kaldır' : 'Vergiden muaf tut'}</button>
            <button class="btn ghost sm" id="dx-forgive" ${r.invoices.length ? '' : 'disabled'}><i class="fa-solid fa-eraser"></i> Tüm faturalarını sil (${r.invoices.length})</button>
        </div>
        <div class="tabs" id="dr-tabs">
            ${[['vehicles', `Araçlar (${r.vehicles.length})`], ['invoices', `Faturalar (${r.invoices.length})`], ['tx', 'Banka İşlemleri'], ['taxes', 'Vergi Geçmişi'], ['audit', 'Admin Kayıtları']].map((t) => `<button data-t="${t[0]}" class="${ECO.dtab === t[0] ? 'active' : ''}">${t[1]}</button>`).join('')}
        </div><div id="dr-body"></div>`;
        $('#dr-close').addEventListener('click', ECO.closeDrawer);
        $('#dr-tabs').addEventListener('click', (e) => { const b = e.target.closest('button[data-t]'); if (b) { ECO.dtab = b.dataset.t; renderDrawer(); } });
        $('#dm-go').addEventListener('click', async () => {
            const amt = +$('#dm-amt').value;
            if (!(amt >= 0) || $('#dm-amt').value === '') return ECO.toast('Geçerli bir tutar girin', 'err');
            const op = $('#dm-op').value, kind = $('#dm-kind').value;
            const ok = await ECO.confirm('Para işlemini onayla', `${kind === 'bank' ? 'Banka' : 'Nakit'} hesabına ${money(amt)} ${op === 'add' ? 'EKLENECEK' : op === 'remove' ? 'ÇIKARILACAK' : 'olarak AYARLANACAK'}. Bu işlem kayıt altına alınır.`, 'Uygula');
            if (!ok) return;
            const res = await ECO.call('playerMoney', { cid: p.cid, kind, op, amount: amt, reason: $('#dm-reason').value });
            if (res.ok) { ECO.toast('Para işlemi uygulandı'); ECO.openPlayer(p.cid, true); if (ECO.page === 'players') ECO.loadPlayers(true); } else ECO.toast(res.error || 'Hata', 'err');
        });
        $('#di-go').addEventListener('click', async () => {
            const amt = +$('#di-amt').value;
            if (!(amt >= 1)) return ECO.toast('Geçerli bir tutar girin', 'err');
            const res = await ECO.call('createInvoice', { cid: p.cid, amount: amt, reason: $('#di-reason').value, senderLabel: $('#di-sender').value });
            if (res.ok) { ECO.toast('Fatura oluşturuldu'); ECO.dtab = 'invoices'; ECO.openPlayer(p.cid, true); } else ECO.toast(res.error || 'Hata', 'err');
        });
        $('#dx-exempt').addEventListener('click', async () => {
            const res = await ECO.call('toggleExempt', { cid: p.cid });
            if (res.ok) { ECO.toast(res.exempt ? 'Oyuncu vergiden muaf tutuldu' : 'Muafiyet kaldırıldı'); ECO.openPlayer(p.cid, true); } else ECO.toast(res.error || 'Hata', 'err');
        });
        $('#dx-forgive').addEventListener('click', async () => {
            if (!(await ECO.confirm('Tüm faturalar silinsin mi?', `${p.name} adlı oyuncunun ${r.invoices.length} faturası kalıcı olarak silinecek.`, 'Sil'))) return;
            const res = await ECO.call('invoiceAction', { op: 'forgiveAll', cid: p.cid });
            if (res.ok) { ECO.toast(`${res.deleted} fatura silindi`); ECO.openPlayer(p.cid, true); } else ECO.toast(res.error || 'Hata', 'err');
        });
        drawerTab();
    }

    function drawerTab() {
        const r = ECO.cur, p = r.player, b = $('#dr-body');
        const tbl = (head, rows, empty) => `<div class="tbl-wrap"><table class="tbl"><thead><tr>${head.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.length ? rows.join('') : `<tr><td colspan="${head.length}" class="empty">${empty}</td></tr>`}</tbody></table></div>`;
        if (ECO.dtab === 'vehicles') {
            b.innerHTML = tbl(['Plaka', 'Model', 'Durum', 'Garaj', 'Yakıt', 'Motor', 'Kaporta', 'İşlem'], r.vehicles.map((v) => `<tr>
                <td><b style="color:#fff">${esc(v.plate)}</b></td><td>${esc(v.label)}</td>
                <td><span class="badge ${v.stateCode === 1 ? 'on' : v.stateCode === 2 ? 'bad' : 'warn'}">${esc(v.state)}</span></td><td>${esc(v.garage)}</td>
                <td><span class="meter"><i style="width:${Math.min(100, v.fuel)}%"></i></span>${Math.round(v.fuel)}</td>
                <td><span class="meter"><i style="width:${Math.min(100, v.engine)}%;background:#60a5fa"></i></span>${v.engine}%</td>
                <td><span class="meter"><i style="width:${Math.min(100, v.body)}%;background:#fbbf24"></i></span>${v.body}%</td>
                <td><button class="btn ghost sm" data-va="garage" data-pl="${esc(v.plate)}" title="Garaja al"><i class="fa-solid fa-warehouse"></i></button>
                    <button class="btn ghost sm" data-va="transfer" data-pl="${esc(v.plate)}" title="Devret"><i class="fa-solid fa-right-left"></i></button>
                    <button class="btn red sm" data-va="delete" data-pl="${esc(v.plate)}" title="Sil"><i class="fa-solid fa-trash"></i></button></td></tr>`), 'Bu oyuncunun aracı yok.');
            $$('button[data-va]', b).forEach((btn) => btn.addEventListener('click', async () => {
                const op = btn.dataset.va, plate = btn.dataset.pl;
                let extra = {};
                if (op === 'delete' && !(await ECO.confirm('Araç silinsin mi?', `${plate} plakalı araç veritabanından KALICI olarak silinecek.`, 'Sil'))) return;
                if (op === 'transfer') {
                    const f = await ECO.modal({ title: 'Aracı devret', msg: `${plate} plakalı aracın yeni sahibinin Vatandaş ID'sini girin.`, fields: [{ key: 'target', label: 'Hedef Vatandaş ID' }], okText: 'Devret', okClass: 'blue' });
                    if (!f || !f.target) return;
                    extra.target = f.target.trim().toUpperCase();
                }
                const res = await ECO.call('vehicleAction', Object.assign({ op, plate, cid: p.cid }, extra));
                if (res.ok) { ECO.toast('İşlem tamamlandı'); ECO.openPlayer(p.cid, true); } else ECO.toast(res.error || 'Hata', 'err');
            }));
        } else if (ECO.dtab === 'invoices') {
            b.innerHTML = tbl(['#', 'Gönderen', 'Tutar', 'Açıklama', 'Tarih', ''], r.invoices.map((i) => `<tr><td>${i.id}</td><td>${esc(i.sender_name)}</td><td class="c-red"><b>${money(i.amount)}</b></td><td title="${esc(i.reason)}">${esc(i.reason)}</td><td>${esc(i.date)}</td>
                <td><button class="btn red sm" data-di="${i.id}"><i class="fa-solid fa-trash"></i></button></td></tr>`), 'Ödenmemiş fatura yok.');
            $$('button[data-di]', b).forEach((btn) => btn.addEventListener('click', async () => {
                const res = await ECO.call('invoiceAction', { op: 'delete', id: +btn.dataset.di });
                if (res.ok) { ECO.toast('Fatura silindi'); ECO.openPlayer(p.cid, true); } else ECO.toast(res.error || 'Hata', 'err');
            }));
        } else if (ECO.dtab === 'tx') {
            b.innerHTML = tbl(['Tarih', 'Tür', 'Tutar', 'Başlık', 'Mesaj'], r.transactions.map((t) => `<tr><td>${fmtDate(t.time)}</td>
                <td><span class="badge ${t.trans_type === 'deposit' ? 'on' : 'bad'}">${t.trans_type === 'deposit' ? 'GİRİŞ' : 'ÇIKIŞ'}</span></td>
                <td class="${t.trans_type === 'deposit' ? 'c-green' : 'c-red'}"><b>${money(t.amount)}</b></td><td>${esc(t.title)}</td><td title="${esc(t.message)}">${esc(t.message)}</td></tr>`), 'Banka işlemi bulunamadı.');
        } else if (ECO.dtab === 'taxes') {
            b.innerHTML = tbl(['Tarih', 'Vergi', 'Matrah', 'Tutar', 'Not'], r.taxes.map((t) => `<tr><td>${fmtDate(t.created_at)}</td><td>${esc(t.label)}</td><td>${money(t.base)}</td><td class="c-purple"><b>${money(t.amount)}</b></td><td title="${esc(t.note)}">${esc(t.note)}</td></tr>`), 'Vergi kaydı yok.');
        } else {
            b.innerHTML = tbl(['Tarih', 'Admin', 'İşlem', 'Detay'], r.audits.map((a) => `<tr><td>${fmtDate(a.created_at)}</td><td>${esc(a.admin_name)}</td><td><span class="badge info">${esc(a.action)}</span></td><td title="${esc(a.detail)}">${esc(a.detail)}</td></tr>`), 'Bu oyuncuya yapılmış admin işlemi yok.');
        }
    }

    // ---------- NUI mesajları / ESC ----------
    window.addEventListener('message', (e) => {
        const d = e.data;
        if (d && d.action === 'ecoOpen') ECO.show(d);
        if (d && d.action === 'ecoClose' && ECO.open) { ECO.dirty = false; ECO.close(); }
    });
    window.addEventListener('keydown', (e) => {
        if (!ECO.open || e.key !== 'Escape') return;
        if ($('.eco-modal-bg')) { const c = $('.eco-modal-bg [data-x="0"]'); if (c) c.click(); return; }
        if ($('#eco-drawer').classList.contains('open')) ECO.closeDrawer(); else ECO.close();
    });
})();
