-- Super Admin "reset / clean up a tenant" in ONE transaction, in dependency-safe order.
--
-- Scopes: sales, accounts, customers, menu, inventory, suppliers, expenses, shifts,
--         tables_delivery, employees, or 'everything' (all of the above).
--
-- Always kept: the restaurant row, its subscription, tenant_payments (billing history), audit
-- logs, settings, payment methods, roles/permissions, registered devices, expense categories,
-- and the main admin employee (earliest-created employee with role 'admin').
--
-- Service-role only: the Super Admin server action calls this after its own auth check.
create or replace function public.admin_reset_restaurant_data(p_restaurant_id uuid, p_scopes text[])
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_all boolean;
  v_main_admin uuid;
  v_counts jsonb := '{}'::jsonb;
  v_n int;
begin
  if p_scopes is null or coalesce(array_length(p_scopes, 1), 0) = 0 then
    raise exception 'Nothing selected to delete.';
  end if;
  if exists (
    select 1 from unnest(p_scopes) s
    where s <> all (array['everything','sales','accounts','customers','menu','inventory','suppliers','expenses','shifts','tables_delivery','employees'])
  ) then
    raise exception 'Unknown reset option.';
  end if;
  if not exists (select 1 from restaurants where id = p_restaurant_id) then
    raise exception 'Restaurant not found.';
  end if;

  v_all := 'everything' = any(p_scopes);

  select id into v_main_admin
  from employees
  where restaurant_id = p_restaurant_id and role = 'admin'
  order by created_at asc
  limit 1;

  -- 1. Sales (sale_items / sale_payments cascade). Ledger income rows tied to those sales go too.
  if v_all or 'sales' = any(p_scopes) then
    delete from device_sale_receipts where restaurant_id = p_restaurant_id;
    delete from rider_settlements where restaurant_id = p_restaurant_id;
    delete from accounts where restaurant_id = p_restaurant_id and sale_id is not null;
    delete from sales where restaurant_id = p_restaurant_id;
    get diagnostics v_n = row_count;
    v_counts := v_counts || jsonb_build_object('sales', v_n);
  end if;

  -- 2. Whole accounts ledger (manual entries included).
  if v_all or 'accounts' = any(p_scopes) then
    delete from accounts where restaurant_id = p_restaurant_id;
    get diagnostics v_n = row_count;
    v_counts := v_counts || jsonb_build_object('accounts', v_n);
  end if;

  -- 3. Customers (orders keep existing, just unlinked).
  if v_all or 'customers' = any(p_scopes) then
    update sales set customer_id = null where restaurant_id = p_restaurant_id and customer_id is not null;
    delete from customers where restaurant_id = p_restaurant_id;
    get diagnostics v_n = row_count;
    v_counts := v_counts || jsonb_build_object('customers', v_n);
  end if;

  -- 4. Menu: products (recipe_items cascade), deals, categories.
  if v_all or 'menu' = any(p_scopes) then
    if exists (
      select 1 from sale_items si join products p on p.id = si.product_id
      where p.restaurant_id = p_restaurant_id
    ) then
      raise exception 'Menu items are used by past orders. Also delete the sales history, or choose Reset everything.';
    end if;
    delete from deal_items
    where deal_product_id in (select id from products where restaurant_id = p_restaurant_id)
       or component_product_id in (select id from products where restaurant_id = p_restaurant_id);
    delete from products where restaurant_id = p_restaurant_id;
    get diagnostics v_n = row_count;
    v_counts := v_counts || jsonb_build_object('menu_items', v_n);
    delete from menu_categories where restaurant_id = p_restaurant_id;
    get diagnostics v_n = row_count;
    v_counts := v_counts || jsonb_build_object('menu_categories', v_n);
  end if;

  -- 5. Inventory (cascades stock purchases, production logs, recipe lines).
  if v_all or 'inventory' = any(p_scopes) then
    delete from inventory_items where restaurant_id = p_restaurant_id;
    get diagnostics v_n = row_count;
    v_counts := v_counts || jsonb_build_object('inventory_items', v_n);
  end if;

  -- 6. Suppliers (ledger + promised payments cascade).
  if v_all or 'suppliers' = any(p_scopes) then
    delete from suppliers where restaurant_id = p_restaurant_id;
    get diagnostics v_n = row_count;
    v_counts := v_counts || jsonb_build_object('suppliers', v_n);
  end if;

  -- 7. Expenses + recurring expenses (categories are configuration and stay).
  if v_all or 'expenses' = any(p_scopes) then
    delete from expenses where restaurant_id = p_restaurant_id;
    get diagnostics v_n = row_count;
    v_counts := v_counts || jsonb_build_object('expenses', v_n);
    delete from recurring_expenses where restaurant_id = p_restaurant_id;
    get diagnostics v_n = row_count;
    v_counts := v_counts || jsonb_build_object('recurring_expenses', v_n);
  end if;

  -- 8. Shift records + attendance.
  if v_all or 'shifts' = any(p_scopes) then
    delete from staff_shifts where restaurant_id = p_restaurant_id;
    get diagnostics v_n = row_count;
    v_counts := v_counts || jsonb_build_object('shifts', v_n);
    delete from attendance_records where restaurant_id = p_restaurant_id;
    get diagnostics v_n = row_count;
    v_counts := v_counts || jsonb_build_object('attendance_records', v_n);
  end if;

  -- 9. Tables and delivery areas (orders / customers just lose the link).
  if v_all or 'tables_delivery' = any(p_scopes) then
    update sales set table_id = null, area_id = null
    where restaurant_id = p_restaurant_id and (table_id is not null or area_id is not null);
    update customers set area_id = null where restaurant_id = p_restaurant_id and area_id is not null;
    delete from tables where restaurant_id = p_restaurant_id;
    get diagnostics v_n = row_count;
    v_counts := v_counts || jsonb_build_object('tables', v_n);
    delete from delivery_areas where restaurant_id = p_restaurant_id;
    get diagnostics v_n = row_count;
    v_counts := v_counts || jsonb_build_object('delivery_areas', v_n);
  end if;

  -- 10. Every employee except the main admin (their ledger, user rows cascade).
  if v_all or 'employees' = any(p_scopes) then
    if v_main_admin is null then
      raise exception 'This restaurant has no admin employee to keep, so employees were not touched.';
    end if;
    update sales set cashier_employee_id = null
    where restaurant_id = p_restaurant_id and cashier_employee_id is not null and cashier_employee_id <> v_main_admin;
    update production_logs set employee_id = null
    where restaurant_id = p_restaurant_id and employee_id is not null and employee_id <> v_main_admin;
    delete from employees where restaurant_id = p_restaurant_id and id <> v_main_admin;
    get diagnostics v_n = row_count;
    v_counts := v_counts || jsonb_build_object('employees', v_n);
  end if;

  -- The main admin's own payroll ledger only goes on a full reset.
  if v_all then
    delete from employee_ledger where restaurant_id = p_restaurant_id;
  end if;

  return v_counts;
end;
$$;

revoke all on function public.admin_reset_restaurant_data(uuid, text[]) from public, anon, authenticated;
grant execute on function public.admin_reset_restaurant_data(uuid, text[]) to service_role;
