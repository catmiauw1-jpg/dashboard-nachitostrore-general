alter table public.expenses
add column if not exists expense_scope text not null default 'Tienda'
check (expense_scope in ('Tienda', 'Personal'));

create index if not exists idx_expenses_scope_date on public.expenses (expense_scope, expense_date desc);
