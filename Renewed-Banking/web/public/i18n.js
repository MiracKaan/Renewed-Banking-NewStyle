/* ===== Renewed-Banking | Arayüz çeviri katmanı =====
 * Dil, config.lua içindeki Config.locale değerinden gelir (Lua -> NUI).
 * Kaynak metinler Türkçedir. Config.locale = 'tr' ise hiçbir çeviri uygulanmaz.
 * Diğer diller için lang/<kod>.json dosyası yüklenir; dosya yoksa lang/en.json kullanılır.
 *
 * Sözlük biçimi:  "Türkçe metin": "Çeviri"
 *   {0} {1}   -> herhangi bir metin parçası (yakalanır, çeviride aynı numarayla geri yazılır)
 *   {n0} {n1} -> sayı (rakam, nokta, virgül)
 * Yakalanan parça sözlükte birebir varsa o da çevrilir.
 */
(function () {
    'use strict';
    const RES = typeof GetParentResourceName === 'function' ? GetParentResourceName() : 'Renewed-Banking';
    const SKIP = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'NOSCRIPT', 'CODE']);
    const ATTRS = ['placeholder', 'title', 'aria-label', 'alt'];
    const ATTR_SEL = ATTRS.map((a) => '[' + a + ']').join(',');
    const NUM = '[-+]?[\\d.,]+';
    const DATE_LOCALES = { en: 'en-GB', tr: 'tr-TR', pt: 'pt-PT', sr: 'sr-RS' };

    const I18N = (window.I18N = { locale: null, dateLocale: 'tr-TR', active: false });
    let exact = new Map();
    let patterns = [];
    let token = 0;
    const done = new WeakMap(); // text node -> son yazdığımız çıktı

    const norm = (s) => s.replace(/\s+/g, ' ').trim();
    const rxEsc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    function compile(dict) {
        exact = new Map();
        patterns = [];
        Object.keys(dict).forEach((k) => {
            const key = norm(k);
            const val = dict[k];
            if (typeof val !== 'string') return;
            if (/\{n?\d+\}/.test(key)) {
                const names = [];
                let re = '', last = 0;
                key.replace(/\{(n?)(\d+)\}/g, (m, n, idx, off) => {
                    re += rxEsc(key.slice(last, off)) + (n ? '(' + NUM + ')' : '(.+?)');
                    names.push(idx);
                    last = off + m.length;
                    return m;
                });
                re += rxEsc(key.slice(last));
                patterns.push({ re: new RegExp('^' + re + '$'), names, out: val, len: key.length });
            } else {
                exact.set(key, val);
            }
        });
        patterns.sort((a, b) => b.len - a.len);
    }

    function lookup(core) {
        let hit = exact.get(core);
        if (hit !== undefined) return hit;
        for (let i = 0; i < patterns.length; i++) {
            const p = patterns[i];
            const m = p.re.exec(core);
            if (!m) continue;
            return p.out.replace(/\{n?(\d+)\}/g, (x, idx) => {
                const at = p.names.indexOf(idx);
                const cap = at >= 0 ? m[at + 1] : '';
                const sub = exact.get(norm(cap));
                return sub !== undefined ? sub : cap;
            });
        }
        return null;
    }

    function translate(core) {
        const m = /^(.*?)(\s*[▲▼])$/.exec(core); // sıralama oku
        if (m && m[1]) {
            const t = lookup(m[1]);
            return t == null ? null : t + m[2];
        }
        return lookup(core);
    }

    function textNode(n) {
        const p = n.parentNode;
        if (!p || SKIP.has(p.nodeName)) return;
        const v = n.nodeValue;
        if (!v || !/\S/.test(v)) return;
        if (done.get(n) === v) return;
        const core = norm(v);
        const out = translate(core);
        if (out == null || out === core) return;
        const res = v.match(/^\s*/)[0] + out + v.match(/\s*$/)[0];
        done.set(n, res);
        n.nodeValue = res;
    }

    function attrs(el) {
        if (!el || el.nodeType !== 1) return;
        for (let i = 0; i < ATTRS.length; i++) {
            const a = ATTRS[i];
            if (!el.hasAttribute(a)) continue;
            const v = el.getAttribute(a);
            const core = norm(v || '');
            if (!core) continue;
            const out = translate(core);
            if (out != null && out !== core && out !== v) el.setAttribute(a, out);
        }
    }

    function walk(root) {
        if (!I18N.active || !root) return;
        if (root.nodeType === 3) { textNode(root); return; }
        if (root.nodeType !== 1 && root.nodeType !== 9 && root.nodeType !== 11) return;
        const tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
        let n;
        while ((n = tw.nextNode())) textNode(n);
        if (root.nodeType === 1) attrs(root);
        if (root.querySelectorAll) root.querySelectorAll(ATTR_SEL).forEach(attrs);
    }

    new MutationObserver((muts) => {
        if (!I18N.active) return;
        for (let i = 0; i < muts.length; i++) {
            const m = muts[i];
            if (m.type === 'characterData') textNode(m.target);
            else if (m.type === 'attributes') attrs(m.target);
            else m.addedNodes.forEach(walk);
        }
    }).observe(document.documentElement, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });

    async function load(code) {
        try {
            const r = await fetch('lang/' + code + '.json', { cache: 'no-cache' });
            if (!r.ok) return null;
            return await r.json();
        } catch (e) { return null; }
    }

    I18N.t = function (s) {
        if (!I18N.active) return s;
        const out = translate(norm(String(s)));
        return out == null ? s : out;
    };

    I18N.setLocale = async function (code) {
        code = String(code || '').toLowerCase().replace(/[^a-z_-]/g, '');
        if (!code || code === I18N.locale) return;
        I18N.locale = code;
        I18N.dateLocale = DATE_LOCALES[code] || code;
        document.documentElement.lang = code;
        const my = ++token;
        if (code === 'tr') { I18N.active = false; return; } // kaynak dil
        let dict = await load(code);
        if (!dict && code !== 'en') dict = await load('en');
        if (my !== token) return;
        if (!dict) { I18N.active = false; return; }
        compile(dict);
        I18N.active = true;
        walk(document.body || document.documentElement);
    };

    window.addEventListener('message', (e) => {
        const d = e.data;
        if (d && typeof d.locale === 'string') I18N.setLocale(d.locale);
    });

    // Sayfa açılır açılmaz Lua'dan dili iste (NUI mesajı kaçırılırsa diye tekrar dene)
    (async function boot() {
        for (let i = 0; i < 30 && !I18N.locale; i++) {
            try {
                const r = await fetch('https://' + RES + '/getLocale', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
                const j = await r.json();
                if (j && j.locale) { await I18N.setLocale(j.locale); break; }
            } catch (e) { /* client henüz hazır değil */ }
            await new Promise((res) => setTimeout(res, 500));
        }
    })();
})();
