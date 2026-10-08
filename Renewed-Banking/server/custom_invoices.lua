-- Custom Invoice and Tax System

-- Vergi oranları artık server/economy.lua + /ekonomi panelinden yönetilir

-- Transfer Override (Adding Tax)
lib.callback.register('Renewed-Banking:server:transfer', function(source, data)
    local Player = GetPlayerObject(source)
    local totalAmount = tonumber(data.amount)
    if not totalAmount or totalAmount < 1 then
        Notify(source, {title = locale("bank_name"), description = locale("invalid_amount", "transfer"), type = "error"})
        return false
    end
    
    -- Hedef ID boş/geçersizse hemen hata ver
    local targetId = tostring(data.stateid or ''):match('^%s*(.-)%s*$')
    if targetId == '' then
        Notify(source, {title = locale("bank_name"), description = locale("unknown_player", ""), type = "error"})
        return false
    end
    data.stateid = targetId

    local tax = Economy.IsExempt(Player) and 0 or Economy.CalcPercent('transfer', totalAmount)
    local amount = totalAmount - tax

    local name = GetCharacterName(Player)
    if not data.comment or data.comment == "" then data.comment = locale("comp_transaction", name, "transfered", totalAmount) else data.comment = data.comment end
    
    if cachedAccounts[data.fromAccount] then
        if cachedAccounts[data.stateid] then
            local canTransfer = RemoveAccountMoney(data.fromAccount, totalAmount)
            if canTransfer then
                AddAccountMoney(data.stateid, amount)
                local title = ("%s / %s"):format(cachedAccounts[data.fromAccount].name, data.fromAccount)
                local transaction = exports['Renewed-Banking']:handleTransaction(data.fromAccount, title, totalAmount, data.comment, cachedAccounts[data.fromAccount].name, cachedAccounts[data.stateid].name, "withdraw")
                exports['Renewed-Banking']:handleTransaction(data.stateid, title, amount, data.comment, cachedAccounts[data.fromAccount].name, cachedAccounts[data.stateid].name, "deposit", transaction.trans_id)
            else
                TriggerClientEvent('Renewed-Banking:client:sendNotification', source, locale("not_enough_money"))
                return false
            end
        else
            local Player2 = GetPlayerObjectFromID(data.stateid)
            if not Player2 then
                Notify(source, {title = locale("bank_name"), description = locale("unknown_player", data.stateid), type = "error"})
                return false
            end
            local canTransfer = RemoveAccountMoney(data.fromAccount, totalAmount)
            if canTransfer then
                AddMoney(Player2, amount, 'bank', data.comment)
                local plyName = GetCharacterName(Player2)
                local transaction = exports['Renewed-Banking']:handleTransaction(data.fromAccount, ("%s / %s"):format(cachedAccounts[data.fromAccount].name, data.fromAccount), totalAmount, data.comment, cachedAccounts[data.fromAccount].name, plyName, "withdraw")
                exports['Renewed-Banking']:handleTransaction(data.stateid, ("%s / %s"):format(cachedAccounts[data.fromAccount].name, data.fromAccount), amount, data.comment, cachedAccounts[data.fromAccount].name, plyName, "deposit", transaction.trans_id)
            else
                TriggerClientEvent('Renewed-Banking:client:sendNotification', source, locale("not_enough_money"))
                return false
            end
        end
    else
        local funds = GetFunds(Player)
        if cachedAccounts[data.stateid] then
            if funds.bank >= totalAmount and RemoveMoney(Player, totalAmount, 'bank', data.comment) then
                AddAccountMoney(data.stateid, amount)
                local transaction = exports['Renewed-Banking']:handleTransaction(data.fromAccount, locale("eco_personal_acc") .. data.fromAccount, totalAmount, data.comment, name, cachedAccounts[data.stateid].name, "withdraw")
                exports['Renewed-Banking']:handleTransaction(data.stateid, locale("eco_personal_acc") .. data.fromAccount, amount, data.comment, name, cachedAccounts[data.stateid].name, "deposit", transaction.trans_id)
            else
                TriggerClientEvent('Renewed-Banking:client:sendNotification', source, locale("not_enough_money"))
                return false
            end
        else
            local Player2 = GetPlayerObjectFromID(data.stateid)
            if not Player2 then
                Notify(source, {title = locale("bank_name"), description = locale("unknown_player", data.stateid), type = "error"})
                return false
            end

            if funds.bank >= totalAmount and RemoveMoney(Player, totalAmount, 'bank', data.comment) then
                AddMoney(Player2, amount, 'bank', data.comment)
                local name2 = GetCharacterName(Player2)
                local transaction = exports['Renewed-Banking']:handleTransaction(data.fromAccount, locale("eco_personal_acc") .. data.fromAccount, totalAmount, data.comment, name, name2, "withdraw")
                exports['Renewed-Banking']:handleTransaction(data.stateid, locale("eco_personal_acc") .. data.fromAccount, amount, data.comment, name, name2, "deposit", transaction.trans_id)
            else
                TriggerClientEvent('Renewed-Banking:client:sendNotification', source, locale("not_enough_money"))
                return false
            end
        end
    end
    
    if tax > 0 then
        Economy.DepositTreasury('transfer', tax, GetIdentifier(Player), name, totalAmount, locale('eco_tax_transfer_note'))
        Notify(source, {title = locale("eco_transfer_success"), description = locale("eco_transfer_arrived_tax", amount, tax), type = "success"})
    else
        Notify(source, {title = locale("eco_transfer_success"), description = locale("eco_transfer_arrived", amount), type = "success"})
    end
    
    local bankData = lib.callback.await('renewed-banking:server:initalizeBanking', source)
    return bankData
end)


