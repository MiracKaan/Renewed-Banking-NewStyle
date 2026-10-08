-- Invoices and Economy Client
local isVisible = false

RegisterNetEvent('Renewed-Banking:client:openFaturalarim', function()
    -- Open UI showing only invoices tab, no deposit/withdraw/transfer
    isVisible = true
    SetNuiFocus(true, true)
    
    lib.callback('renewed-banking:server:initalizeBanking', false, function(accounts)
        if not accounts then
            SetNuiFocus(false, false)
            return
        end
        SendNUIMessage({
            action = 'setVisible',
            status = true,
            accounts = accounts,
            loading = false,
            locale = ActiveLocale,
            atm = false,
            openInvoices = true,
            canPay = true,
            viewOnly = true
        })
    end)
end)

RegisterNetEvent('Renewed-Banking:client:openEconomy', function(data)
    isVisible = true
    SetNuiFocus(true, true)
    SendNUIMessage({
        action = 'ecoOpen',
        locale = ActiveLocale,
        adminName = data and data.adminName or 'Admin'
    })
end)

-- Ekonomi paneli: tüm NUI istekleri tek kanaldan sunucu callback'lerine gider
RegisterNUICallback('ecoCall', function(data, cb)
    if type(data) ~= 'table' or type(data.name) ~= 'string' then return cb({ ok = false, error = locale('eco_err_invalid_request') }) end
    local result = lib.callback.await('Renewed-Banking:eco:' .. data.name, false, data.data or {})
    cb(result or { ok = false, error = locale('eco_err_no_response') })
end)

-- Chat suggestion
CreateThread(function()
    TriggerEvent('chat:addSuggestion', '/' .. locale('cmd_economy'), locale('eco_cmd_economy_help'), {})
    TriggerEvent('chat:addSuggestion', '/' .. locale('cmd_invoice'), locale('eco_cmd_invoice_help'), {
        { name = locale('eco_arg_player'), help = locale('eco_arg_player_help') },
        { name = locale('eco_arg_amount'), help = locale('eco_arg_amount_help') },
        { name = locale('eco_arg_reason'), help = locale('eco_arg_reason_help') }
    })
end)
