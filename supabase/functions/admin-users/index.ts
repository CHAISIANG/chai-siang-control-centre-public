// Creates, edits and deletes logins. Runs with the project's service role, so it checks the caller itself:
// the caller must be signed in, active, and have the "users_manage" permission (or be the super admin).
// A protected account (the super admin) can never be changed or deleted from here.
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Use POST." }, 405);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

  // ---- who is calling ----
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: auth, error: authErr } = await admin.auth.getUser(token);
  if (authErr || !auth.user) return json({ error: "You are not signed in." }, 401);
  const callerId = auth.user.id;
  const { data: me } = await admin.from("profiles").select("role, active").eq("id", callerId).maybeSingle();
  if (!me || !me.active) return json({ error: "Your login is switched off." }, 403);
  const { data: myRole } = await admin.from("roles").select("is_super").eq("name", me.role).maybeSingle();
  const has = async (perm: string) => {
    if (myRole?.is_super) return true;
    const { data: g } = await admin.from("role_permissions").select("allowed").eq("role", me.role).eq("permission", perm).maybeSingle();
    return !!g?.allowed;
  };
  const canUsers = await has("users_manage");
  const canPortal = await has("portal_manage");
  if (!canUsers && !canPortal) return json({ error: "You do not have permission to manage users." }, 403);

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ error: "Bad request." }, 400); }
  const action = String(body.action ?? "");
  if (action === "create_distributor" ? !canPortal : !canUsers) return json({ error: action === "create_distributor" ? "You do not have permission to manage distributors." : "You do not have permission to manage users." }, 403);

  const roleNeedsSalesman = async (role: string) => {
    if (role === "distributor") return { ok: true, needs: false };
    const { data: r } = await admin.from("roles").select("is_super").eq("name", role).maybeSingle();
    if (!r) return { ok: false, needs: false };
    if (r.is_super) return { ok: true, needs: false };
    const { data: g } = await admin.from("role_permissions").select("allowed").eq("role", role).eq("permission", "view_all_data").maybeSingle();
    // only roles that see sales figures are tied to a salesman; HR-only roles (Staff, HR) are not
    const { data: sales } = await admin.from("role_permissions").select("permission").eq("role", role).eq("allowed", true).in("permission", ["page_sales", "page_customers", "page_dashboard"]);
    return { ok: true, needs: !g?.allowed && role !== "pending" && (sales ?? []).length > 0 };
  };

  // ---- list ----
  if (action === "list") {
    const { data: list, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (error) return json({ error: error.message }, 500);
    const { data: profiles } = await admin.from("profiles").select("id, full_name, role, salesman_code, active, protected");
    const byId = new Map((profiles ?? []).map((p) => [p.id, p]));
    return json({
      users: list.users.map((u) => {
        const p = byId.get(u.id);
        return {
          id: u.id, email: u.email, full_name: p?.full_name ?? null, role: p?.role ?? "pending", salesman_code: p?.salesman_code ?? null,
          active: p?.active ?? false, protected: p?.protected ?? false, last_sign_in_at: u.last_sign_in_at ?? null, created_at: u.created_at,
          confirmed: !!u.email_confirmed_at,
        };
      }).sort((a, b) => (a.created_at < b.created_at ? -1 : 1)),
    });
  }

  // ---- create a distributor login with its portal account ----
  if (action === "create_distributor") {
    const email = String(body.email ?? "").trim().toLowerCase();
    const password = String(body.password ?? "");
    const company = String(body.company_name ?? "").trim();
    const code = String(body.code ?? "").trim().toUpperCase();
    const tier = String(body.tier ?? "Silver");
    const limit = Number(body.credit_limit ?? 0);
    const outstanding = Number(body.outstanding ?? 0);
    if (!/^\S+@\S+\.\S+$/.test(email)) return json({ error: "Enter a valid email address." }, 400);
    if (password.length < 8) return json({ error: "The password must be at least 8 characters." }, 400);
    if (!company) return json({ error: "Enter the company name." }, 400);
    if (!/^[A-Z0-9-]{3,20}$/.test(code)) return json({ error: "The distributor ID must be 3 to 20 letters, numbers or dashes, for example DIST-10482." }, 400);
    if (!["Bronze", "Silver", "Gold", "Platinum"].includes(tier)) return json({ error: "Choose a tier." }, 400);
    if (!(limit >= 0) || !(outstanding >= 0)) return json({ error: "Credit limit and amount owed cannot be negative." }, 400);
    const { data: created, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: company } });
    if (error || !created.user) return json({ error: error?.message ?? "Could not create the login." }, 400);
    const { error: pErr } = await admin.from("profiles").upsert({ id: created.user.id, full_name: company, role: "distributor", salesman_code: null, active: true });
    const { error: aErr } = pErr ? { error: pErr } : await admin.from("portal_accounts").insert({ user_id: created.user.id, code, company_name: company, tier, credit_limit: limit, outstanding });
    if (aErr) {
      await admin.auth.admin.deleteUser(created.user.id);
      return json({ error: aErr.message.includes("portal_accounts_code_key") ? "That distributor ID is already used." : aErr.message }, 400);
    }
    return json({ ok: true, id: created.user.id });
  }

  // ---- create ----
  if (action === "create") {
    const email = String(body.email ?? "").trim().toLowerCase();
    const password = String(body.password ?? "");
    const fullName = String(body.full_name ?? "").trim();
    const role = String(body.role ?? "");
    const salesman = body.salesman_code ? String(body.salesman_code) : null;
    if (!/^\S+@\S+\.\S+$/.test(email)) return json({ error: "Enter a valid email address." }, 400);
    if (password.length < 8) return json({ error: "The password must be at least 8 characters." }, 400);
    if (!fullName) return json({ error: "Enter the person's name." }, 400);
    if (role === "super_admin") return json({ error: "The super admin can only be set in the database." }, 400);
    const rn = await roleNeedsSalesman(role);
    if (!rn.ok) return json({ error: "That role does not exist." }, 400);
    if (rn.needs && !salesman) return json({ error: "This role only sees its own customers, so pick which salesman this person is." }, 400);

    // A staff code login: someone with no email signs in with their employee code. Their login address is private
    // (on the reserved ".invalid" domain, so no mail can ever go there) and is written onto their HR record.
    const staffCode = body.staff_code ? String(body.staff_code).trim().toUpperCase() : null;
    const STAFF_DOMAIN = "staff.chaisiang.invalid";
    let staffId: string | null = null;
    if (staffCode) {
      if (!/^[A-Z0-9]{2,20}$/.test(staffCode)) return json({ error: "The staff code must be letters and numbers only." }, 400);
      if (email !== `${staffCode.toLowerCase()}@${STAFF_DOMAIN}`) return json({ error: "The login address does not match the staff code." }, 400);
      const { data: emp } = await admin.from("hr_employees").select("id, active, profile_id").eq("code", staffCode).maybeSingle();
      if (!emp) return json({ error: `There is no employee ${staffCode} in HR › Employees.` }, 400);
      if (!emp.active) return json({ error: `Employee ${staffCode} is marked as left.` }, 400);
      if (emp.profile_id) return json({ error: `Employee ${staffCode} already has a login.` }, 400);
      staffId = emp.id;
    } else if (email.endsWith(`@${STAFF_DOMAIN}`)) {
      return json({ error: "Use “Signs in with staff code” for this." }, 400);
    }

    const { data: created, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: fullName } });
    if (error || !created.user) return json({ error: /already|registered|exists/i.test(error?.message ?? "") && staffCode ? `Staff code ${staffCode} already has a login.` : error?.message ?? "Could not create the login." }, 400);
    const { error: pErr } = await admin.from("profiles").upsert({ id: created.user.id, full_name: fullName, role, salesman_code: salesman, active: true });
    const { error: hErr } = pErr || !staffId ? { error: null } : await admin.from("hr_employees").update({ email, profile_id: created.user.id, updated_at: new Date().toISOString() }).eq("id", staffId);
    if (pErr || hErr) {
      await admin.auth.admin.deleteUser(created.user.id);
      return json({ error: (pErr ?? hErr)!.message }, 400);
    }
    return json({ ok: true, id: created.user.id });
  }

  const id = String(body.id ?? "");
  if (!id) return json({ error: "Missing user." }, 400);
  const { data: target } = await admin.from("profiles").select("id, role, protected, active").eq("id", id).maybeSingle();
  if (!target) return json({ error: "That user does not exist." }, 404);
  if (target.protected) return json({ error: "This account is protected. It cannot be changed or deleted here." }, 403);

  // ---- update ----
  if (action === "update") {
    const patch: Record<string, unknown> = {};
    if (body.full_name !== undefined) patch.full_name = String(body.full_name).trim();
    if (body.role !== undefined) {
      const role = String(body.role);
      if (role === "super_admin") return json({ error: "The super admin can only be set in the database." }, 400);
      const rn = await roleNeedsSalesman(role);
      if (!rn.ok) return json({ error: "That role does not exist." }, 400);
      const salesman = body.salesman_code !== undefined ? (body.salesman_code ? String(body.salesman_code) : null) : undefined;
      if (rn.needs && !salesman) return json({ error: "This role only sees its own customers, so pick which salesman this person is." }, 400);
      patch.role = role;
      patch.salesman_code = salesman ?? null;
    }
    if (body.active !== undefined) {
      if (id === callerId) return json({ error: "You cannot switch off your own login." }, 400);
      patch.active = !!body.active;
    }
    if (Object.keys(patch).length) {
      const { error } = await admin.from("profiles").update(patch).eq("id", id);
      if (error) return json({ error: error.message }, 400);
    }
    const authPatch: Record<string, unknown> = {};
    if (body.active !== undefined) authPatch.ban_duration = body.active ? "none" : "876000h";
    if (body.password) {
      const pw = String(body.password);
      if (pw.length < 8) return json({ error: "The password must be at least 8 characters." }, 400);
      authPatch.password = pw;
    }
    if (body.full_name !== undefined) authPatch.user_metadata = { full_name: String(body.full_name).trim() };
    if (Object.keys(authPatch).length) {
      const { error } = await admin.auth.admin.updateUserById(id, authPatch);
      if (error) return json({ error: error.message }, 400);
    }
    return json({ ok: true });
  }

  // ---- delete ----
  if (action === "delete") {
    if (id === callerId) return json({ error: "You cannot delete your own login." }, 400);
    const { error } = await admin.auth.admin.deleteUser(id);
    if (error) return json({ error: error.message }, 400);
    return json({ ok: true });
  }

  return json({ error: "Unknown action." }, 400);
});