local function isJobAllowed(jobName)
    return Economy.IsJobAllowedToInvoice(jobName)
end

-- Invoice System
RegisterCommand(locale('cmd_invoice'), function(source, args)
    local Player = GetPlayerObject(source)
    if not Player then return end

    -- Check Job
    local hasPermission = false
    local jobs = GetJobs(Player)
    local jobName = ""
    if type(jobs) == "table" and jobs[1] then
        for i=1, #jobs do
            if isJobAllowed(jobs[i].name) then hasPermission = true; jobName = jobs[i].name; break end
        end
    elseif jobs and isJobAllowed(jobs.name) then
        hasPermission = true
        jobName = jobs.name
    end

    if not hasPermission then
        Notify(source, {title = locale("eco_error"), description = locale("eco_inv_no_permission"), type = "error"})
        return
    end

    local targetId = tonumber(args[1])
    local amount = tonumber(args[2])
    local reason = table.concat(args, " ", 3)

    if not targetId or not amount or not reason or reason == "" then
        Notify(source, {title = locale("eco_error"), description = locale("eco_inv_usage"), type = "error"})
        return
    end

    amount = math.floor(amount)
    local minA, maxA = Economy.GetInvoiceLimits()
    if amount < minA or (maxA > 0 and amount > maxA) then
        Notify(source, {title = locale("eco_error"), description = locale("eco_inv_amount_range", minA, maxA > 0 and ("$" .. maxA) or locale("eco_unlimited")), type = "error"})
        return
    end

    local Target = GetPlayerObject(targetId)
    if not Target then
        Notify(source, {title = locale("eco_error"), description = locale("eco_player_not_found_dot"), type = "error"})
        return
    end

    local jobLabel = ""
    if type(jobs) == "table" and jobs[1] then
        for i=1, #jobs do
            if jobs[i].name == jobName then jobLabel = jobs[i].label or jobName break end
        end
    elseif jobs then
        jobLabel = jobs.label or jobName
    end

    local receiverCID = GetIdentifier(Target)
    local senderName = GetCharacterName(Player)
    local dateStr = os.date("%d.%m.%Y")

    MySQL.insert('INSERT INTO player_invoices (sender, receiver, sender_name, amount, reason, date) VALUES (?, ?, ?, ?, ?, ?)', 
        {jobName, receiverCID, jobLabel .. " - " .. senderName, amount, reason, dateStr}, function(id)
        if id then
            Notify(source, {title = locale("eco_inv_issued_title"), description = locale("eco_inv_issued_desc", amount), type = "success"})
            Notify(targetId, {title = locale("eco_new_invoice"), description = locale("eco_inv_received_desc", jobLabel, amount), type = "inform"})
        end
    end)
end, false)

lib.callback.register('Renewed-Banking:server:getInvoices', function(source)
    local Player = GetPlayerObject(source)
    if not Player then return {} end
    local cid = GetIdentifier(Player)
    
    local invoices = MySQL.query.await('SELECT * FROM player_invoices WHERE receiver = ? ORDER BY id DESC', {cid})
    return invoices
end)

