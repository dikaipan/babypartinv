-- Fix 403 on profiles REST access by ensuring authenticated role has table privileges
-- and RLS policies for self/admin access.

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.profiles TO authenticated;
GRANT ALL ON TABLE public.profiles TO service_role;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_admin_user()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = auth.uid()
      AND role = 'admin'
      AND COALESCE(is_active, true) = true
  );
$$;

REVOKE ALL ON FUNCTION public.is_admin_user() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_admin_user() TO authenticated, service_role;

DROP POLICY IF EXISTS profiles_select_self_or_admin ON public.profiles;
CREATE POLICY profiles_select_self_or_admin
ON public.profiles
FOR SELECT
TO authenticated
USING (
  auth.uid() = id
  OR public.is_admin_user()
);

DROP POLICY IF EXISTS profiles_insert_self_or_admin ON public.profiles;
CREATE POLICY profiles_insert_self_or_admin
ON public.profiles
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = id
  OR public.is_admin_user()
);

DROP POLICY IF EXISTS profiles_update_self_or_admin ON public.profiles;
CREATE POLICY profiles_update_self_or_admin
ON public.profiles
FOR UPDATE
TO authenticated
USING (
  auth.uid() = id
  OR public.is_admin_user()
)
WITH CHECK (
  auth.uid() = id
  OR public.is_admin_user()
);

DROP POLICY IF EXISTS profiles_delete_admin_only ON public.profiles;
CREATE POLICY profiles_delete_admin_only
ON public.profiles
FOR DELETE
TO authenticated
USING (
  public.is_admin_user()
);
