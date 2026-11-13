# Chai Siang control centre

Internal dashboard for a FMCG distributor: sales and coverage, customers and credit, logistics, PAF claim forms, users and roles.
Built with Next.js, Tailwind CSS and Supabase.

## Run it

```bash
npm install
cp .env.example .env.local   # then fill in your Supabase URL and publishable key
npm run dev
```

## Database

Schema, access rules and the user-management function live in `supabase/` (`migrations/`, `functions/admin-users/`).
Apply them with the Supabase CLI (`supabase link`, `supabase db push`, `supabase functions deploy admin-users`).

## Keep private

- `.env.local` and anything in `supabase/seed/` (real customer and sales data) are ignored by git. Do not commit them or paste them into issues.
- Sign-up is switched off. Logins are created by an administrator on the Users page.
- Only the publishable key belongs in the front end. The service role key must never be added to this project's `.env` files; it exists only inside the deployed Supabase function.
