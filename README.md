# Renewed-Banking

A banking resource for FiveM (QBCore / QBox / ESX) with personal, job, gang and shared accounts, invoices, and a built-in **economy & tax management panel**.

This is a customized version of [Renewed-Banking](https://discord.gg/P3RMrbwA8n) 2.1.x. On top of the original resource it adds an economy/tax system, a custom invoice system, a config-driven language setting and a localized UI.

> Original resource created & maintained by uShifty. The 2.0 UI was redesigned by [qwadebot](https://github.com/qw-scripts) and edited by [uShifty](https://github.com/uShifty). See [LICENSE](LICENSE).

---

<img width="1906" height="1077" alt="image" src="https://github.com/user-attachments/assets/2364d1b5-7ac1-4b09-a2b1-111fe279c627" />
<img width="1083" height="725" alt="image" src="https://github.com/user-attachments/assets/2b9134d2-90dc-4020-bbf5-86eece3a723c" />



## Features

- Personal, job, gang and shared (organization) accounts
- Deposit, withdraw and transfer between accounts / players
- Invoice system (`/billing`) with an unpaid-invoices screen
- **Economy panel** (`/economy`): server-wide statistics, player & vehicle management, invoice management, tax center, logs
- **Tax system** with live-editable rates: transfer, invoice, deposit, withdraw, vehicle spawn, salary, vehicle ownership, property ownership, wealth (flat or progressive brackets)
- Government treasury account that collects the taxes
- Config-driven language (`Config.locale`), 22 locale files, UI follows the selected language
- Clear error notifications for insufficient funds and unknown/offline transfer targets

## Dependencies

- [oxmysql](https://github.com/overextended/oxmysql)
- [ox_lib](https://github.com/overextended/ox_lib)
- [ox_target](https://github.com/overextended/ox_target)
- One supported framework (auto-detected): `qbx_core`, `qb-core` or `es_extended`

Other frameworks can be added by editing `server/framework.lua` and `client/framework.lua`.

## Installation

1. Import `Renewed-Banking.sql` (the resource also creates the tables automatically on start).
2. Put the resource in your resources folder and make sure it starts after `ox_lib` and `oxmysql`:
   ```cfg
   ensure ox_lib
   ensure oxmysql
   ensure Renewed-Banking
   ```
3. Edit `config.lua` (see below).
4. Give your admins access to the economy panel (see [Permissions](#permissions)).
5. Integrate the [exports](#exports) in any external resource that touches bank money.

**QBCore / QBox only:** if you used `qb-management`, replace its exports with the ones below (this resource `provide`s `qb-management` and `esx_society`):

```lua
exports['qb-management']:GetAccount      => exports['Renewed-Banking']:getAccountMoney
exports['qb-management']:AddMoney        => exports['Renewed-Banking']:addAccountMoney
exports['qb-management']:RemoveMoney     => exports['Renewed-Banking']:removeAccountMoney
exports['qb-management']:GetGangAccount => exports['Renewed-Banking']:getAccountMoney
exports['qb-management']:AddGangMoney    => exports['Renewed-Banking']:addAccountMoney
exports['qb-management']:RemoveGangMoney => exports['Renewed-Banking']:removeAccountMoney
```

**Society bank access:** edit `QBCore/Shared/jobs.lua` and `QBCore/Shared/gangs.lua` and add `bankAuth = true` to the job/gang grades that should access society funds.

## Configuration

`config.lua`:

| Option | Default | Description |
|---|---|---|
| `Config.locale` | `'en'` | UI / notification / command language. Any file name in `locales/` (`en`, `tr`, `de`, `fr`, ...). **Does not use the `ox:locale` convar.** Missing keys fall back to English. |
| `Config.currency` | `'USD'` | Currency used by the UI. |
| `Config.renewedMultiJob` | `false` | QBCore only. Enables Renewed Phones multi-job support. |
| `Config.progressbar` | `'circle'` | `circle` or `rectangle`. |
| `Config.atms` | ATM props | Props that open the ATM UI. |
| `Config.peds` | bank peds | Bank ped models and coordinates (`createAccounts = true` allows creating shared accounts). |

Tax rates, exemptions, invoice limits, the treasury and the invoice-enabled jobs are **not** in `config.lua`: they are edited live from the economy panel (**Tax Center**) and stored in `economy_config.json`, which is created on first start.

## Localization

- Server/client text lives in `locales/<code>.json`. The loader (`shared/locale.lua`) reads `en.json` first, then overlays `Config.locale`.
- The web UI is translated at runtime from `web/public/lang/<code>.json` (source strings are Turkish; `en.json` is provided). If `Config.locale = 'tr'` no translation is applied. A language without a `lang/<code>.json` falls back to English.
- Command names are localized too (keys `cmd_invoice`, `cmd_myinvoices`, `cmd_economy`). **Restart the resource after changing `Config.locale`.**

## Commands

| English (`en`) | Turkish (`tr`) | Description |
|---|---|---|
| `/billing [id] [amount] [reason]` | `/fatura` | Issue an invoice to a player (jobs allowed in the Tax Center only). |
| `/mybills` | `/faturalarim` | Open your unpaid invoices. |
| `/economy` | `/ekonomi` | Open the economy admin panel (admins only; prints a summary in the console). |
| `/givecash [id] [amount]` | same | Hand cash to a nearby player. |

## Permissions

The economy panel is available to the server console and to anyone matching any of:

- ACE `command.<economy command>` (e.g. `command.economy`; `command.ekonomi` is also accepted), `group.admin` or `group.god`
- QBox / QBCore permission `admin` / `god`
- ESX group `admin` / `superadmin`

```cfg
add_ace group.admin command.economy allow
```

## Exports

All exports are **server-side** and called as `exports['Renewed-Banking']:<name>(...)`.

### Accounts & transactions

#### `handleTransaction`
Call this anywhere a resource adds or removes money from a bank account, so it appears in the transaction history.

```lua
local transaction = exports['Renewed-Banking']:handleTransaction(account, title, amount, message, issuer, receiver, type, transID)
```

| Param | Type | Description |
|---|---|---|
| `account` | string | Job name, custom account name or citizenid |
| `title` | string | Transaction title, e.g. `Personal Account / ABC12345` |
| `amount` | number | Amount transacted |
| `message` | string | Description |
| `issuer` | string | Business or character issuing the bill |
| `receiver` | string | Business or character receiving the bill |
| `type` | string | `deposit` or `withdraw` |
| `transID` | string? | Force a specific transaction ID instead of generating one |

Returns the transaction table (`trans_id`, `title`, `amount`, `trans_type`, `receiver`, `message`, `issuer`, `time`), or `nil` if an argument is invalid (an error is printed to the console).

#### `getAccountMoney`
```lua
local amount = exports['Renewed-Banking']:getAccountMoney(account)
```
Returns the account balance (`number`) or `false` if the account does not exist.

#### `addAccountMoney`
```lua
local ok = exports['Renewed-Banking']:addAccountMoney(account, amount)
```
Adds money to a job / shared account. Returns `true` / `false`.

#### `removeAccountMoney`
```lua
local ok = exports['Renewed-Banking']:removeAccountMoney(account, amount)
```
Removes money from a job / shared account. Returns `false` if the account does not exist or has insufficient funds.

#### `getAccountTransactions`
```lua
local transactions = exports['Renewed-Banking']:getAccountTransactions(account)
```
Returns the transaction list of a shared/job account or a player (citizenid), or `false` if not found.

#### `changeAccountName`
```lua
local ok = exports['Renewed-Banking']:changeAccountName(account, newName, src)
```
Renames an account **ID**. `src` is optional (the player to notify on error). Only use this from secure server-side code.

### Job / organization accounts

#### `GetJobAccount`
```lua
local account = exports['Renewed-Banking']:GetJobAccount(jobName)
```
Returns the cached account table (`id`, `type`, `name`, `frozen`, `amount`, `transactions`, `auth`, `creator`) or `nil`. Throws if `jobName` is not a non-empty string.

#### `CreateJobAccount`
```lua
local account = exports['Renewed-Banking']:CreateJobAccount({ name = 'mechanic', label = 'Mechanic' }, 0)
```
| Param | Type | Description |
|---|---|---|
| `job.name` | string | Unique account ID (e.g. the job name) |
| `job.label` | string | Display name |
| `initialBalance` | number? | Starting balance (default `0`) |

Returns the existing account if it already exists. Throws on invalid input or a database error.

#### `addAccountMember` / `removeAccountMember`
```lua
exports['Renewed-Banking']:addAccountMember(account, citizenid)
exports['Renewed-Banking']:removeAccountMember(account, citizenid)
```
Adds / removes a player from a shared account's access list. The player must be online (resolved by citizenid).

### Economy & taxes

#### `ChargeVehicleSpawn`
Charge the vehicle spawn tax from your garage script. Returns `true` if the player paid (or the tax is off / the player is exempt), `false` otherwise (the player is notified).

```lua
if not exports['Renewed-Banking']:ChargeVehicleSpawn(source, plate, vehicleValue) then return end
```

#### `ApplyTax`
Deduct a configured percentage tax from an amount in your own script.

```lua
local remaining, tax = exports['Renewed-Banking']:ApplyTax(source, 'salary', 5000)
```
Valid keys: `transfer`, `invoice`, `deposit`, `withdraw`, `vehicleSpawn`, `salary`, `vehicleOwn`, `houseOwn`, `wealth`. Returns the remaining amount and the tax. Exempt players (or an unknown player) get `amount, 0`. This only calculates, it does not move money.

#### `GetTaxConfig`
```lua
local cfg = exports['Renewed-Banking']:GetTaxConfig()
```
Returns the live economy configuration (taxes, treasury, exemptions, allowed jobs, invoice limits). Treat it as read-only.

#### `GetTreasuryBalance`
```lua
local balance = exports['Renewed-Banking']:GetTreasuryBalance()
```
Returns the government treasury balance.

## Database

Tables created automatically: `bank_accounts_new`, `player_transactions`, `player_invoices`, `economy_tax_log`, `economy_audit`, `economy_snapshots`.

Stored text (transaction messages, invoice reasons, logs) is saved in the language active when it was created and is not retranslated later.


