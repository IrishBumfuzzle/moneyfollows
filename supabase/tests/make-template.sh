#!/bin/sh
# Runs once when the supabase/postgres test container initialises (after the image's own
# migrate.sh). Copies the schema of the real `postgres` database (auth schema, roles' default
# privileges, extensions) into `paisa_template`, which db.ts clones for every test database.
# The `postgres` database itself cannot be a template: pg_net and pg_cron stay connected to it.
set -eu
psql -v ON_ERROR_STOP=1 -q -U supabase_admin -d postgres -c 'create database paisa_template'
pg_dump -U supabase_admin --schema-only -d postgres |
  psql -v ON_ERROR_STOP=1 -q -U supabase_admin -d paisa_template
psql -v ON_ERROR_STOP=1 -q -U supabase_admin -d postgres \
  -c 'alter database paisa_template with is_template true allow_connections false'
