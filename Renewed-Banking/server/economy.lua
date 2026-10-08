-- =====================================================================
--  RENEWED-BANKING  |  EKONOMİ & VERGİ YÖNETİM SİSTEMİ  (server/economy.lua)
--  /ekonomi  -> admin paneli
--  Tüm vergi oranları panelden değiştirilebilir (economy_config.json)
-- =====================================================================

Economy = {}

local RES = GetCurrentResourceName()
local CONFIG_FILE = 'economy_config.json'
local STATE_FILE = 'economy_state.json'

local Framework = GetResourceState('es_extended') == 'started' and 'esx'
    or GetResourceState('qbx_core') == 'started' and 'qbx'
    or GetResourceState('qb-core') == 'started' and 'qb' or 'Unknown'

-- ---------------------------------------------------------------------
--  VARSAYILAN AYARLAR
-- ---------------------------------------------------------------------
local DEFAULT_CFG = {
    treasury = { enabled = true, account = 'government', label = locale('eco_treasury_label') },
    allowedJobs = { 'police', 'mechanic', 'ambulance' },
    exempt = { jobs = {}, citizenids = {} },
    invoice = { minAmount = 1, maxAmount = 0 }, -- maxAmount 0 = limitsiz
    snapshotInterval = 30, -- dakika
    taxes = {
        transfer     = { enabled = true,  rate = 5, min = 0, max = 0 },
        invoice      = { enabled = true,  rate = 5, jobRates = {} },
        deposit      = { enabled = false, rate = 0 },
        withdraw     = { enabled = false, rate = 0 },
        vehicleSpawn = { enabled = false, flat = 0, rate = 0 },
        salary       = { enabled = false, rate = 0, reasons = { 'paycheck', 'salary' } },
        vehicleOwn   = { enabled = false, flat = 500,  interval = 24, mode = 'invoice', includeOffline = false },
        houseOwn     = { enabled = false, flat = 1000, interval = 24, mode = 'invoice', includeOffline = false },
        wealth       = { enabled = true,  rate = 3, interval = 6, threshold = 0, mode = 'invoice',
                         includeOffline = false, countCash = true, countBank = true, brackets = {} },
    }
}

local TAX_LABELS = {
    transfer = locale('tax_transfer'), invoice = locale('tax_invoice'), deposit = locale('tax_deposit'),
    withdraw = locale('tax_withdraw'), vehicleSpawn = locale('tax_vehicleSpawn'), salary = locale('tax_salary'),
    vehicleOwn = locale('tax_vehicleOwn'), houseOwn = locale('tax_houseOwn'), wealth = locale('tax_wealth')
}

local cfg = nil
local state = { lastRun = {} }

local function isDict(t) return type(t) == 'table' and #t == 0 and next(t) ~= nil end

local function deepMerge(base, over)
    local out = {}
    for k, v in pairs(base) do out[k] = v end
    if type(over) ~= 'table' then return out end
    for k, v in pairs(over) do
        if isDict(v) and isDict(base[k]) then
            out[k] = deepMerge(base[k], v)
        else
            out[k] = v
        end
    end
    return out
end

local function copy(t)
    if type(t) ~= 'table' then return t end
    local o = {}
    for k, v in pairs(t) do o[k] = copy(v) end
    return o
end

local function saveCfg()
    SaveResourceFile(RES, CONFIG_FILE, json.encode(cfg), -1)
end

local function saveState()
    SaveResourceFile(RES, STATE_FILE, json.encode(state), -1)
end

local function loadCfg()
    cfg = copy(DEFAULT_CFG)
    local raw = LoadResourceFile(RES, CONFIG_FILE)
    local migrated = false
    if raw and raw ~= '' then
        local ok, dec = pcall(json.decode, raw)
        if ok and type(dec) == 'table' then cfg = deepMerge(cfg, dec) end
    else
        -- Eski sistemden göç (allowed_jobs.json + wealth_tax.json)
        local jobsRaw = LoadResourceFile(RES, 'allowed_jobs.json')
        if jobsRaw then
            local ok, dec = pcall(json.decode, jobsRaw)
            if ok and type(dec) == 'table' then cfg.allowedJobs = dec; migrated = true end
        end
        local taxRaw = LoadResourceFile(RES, 'wealth_tax.json')
        if taxRaw then
            local ok, dec = pcall(json.decode, taxRaw)
            if ok and type(dec) == 'table' then
                cfg.taxes.wealth.rate = tonumber(dec.rate) or cfg.taxes.wealth.rate
                cfg.taxes.wealth.interval = tonumber(dec.interval) or cfg.taxes.wealth.interval
                migrated = true
            end
        end
        saveCfg()
        if migrated then print(locale('eco_log_migrated')) end
    end
    local sraw = LoadResourceFile(RES, STATE_FILE)
    if sraw and sraw ~= '' then
        local ok, dec = pcall(json.decode, sraw)
        if ok and type(dec) == 'table' then state = dec; state.lastRun = state.lastRun or {} end
    end
end

loadCfg()

-- ---------------------------------------------------------------------
--  YARDIMCILAR
-- ---------------------------------------------------------------------
local function num(v, default) return tonumber(v) or default or 0 end
local function floor(v) return math.floor(v + 0.0000001) end

local function listHas(list, val)
    if type(list) ~= 'table' then return false end
    for i = 1, #list do if list[i] == val then return true end end
    return false
end

local function safeDecode(str, default)
    if not str or str == '' then return default end
    local ok, dec = pcall(json.decode, str)
    if ok and dec ~= nil then return dec end
    return default
end

local function dbQuery(q, params)
    local ok, res = pcall(function() return MySQL.query.await(q, params or {}) end)
    if ok then return res or {} end
    return {}
end

local function dbSingle(q, params)
    local ok, res = pcall(function() return MySQL.single.await(q, params or {}) end)
    if ok then return res end
    return nil
end

local function dbExec(q, params)
    local ok, res = pcall(function() return MySQL.update.await(q, params or {}) end)
    if ok then return res end
    return nil
end

function Economy.GetConfig() return cfg end
function Economy.Label(key) return TAX_LABELS[key] or key end

-- ---------------------------------------------------------------------
--  TABLOLAR
-- ---------------------------------------------------------------------
CreateThread(function()
    Wait(300)
    dbExec([[CREATE TABLE IF NOT EXISTS `economy_tax_log` (
        `id` int(11) NOT NULL AUTO_INCREMENT,
        `tax_key` varchar(32) NOT NULL,
        `citizenid` varchar(64) DEFAULT NULL,
        `name` varchar(100) DEFAULT NULL,
        `base` double DEFAULT 0,
        `amount` double DEFAULT 0,
        `note` varchar(255) DEFAULT NULL,
        `created_at` int(11) NOT NULL,
        PRIMARY KEY (`id`), KEY `idx_key` (`tax_key`), KEY `idx_time` (`created_at`)
    )]])
    dbExec([[CREATE TABLE IF NOT EXISTS `economy_audit` (
        `id` int(11) NOT NULL AUTO_INCREMENT,
        `admin_cid` varchar(64) DEFAULT NULL,
        `admin_name` varchar(100) DEFAULT NULL,
        `action` varchar(64) NOT NULL,
        `target` varchar(100) DEFAULT NULL,
        `detail` varchar(500) DEFAULT NULL,
        `created_at` int(11) NOT NULL,
        PRIMARY KEY (`id`), KEY `idx_time` (`created_at`)
    )]])
    dbExec([[CREATE TABLE IF NOT EXISTS `economy_snapshots` (
        `id` int(11) NOT NULL AUTO_INCREMENT,
        `ts` int(11) NOT NULL,
        `total_bank` double DEFAULT 0,
        `total_cash` double DEFAULT 0,
        `players` int(11) DEFAULT 0,
        `online` int(11) DEFAULT 0,
        `vehicles` int(11) DEFAULT 0,
        `unpaid_sum` double DEFAULT 0,
        `tax_total` double DEFAULT 0,
        `treasury` double DEFAULT 0,
        PRIMARY KEY (`id`), KEY `idx_ts` (`ts`)
    )]])
    -- Hazine büyüyebilsin diye bakiye kolonunu genişlet (hata verirse sorun değil)
    dbExec('ALTER TABLE `bank_accounts_new` MODIFY `amount` BIGINT DEFAULT 0')
    dbExec('ALTER TABLE `player_invoices` MODIFY `amount` BIGINT DEFAULT 0')
end)

