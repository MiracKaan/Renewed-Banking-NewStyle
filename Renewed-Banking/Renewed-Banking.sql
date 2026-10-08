CREATE TABLE IF NOT EXISTS `bank_accounts_new` (
  `id` varchar(50) NOT NULL,
  `amount` int(11) DEFAULT 0,
  `transactions` longtext DEFAULT '[]',
  `auth` longtext DEFAULT '[]',
  `isFrozen` int(11) DEFAULT 0,
  `creator` varchar(50) DEFAULT NULL,
  PRIMARY KEY (`id`)
);

CREATE TABLE IF NOT EXISTS `player_transactions` (
  `id` varchar(50) NOT NULL,
  `isFrozen` int(11) DEFAULT 0,
  `transactions` longtext DEFAULT '[]',
  PRIMARY KEY (`id`)
);


-- Ekonomi & Vergi sistemi (economy.lua bu tabloları otomatik de oluşturur)
CREATE TABLE IF NOT EXISTS `economy_tax_log` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `tax_key` varchar(32) NOT NULL,
  `citizenid` varchar(64) DEFAULT NULL,
  `name` varchar(100) DEFAULT NULL,
  `base` double DEFAULT 0,
  `amount` double DEFAULT 0,
  `note` varchar(255) DEFAULT NULL,
  `created_at` int(11) NOT NULL,
  PRIMARY KEY (`id`), KEY `idx_key` (`tax_key`), KEY `idx_time` (`created_at`)
);

CREATE TABLE IF NOT EXISTS `economy_audit` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `admin_cid` varchar(64) DEFAULT NULL,
  `admin_name` varchar(100) DEFAULT NULL,
  `action` varchar(64) NOT NULL,
  `target` varchar(100) DEFAULT NULL,
  `detail` varchar(500) DEFAULT NULL,
  `created_at` int(11) NOT NULL,
  PRIMARY KEY (`id`), KEY `idx_time` (`created_at`)
);

CREATE TABLE IF NOT EXISTS `economy_snapshots` (
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
);
