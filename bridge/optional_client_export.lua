-- OPTIONAL, authorized client Lua ONLY. The public monitor does not need game-server edits.
-- Cannot be run via lua_run_cl/lua_openscript_cl if sv_allowcslua is disabled.
-- This script reads the NPP phone app's already-received state; it does NOT
-- subscribe on its own or request server data.
-- The game phone must remain open; server may restrict NPP subscriptions by role.
if not CLIENT then return end

timer.Create('SyndicateNPP_Export', 1, 0, function()
    local p = SPHONE and SPHONE.NPP
    local cache = p and p.S
    if not cache or not istable(cache.st) or not istable(cache.st.s) then return end
    if not isnumber(cache.at) then return end
    if cache.at == _G.SyndicateNPP_LastExportAt then return end
    _G.SyndicateNPP_LastExportAt = cache.at
    -- Only the station state; deliberately exclude the phone's pay/money/crew tabs.
    local result = util.TableToJSON({s = cache.st.s})
    if isstring(result) and #result < 80000 then
        file.Write('syndicate_npp_monitor.json', result)
    end
end)