-- ---------------------------------------------------------------------
--  YETKİ
-- ---------------------------------------------------------------------
function Economy.IsAdmin(src)
    if not src or src == 0 then return true end
    if IsPlayerAceAllowed(src, 'command.' .. locale('cmd_economy')) or IsPlayerAceAllowed(src, 'command.ekonomi') or IsPlayerAceAllowed(src, 'group.admin') or IsPlayerAceAllowed(src, 'group.god') then return true end
    if Framework == 'qbx' then
        local ok, res = pcall(function() return exports.qbx_core:HasPermission(src, 'admin') end)
        if ok and res then return true end
    end
    if Framework == 'qb' or Framework == 'qbx' then
        local ok, res = pcall(function()
            local QB = exports['qb-core']:GetCoreObject()
            return QB.Functions.HasPermission(src, 'admin') or QB.Functions.HasPermission(src, 'god')
        end)
        if ok and res then return true end
    elseif Framework == 'esx' then
        local ok, res = pcall(function()
            local ESX = exports['es_extended']:getSharedObject()
            local x = ESX.GetPlayerFromId(src)
            local g = x and x.getGroup()
            return g == 'admin' or g == 'superadmin'
        end)
        if ok and res then return true end
    end
    return false
end

local function adminInfo(src)
    if not src or src == 0 then return 'CONSOLE', locale('eco_console') end
    local P = GetPlayerObject(src)
    if not P then return tostring(src), GetPlayerName(src) or locale('eco_unknown') end
    return GetIdentifier(P), GetCharacterName(P)
end

local function audit(src, action, target, detail)
    local cid, name = adminInfo(src)
    CreateThread(function()
        dbExec('INSERT INTO economy_audit (admin_cid, admin_name, action, target, detail, created_at) VALUES (?, ?, ?, ?, ?, ?)',
            { cid, name, action, target and tostring(target) or nil, detail and tostring(detail):sub(1, 490) or nil, os.time() })
    end)
    print(locale('eco_log_audit', name, cid, action, tostring(target), tostring(detail)))
end

-- ---------------------------------------------------------------------
--  HAZİNE
-- ---------------------------------------------------------------------
local function ensureTreasury()
    if not cfg.treasury.enabled then return false end
    local acct = cfg.treasury.account
    local bal = GetAccountMoney(acct)
    if bal ~= false and bal ~= nil then return true end
    local ok = pcall(EnsureAccount, acct, cfg.treasury.label)
    if ok then return GetAccountMoney(acct) ~= false end
    return false
end

function Economy.TreasuryBalance()
    if not cfg.treasury.enabled then return 0 end
    local b = GetAccountMoney(cfg.treasury.account)
    return (b ~= false and b) or 0
end

local function logTax(key, cid, name, base, amount, note)
    CreateThread(function()
        dbExec('INSERT INTO economy_tax_log (tax_key, citizenid, name, base, amount, note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
            { key, cid, name, base or 0, amount or 0, note and tostring(note):sub(1, 250) or nil, os.time() })
    end)
end

--- Toplanan vergiyi hazineye yatırır ve loglar.
function Economy.DepositTreasury(key, amount, cid, name, base, note)
    amount = floor(num(amount))
    if amount <= 0 then return false end
    if cfg.treasury.enabled and ensureTreasury() then
        AddAccountMoney(cfg.treasury.account, amount)
        pcall(function()
            exports['Renewed-Banking']:handleTransaction(cfg.treasury.account, (TAX_LABELS[key] or key) .. ' / ' .. tostring(name or cid or '-'),
                amount, note or (TAX_LABELS[key] or key), tostring(name or cid or locale('eco_citizen')), cfg.treasury.label, 'deposit')
        end)
    end
    logTax(key, cid, name, base, amount, note)
    return true
end

-- ---------------------------------------------------------------------
--  VERGİ HESAPLAMA
-- ---------------------------------------------------------------------
local function playerJobName(Player)
    local ok, jobs = pcall(GetJobs, Player)
    if not ok or not jobs then return nil end
    if jobs[1] then return jobs[1].name end
    return jobs.name
end

function Economy.IsExempt(Player)
    if not Player then return false end
    local cid = GetIdentifier(Player)
    if listHas(cfg.exempt.citizenids, cid) then return true end
    local job = playerJobName(Player)
    if job and listHas(cfg.exempt.jobs, job) then return true end
    return false
end

local function isCidExempt(cid, job)
    return listHas(cfg.exempt.citizenids, cid) or (job and listHas(cfg.exempt.jobs, job))
end

--- Yüzde bazlı vergi. Dönüş: vergi tutarı (tam sayı)
function Economy.CalcPercent(key, amount, extra)
    local t = cfg.taxes[key]
    if not t or not t.enabled then return 0 end
    local rate = num(t.rate)
    if extra and t.jobRates and t.jobRates[extra] ~= nil then rate = num(t.jobRates[extra]) end
    if rate <= 0 then return 0 end
    local tax = floor(amount * rate / 100)
    if t.min and num(t.min) > 0 and tax < num(t.min) then tax = floor(num(t.min)) end
    if t.max and num(t.max) > 0 and tax > num(t.max) then tax = floor(num(t.max)) end
    if tax > amount then tax = amount end
    return tax
end

--- Fatura açıklamasından vergi türünü bul (devlet faturaları için)
function Economy.KeyFromReason(reason)
    -- Hem Türkçe (eski kayıtlar) hem İngilizce nedenleri tanır
    reason = tostring(reason or ''):lower()
    if reason:find('varl', 1, true) or reason:find('wealth', 1, true) then return 'wealth' end
    if (reason:find('ara', 1, true) and reason:find('vergi', 1, true)) or reason:find('vehicle', 1, true) then return 'vehicleOwn' end
    if reason:find('mülk', 1, true) or reason:find('ev ', 1, true) or reason:find('property', 1, true) or reason:find('house', 1, true) then return 'houseOwn' end
    return 'wealth'
end

--- Fiyat bazlı sabit + yüzde vergi (araç çıkarma vb.)
function Economy.CalcFlat(key, base)
    local t = cfg.taxes[key]
    if not t or not t.enabled then return 0 end
    local tax = num(t.flat)
    if base and num(t.rate) > 0 then tax = tax + floor(base * num(t.rate) / 100) end
    return floor(tax)
end

