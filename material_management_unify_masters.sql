-- ============================================================================
-- Material Management — Unify with existing products/customers/suppliers
-- Run this ENTIRE script once in the OneAccounts Supabase SQL Editor.
-- Safe: only ADDS columns to products (nullable/defaulted), and only
-- touches mm_* tables which currently hold zero real data.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Extend the real products table with manufacturing-only fields
--    (all nullable or defaulted — existing trading products are unaffected)
-- ----------------------------------------------------------------------------
alter table products add column if not exists mm_category text;              -- RAW / CHM / STO / FG
alter table products add column if not exists mm_conversion_kg numeric;      -- bag-to-kg factor
alter table products add column if not exists mm_parent_product_id integer references products(id);
alter table products add column if not exists mm_is_rc boolean default false;
alter table products add column if not exists mm_is_sellable boolean default true;
-- Note: manufacturing UOM (kg/bags/litres/etc.) reuses the existing "unit" column.

-- ----------------------------------------------------------------------------
-- 2. Drop the mm_stock_balance view first (it depends on mm_stock_ledger.product_id,
--    which we're about to change the type of)
-- ----------------------------------------------------------------------------
drop view if exists mm_stock_balance;

-- ----------------------------------------------------------------------------
-- 3. Drop the now-unnecessary separate masters (safe — test data only)
--    CASCADE removes the old foreign key constraints pointing at them.
-- ----------------------------------------------------------------------------
drop table if exists mm_products cascade;
drop table if exists mm_customers cascade;
drop table if exists mm_suppliers cascade;

-- ----------------------------------------------------------------------------
-- 4. Repoint every Material transactional table to the real products/
--    customers/suppliers tables (all integer IDs). Since these tables are
--    empty, we drop and re-add the columns with the correct type + FK.
-- ----------------------------------------------------------------------------

-- Inward Gate Pass -> real suppliers
alter table mm_inward_gate_passes drop column if exists supplier_id;
alter table mm_inward_gate_passes add column supplier_id integer references suppliers(id);

alter table mm_igp_line_items drop column if exists product_id;
alter table mm_igp_line_items add column product_id integer not null references products(id);

-- Outward Gate Pass -> real customers
alter table mm_outward_gate_passes drop column if exists customer_id;
alter table mm_outward_gate_passes add column customer_id integer references customers(id);

alter table mm_ogp_line_items drop column if exists product_id;
alter table mm_ogp_line_items add column product_id integer not null references products(id);

-- Store Transfers -> real products
alter table mm_store_transfers drop column if exists product_id;
alter table mm_store_transfers add column product_id integer not null references products(id);

-- Production Runs -> real products
alter table mm_production_runs drop column if exists raw_material_product_id;
alter table mm_production_runs add column raw_material_product_id integer not null references products(id);

alter table mm_production_runs drop column if exists finished_good_product_id;
alter table mm_production_runs add column finished_good_product_id integer not null references products(id);

-- RC Movements -> real products
alter table mm_rc_movements drop column if exists product_id;
alter table mm_rc_movements add column product_id integer not null references products(id);

-- Stock Ledger -> real products
alter table mm_stock_ledger drop column if exists product_id;
alter table mm_stock_ledger add column product_id integer not null references products(id);

-- ----------------------------------------------------------------------------
-- 5. Recreate the stock balance view
-- ----------------------------------------------------------------------------
create or replace view mm_stock_balance as
select
  company_id,
  product_id,
  store,
  sum(quantity * direction) as qty_on_hand
from mm_stock_ledger
group by company_id, product_id, store;

-- ============================================================================
-- Done. Products, customers, and suppliers are now shared between
-- Material Management and the rest of OneAccounts.
-- ============================================================================