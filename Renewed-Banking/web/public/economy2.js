/* ===== Ekonomi Paneli - Faturalar, Vergi Merkezi, Kayıtlar ===== */
(function () {
    const ECO = window.ECO;
    const { esc, $, $$, money, fmtDate, debounce } = ECO;

    // ================= FATURALAR =================
    ECO.inv = { search: '', sender: 'all', page: 1 };
    ECO.sel = new Set();

    ECO.pages.invoices = function () {
        ECO.sel.clear();
        $('#eco-main').innerHTML = `<div class="eco-h"><div><h2>Faturalar</h2><small>Sunucudaki tüm ödenmemiş faturalar — düzenle, sil veya toplu temizle</small></div></div>
            <div class="grid g-kpi" id="iv-sum"></div>
            <div class="toolbar"><input class="inp" id="iv-search" placeholder="Alıcı, gönderen veya açıklama ara..." value="${esc(ECO.inv.search)}">
                <select class="sel" id="iv-sender"><option value="all">Tüm gönderenler</option></select>
                <button class="btn red" id="iv-bulk" disabled><i class="fa-solid fa-trash"></i> Seçilenleri sil (<span id="iv-cnt">0</span>)</button>
                <button class="btn ghost" id="iv-ref"><i class="fa-solid fa-rotate"></i></button></div>
            <div id="iv-table"></div>`;
        $('#iv-search').addEventListener('input', debounce((e) => { ECO.inv.search = e.target.value; ECO.inv.page = 1; ECO.loadInvoices(); }, 300));
        $('#iv-sender').addEventListener('change', (e) => { ECO.inv.sender = e.target.value; ECO.inv.page = 1; ECO.loadInvoices(); });
        $('#iv-ref').addEventListener('click', () => ECO.loadInvoices());
        $('#iv-bulk').addEventListener('click', async () => {
            const ids = Array.from(ECO.sel);
            if (!ids.length) return;
            if (!(await ECO.confirm('Faturalar silinsin mi?', `${ids.length} fatura kalıcı olarak silinecek.`, 'Sil'))) return;
            const r = await ECO.call('invoiceAction', { op: 'delete', ids });
            if (r.ok) { ECO.toast(`${r.deleted} fatura silindi`); ECO.sel.clear(); ECO.loadInvoices(); } else ECO.toast(r.error || 'Hata', 'err');
        });
        ECO.loadInvoices();
    };

    function syncSel() {
        const b = $('#iv-bulk');
        if (!b) return;
        $('#iv-cnt').textContent = ECO.sel.size;
        b.disabled = ECO.sel.size === 0;
    }

    ECO.loadInvoices = async function () {
        const box = $('#iv-table');
        if (!box) return;
        const r = await ECO.call('getInvoices', ECO.inv);
        if (!r.ok) { box.innerHTML = `<div class="empty-box">${esc(r.error)}</div>`; return; }
        const sel = $('#iv-sender');
        if (sel.options.length <= 1) {
            (r.senders || []).forEach((s) => { const o = document.createElement('option'); o.value = s.sender; o.textContent = s.sender_name || s.sender; sel.appendChild(o); });
            sel.value = ECO.inv.sender;
        }
        $('#iv-sum').innerHTML = `<div class="card kpi"><div class="lbl"><i class="fa-solid fa-file-invoice-dollar c-red"></i>Filtredeki Toplam Borç</div><div class="val c-red">${money(r.sum)}</div><div class="note">${r.total} fatura</div></div>`;
        box.innerHTML = `<div class="tbl-wrap"><table class="tbl"><thead><tr><th><input type="checkbox" id="iv-all"></th><th>#</th><th>Alıcı</th><th>Gönderen</th><th class="num">Tutar</th><th>Açıklama</th><th>Tarih</th><th></th></tr></thead><tbody>
            ${r.rows.length ? r.rows.map((i) => `<tr><td><input type="checkbox" class="iv-c" data-id="${i.id}" ${ECO.sel.has(i.id) ? 'checked' : ''}></td><td>${i.id}</td>
                <td><a href="#" class="c-blue" data-cid="${esc(i.receiver)}">${esc(i.receiver_name)}</a></td><td>${esc(i.sender_name)}</td>
                <td class="num c-red"><b>${money(i.amount)}</b></td><td title="${esc(i.reason)}">${esc(i.reason)}</td><td>${esc(i.date)}</td>
                <td><button class="btn ghost sm" data-e="${i.id}" data-a="${i.amount}" data-r="${esc(i.reason)}"><i class="fa-solid fa-pen"></i></button>
                    <button class="btn red sm" data-d="${i.id}"><i class="fa-solid fa-trash"></i></button></td></tr>`).join('') : '<tr><td colspan="8" class="empty">Fatura bulunamadı.</td></tr>'}
            </tbody></table></div><div class="pager" id="iv-pager"></div>`;
        ECO.pager($('#iv-pager'), r.page, r.pages, r.total, (pg) => { ECO.inv.page = pg; ECO.loadInvoices(); });
        syncSel();
        $('#iv-all').addEventListener('change', (e) => { $$('.iv-c', box).forEach((c) => { c.checked = e.target.checked; e.target.checked ? ECO.sel.add(+c.dataset.id) : ECO.sel.delete(+c.dataset.id); }); syncSel(); });
        $$('.iv-c', box).forEach((c) => c.addEventListener('change', () => { c.checked ? ECO.sel.add(+c.dataset.id) : ECO.sel.delete(+c.dataset.id); syncSel(); }));
        $$('a[data-cid]', box).forEach((a) => a.addEventListener('click', (e) => { e.preventDefault(); ECO.openPlayer(a.dataset.cid); }));
        $$('button[data-d]', box).forEach((b) => b.addEventListener('click', async () => {
            const res = await ECO.call('invoiceAction', { op: 'delete', id: +b.dataset.d });
            if (res.ok) { ECO.toast('Fatura silindi'); ECO.loadInvoices(); } else ECO.toast(res.error || 'Hata', 'err');
        }));
        $$('button[data-e]', box).forEach((b) => b.addEventListener('click', async () => {
            const f = await ECO.modal({ title: `Fatura #${b.dataset.e} düzenle`, fields: [{ key: 'amount', label: 'Tutar ($)', type: 'number', value: b.dataset.a }, { key: 'reason', label: 'Açıklama', value: b.dataset.r }], okText: 'Kaydet', okClass: 'green' });
            if (!f) return;
            const res = await ECO.call('invoiceAction', { op: 'edit', id: +b.dataset.e, amount: +f.amount, reason: f.reason });
            if (res.ok) { ECO.toast('Fatura güncellendi'); ECO.loadInvoices(); } else ECO.toast(res.error || 'Hata', 'err');
        }));
    };

    // ================= VERGİ MERKEZİ =================
    const getP = (o, p) => p.split('.').reduce((a, k) => (a == null ? a : a[k]), o);
    const setP = (o, p, v) => { const ks = p.split('.'); const l = ks.pop(); const t = ks.reduce((a, k) => (a[k] = a[k] || {}), o); t[l] = v; };
    const markDirty = () => { ECO.dirty = true; const s = $('#tx-save'); if (s) s.classList.add('show'); };

    ECO.pages.tax = async function (force) {
        const main = $('#eco-main');
        if (!ECO.workCfg || force) {
            main.innerHTML = ECO.loading();
            const r = await ECO.call('getConfig');
            if (!r.ok) { main.innerHTML = `<div class="empty-box">${esc(r.error)}</div>`; return; }
            ECO.cfgMeta = r;
            ECO.workCfg = JSON.parse(JSON.stringify(r.config));
            ECO.dirty = false;
        }
        renderTax();
    };

    const num = (path, label, o) => {
        o = o || {};
        return `<label class="f">${label}<input class="inp" type="number" step="${o.step || 'any'}" min="0" ${o.max != null ? `max="${o.max}"` : ''} data-path="${path}" data-t="num" value="${esc(getP(ECO.workCfg, path) ?? 0)}">${o.hint ? `<small>${o.hint}</small>` : ''}</label>`;
    };
    const sel = (path, label, opts, hint) => `<label class="f">${label}<select class="sel" data-path="${path}" data-t="str">${opts.map((o) => `<option value="${o[0]}" ${getP(ECO.workCfg, path) === o[0] ? 'selected' : ''}>${o[1]}</option>`).join('')}</select>${hint ? `<small>${hint}</small>` : ''}</label>`;
    const sw = (path, label) => `<label style="display:flex;align-items:center;gap:10px;font-size:12.5px;color:#cbd5e1;cursor:pointer"><span class="sw"><input type="checkbox" data-path="${path}" data-t="bool" ${getP(ECO.workCfg, path) ? 'checked' : ''}><span></span></span>${label}</label>`;
    const MODE = [['invoice', 'Fatura kes (oyuncu öder)'], ['direct', 'Doğrudan hesaptan çek']];

    function taxCard(key, icon, title, desc, fieldsHtml, extra) {
        const on = !!getP(ECO.workCfg, `taxes.${key}.enabled`);
        const lr = ECO.cfgMeta.lastRun[key];
        return `<div class="card tax-card ${on ? '' : 'disabled'}" data-key="${key}">
            <div class="hd"><h4><i class="fa-solid ${icon} c-red"></i>${title}</h4>
                <label class="sw"><input type="checkbox" data-path="taxes.${key}.enabled" data-t="bool" ${on ? 'checked' : ''}><span></span></label></div>
            <p class="desc">${desc}</p><div class="fields" style="display:flex;flex-direction:column;gap:12px">${fieldsHtml}${extra || ''}</div>
            ${lr ? `<div style="font-size:11px;color:#64748b">Son otomatik çalışma: ${fmtDate(lr)}</div>` : ''}</div>`;
    }

    function runBtns(key) {
        return `<div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn ghost sm" data-prev="${key}"><i class="fa-solid fa-eye"></i> Önizle</button>
            <button class="btn amber sm" data-run="${key}"><i class="fa-solid fa-play"></i> Şimdi Uygula</button></div>
            <div class="desc" id="prev-${key}" style="margin:0"></div>`;
    }

    function jobName(n) {
        const j = ECO.cfgMeta.jobs.find((x) => x.name === n);
        return j ? `${j.label} (${n})` : n;
    }

    function jobList(path, title, hint) {
        const arr = getP(ECO.workCfg, path) || [];
        const opts = ECO.cfgMeta.jobs.filter((j) => !arr.includes(j.name));
        return `<div class="card"><h3>${title}</h3><p class="desc" style="margin-top:-4px;margin-bottom:10px">${hint}</p>
            <div data-list="${path}" style="min-height:30px">${arr.length ? arr.map((n, i) => `<span class="chip">${esc(jobName(n))}<button data-rm="${path}" data-i="${i}"><i class="fa-solid fa-xmark"></i></button></span>`).join('') : '<span style="color:#64748b;font-size:12px">Hiç meslek yok</span>'}</div>
            <div class="row" style="margin-top:8px"><select class="sel sm" data-addsel="${path}"><option value="">Meslek seç...</option>${opts.map((j) => `<option value="${esc(j.name)}">${esc(j.label)} (${esc(j.name)})</option>`).join('')}</select>
            <input class="inp sm" data-addtxt="${path}" placeholder="veya elle yaz (ör: taxi)"><button class="btn green sm fix" data-add="${path}"><i class="fa-solid fa-plus"></i> Ekle</button></div></div>`;
    }

    function renderTax() {
        const C = ECO.workCfg, M = ECO.cfgMeta;
        const jr = C.taxes.invoice.jobRates || {};
        const br = C.taxes.wealth.brackets || [];
        const reasons = C.taxes.salary.reasons || [];
        const main = $('#eco-main');
        const st = main.scrollTop;
        main.innerHTML = `
        <div class="eco-h"><div><h2>Vergi Merkezi</h2><small>Her vergiyi aç/kapat, oranını belirle. Kaydedince sunucuda anında geçerli olur (restart gerekmez).</small></div>
            <div style="display:flex;gap:8px"><button class="btn ghost" id="tx-revert"><i class="fa-solid fa-rotate-left"></i> Geri al</button><button class="btn green" id="tx-save2"><i class="fa-solid fa-floppy-disk"></i> Kaydet</button></div></div>

        <div class="sec-title">İşlem Vergileri</div>
        <div class="grid g-2">
        ${taxCard('transfer', 'fa-money-bill-transfer', M.labels.transfer, 'Banka transferlerinden kesilir. Karşı tarafa <b>tutar − vergi</b> ulaşır, vergi hazineye gider.',
            `<div class="row">${num('taxes.transfer.rate', 'Oran (%)', { max: 100 })}${num('taxes.transfer.min', 'Min. vergi ($)', { hint: '0 = yok' })}${num('taxes.transfer.max', 'Maks. vergi ($)', { hint: '0 = limitsiz' })}</div>`)}
        ${taxCard('invoice', 'fa-file-invoice-dollar', M.labels.invoice, 'Fatura ödendiğinde kesilir; faturayı kesen mesleğe <b>tutar − vergi</b> gider. Meslek bazında özel oran verebilirsiniz.',
            `<div class="row">${num('taxes.invoice.rate', 'Varsayılan oran (%)', { max: 100 })}</div>
             <div><div style="font-size:11px;color:#94a3b8;font-weight:600;text-transform:uppercase;margin-bottom:6px">Meslek bazlı özel oranlar</div>
             ${Object.keys(jr).length ? Object.keys(jr).map((k) => `<span class="chip">${esc(jobName(k))}: <b>%${jr[k]}</b><button data-rmjr="${esc(k)}"><i class="fa-solid fa-xmark"></i></button></span>`).join('') : '<span style="color:#64748b;font-size:12px">Özel oran yok (hepsi varsayılanı kullanır)</span>'}
             <div class="row" style="margin-top:8px"><select class="sel sm" id="jr-job"><option value="">Meslek...</option>${M.jobs.map((j) => `<option value="${esc(j.name)}">${esc(j.label)}</option>`).join('')}</select><input class="inp sm" id="jr-rate" type="number" min="0" max="100" placeholder="% oran"><button class="btn green sm fix" id="jr-add">Ekle</button></div></div>`)}
        ${taxCard('deposit', 'fa-arrow-down-to-bracket', M.labels.deposit, 'ATM/banka\'dan nakit yatırılırken kesilir.', `<div class="row">${num('taxes.deposit.rate', 'Oran (%)', { max: 100 })}</div>`)}
        ${taxCard('withdraw', 'fa-arrow-up-from-bracket', M.labels.withdraw, 'ATM/banka\'dan nakit çekilirken kesilir.', `<div class="row">${num('taxes.withdraw.rate', 'Oran (%)', { max: 100 })}</div>`)}
        </div>

        <div class="sec-title">Araç & Mülk Vergileri</div>
        <div class="grid g-3">
        ${taxCard('vehicleSpawn', 'fa-car-side', M.labels.vehicleSpawn, 'Garajdan araç çıkarırken alınır. Garaj scriptine export eklenmesi gerekir (aşağıda).',
            `<div class="row">${num('taxes.vehicleSpawn.flat', 'Sabit ücret ($)')}${num('taxes.vehicleSpawn.rate', 'Araç değeri %', { max: 100, hint: 'Değer verilirse' })}</div>`,
            `<code style="font-size:10.5px;color:#fca5a5;background:#0f172a;padding:8px;border-radius:8px;display:block;white-space:pre-wrap;user-select:text">if not exports['Renewed-Banking']:ChargeVehicleSpawn(source, plate) then return end</code>`)}
        ${taxCard('vehicleOwn', 'fa-car', M.labels.vehicleOwn, 'Sahip olunan <b>her araç</b> için periyodik vergi.',
            `<div class="row">${num('taxes.vehicleOwn.flat', 'Araç başına ($)')}${num('taxes.vehicleOwn.interval', 'Periyot (saat)')}</div>${sel('taxes.vehicleOwn.mode', 'Tahsilat', MODE)}${sw('taxes.vehicleOwn.includeOffline', 'Offline oyunculara da uygula')}`, runBtns('vehicleOwn'))}
        ${taxCard('houseOwn', 'fa-house', M.labels.houseOwn, 'Sahip olunan <b>her ev/mülk</b> için periyodik vergi.',
            `<div class="row">${num('taxes.houseOwn.flat', 'Mülk başına ($)')}${num('taxes.houseOwn.interval', 'Periyot (saat)')}</div>${sel('taxes.houseOwn.mode', 'Tahsilat', MODE)}${sw('taxes.houseOwn.includeOffline', 'Offline oyunculara da uygula')}`, runBtns('houseOwn'))}
        </div>

        <div class="sec-title">Gelir & Servet Vergileri</div>
        <div class="grid g-2">
        ${taxCard('salary', 'fa-money-check-dollar', M.labels.salary, 'Maaş (paycheck) olarak bankaya yatan paradan yüzde keser. Açıklaması aşağıdaki kelimelerden birini içeren para girişleri vergilendirilir.',
            `<div class="row">${num('taxes.salary.rate', 'Oran (%)', { max: 100 })}</div>
             <div><div style="font-size:11px;color:#94a3b8;font-weight:600;text-transform:uppercase;margin-bottom:6px">Tetikleyici kelimeler</div>
             ${reasons.map((r, i) => `<span class="chip">${esc(r)}<button data-rmrs="${i}"><i class="fa-solid fa-xmark"></i></button></span>`).join('')}
             <div class="row" style="margin-top:8px"><input class="inp sm" id="rs-txt" placeholder="ör: paycheck"><button class="btn green sm fix" id="rs-add">Ekle</button></div></div>`)}
        ${taxCard('wealth', 'fa-sack-dollar', M.labels.wealth, 'Banka + nakit toplamı üzerinden periyodik alınır. Kademe eklerseniz düz oran yerine <b>kademeli (marjinal)</b> hesap kullanılır.',
            `<div class="row">${num('taxes.wealth.rate', 'Düz oran (%)', { max: 100 })}${num('taxes.wealth.threshold', 'Muaf sınır ($)', { hint: 'Altı vergilenmez' })}${num('taxes.wealth.interval', 'Periyot (saat)')}</div>
             ${sel('taxes.wealth.mode', 'Tahsilat', MODE)}
             <div style="display:flex;gap:18px;flex-wrap:wrap">${sw('taxes.wealth.countBank', 'Bankayı say')}${sw('taxes.wealth.countCash', 'Nakiti say')}${sw('taxes.wealth.includeOffline', 'Offline oyuncular da')}</div>
             <div><div style="font-size:11px;color:#94a3b8;font-weight:600;text-transform:uppercase;margin-bottom:6px">Kademeli oranlar <span style="text-transform:none;font-weight:400;color:#64748b">(ör. $0'dan itibaren %1, $100.000'dan itibaren %3)</span></div>
             ${br.map((b, i) => `<div class="br-row"><input class="inp sm" type="number" min="0" data-br="${i}" data-f="from" value="${b.from}" placeholder="Bu tutardan itibaren ($)"><input class="inp sm" type="number" min="0" max="100" data-br="${i}" data-f="rate" value="${b.rate}" placeholder="Oran %"><button class="btn red sm" data-rmbr="${i}"><i class="fa-solid fa-trash"></i></button></div>`).join('')}
             <button class="btn ghost sm" id="br-add"><i class="fa-solid fa-plus"></i> Kademe ekle</button></div>`, runBtns('wealth'))}
        </div>

        <div class="sec-title">Hazine, Limitler & Muafiyetler</div>
        <div class="grid g-3">
            <div class="card"><h3>Devlet Hazinesi</h3><div style="display:flex;flex-direction:column;gap:12px">
                ${sw('treasury.enabled', 'Vergiler hazineye yatsın')}
                <label class="f">Hesap ID<input class="inp" data-path="treasury.account" data-t="str" value="${esc(C.treasury.account)}"><small>Kurum hesabı olarak oluşturulur (ör. government)</small></label>
                <label class="f">Hesap adı<input class="inp" data-path="treasury.label" data-t="str" value="${esc(C.treasury.label)}"></label>
                <div style="font-size:12px;color:#94a3b8">Güncel bakiye: <b class="c-green">${money(M.treasuryBalance != null ? M.treasuryBalance : (ECO.lastOverview ? ECO.lastOverview.kpi.treasury : 0))}</b></div></div></div>
            <div class="card"><h3>Fatura Limitleri & Genel</h3><div style="display:flex;flex-direction:column;gap:12px">
                ${num('invoice.minAmount', 'Min. fatura tutarı ($)')}${num('invoice.maxAmount', 'Maks. fatura tutarı ($)', { hint: '0 = limitsiz' })}${num('snapshotInterval', 'İstatistik kayıt aralığı (dk)', { hint: 'Grafik geçmişi için, min 5' })}</div></div>
            <div class="card"><h3>Muaf Kişiler (Vatandaş ID)</h3>
                <p class="desc" style="margin-top:-4px;margin-bottom:10px">Tüm vergilerden muaf tutulan karakterler. Oyuncu detayından da ekleyebilirsiniz.</p>
                <div>${(C.exempt.citizenids || []).length ? C.exempt.citizenids.map((c, i) => `<span class="chip">${esc(c)}<button data-rmex="${i}"><i class="fa-solid fa-xmark"></i></button></span>`).join('') : '<span style="color:#64748b;font-size:12px">Kimse yok</span>'}</div>
                <div class="row" style="margin-top:8px"><input class="inp sm" id="ex-txt" placeholder="ABC12345"><button class="btn green sm fix" id="ex-add">Ekle</button></div></div>
        </div>
        <div class="grid g-2" style="margin-top:16px">
            ${jobList('allowedJobs', 'Fatura Kesebilen Meslekler', '/fatura komutunu kullanabilen meslekler.')}
            ${jobList('exempt.jobs', 'Vergiden Muaf Meslekler', 'Bu mesleklerdeki oyuncular hiçbir vergiye tabi olmaz (ör. polis, ambulans).')}
        </div>
        <div class="savebar ${ECO.dirty ? 'show' : ''}" id="tx-save"><i class="fa-solid fa-triangle-exclamation c-red"></i><span>Kaydedilmemiş değişiklikleriniz var.</span><button class="btn ghost" id="tx-revert2">Geri al</button><button class="btn green" id="tx-save3"><i class="fa-solid fa-floppy-disk"></i> Kaydet</button></div>`;
        main.scrollTop = st;
        bindTax();
    }

    function bindTax() {
        const main = $('#eco-main');
        // genel inputlar
        $$('[data-path]', main).forEach((el) => {
            const handler = () => {
                const t = el.dataset.t;
                let v = el.value;
                if (t === 'bool') v = el.checked; else if (t === 'num') v = el.value === '' ? 0 : Number(el.value);
                setP(ECO.workCfg, el.dataset.path, v);
                markDirty();
                if (el.dataset.path.endsWith('.enabled') && el.closest('.tax-card')) el.closest('.tax-card').classList.toggle('disabled', !v);
            };
            el.addEventListener(el.type === 'checkbox' || el.tagName === 'SELECT' ? 'change' : 'input', handler);
        });
        const rerender = () => { markDirty(); renderTax(); };
        // meslek listeleri
        $$('[data-rm]', main).forEach((b) => b.addEventListener('click', () => { getP(ECO.workCfg, b.dataset.rm).splice(+b.dataset.i, 1); rerender(); }));
        $$('[data-add]', main).forEach((b) => b.addEventListener('click', () => {
            const p = b.dataset.add;
            const v = ($(`[data-addtxt="${p}"]`).value.trim()) || $(`[data-addsel="${p}"]`).value;
            if (!v) return;
            const arr = getP(ECO.workCfg, p);
            if (!arr.includes(v)) arr.push(v);
            rerender();
        }));
        // fatura meslek oranı
        $$('[data-rmjr]', main).forEach((b) => b.addEventListener('click', () => { delete ECO.workCfg.taxes.invoice.jobRates[b.dataset.rmjr]; rerender(); }));
        const jra = $('#jr-add');
        if (jra) jra.addEventListener('click', () => {
            const j = $('#jr-job').value, r = $('#jr-rate').value;
            if (!j || r === '') return ECO.toast('Meslek ve oran girin', 'err');
            ECO.workCfg.taxes.invoice.jobRates = ECO.workCfg.taxes.invoice.jobRates || {};
            ECO.workCfg.taxes.invoice.jobRates[j] = Number(r);
            rerender();
        });
        // maaş kelimeleri
        $$('[data-rmrs]', main).forEach((b) => b.addEventListener('click', () => { ECO.workCfg.taxes.salary.reasons.splice(+b.dataset.rmrs, 1); rerender(); }));
        const rsa = $('#rs-add');
        if (rsa) rsa.addEventListener('click', () => { const v = $('#rs-txt').value.trim(); if (!v) return; ECO.workCfg.taxes.salary.reasons.push(v); rerender(); });
        // kademeler
        const bra = $('#br-add');
        if (bra) bra.addEventListener('click', () => { const b = ECO.workCfg.taxes.wealth.brackets = ECO.workCfg.taxes.wealth.brackets || []; b.push({ from: b.length ? (Number(b[b.length - 1].from) || 0) + 100000 : 0, rate: 1 }); rerender(); });
        $$('[data-rmbr]', main).forEach((b) => b.addEventListener('click', () => { ECO.workCfg.taxes.wealth.brackets.splice(+b.dataset.rmbr, 1); rerender(); }));
        $$('[data-br]', main).forEach((i) => i.addEventListener('input', () => { ECO.workCfg.taxes.wealth.brackets[+i.dataset.br][i.dataset.f] = Number(i.value) || 0; markDirty(); }));
        // muaf kişi
        $$('[data-rmex]', main).forEach((b) => b.addEventListener('click', () => { ECO.workCfg.exempt.citizenids.splice(+b.dataset.rmex, 1); rerender(); }));
        const exa = $('#ex-add');
        if (exa) exa.addEventListener('click', () => { const v = $('#ex-txt').value.trim().toUpperCase(); if (!v) return; if (!ECO.workCfg.exempt.citizenids.includes(v)) ECO.workCfg.exempt.citizenids.push(v); rerender(); });
        // kaydet / geri al
        const save = async () => {
            const r = await ECO.call('saveConfig', { config: ECO.workCfg });
            if (r.ok) { ECO.toast('Ayarlar kaydedildi ve uygulandı'); ECO.cfgMeta.config = r.config; ECO.workCfg = JSON.parse(JSON.stringify(r.config)); ECO.dirty = false; renderTax(); }
            else ECO.toast(r.error || 'Kaydedilemedi', 'err');
        };
        const revert = () => { ECO.workCfg = JSON.parse(JSON.stringify(ECO.cfgMeta.config)); ECO.dirty = false; renderTax(); ECO.toast('Değişiklikler geri alındı', 'info'); };
        ['tx-save2', 'tx-save3'].forEach((id) => $('#' + id).addEventListener('click', save));
        ['tx-revert', 'tx-revert2'].forEach((id) => $('#' + id).addEventListener('click', revert));
        // önizle / çalıştır
        $$('[data-prev]', main).forEach((b) => b.addEventListener('click', async () => {
            if (ECO.dirty) return ECO.toast('Önce ayarları kaydedin', 'err');
            const r = await ECO.call('previewTax', { key: b.dataset.prev });
            $('#prev-' + b.dataset.prev).innerHTML = r.ok ? `Şu an uygulansa: <b class="c-amber">${r.count} kişi</b> · toplam <b class="c-green">${money(r.sum)}</b>` : esc(r.error);
        }));
        $$('[data-run]', main).forEach((b) => b.addEventListener('click', async () => {
            if (ECO.dirty) return ECO.toast('Önce ayarları kaydedin', 'err');
            const key = b.dataset.run;
            const pv = await ECO.call('previewTax', { key });
            if (!pv.ok) return ECO.toast(pv.error || 'Hata', 'err');
            if (!(await ECO.confirm('Vergi şimdi uygulansın mı?', `${pv.count} kişiye toplam ${money(pv.sum)} vergi uygulanacak (periyot sayacı sıfırlanır).`, 'Uygula'))) return;
            const r = await ECO.call('runTax', { key });
            if (r.ok) { ECO.toast(`${r.count} kişiye ${money(r.sum)} vergi uygulandı`); ECO.pages.tax(true); } else ECO.toast(r.error || 'Hata', 'err');
        }));
    }

    // ================= KAYITLAR =================
    ECO.lg = { kind: 'tax', search: '', key: 'all', page: 1 };
    ECO.pages.logs = function () {
        $('#eco-main').innerHTML = `<div class="eco-h"><div><h2>Kayıtlar</h2><small>Tahsil edilen vergiler ve adminlerin yaptığı tüm işlemler</small></div></div>
            <div class="tabs"><button data-k="tax" class="${ECO.lg.kind === 'tax' ? 'active' : ''}">Vergi Kayıtları</button><button data-k="audit" class="${ECO.lg.kind === 'audit' ? 'active' : ''}">Admin Denetim Kaydı</button></div>
            <div class="toolbar"><input class="inp" id="lg-search" placeholder="Ara..." value="${esc(ECO.lg.search)}">
            <select class="sel" id="lg-key" style="${ECO.lg.kind === 'tax' ? '' : 'display:none'}"><option value="all">Tüm vergiler</option>${Object.entries((ECO.cfgMeta && ECO.cfgMeta.labels) || { transfer: 'Transfer', invoice: 'Fatura', wealth: 'Varlık', vehicleOwn: 'Araç', houseOwn: 'Mülk', vehicleSpawn: 'Araç çıkarma', salary: 'Maaş', deposit: 'Yatırma', withdraw: 'Çekme' }).map((e) => `<option value="${e[0]}">${e[1]}</option>`).join('')}</select></div>
            <div id="lg-table"></div>`;
        $('#lg-key').value = ECO.lg.key;
        $$('.tabs button').forEach((b) => b.addEventListener('click', () => { ECO.lg.kind = b.dataset.k; ECO.lg.page = 1; ECO.pages.logs(); }));
        $('#lg-search').addEventListener('input', debounce((e) => { ECO.lg.search = e.target.value; ECO.lg.page = 1; loadLogs(); }, 300));
        $('#lg-key').addEventListener('change', (e) => { ECO.lg.key = e.target.value; ECO.lg.page = 1; loadLogs(); });
        loadLogs();
    };

    async function loadLogs() {
        const box = $('#lg-table');
        const r = await ECO.call('getLogs', ECO.lg);
        if (!r.ok) { box.innerHTML = `<div class="empty-box">${esc(r.error)}</div>`; return; }
        const head = ECO.lg.kind === 'tax' ? ['Tarih', 'Vergi', 'Oyuncu', 'ID', 'Matrah', 'Tutar', 'Not'] : ['Tarih', 'Admin', 'İşlem', 'Hedef', 'Detay'];
        const rows = ECO.lg.kind === 'tax'
            ? r.rows.map((x) => `<tr><td>${fmtDate(x.created_at)}</td><td><span class="badge info">${esc(x.label)}</span></td><td>${esc(x.name || '-')}</td><td style="color:#94a3b8">${esc(x.citizenid || '-')}</td><td>${money(x.base)}</td><td class="c-green"><b>${money(x.amount)}</b></td><td title="${esc(x.note)}">${esc(x.note || '')}</td></tr>`)
            : r.rows.map((x) => `<tr><td>${fmtDate(x.created_at)}</td><td>${esc(x.admin_name)} <span style="color:#64748b">${esc(x.admin_cid)}</span></td><td><span class="badge warn">${esc(x.action)}</span></td><td>${esc(x.target || '-')}</td><td title="${esc(x.detail)}">${esc(x.detail || '')}</td></tr>`);
        box.innerHTML = `<div class="tbl-wrap"><table class="tbl"><thead><tr>${head.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.length ? rows.join('') : `<tr><td colspan="${head.length}" class="empty">Kayıt yok.</td></tr>`}</tbody></table></div><div class="pager" id="lg-pager"></div>`;
        ECO.pager($('#lg-pager'), r.page, r.pages, r.total, (pg) => { ECO.lg.page = pg; loadLogs(); });
    }
})();
