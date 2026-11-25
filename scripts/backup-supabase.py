"""
Weekly read-only copy of the live Supabase database, saved next to the project in ../Backups/supabase-YYYY-MM-DD.

Needs the Supabase CLI to be logged in on this PC (it is, for the person who set it up) and the project linked.
It only runs SELECT queries (--read-only). Nothing in the database changes.
Keeps the newest 8 copies and deletes older ones. A copy that fails part-way is thrown away, so a good copy is never replaced by a bad one.
The copies hold real customer, staff and sales data: keep them out of GitHub (the Backups folder is outside the repo).
"""
import datetime
import json
import os
import shutil
import subprocess
import sys

APP = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ROOT = os.path.join(os.path.dirname(APP), "Backups")
KEEP = 8
PAGE = 2000
today = datetime.date.today().isoformat()
FINAL = os.path.join(ROOT, f"supabase-{today}")
TMP = FINAL + ".partial"


def q(sql):
    r = subprocess.run(["supabase", "db", "query", "--remote", "--read-only", "--output-format", "json", sql],
                       cwd=APP, capture_output=True, text=True, encoding="utf-8", shell=True)
    out = r.stdout
    starts = [x for x in (out.find("{"), out.find("[")) if x >= 0]
    if r.returncode != 0 or not starts:
        raise RuntimeError((r.stderr or out)[-400:])
    # the CLI answers {"rows": [...]} on a terminal and a bare [...] when run by the scheduler, and may print
    # notices after it; take the first JSON value only
    try:
        got = json.JSONDecoder().raw_decode(out[min(starts):])[0]
        return got["rows"] if isinstance(got, dict) else got
    except (ValueError, KeyError):
        raise RuntimeError("unreadable answer from the Supabase CLI: " + (out[:300] + " | " + r.stderr[-200:]).replace("\n", " "))


def save(rel, obj):
    path = os.path.join(TMP, rel)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False)
    return os.path.getsize(path)


STRUCTURE = {
    "columns": "select table_schema, table_name, column_name, ordinal_position, data_type, udt_name, is_nullable, column_default from information_schema.columns where table_schema in ('public','storage') order by 1,2,4",
    "constraints": "select n.nspname as schema, c.relname as table, k.conname, k.contype, pg_get_constraintdef(k.oid) as def from pg_constraint k join pg_class c on c.oid=k.conrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' order by 1,2,3",
    "indexes": "select schemaname, tablename, indexname, indexdef from pg_indexes where schemaname='public' order by 1,2,3",
    "policies": "select schemaname, tablename, policyname, permissive, roles::text, cmd, qual, with_check from pg_policies where schemaname in ('public','storage') order by 1,2,3",
    "rls": "select n.nspname as schema, c.relname as table, c.relrowsecurity as rls_on from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' order by 1,2",
    "functions": "select n.nspname as schema, p.proname, pg_get_functiondef(p.oid) as def from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prokind in ('f','p') order by 1,2",
    "buckets": "select id, name, public, file_size_limit, allowed_mime_types from storage.buckets order by 1",
    "migrations": "select version, name, statements from supabase_migrations.schema_migrations order by version",
    "cron": "select jobid, schedule, command, jobname, active from cron.job order by 1",
    "extensions": "select extname, extversion from pg_extension order by 1",
}


def main():
    shutil.rmtree(TMP, ignore_errors=True)
    os.makedirs(TMP)
    report, bad = [], 0
    struct = {k: q(sql) for k, sql in STRUCTURE.items()}
    report.append(f"structure.json {save('structure.json', struct)} bytes")
    tables = [("public", r["table_name"]) for r in q("select table_name from information_schema.tables where table_schema='public' and table_type='BASE TABLE' order by 1")]
    tables += [("auth", "users"), ("auth", "identities"), ("storage", "buckets"), ("storage", "objects")]
    for s, t in tables:
        n = q(f'select count(*)::int as n from "{s}"."{t}"')[0]["n"]
        rows = []
        for off in range(0, max(n, 1), PAGE):
            part = q(f'select coalesce(jsonb_agg(to_jsonb(x)), \'[]\'::jsonb) as d from (select * from "{s}"."{t}" order by ctid limit {PAGE} offset {off}) x')[0]["d"]
            rows += json.loads(part) if isinstance(part, str) else part
        # rows can change while the copy runs; a small difference is fine, a big one is not
        ok = abs(len(rows) - n) <= max(5, n // 100)
        bad += 0 if ok else 1
        report.append(f"{s}.{t}: {len(rows)}/{n} rows, {save(os.path.join('data', f'{s}.{t}.json'), rows)} bytes" + ("" if ok else "  <-- COUNT MISMATCH"))
    if bad:
        raise RuntimeError(f"{bad} table(s) did not match their row count")
    with open(os.path.join(TMP, "REPORT.txt"), "w", encoding="utf-8") as f:
        f.write("\n".join(report))
    with open(os.path.join(TMP, "README.txt"), "w", encoding="utf-8") as f:
        f.write("Supabase backup of chai-siang-control-centre, taken " + today + " by scripts/backup-supabase.py (read-only).\n"
                "structure.json = columns, rules, policies, functions, buckets, jobs and every applied migration with its SQL.\n"
                "data/*.json = every row of every table in public, plus auth.users, auth.identities and the storage file lists.\n"
                "Not included: the uploaded files themselves (receipt photos), only their names.\n"
                "PRIVATE: real customer, staff and sales data and password hashes. Keep it off GitHub; do not email it.\n")
    final = FINAL
    shutil.rmtree(final, ignore_errors=True)
    if os.path.exists(final):  # a file in it is locked (OneDrive or an open window): keep both, name this one by the time
        final = f"{FINAL}-{datetime.datetime.now():%H%M}"
        shutil.rmtree(final, ignore_errors=True)
    os.rename(TMP, final)
    old = sorted(d for d in os.listdir(ROOT) if d.startswith("supabase-") and not d.endswith(".partial"))
    for d in old[:-KEEP]:
        shutil.rmtree(os.path.join(ROOT, d), ignore_errors=True)
    print(f"OK {final}: {len(tables)} tables")


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        shutil.rmtree(TMP, ignore_errors=True)
        print("FAILED:", e)
        sys.exit(1)