--- Kademeli (marjinal) veya düz varlık vergisi
local function calcWealth(total)
    local t = cfg.taxes.wealth
    local thr = num(t.threshold)
    if total <= thr or total <= 0 then return 0 end
    local brackets = t.brackets
    if type(brackets) == 'table' and #brackets > 0 then
        local sorted = copy(brackets)
        table.sort(sorted, function(a, b) return num(a.from) < num(b.from) end)
        local tax = 0
        for i = 1, #sorted do
            local from = num(sorted[i].from)
            local to = sorted[i + 1] and num(sorted[i + 1].from) or math.huge
            if total > from then
                local slice = math.min(total, to) - from
                tax = tax + slice * num(sorted[i].rate) / 100
            end
        end
        return floor(tax)
    end
    return floor((total - 0) * num(t.rate) / 100)
end
Economy.CalcWealth = calcWealth

-- Oyuncudan doğrudan vergi tahsil et (bank -> cash). Dönüş: tahsil edilen
local function chargePlayer(Player, amount, reason)
    amount = floor(amount)
    if amount <= 0 then return 0 end
    local funds = GetFunds(Player)
    local fromBank = math.min(funds.bank, amount)
    local taken = 0
    if fromBank > 0 and RemoveMoney(Player, fromBank, 'bank', reason) then taken = taken + fromBank end
    local rest = amount - taken
    if rest > 0 and funds.cash >= rest and RemoveMoney(Player, rest, 'cash', reason) then taken = taken + rest end
    return taken
end

local function createTaxInvoice(cid, amount, reason, senderLabel)
    amount = floor(amount)
    if amount <= 0 then return false end
    local id = nil
    pcall(function()
        id = MySQL.insert.await('INSERT INTO player_invoices (sender, receiver, sender_name, amount, reason, date) VALUES (?, ?, ?, ?, ?, ?)',
            { 'devlet', cid, senderLabel or locale('eco_tax_office'), amount, reason, os.date('%d.%m.%Y') })
    end)
    return id ~= nil
end
Economy.CreateTaxInvoice = createTaxInvoice

-- ---------------------------------------------------------------------
--  FEE / HOOK FONKSİYONLARI (diğer scriptler kullanabilir)
-- ---------------------------------------------------------------------

--- ATM yatır/çek ücreti. Dönüş: ücret
function Economy.Fee(key, amount, Player)
    if Player and Economy.IsExempt(Player) then return 0 end
    return Economy.CalcPercent(key, amount)
end

--- Araç çıkarma (garaj) vergisi. Başarılıysa true.
--- Garaj scriptinden:  if not exports['Renewed-Banking']:ChargeVehicleSpawn(source, plate, vehicleValue) then return end
function Economy.ChargeVehicleSpawn(src, plate, vehicleValue)
    local t = cfg.taxes.vehicleSpawn
    if not t or not t.enabled then return true end
    local Player = GetPlayerObject(src)
    if not Player then return false end
    if Economy.IsExempt(Player) then return true end
    local fee = Economy.CalcFlat('vehicleSpawn', vehicleValue)
    if fee <= 0 then return true end
    local taken = chargePlayer(Player, fee, locale('eco_vehicle_spawn_tax_note') .. (plate and (' ' .. plate) or ''))
    if taken < fee then
        if taken > 0 then AddMoney(Player, taken, 'bank', locale('eco_vehicle_tax_refund')) end
        Notify(src, { title = locale('eco_gov'), description = locale('eco_vehicle_tax_required', fee), type = 'error' })
        return false
    end
    Economy.DepositTreasury('vehicleSpawn', fee, GetIdentifier(Player), GetCharacterName(Player), vehicleValue or 0, plate or locale('eco_vehicle_spawn'))
    Notify(src, { title = locale('eco_gov'), description = locale('eco_vehicle_tax_paid', fee), type = 'inform' })
    return true
end
exports('ChargeVehicleSpawn', function(src, plate, value) return Economy.ChargeVehicleSpawn(src, plate, value) end)

--- Genel amaçlı: başka scriptlerden vergi kes. exports['Renewed-Banking']:ApplyTax(src, 'salary', 5000) -> kalan, vergi
exports('ApplyTax', function(src, key, amount)
    local Player = GetPlayerObject(src)
    if not Player or Economy.IsExempt(Player) then return amount, 0 end
    local tax = Economy.CalcPercent(key, amount)
    return amount - tax, tax
end)
exports('GetTaxConfig', function() return cfg end)
exports('GetTreasuryBalance', function() return Economy.TreasuryBalance() end)

-- Maaş vergisi (QBCore/QBX para değişim eventi)
local inSalaryHook = false
AddEventHandler('QBCore:Server:OnMoneyChange', function(src, moneyType, amount, action, reason)
    local t = cfg.taxes.salary
    if not t or not t.enabled or inSalaryHook then return end
    if action ~= 'add' or moneyType ~= 'bank' then return end
    reason = tostring(reason or ''):lower()
    local match = false
    for i = 1, #(t.reasons or {}) do
        if reason ~= '' and reason:find(tostring(t.reasons[i]):lower(), 1, true) then match = true break end
    end
    if not match then return end
    local Player = GetPlayerObject(src)
    if not Player or Economy.IsExempt(Player) then return end
    local tax = Economy.CalcPercent('salary', amount)
    if tax <= 0 then return end
    inSalaryHook = true
    if RemoveMoney(Player, tax, 'bank', locale('eco_income_tax')) then
        Economy.DepositTreasury('salary', tax, GetIdentifier(Player), GetCharacterName(Player), amount, locale('eco_salary_deduction'))
        Notify(src, { title = locale('eco_income_tax_title'), description = locale('eco_salary_tax_cut', tax), type = 'inform' })
    end
    inSalaryHook = false
end)

-- ---------------------------------------------------------------------
--  OYUNCU VERİSİ (DB)
-- ---------------------------------------------------------------------
local playersCache, playersCacheTime = nil, 0
local vehicleLabels = nil

local function vehicleLabel(model)
    if not model then return '-' end
    if vehicleLabels == nil then
        vehicleLabels = {}
        pcall(function()
            local all = exports.qbx_core:GetVehiclesByName()
            for k, v in pairs(all or {}) do vehicleLabels[k] = ((v.brand and (v.brand .. ' ') or '') .. (v.name or k)) end
        end)
    end
    return vehicleLabels[model] or vehicleLabels[tostring(model):lower()] or tostring(model)
end

local function jobLabelOf(name)
    if not name then return '-' end
    local ok, l = pcall(GetSocietyLabel, name)
    return ok and l or name
end

