const { test } = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const { readFileSync } = require("node:fs");
test("comments enforce membership, notice visibility, ownership and moderation", async () => {
  const { PGlite } = await import("@electric-sql/pglite");
  const db = new PGlite();
  try {
    const member = randomUUID(),
      other = randomUUID(),
      admin = randomUUID(),
      post = randomUUID(),
      hidden = randomUUID();
    await db.exec(`create role anon;create role authenticated;create role service_role;create schema private;create schema auth;
   create table auth.users(id uuid primary key);
   create function auth.uid() returns uuid language sql stable as $$select current_setting('test.user',true)::uuid$$;
   create function private.is_member() returns boolean language sql stable as $$select current_setting('test.member',true)='yes'$$;
   create function private.is_admin() returns boolean language sql stable as $$select current_setting('test.admin',true)='yes'$$;
   grant usage on schema private,auth to authenticated;
   create table public.announcements(id uuid primary key,deleted_at timestamptz,visible boolean);
   alter table public.announcements enable row level security;
   grant select on public.announcements to authenticated;
   create policy visible on public.announcements for select to authenticated using(visible or private.is_admin());`);
    const sql = readFileSync(
      "supabase/migrations/202611120016_post_comments.sql",
      "utf8",
    ).split("alter table public.inquiry_messages")[0];
    await db.exec(sql + "commit;");
    for (const id of [member, other, admin])
      await db.query("insert into auth.users values($1)", [id]);
    await db.query(
      "insert into public.announcements values($1,null,true),($2,null,false)",
      [post, hidden],
    );
    async function as(id, q, params, active = true) {
      await db.exec("begin;set local role authenticated");
      try {
        await db.query(
          "select set_config('test.user',$1,true),set_config('test.member',$2,true),set_config('test.admin',$3,true)",
          [id, active ? "yes" : "no", id === admin ? "yes" : "no"],
        );
        const r = await db.query(q, params);
        await db.exec("commit");
        return r.rows;
      } catch (e) {
        await db.exec("rollback");
        throw e;
      }
    }
    const add =
      "insert into public.post_comments(post_id,body) values($1,'hello') returning id";
    const [{ id }] = await as(member, add, [post]);
    await assert.rejects(as(member, add, [hidden]));
    await assert.rejects(as(other, add, [post], false));
    assert.equal(
      (
        await as(
          other,
          "update public.post_comments set body='edited' where id=$1 returning id",
          [id],
        )
      ).length,
      0,
    );
    assert.equal(
      (
        await as(
          member,
          "update public.post_comments set body='edited' where id=$1 returning id",
          [id],
        )
      ).length,
      1,
    );
    assert.equal(
      (
        await as(
          admin,
          "delete from public.post_comments where id=$1 returning id",
          [id],
        )
      ).length,
      1,
    );
  } finally {
    await db.close();
  }
});