lib.callback.register('Renewed-Banking:server:payInvoice', function(source, data)
    local invoiceId = data.id
    local Player = GetPlayerObject(source)
    if not Player then return false end
    local cid = GetIdentifier(Player)

    local invoice = MySQL.single.await('SELECT * FROM player_invoices WHERE id = ? AND receiver = ?', {invoiceId, cid})

    if not invoice then
        Notify(source, {title = locale("eco_error"), description = locale("eco_inv_not_found"), type = "error"})
        return false
    end

    local totalAmount = tonumber(invoice.amount)
    local isGov = invoice.sender == 'devlet'
    local tax = 0
    if not isGov and not Economy.IsExempt(Player) then
        tax = Economy.CalcPercent('invoice', totalAmount, invoice.sender)
    end
    local amountToSender = totalAmount - tax

    if not RemoveMoney(Player, totalAmount, 'bank', locale("eco_inv_payment_reason", invoice.reason)) then
        Notify(source, {title = locale("eco_error"), description = locale("eco_inv_no_funds"), type = "error"})
        return false
    end

    MySQL.update('DELETE FROM player_invoices WHERE id = ?', {invoiceId})

    local plyName = GetCharacterName(Player)
    local trans = exports['Renewed-Banking']:handleTransaction(cid, locale("eco_inv_payment_title") .. invoice.sender_name, totalAmount, invoice.reason, plyName, invoice.sender_name, "withdraw")

    -- Devlet faturası (vergi): paranın tamamı hazineye
    if isGov then
        Economy.DepositTreasury(Economy.KeyFromReason(invoice.reason), totalAmount, cid, plyName, totalAmount, invoice.reason)
        Notify(source, {title = locale("eco_success"), description = locale("eco_tax_debt_paid", totalAmount), type = "success"})
        return true
    end

    -- Fatura vergisi hazineye
    if tax > 0 then
        Economy.DepositTreasury('invoice', tax, cid, plyName, totalAmount, invoice.reason)
    end

    local paidToSociety = false
    if AddAccountMoney then
        paidToSociety = AddAccountMoney(invoice.sender, amountToSender)
    end

    if paidToSociety then
        exports['Renewed-Banking']:handleTransaction(invoice.sender, locale("eco_inv_collection_title") .. plyName, amountToSender, invoice.reason, invoice.sender_name, invoice.sender_name, "deposit", trans.trans_id)
    else
        exports['Renewed-Banking']:handleTransaction(invoice.sender, locale("eco_inv_collection_title") .. plyName, amountToSender, invoice.reason, plyName, invoice.sender_name, "deposit", trans.trans_id)
        local TargetPlayer = GetPlayerObjectFromID(invoice.sender)
        if TargetPlayer then
            AddMoney(TargetPlayer, amountToSender, 'bank', locale("eco_inv_paid_reason", invoice.reason))
            local targetSrc = TargetPlayer.PlayerData and TargetPlayer.PlayerData.source or TargetPlayer.source
            if targetSrc then
                Notify(targetSrc, {title = locale("eco_inv_paid_title"), description = locale("eco_inv_paid_desc", amountToSender), type = "success"})
            end
        else
            if GetResourceState('qb-core') == 'started' or GetResourceState('qbx_core') == 'started' then
                local result = MySQL.single.await('SELECT money FROM players WHERE citizenid = ?', {invoice.sender})
                if result and result.money then
                    local money = json.decode(result.money)
                    money.bank = (money.bank or 0) + amountToSender
                    MySQL.update('UPDATE players SET money = ? WHERE citizenid = ?', {json.encode(money), invoice.sender})
                end
            elseif GetResourceState('es_extended') == 'started' then
                local result = MySQL.single.await('SELECT accounts FROM users WHERE identifier = ?', {invoice.sender})
                if result and result.accounts then
                    local accounts = json.decode(result.accounts)
                    if accounts.bank then
                        accounts.bank = accounts.bank + amountToSender
                        MySQL.update('UPDATE users SET accounts = ? WHERE identifier = ?', {json.encode(accounts), invoice.sender})
                    end
                end
            end
        end
    end
    Notify(source, {title = locale("eco_success"), description = locale("eco_inv_paid_success") .. (tax > 0 and locale("eco_tax_suffix", tax) or ""), type = "success"})
    return true
end)

RegisterCommand(locale('cmd_myinvoices'), function(source)
    TriggerClientEvent('Renewed-Banking:client:openFaturalarim', source)
end, false)
