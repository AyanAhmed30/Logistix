-- =====================================================
-- Policy: Full access for service role
-- Purpose: Allow Admin Client (Service Role) full access to app_users
-- Related Table: app_users
-- Related Functionality: User Management, Authentication
-- =====================================================

create policy "Full access for service role" 
on public.app_users 
for all 
using (true) 
with check (true);