local function loadPlayers(force)
    local now = os.time()
    if not force and playersCache and now - playersCacheTime < 10 then return playersCache end

    local list = {}
    local vehCount, vehValue, houseCount = {}, {}, {}
    local invCount, invSum = {}, {}

    local invoices = dbQuery('SELECT receiver, COUNT(*) AS c, SUM(amount) AS s FROM player_invoices GROUP BY receiver')
    for i = 1, #invoices do invCount[invoices[i].receiver] = invoices[i].c; invSum[invoices[i].receiver] = num(invoices[i].s) end

    local online = {}
    for _, s in ipairs(GetPlayers()) do
        local P = GetPlayerObject(tonumber(s))
        if P then online[GetIdentifier(P)] = tonumber(s) end
    end

    if Framework == 'qb' or Framework == 'qbx' then
        local veh = dbQuery('SELECT citizenid, COUNT(*) AS c FROM player_vehicles GROUP BY citizenid')
        for i = 1, #veh do vehCount[veh[i].citizenid] = veh[i].c end
        for _, q in ipairs({ 'SELECT citizenid, COUNT(*) AS c FROM player_houses GROUP BY citizenid',
                             'SELECT citizenid, COUNT(*) AS c FROM properties GROUP BY citizenid' }) do
            local ok, h = pcall(function() return MySQL.query.await(q) end)
            if ok and h then
                for i = 1, #h do houseCount[h[i].citizenid] = (houseCount[h[i].citizenid] or 0) + h[i].c end
                break
            end
        end
        local rows = dbQuery('SELECT citizenid, license, charinfo, money, job FROM players')
        for i = 1, #rows do
            local r = rows[i]
            local money = safeDecode(r.money, {})
            local char = safeDecode(r.charinfo, {})
            local job = safeDecode(r.job, {})
            local b, c = num(money.bank), num(money.cash)
            local cid = r.citizenid
            list[#list + 1] = {
                cid = cid,
                name = ((char.firstname or '?') .. ' ' .. (char.lastname or '')),
                phone = char.phone, job = job.name, jobLabel = job.label or job.name,
                bank = b, cash = c, total = b + c,
                vehicles = vehCount[cid] or 0, houses = houseCount[cid] or 0,
                invoices = invCount[cid] or 0, invoiceSum = invSum[cid] or 0,
                online = online[cid], exempt = listHas(cfg.exempt.citizenids, cid) or false,
                suspicious = (b + c) > 1e12 or b < 0 or c < 0
            }
        end
    elseif Framework == 'esx' then
        local veh = dbQuery('SELECT owner, COUNT(*) AS c FROM owned_vehicles GROUP BY owner')
        for i = 1, #veh do vehCount[veh[i].owner] = veh[i].c end
        local ok, h = pcall(function() return MySQL.query.await('SELECT owner, COUNT(*) AS c FROM owned_properties GROUP BY owner') end)
        if ok and h then for i = 1, #h do houseCount[h[i].owner] = h[i].c end end
        local rows = dbQuery('SELECT identifier, firstname, lastname, accounts, job FROM users')
        for i = 1, #rows do
            local r = rows[i]
            local acc = safeDecode(r.accounts, {})
            local b, c = num(acc.bank), num(acc.money)
            local cid = r.identifier
            list[#list + 1] = {
                cid = cid, name = ((r.firstname or '?') .. ' ' .. (r.lastname or '')),
                job = r.job, jobLabel = r.job, bank = b, cash = c, total = b + c,
                vehicles = vehCount[cid] or 0, houses = houseCount[cid] or 0,
                invoices = invCount[cid] or 0, invoiceSum = invSum[cid] or 0,
                online = online[cid], exempt = listHas(cfg.exempt.citizenids, cid) or false,
                suspicious = (b + c) > 1e12 or b < 0 or c < 0
            }
        end
    end

    playersCache, playersCacheTime = list, now
    return list
end

local function findPlayer(cid)
    local list = loadPlayers(false)
    for i = 1, #list do if list[i].cid == cid then return list[i] end end
    return nil
end

-- ---------------------------------------------------------------------
--  PARA DEĞİŞTİRME (online / offline)
-- ---------------------------------------------------------------------
local function modifyMoney(cid, kind, op, amount, reason)
    amount = num(amount)
    if amount < 0 or (op ~= 'set' and amount == 0) then return false, locale('eco_err_invalid_amount') end
    if kind ~= 'bank' and kind ~= 'cash' then return false, locale('eco_err_invalid_account_type') end

    local P = GetPlayerObjectFromID(cid)
    if P then
        local funds = GetFunds(P)
        local cur = funds[kind]
        if op == 'add' then
            AddMoney(P, amount, kind, reason)
        elseif op == 'remove' then
            local take = math.min(cur, amount)
            if take > 0 then RemoveMoney(P, take, kind, reason) end
        elseif op == 'set' then
            if amount > cur then AddMoney(P, amount - cur, kind, reason)
            elseif amount < cur then RemoveMoney(P, cur - amount, kind, reason) end
        end
        playersCache = nil
        return true
    end

    -- Offline: doğrudan DB
    if Framework == 'qb' or Framework == 'qbx' then
        local row = dbSingle('SELECT money FROM players WHERE citizenid = ?', { cid })
        if not row then return false, locale('eco_err_player_not_found') end
        local money = safeDecode(row.money, {})
        local cur = num(money[kind])
        if op == 'add' then money[kind] = cur + amount
        elseif op == 'remove' then money[kind] = math.max(0, cur - amount)
        else money[kind] = amount end
        dbExec('UPDATE players SET money = ? WHERE citizenid = ?', { json.encode(money), cid })
    elseif Framework == 'esx' then
        local row = dbSingle('SELECT accounts FROM users WHERE identifier = ?', { cid })
        if not row then return false, locale('eco_err_player_not_found') end
        local acc = safeDecode(row.accounts, {})
        local key = kind == 'cash' and 'money' or 'bank'
        local cur = num(acc[key])
        if op == 'add' then acc[key] = cur + amount
        elseif op == 'remove' then acc[key] = math.max(0, cur - amount)
        else acc[key] = amount end
        dbExec('UPDATE users SET accounts = ? WHERE identifier = ?', { json.encode(acc), cid })
    end
    playersCache = nil
    return true
end

-- ---------------------------------------------------------------------
--  PERİYODİK VERGİ DÖNGÜLERİ
-- ---------------------------------------------------------------------
local cycleBusy = {}

--- Tek bir oyuncuya vergi uygula (invoice veya direct)
local function applyToPlayer(key, rec, taxAmount, base, note)
    taxAmount = floor(taxAmount)
    if taxAmount <= 0 then return 0 end
    local t = cfg.taxes[key]
    local label = TAX_LABELS[key] or key
    if t.mode == 'direct' and rec.online then
        local P = GetPlayerObject(rec.online)
        if P then
            local taken = chargePlayer(P, taxAmount, label)
            if taken > 0 then
                Economy.DepositTreasury(key, taken, rec.cid, rec.name, base, note)
                Notify(rec.online, { title = label, description = locale('eco_tax_deducted', taken, label:lower()), type = 'inform' })
            end
            local rest = taxAmount - taken
            if rest > 0 then
                createTaxInvoice(rec.cid, rest, note or label)
                Notify(rec.online, { title = label, description = locale('eco_tax_insufficient', rest), type = 'error' })
            end
            return taxAmount
        end
    end
    if createTaxInvoice(rec.cid, taxAmount, note or label) then
        if rec.online then
            Notify(rec.online, { title = label, description = locale('eco_tax_invoiced', taxAmount), type = 'inform' })
        end
        return taxAmount
    end
    return 0
end

