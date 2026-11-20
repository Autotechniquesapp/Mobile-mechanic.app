# Supabase migration source of truth

The repository has 12 recoverable migration files. Issue #55 reports 56 applied production migration entries, so production has historical migration rows that are not represented by authoritative SQL in GitHub.

Do not create fake historical migrations to match the missing production rows.

Use this header for any current-schema baseline generated from production:

```sql
-- Current-schema baseline for production Supabase project.
-- This file is not recovered historical migration SQL.
-- It represents the schema state after unrecoverable historical migrations
-- that were applied in production but are not represented by authoritative
-- SQL files in GitHub.
```

The live reconciliation procedure is tracked in `docs/issue-55-supabase-migration-recovery.md`.
