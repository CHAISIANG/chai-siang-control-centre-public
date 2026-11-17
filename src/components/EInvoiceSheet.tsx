// The company e-invoice, laid out to match the printed template exactly (A4 portrait).
// Positions are in millimetres on the full A4 sheet. Only the data changes; the layout never does.
import { Noto_Serif_TC } from "next/font/google";
import type { CSSProperties, ReactNode } from "react";
import { amountInWords, LINES_PER_PAGE, type Company, type InvoiceDoc, type Party } from "@/lib/einvoice";

const cn = Noto_Serif_TC({ weight: "900", subsets: ["latin"], preload: false, display: "block" });

const money = (n: number) => n.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dmy = (d: Date | null) => (d ? `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/${d.getUTCFullYear()}` : "");
const qtyTxt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2));

// Column edges (mm from the left edge of the sheet), from the template.
const COL = { no: 7, code: 12.5, desc: 35.5, uom: 117, price: 126.5, qty: 150, disc: 177.5, amt: 188, end: 208 };
const ROW0 = 135.2; // first line
const ROWH = 5.4;   // line spacing

const at = (left: number, top: number, extra: CSSProperties = {}): CSSProperties => ({ position: "absolute", left: `${left}mm`, top: `${top}mm`, ...extra });
const box = (left: number, top: number, width: number, height: number, extra: CSSProperties = {}): CSSProperties => ({ ...at(left, top), width: `${width}mm`, height: `${height}mm`, ...extra });

function T({ x, y, w, align = "left", size = 9.5, bold = false, children, style }: { x: number; y: number; w?: number; align?: "left" | "right" | "center"; size?: number; bold?: boolean; children: ReactNode; style?: CSSProperties }) {
  return <div style={{ ...at(x, y), width: w ? `${w}mm` : undefined, textAlign: align, fontSize: `${size}pt`, fontWeight: bold ? 700 : 400, whiteSpace: "nowrap", lineHeight: 1.15, ...style }}>{children}</div>;
}

function Address({ x, y, w, title, p, showName }: { x: number; y: number; w: number; title: string; p: Party; showName: boolean }) {
  return (
    <>
      <div style={box(x, y, w, 40.5, { border: "0.3mm solid #000", borderRadius: "5mm" })} />
      <T x={x + 1.5} y={y + 1.2} bold size={9.5}>{title}</T>
      {showName && <T x={x + 1.5} y={y + 5.8} bold size={10.5} w={w - 3} style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{p.name}</T>}
      <T x={x + 1.5} y={y + 13} size={9.5}>BRN : {p.brn}</T>
      <T x={x + w * 0.56} y={y + 13} size={9.5}>TIN: {p.tin}</T>
      {p.address.slice(0, 4).map((l, i) => <T key={i} x={x + 1.5} y={y + 17.3 + i * 4.1} size={9.5} w={w - 3} style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{l}</T>)}
      <T x={x + 1.5} y={y + 34.6} size={7.5}>EMAIL : {p.email}</T>
      <T x={x + w * 0.63} y={y + 34.6} size={7.5}>TEL : {p.tel}</T>
    </>
  );
}