function Economy.RunCycle(key, byAdmin)
    local t = cfg.taxes[key]
    if not t or cycleBusy[key] then return 0, 0 end
    cycleBusy[key] = true
    local list = loadPlayers(true)
    local count, sum = 0, 0

    for i = 1, #list do
        local rec = list[i]
        if (rec.online or t.includeOffline) and not isCidExempt(rec.cid, rec.job) then
            local tax, base, note = 0, 0, nil
            if key == 'wealth' then
                base = (t.countBank ~= false and rec.bank or 0) + (t.countCash ~= false and rec.cash or 0)
                tax = calcWealth(base)
                if rec.suspicious then tax = 0 end -- bozuk/şüpheli bakiyelere otomatik vergi kesme
                note = locale('eco_note_wealth', #(t.brackets or {}) > 0 and locale('eco_progressive') or ('%%' .. tostring(t.rate)))
            elseif key == 'vehicleOwn' then
                base = rec.vehicles
                tax = base * num(t.flat)
                note = locale('eco_note_vehicle', base)
            elseif key == 'houseOwn' then
                base = rec.houses
                tax = base * num(t.flat)
                note = locale('eco_note_property', base)
            end
            if tax > 0 then
                local done = applyToPlayer(key, rec, tax, base, note)
                if done > 0 then count = count + 1; sum = sum + done end
            end
        end
    end

    state.lastRun[key] = os.time()
    saveState()
    cycleBusy[key] = false
    return count, sum
end

CreateThread(function()
    Wait(5000)
    ensureTreasury()
    for _, key in ipairs({ 'wealth', 'vehicleOwn', 'houseOwn' }) do
        if not state.lastRun[key] then state.lastRun[key] = os.time() end
    end
    saveState()
    while true do
        Wait(60 * 1000)
        for _, key in ipairs({ 'wealth', 'vehicleOwn', 'houseOwn' }) do
            local t = cfg.taxes[key]
            if t and t.enabled and num(t.interval) > 0 then
                if os.time() - (state.lastRun[key] or 0) >= num(t.interval) * 3600 then
                    local c, s = Economy.RunCycle(key)
                    if c > 0 then print(locale('eco_log_tax_run', TAX_LABELS[key], c, s)) end
                end
            end
        end
    end
end)

-- ---------------------------------------------------------------------
--  SNAPSHOT (grafik geçmişi)
-- ---------------------------------------------------------------------
local function takeSnapshot()
    local list = loadPlayers(true)
    local tb, tc, vehicles, online = 0, 0, 0, 0
    for i = 1, #list do
        if not list[i].suspicious then tb = tb + list[i].bank; tc = tc + list[i].cash end
        vehicles = vehicles + list[i].vehicles
        if list[i].online then online = online + 1 end
    end
    local inv = dbSingle('SELECT COALESCE(SUM(amount),0) AS s FROM player_invoices')
    local tax = dbSingle('SELECT COALESCE(SUM(amount),0) AS s FROM economy_tax_log')
    dbExec('INSERT INTO economy_snapshots (ts, total_bank, total_cash, players, online, vehicles, unpaid_sum, tax_total, treasury) VALUES (?,?,?,?,?,?,?,?,?)',
        { os.time(), tb, tc, #list, online, vehicles, inv and num(inv.s) or 0, tax and num(tax.s) or 0, Economy.TreasuryBalance() })
    dbExec('DELETE FROM economy_snapshots WHERE ts < ?', { os.time() - 60 * 86400 })
end

CreateThread(function()
    Wait(20000)
    while true do
        pcall(takeSnapshot)
        Wait(math.max(5, num(cfg.snapshotInterval, 30)) * 60 * 1000)
    end
end)

-- ---------------------------------------------------------------------
--  ADMIN CALLBACK'LERİ
-- ---------------------------------------------------------------------
local function guard(name, fn)
    lib.callback.register('Renewed-Banking:eco:' .. name, function(src, data)
        if not Economy.IsAdmin(src) then return { ok = false, error = locale('eco_err_no_permission') } end
        local ok, res = pcall(fn, src, data or {})
        if not ok then
            print(locale('eco_log_cb_error', name, tostring(res)))
            return { ok = false, error = locale('eco_err_server') .. tostring(res) }
        end
        return res
    end)
end

local BUCKETS = {
    { 0, 1000, '< $1K' }, { 1000, 10000, '$1K–10K' }, { 10000, 50000, '$10K–50K' },
    { 50000, 100000, '$50K–100K' }, { 100000, 500000, '$100K–500K' }, { 500000, 1000000, '$500K–1M' },
    { 1000000, 10000000, '$1M–10M' }, { 10000000, math.huge, '$10M+' }
}

local function gini(sorted)
    local n = #sorted
    if n == 0 then return 0 end
    local sum, weighted = 0, 0
    for i = 1, n do sum = sum + sorted[i]; weighted = weighted + i * sorted[i] end
    if sum <= 0 then return 0 end
    return (2 * weighted) / (n * sum) - (n + 1) / n
end

guard('getOverview', function(src, data)
    local list = loadPlayers(true)
    local totalBank, totalCash, onlineCount, suspicious = 0, 0, 0, 0
    local vehicles, houses = 0, 0
    local buckets = {}
    for i = 1, #BUCKETS do buckets[i] = { label = BUCKETS[i][3], count = 0 } end
    local totals = {}
    for i = 1, #list do
        local p = list[i]
        vehicles = vehicles + p.vehicles
        houses = houses + p.houses
        if p.online then onlineCount = onlineCount + 1 end
        if p.suspicious then
            suspicious = suspicious + 1
        else
            totalBank = totalBank + p.bank
            totalCash = totalCash + p.cash
            totals[#totals + 1] = p.total
            for b = 1, #BUCKETS do
                if p.total >= BUCKETS[b][1] and p.total < BUCKETS[b][2] then buckets[b].count = buckets[b].count + 1 break end
            end
        end
    end
    table.sort(totals)
    local median = #totals > 0 and totals[math.ceil(#totals / 2)] or 0
    local avg = #totals > 0 and (totalBank + totalCash) / #totals or 0

    local ranked = copy(list)
    table.sort(ranked, function(a, b) return a.total > b.total end)
    local top = {}
    for i = 1, math.min(10, #ranked) do
        local p = ranked[i]
        top[#top + 1] = { cid = p.cid, name = p.name, total = p.total, bank = p.bank, cash = p.cash, suspicious = p.suspicious }
    end

    -- Araç istatistikleri
    local vehByState = { garaged = 0, out = 0, impounded = 0 }
    local topModels = {}
    if Framework == 'qb' or Framework == 'qbx' then
        local st = dbQuery('SELECT state, COUNT(*) AS c FROM player_vehicles GROUP BY state')
        for i = 1, #st do
            local s = tonumber(st[i].state) or 0
            if s == 1 then vehByState.garaged = vehByState.garaged + st[i].c
            elseif s == 2 then vehByState.impounded = vehByState.impounded + st[i].c
            else vehByState.out = vehByState.out + st[i].c end
        end
        local models = dbQuery('SELECT vehicle, COUNT(*) AS c FROM player_vehicles GROUP BY vehicle ORDER BY c DESC LIMIT 8')
        for i = 1, #models do topModels[#topModels + 1] = { label = vehicleLabel(models[i].vehicle), count = models[i].c } end
    end

    -- Vergi istatistikleri
    local taxByType = {}
    local rows = dbQuery('SELECT tax_key, SUM(amount) AS s, COUNT(*) AS c FROM economy_tax_log GROUP BY tax_key')
    local taxTotal = 0
    for i = 1, #rows do
        taxByType[#taxByType + 1] = { key = rows[i].tax_key, label = TAX_LABELS[rows[i].tax_key] or rows[i].tax_key, sum = num(rows[i].s), count = rows[i].c }
        taxTotal = taxTotal + num(rows[i].s)
    end
    table.sort(taxByType, function(a, b) return a.sum > b.sum end)

    local since = os.time() - 14 * 86400
    local daily = dbQuery('SELECT FLOOR(created_at / 86400) AS d, SUM(amount) AS s FROM economy_tax_log WHERE created_at >= ? GROUP BY d ORDER BY d', { since })
    local taxDaily = {}
    for i = 1, #daily do taxDaily[#taxDaily + 1] = { ts = daily[i].d * 86400, sum = num(daily[i].s) } end

    -- Fatura istatistikleri
    local inv = dbSingle('SELECT COUNT(*) AS c, COALESCE(SUM(amount),0) AS s FROM player_invoices') or { c = 0, s = 0 }
    local bySender = dbQuery('SELECT sender_name, COUNT(*) AS c, SUM(amount) AS s FROM player_invoices GROUP BY sender ORDER BY s DESC LIMIT 8')
    local invSenders = {}
    for i = 1, #bySender do invSenders[#invSenders + 1] = { label = bySender[i].sender_name or '-', count = bySender[i].c, sum = num(bySender[i].s) } end

    local snaps = dbQuery('SELECT ts, total_bank, total_cash, players, online, vehicles, unpaid_sum, tax_total, treasury FROM economy_snapshots WHERE ts >= ? ORDER BY ts', { os.time() - (tonumber(data.days) or 7) * 86400 })

    return {
        ok = true,
        kpi = {
            totalBank = totalBank, totalCash = totalCash, total = totalBank + totalCash,
            players = #list, online = onlineCount, vehicles = vehicles, houses = houses,
            avg = avg, median = median, gini = gini(totals), suspicious = suspicious,
            treasury = Economy.TreasuryBalance(), treasuryEnabled = cfg.treasury.enabled,
            unpaidCount = inv.c, unpaidSum = num(inv.s), taxTotal = taxTotal
        },
        buckets = buckets, top = top, vehByState = vehByState, topModels = topModels,
        taxByType = taxByType, taxDaily = taxDaily, invSenders = invSenders, snapshots = snaps,
        currency = Config.currency
    }
end)

guard('getPlayers', function(src, data)
    local list = loadPlayers(data.refresh == true)
    local search = tostring(data.search or ''):lower()
    local filter = data.filter or 'all'
    local out = {}
    for i = 1, #list do
        local p = list[i]
        local match = true
        if search ~= '' then
            match = p.name:lower():find(search, 1, true) or p.cid:lower():find(search, 1, true)
                or (p.job and p.job:lower():find(search, 1, true)) or false
        end
        if match and filter == 'online' and not p.online then match = false end
        if match and filter == 'debt' and p.invoices == 0 then match = false end
        if match and filter == 'suspicious' and not p.suspicious then match = false end
        if match and filter == 'exempt' and not p.exempt then match = false end
        if match and filter == 'vehicles' and p.vehicles == 0 then match = false end
        if match then out[#out + 1] = p end
    end
    local sort = data.sort or 'total'
    local dir = data.dir == 'asc' and 1 or -1
    table.sort(out, function(a, b)
        local x, y = a[sort], b[sort]
        if type(x) == 'string' or type(y) == 'string' then
            x, y = tostring(x or ''):lower(), tostring(y or ''):lower()
        elseif type(x) == 'boolean' or x == nil then
            x, y = x and 1 or 0, y and 1 or 0
        end
        if x == y then return a.cid < b.cid end
        if dir == 1 then return x < y end
        return x > y
    end)
    local page = math.max(1, tonumber(data.page) or 1)
    local size = math.min(100, math.max(5, tonumber(data.pageSize) or 25))
    local total = #out
    local paged = {}
    for i = (page - 1) * size + 1, math.min(total, page * size) do paged[#paged + 1] = out[i] end
    return { ok = true, rows = paged, total = total, page = page, pages = math.max(1, math.ceil(total / size)) }
end)

local function loadVehicles(cid)
    local out = {}
    if Framework == 'qb' or Framework == 'qbx' then
        local rows = dbQuery('SELECT plate, vehicle, state, garage, fuel, engine, body, balance, depotprice FROM player_vehicles WHERE citizenid = ?', { cid })
        if #rows == 0 then rows = dbQuery('SELECT plate, vehicle, state, garage, fuel, engine, body FROM player_vehicles WHERE citizenid = ?', { cid }) end
        for i = 1, #rows do
            local r = rows[i]
            local s = tonumber(r.state) or 0
            out[#out + 1] = {
                plate = r.plate, model = r.vehicle, label = vehicleLabel(r.vehicle),
                state = s == 1 and locale('eco_state_garaged') or s == 2 and locale('eco_state_impounded') or locale('eco_state_out'),
                stateCode = s, garage = r.garage or '-', fuel = tonumber(r.fuel) or 0,
                engine = math.floor((tonumber(r.engine) or 0) / 10), body = math.floor((tonumber(r.body) or 0) / 10),
                balance = tonumber(r.balance) or 0
            }
        end
    elseif Framework == 'esx' then
        local rows = dbQuery('SELECT plate, vehicle, stored FROM owned_vehicles WHERE owner = ?', { cid })
        for i = 1, #rows do
            local v = safeDecode(rows[i].vehicle, {})
            out[#out + 1] = { plate = rows[i].plate, model = tostring(v.model or '-'), label = tostring(v.model or '-'),
                state = rows[i].stored == 1 and locale('eco_state_garaged') or locale('eco_state_out'), stateCode = rows[i].stored == 1 and 1 or 0, garage = '-', fuel = 0, engine = 0, body = 0, balance = 0 }
        end
    end
    return out
end

guard('getPlayer', function(src, data)
    local p = findPlayer(data.cid)
    if not p then return { ok = false, error = locale('eco_err_player_not_found') } end
    local invoices = dbQuery('SELECT * FROM player_invoices WHERE receiver = ? ORDER BY id DESC LIMIT 100', { p.cid })
    local txRow = dbSingle('SELECT transactions FROM player_transactions WHERE id = ?', { p.cid })
    local txs = txRow and safeDecode(txRow.transactions, {}) or {}
    local tx = {}
    for i = 1, math.min(40, #txs) do tx[#tx + 1] = txs[i] end
    local taxes = dbQuery('SELECT tax_key, base, amount, note, created_at FROM economy_tax_log WHERE citizenid = ? ORDER BY id DESC LIMIT 30', { p.cid })
    local taxPaid = dbSingle('SELECT COALESCE(SUM(amount),0) AS s FROM economy_tax_log WHERE citizenid = ?', { p.cid })
    for i = 1, #taxes do taxes[i].label = TAX_LABELS[taxes[i].tax_key] or taxes[i].tax_key end
    local audits = dbQuery('SELECT admin_name, action, detail, created_at FROM economy_audit WHERE target = ? ORDER BY id DESC LIMIT 15', { p.cid })
    return { ok = true, player = p, vehicles = loadVehicles(p.cid), invoices = invoices, transactions = tx,
             taxes = taxes, taxPaid = taxPaid and num(taxPaid.s) or 0, audits = audits }
end)

guard('playerMoney', function(src, data)
    local op, kind = data.op, data.kind
    if op ~= 'add' and op ~= 'remove' and op ~= 'set' then return { ok = false, error = locale('eco_err_invalid_op') } end
    local amount = num(data.amount)
    if amount > 1e10 then return { ok = false, error = locale('eco_err_max_amount') } end
    local ok, err = modifyMoney(data.cid, kind, op, amount, locale('eco_admin_prefix') .. tostring(data.reason or locale('eco_panel')))
    if not ok then return { ok = false, error = err } end
    audit(src, 'money_' .. op, data.cid, ('%s %s $%s | %s'):format(kind, op, amount, tostring(data.reason or '-')))
    return { ok = true }
end)

guard('toggleExempt', function(src, data)
    local list = cfg.exempt.citizenids
    local found = false
    for i = 1, #list do if list[i] == data.cid then table.remove(list, i) found = true break end end
    if not found then list[#list + 1] = data.cid end
    saveCfg()
    playersCache = nil
    audit(src, found and 'exempt_remove' or 'exempt_add', data.cid, locale('eco_audit_tax_exempt'))
    return { ok = true, exempt = not found }
end)

guard('createInvoice', function(src, data)
    local amount = floor(num(data.amount))
    if amount < 1 then return { ok = false, error = locale('eco_err_invalid_amount_t') } end
    local reason = tostring(data.reason or ''):sub(1, 200)
    if reason == '' then reason = locale('eco_admin_invoice') end
    local ok = createTaxInvoice(data.cid, amount, reason, data.senderLabel ~= '' and data.senderLabel or nil)
    if not ok then return { ok = false, error = locale('eco_err_invoice_create') } end
    local P = GetPlayerObjectFromID(data.cid)
    if P then
        local s = P.PlayerData and P.PlayerData.source or P.source
        if s then Notify(s, { title = locale('eco_new_invoice'), description = locale('eco_invoice_issued_desc', amount, reason), type = 'inform' }) end
    end
    playersCache = nil
    audit(src, 'invoice_create', data.cid, ('$%d | %s'):format(amount, reason))
    return { ok = true }
end)

guard('getInvoices', function(src, data)
    local search = tostring(data.search or ''):lower()
    local rows = dbQuery('SELECT * FROM player_invoices ORDER BY id DESC LIMIT 2000')
    local names = {}
    local list = loadPlayers(false)
    for i = 1, #list do names[list[i].cid] = list[i].name end
    local out = {}
    for i = 1, #rows do
        local r = rows[i]
        r.receiver_name = names[r.receiver] or r.receiver
        local hay = ((r.receiver_name or '') .. ' ' .. (r.sender_name or '') .. ' ' .. (r.reason or '') .. ' ' .. (r.receiver or '')):lower()
        local ok = search == '' or hay:find(search, 1, true)
        if ok and data.sender and data.sender ~= '' and data.sender ~= 'all' and r.sender ~= data.sender then ok = false end
        if ok then out[#out + 1] = r end
    end
    local total = #out
    local page = math.max(1, tonumber(data.page) or 1)
    local size = 25
    local paged = {}
    for i = (page - 1) * size + 1, math.min(total, page * size) do paged[#paged + 1] = out[i] end
    local sum = 0
    for i = 1, total do sum = sum + num(out[i].amount) end
    local senders = dbQuery('SELECT DISTINCT sender, sender_name FROM player_invoices')
    return { ok = true, rows = paged, total = total, pages = math.max(1, math.ceil(total / size)), page = page, sum = sum, senders = senders }
end)

guard('invoiceAction', function(src, data)
    local op = data.op
    if op == 'delete' then
        local ids = data.ids or { data.id }
        local n = 0
        for i = 1, #ids do
            local r = dbExec('DELETE FROM player_invoices WHERE id = ?', { ids[i] })
            if r and r > 0 then n = n + 1 end
        end
        audit(src, 'invoice_delete', #ids == 1 and ids[1] or locale('eco_bulk'), locale('eco_audit_invoices_deleted', n))
        playersCache = nil
        return { ok = true, deleted = n }
    elseif op == 'edit' then
        local amount = floor(num(data.amount))
        if amount < 1 then return { ok = false, error = locale('eco_err_invalid_amount_t') } end
        dbExec('UPDATE player_invoices SET amount = ?, reason = ? WHERE id = ?', { amount, tostring(data.reason or ''):sub(1, 250), data.id })
        audit(src, 'invoice_edit', data.id, ('$%d | %s'):format(amount, tostring(data.reason or '')))
        playersCache = nil
        return { ok = true }
    elseif op == 'forgiveAll' then
        local r = dbExec('DELETE FROM player_invoices WHERE receiver = ?', { data.cid })
        audit(src, 'invoice_forgive_all', data.cid, locale('eco_audit_invoices_deleted', r or 0))
        playersCache = nil
        return { ok = true, deleted = r or 0 }
    end
    return { ok = false, error = locale('eco_err_invalid_op') }
end)

guard('vehicleAction', function(src, data)
    if Framework ~= 'qb' and Framework ~= 'qbx' then return { ok = false, error = locale('eco_err_qb_only') } end
    local op, plate = data.op, data.plate
    if not plate then return { ok = false, error = locale('eco_err_no_plate') } end
    if op == 'garage' then
        dbExec('UPDATE player_vehicles SET state = 1 WHERE plate = ?', { plate })
    elseif op == 'delete' then
        dbExec('DELETE FROM player_vehicles WHERE plate = ?', { plate })
    elseif op == 'transfer' then
        local target = findPlayer(data.target)
        if not target then return { ok = false, error = locale('eco_err_target_not_found') } end
        dbExec('UPDATE player_vehicles SET citizenid = ? WHERE plate = ?', { target.cid, plate })
    else
        return { ok = false, error = locale('eco_err_invalid_op') }
    end
    playersCache = nil
    audit(src, 'vehicle_' .. op, data.cid or plate, locale('eco_audit_plate', plate, data.target or ''))
    return { ok = true }
end)

guard('getConfig', function(src, data)
    local jobs = {}
    local ok, j, g = pcall(GetFrameworkGroups)
    if ok and j then
        for name, v in pairs(j) do jobs[#jobs + 1] = { name = name, label = v.label or name } end
        table.sort(jobs, function(a, b) return a.label:lower() < b.label:lower() end)
    end
    local lastRun = {}
    for k, v in pairs(state.lastRun) do lastRun[k] = v end
    return { ok = true, config = cfg, labels = TAX_LABELS, jobs = jobs, lastRun = lastRun, now = os.time() }
end)

local function clampRate(v) v = num(v); if v < 0 then v = 0 end; if v > 100 then v = 100 end; return v end
local function clampNum(v) v = num(v); if v < 0 then v = 0 end; return v end

guard('saveConfig', function(src, data)
    local n = data.config
    if type(n) ~= 'table' or type(n.taxes) ~= 'table' then return { ok = false, error = locale('eco_err_invalid_data') } end
    local old = json.encode(cfg.taxes)
    local T = cfg.taxes

    local function copyTax(key, fields)
        local nt = n.taxes[key]
        if type(nt) ~= 'table' then return end
        T[key].enabled = nt.enabled == true
        for _, f in ipairs(fields) do
            local v = nt[f[1]]
            if v ~= nil then
                if f[2] == 'rate' then T[key][f[1]] = clampRate(v)
                elseif f[2] == 'num' then T[key][f[1]] = clampNum(v)
                elseif f[2] == 'mode' then T[key][f[1]] = (v == 'direct') and 'direct' or 'invoice'
                elseif f[2] == 'bool' then T[key][f[1]] = v == true end
            end
        end
    end

    copyTax('transfer', { { 'rate', 'rate' }, { 'min', 'num' }, { 'max', 'num' } })
    copyTax('invoice', { { 'rate', 'rate' } })
    copyTax('deposit', { { 'rate', 'rate' } })
    copyTax('withdraw', { { 'rate', 'rate' } })
    copyTax('vehicleSpawn', { { 'flat', 'num' }, { 'rate', 'rate' } })
    copyTax('salary', { { 'rate', 'rate' } })
    copyTax('vehicleOwn', { { 'flat', 'num' }, { 'interval', 'num' }, { 'mode', 'mode' }, { 'includeOffline', 'bool' } })
    copyTax('houseOwn', { { 'flat', 'num' }, { 'interval', 'num' }, { 'mode', 'mode' }, { 'includeOffline', 'bool' } })
    copyTax('wealth', { { 'rate', 'rate' }, { 'interval', 'num' }, { 'threshold', 'num' }, { 'mode', 'mode' },
                        { 'includeOffline', 'bool' }, { 'countCash', 'bool' }, { 'countBank', 'bool' } })

    -- Job bazlı fatura vergisi
    if type(n.taxes.invoice.jobRates) == 'table' then
        local jr = {}
        for k, v in pairs(n.taxes.invoice.jobRates) do jr[tostring(k)] = clampRate(v) end
        T.invoice.jobRates = jr
    end
    -- Maaş vergisi sebepleri
    if type(n.taxes.salary.reasons) == 'table' then
        local rs = {}
        for _, r in ipairs(n.taxes.salary.reasons) do if tostring(r) ~= '' then rs[#rs + 1] = tostring(r) end end
        T.salary.reasons = rs
    end
    -- Kademeli varlık vergisi
    if type(n.taxes.wealth.brackets) == 'table' then
        local br = {}
        for _, b in ipairs(n.taxes.wealth.brackets) do
            br[#br + 1] = { from = clampNum(b.from), rate = clampRate(b.rate) }
        end
        T.wealth.brackets = br
    end

    -- Genel ayarlar
    if type(n.allowedJobs) == 'table' then
        local aj = {}
        for _, j in ipairs(n.allowedJobs) do aj[#aj + 1] = tostring(j) end
        cfg.allowedJobs = aj
    end
    if type(n.exempt) == 'table' then
        if type(n.exempt.jobs) == 'table' then
            local ej = {}
            for _, j in ipairs(n.exempt.jobs) do ej[#ej + 1] = tostring(j) end
            cfg.exempt.jobs = ej
        end
        if type(n.exempt.citizenids) == 'table' then
            local ec = {}
            for _, c in ipairs(n.exempt.citizenids) do ec[#ec + 1] = tostring(c) end
            cfg.exempt.citizenids = ec
        end
    end
    if type(n.invoice) == 'table' then
        cfg.invoice.minAmount = math.max(1, clampNum(n.invoice.minAmount))
        cfg.invoice.maxAmount = clampNum(n.invoice.maxAmount)
    end
    if type(n.treasury) == 'table' then
        cfg.treasury.enabled = n.treasury.enabled == true
        local acct = tostring(n.treasury.account or ''):gsub('[^%w_%-]', '')
        if acct ~= '' then cfg.treasury.account = acct end
        if tostring(n.treasury.label or '') ~= '' then cfg.treasury.label = tostring(n.treasury.label):sub(1, 50) end
    end
    if num(n.snapshotInterval) >= 5 then cfg.snapshotInterval = num(n.snapshotInterval) end

    saveCfg()
    playersCache = nil
    if cfg.treasury.enabled then ensureTreasury() end
    audit(src, 'config_save', locale('eco_audit_tax'), locale('eco_audit_config_saved'))
    return { ok = true, config = cfg }
end)

guard('runTax', function(src, data)
    local key = data.key
    if key ~= 'wealth' and key ~= 'vehicleOwn' and key ~= 'houseOwn' then return { ok = false, error = locale('eco_err_tax_no_manual') } end
    if not cfg.taxes[key].enabled then return { ok = false, error = locale('eco_err_tax_enable_first') } end
    local c, s = Economy.RunCycle(key, true)
    audit(src, 'tax_run', key, locale('eco_audit_tax_run', c, s))
    return { ok = true, count = c, sum = s }
end)

guard('previewTax', function(src, data)
    local key = data.key
    local list = loadPlayers(true)
    local t = cfg.taxes[key]
    if not t then return { ok = false, error = locale('eco_err_unknown_tax') } end
    local count, sum = 0, 0
    for i = 1, #list do
        local rec = list[i]
        if (rec.online or t.includeOffline) and not isCidExempt(rec.cid, rec.job) and not rec.suspicious then
            local tax = 0
            if key == 'wealth' then
                tax = calcWealth((t.countBank ~= false and rec.bank or 0) + (t.countCash ~= false and rec.cash or 0))
            elseif key == 'vehicleOwn' or key == 'houseOwn' then
                tax = (key == 'vehicleOwn' and rec.vehicles or rec.houses) * num(t.flat)
            end
            if tax > 0 then count = count + 1; sum = sum + tax end
        end
    end
    return { ok = true, count = count, sum = sum }
end)

guard('getLogs', function(src, data)
    local kind = data.kind == 'audit' and 'audit' or 'tax'
    local page = math.max(1, tonumber(data.page) or 1)
    local size = 30
    local search = '%' .. tostring(data.search or '') .. '%'
    local rows, total
    if kind == 'tax' then
        local keyFilter = (data.key and data.key ~= '' and data.key ~= 'all') and data.key or nil
        local where = '(name LIKE ? OR citizenid LIKE ? OR note LIKE ?)'
        local params = { search, search, search }
        if keyFilter then where = where .. ' AND tax_key = ?'; params[#params + 1] = keyFilter end
        local c = dbSingle('SELECT COUNT(*) AS c FROM economy_tax_log WHERE ' .. where, params)
        total = c and c.c or 0
        params[#params + 1] = size; params[#params + 1] = (page - 1) * size
        rows = dbQuery('SELECT * FROM economy_tax_log WHERE ' .. where .. ' ORDER BY id DESC LIMIT ? OFFSET ?', params)
        for i = 1, #rows do rows[i].label = TAX_LABELS[rows[i].tax_key] or rows[i].tax_key end
    else
        local where = '(admin_name LIKE ? OR target LIKE ? OR action LIKE ? OR detail LIKE ?)'
        local params = { search, search, search, search }
        local c = dbSingle('SELECT COUNT(*) AS c FROM economy_audit WHERE ' .. where, params)
        total = c and c.c or 0
        params[#params + 1] = size; params[#params + 1] = (page - 1) * size
        rows = dbQuery('SELECT * FROM economy_audit WHERE ' .. where .. ' ORDER BY id DESC LIMIT ? OFFSET ?', params)
    end
    return { ok = true, rows = rows, total = total, page = page, pages = math.max(1, math.ceil(total / size)) }
end)

-- ---------------------------------------------------------------------
--  /ekonomi KOMUTU
-- ---------------------------------------------------------------------
RegisterCommand(locale('cmd_economy'), function(source)
    if source == 0 then
        local list = loadPlayers(true)
        local b, c = 0, 0
        for i = 1, #list do if not list[i].suspicious then b = b + list[i].bank; c = c + list[i].cash end end
        print(locale('eco_log_server_economy', #list, b, c, Economy.TreasuryBalance()))
        return
    end
    if not Economy.IsAdmin(source) then
        Notify(source, { title = locale('eco_no_permission_title'), description = locale('eco_admin_only_cmd'), type = 'error' })
        return
    end
    local _, name = adminInfo(source)
    TriggerClientEvent('Renewed-Banking:client:openEconomy', source, { adminName = name })
end, false)

-- Eski config'e erişen scriptler için
function Economy.IsJobAllowedToInvoice(jobName)
    return listHas(cfg.allowedJobs, jobName)
end
function Economy.GetInvoiceLimits()
    return num(cfg.invoice.minAmount, 1), num(cfg.invoice.maxAmount, 0)
end
