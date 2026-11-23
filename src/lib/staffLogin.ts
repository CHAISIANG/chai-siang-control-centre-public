// Staff without an email sign in with their employee code. Behind the scenes their login uses a private address
// on a domain that can never receive mail (".invalid" is reserved for exactly this), so no email is ever sent.
export const STAFF_DOMAIN = "staff.chaisiang.invalid";

/** The login address for an employee code, e.g. "10023" -> "10023@staff.chaisiang.invalid". */
export const staffEmail = (code: string) => `${code.trim().toLowerCase()}@${STAFF_DOMAIN}`;
export const isStaffEmail = (email: string | null | undefined) => !!email && email.toLowerCase().endsWith(`@${STAFF_DOMAIN}`);
/** The employee code inside a staff login address, or null for a normal email. */
export const staffCodeOf = (email: string | null | undefined) => (isStaffEmail(email) ? email!.split("@")[0].toUpperCase() : null);
/** What the sign-in box holds: an email as it is, or a staff code turned into its login address. */
export const toLoginEmail = (input: string) => { const s = input.trim(); return s.includes("@") ? s : staffEmail(s); };
/** Employee codes are letters and digits only. */
export const validCode = (s: string) => /^[A-Za-z0-9]{2,20}$/.test(s.trim());