function Page({ c, d, lines, first, page, pages, last }: { c: Company; d: InvoiceDoc; lines: InvoiceDoc["lines"]; first: number; page: number; pages: number; last: boolean }) {
  const totalQty = d.lines.reduce((s, l) => s + l.qty, 0);
  const total = d.lines.reduce((s, l) => s + l.amount, 0);
  return (
    <div className="einv-page" style={{ position: "relative", width: "210mm", height: "297mm", overflow: "hidden", background: "#fff", color: "#000", fontFamily: "Arial, Helvetica, sans-serif", boxShadow: "0 2px 10px rgba(0,0,0,.35)" }}>
      {/* the full A4 sheet: this view prints with no page margin (see @page einv in globals.css) */}
      <div style={{ position: "absolute", left: 0, top: 0, width: "210mm", height: "297mm" }}>
        {/* company header: fixed */}
        <div className={cn.className} style={{ ...at(0, 7.5), width: "210mm", textAlign: "center", fontSize: "25pt", lineHeight: 1, paddingLeft: "12mm" }}>{c.nameCn}</div>
        <div style={{ ...at(0, 17.6), width: "210mm", textAlign: "center", paddingLeft: "12mm", whiteSpace: "nowrap" }}>
          <span style={{ fontSize: "19pt", fontWeight: 900, letterSpacing: "0.2mm" }}>{c.name}</span>
          <span style={{ fontSize: "8.5pt", fontWeight: 700, marginLeft: "2mm" }}>{c.regNo}</span>
        </div>
        <T x={0} y={26.3} w={210} align="center" size={10.5} bold style={{ paddingLeft: "12mm" }}>TIN NO: {c.tin}</T>
        <T x={0} y={30.6} w={210} align="center" size={10.5} bold style={{ paddingLeft: "12mm" }}>{c.address}</T>
        <T x={0} y={34.6} w={210} align="center" size={9.5} bold style={{ paddingLeft: "12mm" }}>Tel No: {c.tel}&nbsp;&nbsp;&nbsp;&nbsp;Mobile No: {c.mobile}&nbsp;&nbsp;&nbsp;&nbsp;Email: {c.email}</T>
        <div style={box(6, 39, 203, 0.6, { background: "#000" })} />

        {/* title and invoice details */}
        <T x={0} y={42.5} w={210} align="center" size={18} bold style={{ paddingLeft: "12mm" }}>E-INVOICE</T>
        <T x={138.5} y={47.8} size={10}>E-Invoice No</T>
        <T x={168} y={46.6} size={14} bold>: {d.no}</T>
        <T x={138.5} y={52.6} size={10}>Date</T>
        <T x={168} y={52.3} size={10.5} bold>: {dmy(d.date)}</T>
        <T x={138.5} y={57.2} size={10}>Purchase Order No : {d.po}</T>
        <T x={138.5} y={68.8} size={10}>Our ref No</T>
        <T x={168} y={68.8} size={10}>: {d.ourRef}</T>

        {/* addresses */}
        <Address x={7} y={77.3} w={106} title="Billing Address :" p={d.bill} showName />
        <Address x={117} y={77.3} w={91} title="Delivery Address" p={d.ship} showName={false} />

        {/* attention row */}
        <div style={box(6, 119.6, 202.5, 6, { borderTop: "0.3mm solid #000", borderBottom: "0.3mm solid #000" })} />
        {[73.5, 116.5, 157].map((x) => <div key={x} style={box(x, 119.6, 0.25, 6, { background: "#000" })} />)}
        <T x={7} y={121} size={9}>Attn : {d.attn}</T>
        <T x={75} y={121} size={9}>Agent :&nbsp;&nbsp;&nbsp;{d.agent}</T>
        <T x={118} y={121} size={9}>Terms : <b>{d.terms}</b></T>
        <T x={160} y={121} size={9}>A/C Code :</T>
        <T x={180} y={120.7} size={10} bold>{d.acCode}</T>

        {/* column heads */}
        <div style={box(6, 126.4, 202.5, 6, { borderBottom: "0.3mm solid #000" })} />
        {[COL.code, COL.desc, COL.uom, COL.price, COL.qty, COL.disc, COL.amt].map((x) => <div key={x} style={box(x, 126.4, 0.25, 6, { background: "#000" })} />)}
        <T x={COL.no - 0.5} y={127.8} size={8}>No</T>
        <T x={COL.code} y={127.8} w={COL.desc - COL.code} align="center" size={8}>Code</T>
        <T x={COL.desc} y={127.8} w={COL.uom - COL.desc} align="center" size={8}>Description</T>
        <T x={COL.uom} y={127.8} w={COL.price - COL.uom} align="center" size={8}>UOM</T>
        <T x={COL.price} y={127.8} w={COL.qty - COL.price} align="center" size={8}>Price/Ctn (RM)</T>
        <T x={COL.qty} y={127.8} w={COL.disc - COL.qty} align="center" size={8}>Quantity</T>
        <T x={COL.disc} y={127.8} w={COL.amt - COL.disc} align="center" size={8}>Disc</T>
        <T x={COL.amt} y={127.8} w={COL.end - COL.amt + 1} align="center" size={8}>Amount (RM)</T>

        {/* lines */}
        {lines.map((l, i) => {
          const y = ROW0 + i * ROWH;
          return (
            <div key={i}>
              <T x={COL.no - 0.5} y={y} w={5} size={9.5}>{first + i + 1}</T>
              <T x={COL.code - 0.5} y={y} size={9.5}>{l.code}</T>
              <T x={COL.desc} y={y} w={COL.uom - COL.desc - 1} size={9} style={{ overflow: "hidden", textOverflow: "clip" }}>{l.desc.toUpperCase()}</T>
              <T x={COL.uom} y={y} w={COL.price - COL.uom} align="center" size={9.5}>{l.perCtn}</T>
              <T x={COL.price} y={y} w={COL.qty - COL.price - 6} align="right" size={9.5}>{money(l.price)}</T>
              <T x={COL.qty + 3} y={y} size={9.5} bold>{qtyTxt(l.qty)} {l.unit}</T>
              <T x={COL.disc} y={y} w={COL.amt - COL.disc + 0.5} align="right" size={9.5}>{l.disc ? money(l.disc) : ""}</T>
              <T x={COL.amt} y={y} w={COL.end - COL.amt} align="right" size={9.5}>{money(l.amount)}</T>
            </div>
          );
        })}

        {/* last page only: totals and the fixed bottom part */}
        {last && (
          <>
            <div style={box(6, 210, 202.5, 6.6, { borderTop: "0.3mm solid #000", borderBottom: "0.3mm solid #000" })} />
            <T x={9.5} y={211.2} size={11} bold>Grand Total :</T>
            <T x={158} y={211.2} size={10.5} bold>{qtyTxt(totalQty)}</T>
            <T x={170} y={211} w={37.5} align="right" size={11} bold>RM&nbsp;&nbsp;{money(total)}</T>
            <T x={7} y={218.6} size={9.5}>RINGGIT MALAYSIA : {amountInWords(total)}</T>
            <T x={74} y={224.5} size={8.5}>E. &amp; O.E</T>
            <div style={{ ...box(7, 228.5, 82, 45), fontSize: "7.6pt", lineHeight: 1.2 }}>
              <p>Any discrepancies relating to this invoice must be notified to us within seven (7) days from the date of receipt of this invoice</p>
              <p style={{ marginTop: "2.2mm" }}>Payment by cheque should be crossed and made payable to<br /><b>{c.name}</b></p>
              <p style={{ marginTop: "2.2mm" }}>For online payment, our account No. is <b>&quot;{c.bankAccountNo}&quot;</b><br />maintained at <b>&quot;{c.bankName}&quot;</b></p>
              <p style={{ marginTop: "2.2mm" }}><b>Interest</b> at the rate of <b>{c.interestPct} per month</b> will be charged on any overdue invoices from the due date until full payment is received</p>
            </div>
            <div style={box(92.5, 224, 73.5, 36.5, { border: "0.3mm solid #000", borderRadius: "5mm" })} />
            <T x={92.5} y={261.8} w={73.5} align="center" size={8}>Recipient&apos;s signature &amp; rubber stamp</T>
            <T x={168} y={229.5} w={40} align="center" size={10} bold>E-Invoice QR Code</T>
            <div style={box(178, 235, 20, 20, { display: "flex", alignItems: "center", justifyContent: "center" })}>
              {d.einv?.qrUrl
                ? <img src={d.einv.qrUrl} alt="E-invoice QR code" style={{ width: "20mm", height: "20mm" }} />
                : <div style={{ width: "20mm", height: "20mm", border: "0.25mm dashed #999" }} />}
            </div>
            <T x={168} y={256} w={40} align="center" size={8}>Validation Date :</T>
            <T x={168} y={260} w={40} align="center" size={8}>{d.einv?.validatedAt ?? ""}</T>
            <T x={140} y={264.3} w={68} align="right" size={8.5} bold>UUID&nbsp;&nbsp;{d.einv?.uuid ?? ""}</T>
          </>
        )}
        <T x={180} y={278.5} w={28} align="right" size={9}>Page&nbsp;&nbsp;&nbsp;{page} of {pages}</T>
      </div>
    </div>
  );
}

/** All pages of one invoice. */
export function EInvoiceSheet({ company, doc }: { company: Company; doc: InvoiceDoc }) {
  const pages = Math.max(1, Math.ceil(doc.lines.length / LINES_PER_PAGE));
  return (
    <>
      {Array.from({ length: pages }, (_, p) => (
        <Page key={p} c={company} d={doc} lines={doc.lines.slice(p * LINES_PER_PAGE, (p + 1) * LINES_PER_PAGE)} first={p * LINES_PER_PAGE} page={p + 1} pages={pages} last={p === pages - 1} />
      ))}
    </>
  );
}
