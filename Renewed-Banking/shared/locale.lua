-- Renewed-Banking | Config tabanli locale sistemi
-- Dil, ox_lib'in "ox:locale" convar'indan degil Config.locale'den secilir.
-- Once en.json yuklenir, sonra secili dil ustune yazilir (eksik anahtar = en fallback).

local resourceName = GetCurrentResourceName()

local function loadFile(lang)
    local raw = LoadResourceFile(resourceName, ('locales/%s.json'):format(lang))
    if not raw then return nil end
    if raw:sub(1, 3) == '\239\187\191' then raw = raw:sub(4) end -- UTF-8 BOM
    local ok, data = pcall(json.decode, raw)
    if not ok or type(data) ~= 'table' then
        print(('^6[^3Renewed-Banking^6]^0 locales/%s.json okunamadi: %s'):format(lang, tostring(data)))
        return nil
    end
    return data
end

local lang = tostring(Config.locale or 'en'):lower():gsub('[^%w_%-]', '')

local Locales = loadFile('en') or {}

if lang ~= 'en' then
    local selected = loadFile(lang)
    if selected then
        for k, v in pairs(selected) do Locales[k] = v end
    else
        print(('^6[^3Renewed-Banking^6]^0 Config.locale = "%s" bulunamadi, en kullaniliyor.'):format(lang))
        lang = 'en'
    end
end

-- ${anahtar} yer tutucularini coz (ox_lib davranisi)
for k, v in pairs(Locales) do
    if type(v) == 'string' and v:find('${', 1, true) then
        Locales[k] = v:gsub('%${([%w_]+)}', function(ref) return Locales[ref] or ('${' .. ref .. '}') end)
    end
end

ActiveLocale = lang

function GetLocales()
    return Locales
end

function locale(key, ...)
    local str = Locales[key]
    if not str then return key end
    if select('#', ...) > 0 then
        local ok, res = pcall(string.format, str, ...)
        return ok and res or str
    end
    return str
end
