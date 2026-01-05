-- ============================================================================
-- Migration: Scheduled Backup Infrastructure
-- Date: 2026-01-05
-- Purpose: Setup automatic daily backups with Storage, logging, and pg_cron
-- ============================================================================

-- 1. Create storage bucket for backups (if not exists)
-- Note: This needs to be run in the Supabase Dashboard SQL Editor
-- as storage operations require special permissions
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'backups', 
  'backups', 
  false,                          -- Private bucket
  52428800,                       -- 50MB max file size
  ARRAY['application/json']       -- Only JSON files allowed
)
ON CONFLICT (id) DO NOTHING;

-- 2. Storage policy: Only service role can manage backups
-- This ensures backups are not accessible by regular users
DROP POLICY IF EXISTS "Service role can manage backups" ON storage.objects;
CREATE POLICY "Service role can manage backups"
ON storage.objects FOR ALL
TO service_role
USING (bucket_id = 'backups')
WITH CHECK (bucket_id = 'backups');

-- 3. Create backup logs table
CREATE TABLE IF NOT EXISTS backup_logs (
  id BIGSERIAL PRIMARY KEY,
  filename TEXT NOT NULL,
  size_bytes BIGINT,
  record_count INT,
  status TEXT NOT NULL CHECK (status IN ('success', 'failed', 'deleted')),
  error_message TEXT,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Enable RLS on backup_logs
ALTER TABLE backup_logs ENABLE ROW LEVEL SECURITY;

-- 5. Policy: Only admins can view backup logs
DROP POLICY IF EXISTS "Admins can view backup logs" ON backup_logs;
CREATE POLICY "Admins can view backup logs"
ON backup_logs FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE id = (SELECT auth.uid()) 
    AND role = 'admin'
  )
);

-- 6. Policy: Service role can insert/update logs
DROP POLICY IF EXISTS "Service role can manage backup logs" ON backup_logs;
CREATE POLICY "Service role can manage backup logs"
ON backup_logs FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- 7. Function to list available backups (for UI)
CREATE OR REPLACE FUNCTION list_backups()
RETURNS TABLE (
  id BIGINT,
  filename TEXT,
  size_bytes BIGINT,
  record_count INT,
  status TEXT,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Check if user is admin
  IF NOT EXISTS (
    SELECT 1 FROM profiles 
    WHERE profiles.id = auth.uid() 
    AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Only admins can list backups';
  END IF;

  RETURN QUERY
  SELECT 
    bl.id,
    bl.filename,
    bl.size_bytes,
    bl.record_count,
    bl.status,
    bl.created_at
  FROM backup_logs bl
  WHERE bl.status = 'success'  -- Only show successful backups
    AND bl.deleted_at IS NULL  -- Exclude deleted
  ORDER BY bl.created_at DESC
  LIMIT 20;
END;
$$;

-- 8. Function to get backup statistics
CREATE OR REPLACE FUNCTION get_backup_stats()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_total_backups INT;
  v_last_backup TIMESTAMPTZ;
  v_last_backup_status TEXT;
  v_storage_used BIGINT;
BEGIN
  -- Check if user is admin
  IF NOT EXISTS (
    SELECT 1 FROM profiles 
    WHERE profiles.id = auth.uid() 
    AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Only admins can view backup stats';
  END IF;

  -- Count total successful backups
  SELECT COUNT(*) INTO v_total_backups
  FROM backup_logs
  WHERE status = 'success' AND deleted_at IS NULL;

  -- Get last backup info
  SELECT created_at, status INTO v_last_backup, v_last_backup_status
  FROM backup_logs
  ORDER BY created_at DESC
  LIMIT 1;

  -- Calculate total storage used
  SELECT COALESCE(SUM(size_bytes), 0) INTO v_storage_used
  FROM backup_logs
  WHERE status = 'success' AND deleted_at IS NULL;

  RETURN jsonb_build_object(
    'total_backups', v_total_backups,
    'last_backup', v_last_backup,
    'last_backup_status', v_last_backup_status,
    'storage_used_bytes', v_storage_used,
    'storage_used_mb', ROUND(v_storage_used::NUMERIC / 1024 / 1024, 2)
  );
END;
$$;

-- 9. Indexes for performance
CREATE INDEX IF NOT EXISTS idx_backup_logs_created_at ON backup_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_backup_logs_status ON backup_logs(status);

-- ============================================================================
-- pg_cron SETUP INSTRUCTIONS
-- ============================================================================
-- 
-- After deploying the Edge Function, run this in the SQL Editor to schedule
-- daily backups at 1 AM UTC (3 AM Cairo time):
--
-- SELECT cron.schedule(
--   'daily-backup',
--   '0 1 * * *',
--   $$
--   SELECT net.http_post(
--     url := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/scheduled-backup',
--     headers := jsonb_build_object(
--       'Authorization', 'Bearer YOUR_SERVICE_ROLE_KEY',
--       'Content-Type', 'application/json'
--     ),
--     body := '{}'::jsonb
--   );
--   $$
-- );
--
-- To view scheduled jobs:
-- SELECT * FROM cron.job;
--
-- To remove a scheduled job:
-- SELECT cron.unschedule('daily-backup');
-- ============================================================================

-- 10. Grant execute permissions
GRANT EXECUTE ON FUNCTION list_backups() TO authenticated;
GRANT EXECUTE ON FUNCTION get_backup_stats() TO authenticated;

-- 11. Add comment for documentation
COMMENT ON TABLE backup_logs IS 'Tracks all automatic and manual backup operations';
COMMENT ON FUNCTION list_backups() IS 'Returns list of available backups for admin users';
COMMENT ON FUNCTION get_backup_stats() IS 'Returns backup statistics for admin dashboard';
