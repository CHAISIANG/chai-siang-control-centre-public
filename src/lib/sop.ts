// Warehouse and logistics SOP: invoice to signed POD. One source for the in-app page and the Word document.
// Every line is Bahasa Melayu first (ms) with the English line under it (en).
// Text in [[double brackets]] is something the company still has to confirm; the page shows it highlighted.

export type Bi = { ms: string; en: string };
const bi = (ms: string, en: string): Bi => ({ ms, en });

export type Step = { n: string; who: Bi; action: Bi; check: Bi; screen?: Bi };
export type Phase = { id: string; title: Bi; goal: Bi; steps: Step[] };

// ---------- people ----------
const ADMIN = bi("Admin", "Admin");
const PICKER = bi("Pemilih barang (Picker)", "Picker");
const CHECKER = bi("Penyemak (Checker)", "Checker");
const CLERK = bi("Kerani logistik", "Logistics clerk");
const DRIVER = bi("Pemandu", "Driver");
const SUPER = bi("Penyelia gudang", "Warehouse supervisor");
const STORE = bi("Penyimpan stor", "Storekeeper");
const THIRD = bi("Pemandu / pengangkut pihak ketiga", "3rd-party driver / transporter");

// ---------- the five phases ----------
export const PHASES: Phase[] = [
  {
    id: "p1",
    title: bi("Fasa 1: Terima invois dan semak pesanan", "Phase 1: Invoice receipt and order verification"),
    goal: bi("Pastikan setiap invois lengkap, stok ada, dan jenis dokumen penghantaran dipilih sebelum barang diambil.", "Make sure every invoice is complete, stock is available and the delivery document type is chosen before any picking."),
    steps: [
      { n: "1.1", who: ADMIN, action: bi("Terima invois daripada bahagian bil. Invois yang dimasukkan melalui SAP import akan muncul sebagai kerja penghantaran.", "Receive the invoice from billing. Invoices imported through the SAP import appear as delivery jobs."), check: bi("Nombor invois, tarikh dan nama pelanggan betul dan tiada invois berganda.", "Invoice number, date and customer name are correct and there are no duplicates."), screen: bi("Logistics > Penghantaran", "Logistics > Deliveries") },
      { n: "1.2", who: ADMIN, action: bi("Semak butiran pelanggan: alamat hantar, terma bayaran, laluan dan nombor telefon penerima.", "Check the customer details: delivery address, payment terms, route and the receiver's phone number."), check: bi("Alamat dan laluan jelas. Jika tidak jelas, hubungi jurujual sebelum teruskan.", "Address and route are clear. If not, call the salesman before going on.") },
      { n: "1.3", who: ADMIN, action: bi("Semak stok setiap baris invois dalam sistem SQL.", "Check stock for every invoice line in the SQL system."), check: bi("Setiap baris ditanda ✔ (stok cukup) atau ✘ (stok tidak cukup).", "Every line is ticked ✔ (enough stock) or ✘ (not enough).") },
      { n: "1.4", who: ADMIN, action: bi("Jika stok tidak cukup, maklumkan jurujual dan bahagian bil. Pilih: hantar separa, tunggu stok, atau batal baris. Tulis keputusan pada invois.", "If stock is short, tell the salesman and billing. Choose: part delivery, wait for stock, or cancel the line. Write the decision on the invoice."), check: bi("Tiada baris tanpa stok dihantar. Keputusan ditulis dan ditandatangani Admin.", "No line without stock goes out. The decision is written and signed by Admin.") },
      { n: "1.5", who: ADMIN, action: bi("Pilih jenis dokumen. ADA DO: cetak DO dan invois. TIADA DO: cetak invois sahaja; invois menjadi dokumen penghantaran. Tulis \"ADA DO\" atau \"TIADA DO\" pada kertas.", "Choose the document type. WITH DO: print the DO and the invoice. NO DO: print the invoice only; the invoice is the delivery document. Write \"WITH DO\" or \"NO DO\" on the paper."), check: bi("Jenis dokumen sepadan dengan syarat pelanggan. Bilangan salinan: [[sahkan: berapa salinan dan siapa simpan yang mana]].", "The document type matches the customer's requirement. Number of copies: [[confirm: how many copies and who keeps which]]."), screen: bi("Logistics > Penghantaran: pilih Ada DO / Tiada DO", "Logistics > Deliveries: choose With DO / No DO") },
      { n: "1.6", who: ADMIN, action: bi("Susun dokumen ikut tarikh hantar dan laluan, kemudian serahkan kepada penyelia gudang.", "Sort the documents by delivery date and route, then hand them to the warehouse supervisor."), check: bi("Penyelia menandatangani penerimaan. Tiada picking list: kerja ambil barang dibuat terus daripada invois atau DO.", "The supervisor signs for them. There is no picking list: picking is done straight from the invoice or DO.") },
    ],
  },
  {
    id: "p2",
    title: bi("Fasa 2: Ambil, bungkus dan susun (staging)", "Phase 2: Picking, packing and staging"),
    goal: bi("Barang yang betul, dalam keadaan baik, dalam kuantiti yang betul, siap di lorong laluan yang betul.", "The right goods, in good condition, in the right quantity, ready in the right route lane."),
    steps: [
      { n: "2.1", who: PICKER, action: bi("Ambil invois atau DO daripada penyelia. Jangan ambil barang tanpa dokumen.", "Take the invoice or DO from the supervisor. Never pick without a document."), check: bi("Nombor invois pada dokumen sama dengan kerja hari ini.", "The invoice number on the document matches today's job.") },
      { n: "2.2", who: PICKER, action: bi("Ambil barang dari lokasi simpanan: palet penuh dahulu, kemudian karton longgar. Tanda setiap baris dengan pen apabila siap.", "Pick from the storage location: full pallets first, then loose cartons. Tick each line with a pen when done."), check: bi("Setiap baris ditanda. Tiada baris terlepas.", "Every line is ticked. No line is missed.") },
      { n: "2.3", who: PICKER, action: bi("Periksa setiap karton: jangan ambil yang rosak, bocor, basah, kemek atau hampir tamat tarikh. Letakkan di Zon F (rosak) dan ambil stok ganti.", "Check every carton: do not take any that is damaged, leaking, wet, crushed or near expiry. Put it in Zone F (damaged) and pick a replacement."), check: bi("Tiada karton rosak atau bocor dalam susunan hantar. Catat dalam log stok rosak.", "No damaged or leaking carton is in the delivery stack. Record it in the damaged stock log."), screen: bi("Logistics > Stok rosak", "Logistics > Damaged stock") },
      { n: "2.4", who: PICKER, action: bi("Semak kod item, penerangan, kuantiti dan unit (karton atau pek) dengan invois. Jika batch dan tarikh luput dijejak, ambil yang paling awal luput dahulu (FEFO).", "Check the item code, description, quantity and unit (carton or pack) against the invoice. If batch and expiry are tracked, take the earliest expiry first (FEFO)."), check: bi("Kod, kuantiti dan unit sama. Batch/luput: [[sahkan: adakah dijejak untuk setiap baris?]]", "Code, quantity and unit match. Batch/expiry: [[confirm: is it tracked for every line?]]") },
      { n: "2.5", who: PICKER, action: bi("Imbas barkod jika ada. Jika tiada barkod, semak secara manual.", "Scan the barcode if there is one. If not, check manually."), check: bi("Imbasan sepadan dengan invois. Barkod: [[sahkan: adakah pengimbas digunakan sekarang?]]", "The scan matches the invoice. Barcode: [[confirm: are scanners in use now?]]") },
      { n: "2.6", who: PICKER, action: bi("Bungkus: balut palet dengan stretch wrap, susun karton longgar kemas, dan lekatkan label (nombor invois, nama pelanggan, laluan).", "Pack: wrap pallets with stretch wrap, stack loose cartons neatly, and stick a label (invoice number, customer name, route)."), check: bi("Setiap palet dan setiap longgokan karton ada label.", "Every pallet and every stack of cartons has a label.") },
      { n: "2.7", who: CHECKER, action: bi("Semakan kedua oleh orang lain (bukan Picker): kira semula karton dan palet, bandingkan dengan invois, dan tandatangan pada dokumen.", "Second check by a different person (not the Picker): recount cartons and pallets, compare with the invoice, and sign the document."), check: bi("Dua tandatangan: Picker dan Checker. Jika ada beza, betulkan sebelum staging.", "Two signatures: Picker and Checker. If there is a difference, fix it before staging."), screen: bi("Logistics > Penghantaran: tandakan Siap diambil (Picked)", "Logistics > Deliveries: mark Picked") },
      { n: "2.8", who: PICKER, action: bi("Susun di lorong staging mengikut laluan (Zon E). Satu lorong untuk satu laluan.", "Stage in the route lane (Zone E). One lane for one route."), check: bi("Tiada barang bercampur antara laluan. Dokumen diletakkan di hadapan lorong.", "No goods are mixed between routes. The documents are placed at the front of the lane.") },
    ],
  },
  {
    id: "p3",
    title: bi("Fasa 3: Atur penghantaran dan lepaskan lori", "Phase 3: Logistics and dispatch arrangement"),
    goal: bi("Setiap invois ada lori dan pemandu (atau pengangkut), dimuat dengan betul dan disahkan oleh pemandu.", "Every invoice has a lorry and driver (or transporter), is loaded correctly and is signed for by the driver."),
    steps: [
      { n: "3.1", who: CLERK, action: bi("Rancang laluan: kumpulkan invois ikut kawasan dan tetapkan urutan hantar. Invois yang dihantar terakhir dimuat dahulu.", "Plan the route: group invoices by area and set the delivery order. The invoice delivered last is loaded first."), check: bi("Setiap invois ada nombor urutan dan laluan.", "Every invoice has an order number and a route.") },
      { n: "3.2", who: CLERK, action: bi("Tetapkan lori dan pemandu sendiri, atau pengangkut pihak ketiga. Semak muatan (peratus) tidak melebihi had lori.", "Assign your own lorry and driver, or a 3rd-party transporter. Check the load (percent) does not exceed the lorry's limit."), check: bi("Satu lori atau pengangkut bagi setiap laluan. Had muatan: [[sahkan: kapasiti setiap lori]].", "One lorry or transporter per route. Load limit: [[confirm: each lorry's capacity]].") },
      { n: "3.3", who: DRIVER, action: bi("Sebelum muat, isi senarai semak kenderaan: bersih, kering, tiada bau atau kesan bocor, tayar, lampu, dokumen kenderaan.", "Before loading, complete the vehicle checklist: clean, dry, no smell or leak marks, tyres, lights, vehicle papers."), check: bi("Semua ditanda OK. Jika tidak OK, jangan muat; maklum penyelia.", "All ticked OK. If not OK, do not load; tell the supervisor.") },
      { n: "3.4", who: DRIVER, action: bi("Muat barang: palet berat di bawah, karton longgar di atas, invois terakhir dimuat dahulu. Ikat atau jaring muatan. Jangan campur barang yang bocor.", "Load the goods: heavy pallets at the bottom, loose cartons on top, the last invoice first. Strap or net the load. Never mix in leaking goods."), check: bi("Muatan stabil. Penyelia atau Checker menyaksikan pemuatan.", "The load is stable. The supervisor or Checker watches the loading.") },
      { n: "3.5", who: DRIVER, action: bi("Kira palet dan karton bagi setiap invois dan tandatangan manifest serah terima bersama kerani.", "Count the pallets and cartons for each invoice and sign the handover manifest together with the clerk."), check: bi("Jumlah pada manifest sama dengan jumlah dimuat. Satu salinan manifest disimpan di pejabat.", "The manifest totals equal what was loaded. One copy of the manifest stays in the office.") },
      { n: "3.6", who: THIRD, action: bi("Pihak ketiga: tandatangan terima bilangan palet dan karton, ambil dokumen, dan berikan nama pemandu serta nombor kenderaan. Kerani merekod pengangkut dan masa jangka tiba.", "3rd party: sign for the number of pallets and cartons, take the documents, and give the driver's name and vehicle number. The clerk records the transporter and the expected arrival time."), check: bi("Tandatangan pengangkut ada pada manifest. Tarikh akhir POD kembali: [[sahkan: berapa hari?]]", "The transporter's signature is on the manifest. POD return deadline: [[confirm: how many days?]]") },
      { n: "3.7", who: CLERK, action: bi("Kemas kini status: tandakan Dimuat (Loaded) dengan lori atau pengangkut dan laluan. Muat naik fail Status Lori harian (On duty, Loading, Empty; invois dimuat; muatan %) jika masih digunakan.", "Update the status: mark Loaded with the lorry or transporter and the route. Upload the daily Lorry Status file (On duty, Loading, Empty; invoices loaded; load %) if still used."), check: bi("Bilangan invois dimuat dalam sistem sama dengan manifest.", "The number of invoices loaded in the system equals the manifest."), screen: bi("Logistics > Penghantaran dan Logistics > Status lori", "Logistics > Deliveries and Logistics > Lorry status") },
      { n: "3.8", who: SUPER, action: bi("Lulus lori keluar dan rekod masa keluar.", "Release the lorry and record the time out."), check: bi("Tiada lori keluar tanpa manifest bertandatangan.", "No lorry leaves without a signed manifest.") },
    ],
  },
  {
    id: "p4",
    title: bi("Fasa 4: Dalam perjalanan dan hantar kepada pelanggan (POD)", "Phase 4: Transit and customer delivery (POD)"),
    goal: bi("Barang diserahkan, dikira bersama pelanggan, dan dokumen ditandatangani serta dicop.", "The goods are handed over, counted with the customer, and the document is signed and stamped."),
    steps: [
      { n: "4.1", who: DRIVER, action: bi("Tiba di premis pelanggan. Hubungi penerima jika perlu dan pakir dengan selamat.", "Arrive at the customer's premises. Call the receiver if needed and park safely."), check: bi("Penerima yang dibenarkan hadir. Jika tiada orang, hubungi pejabat (lihat Pengecualian).", "An authorised receiver is present. If nobody is there, call the office (see Exceptions).") },
      { n: "4.2", who: DRIVER, action: bi("Turunkan barang ikut invois. Kira palet dan karton bersama penerima.", "Unload the goods according to the invoice. Count the pallets and cartons together with the receiver."), check: bi("Penerima bersetuju dengan kiraan.", "The receiver agrees with the count.") },
      { n: "4.3", who: DRIVER, action: bi("Periksa keadaan barang di hadapan pelanggan. Jika ada rosak, bocor atau kurang, tulis pada dokumen sebelum pelanggan tandatangan dan ambil gambar.", "Check the condition of the goods in front of the customer. If anything is damaged, leaking or short, write it on the document before the customer signs and take a photo."), check: bi("Kuantiti dan masalah ditulis jelas pada dokumen.", "Quantities and problems are written clearly on the document.") },
      { n: "4.4", who: DRIVER, action: bi("ADA DO: minta pelanggan tandatangan, cop syarikat, tarikh dan nama pada DO dan pada invois. TIADA DO: tandatangan dan cop pada invois sahaja.", "WITH DO: ask the customer to sign, stamp, date and print their name on the DO and on the invoice. NO DO: signature and stamp on the invoice only."), check: bi("Empat perkara ada: tandatangan, cop, tarikh, nama.", "All four are there: signature, stamp, date, name.") },
      { n: "4.5", who: DRIVER, action: bi("Serahkan salinan pelanggan. Bawa pulang salinan syarikat yang bertanda tangan.", "Give the customer their copy. Bring back the signed company copy."), check: bi("Salinan syarikat tidak ditinggalkan di pelanggan.", "The company copy is not left with the customer.") },
      { n: "4.6", who: DRIVER, action: bi("Ambil gambar dokumen bertandatangan sebagai sandaran dan hantar kepada pejabat.", "Take a photo of the signed document as a backup and send it to the office."), check: bi("Gambar jelas; semua tulisan dan cop boleh dibaca.", "The photo is clear; all writing and stamps can be read.") },
      { n: "4.7", who: DRIVER, action: bi("Jika barang ditolak atau pelanggan enggan tandatangan, jangan tinggalkan barang. Hubungi pejabat dan ikut bahagian Pengecualian.", "If goods are rejected or the customer refuses to sign, do not leave the goods. Call the office and follow the Exceptions section."), check: bi("Pejabat tahu tentang setiap masalah sebelum pemandu meninggalkan pelanggan.", "The office knows about every problem before the driver leaves the customer.") },
    ],
  },
  {
    id: "p5",
    title: bi("Fasa 5: Pulang ke gudang, imbas dokumen dan kemas kini sistem", "Phase 5: Return to base, document scanning and system update"),
    goal: bi("Setiap invois yang dihantar ada POD yang diimbas, dinamakan betul dan ditanda Selesai.", "Every delivered invoice has a scanned POD, named correctly, and marked Completed."),
    steps: [
      { n: "5.1", who: DRIVER, action: bi("Pulang, serahkan semua dokumen kepada kerani dan buat taklimat ringkas: invois dihantar, gagal, ditolak, masalah.", "Return, hand all documents to the clerk and give a short debrief: delivered, failed, rejected, problems."), check: bi("Setiap invois pada manifest dikira: dihantar atau tidak dihantar.", "Every invoice on the manifest is accounted for: delivered or not delivered.") },
      { n: "5.2", who: CLERK, action: bi("Semak dokumen yang dipulangkan dengan manifest. Setiap satu mesti ada tandatangan, cop, tarikh dan nama pelanggan.", "Check the returned documents against the manifest. Each one must have the customer's signature, stamp, date and name."), check: bi("Tiada dokumen hilang atau tidak lengkap. Yang tidak lengkap ditanda dan diselesaikan dahulu.", "No document is missing or incomplete. Incomplete ones are flagged and fixed first.") },
      { n: "5.3", who: CLERK, action: bi("Imbas pada hari yang sama, satu fail untuk setiap invois, semua halaman. Namakan fail POD_NomborInvois_TarikhYYYYMMDD, contohnya POD_S123456_20261120.", "Scan on the same day, one file per invoice, all pages. Name the file POD_InvoiceNumber_DateYYYYMMDD, for example POD_S123456_20261120."), check: bi("Imbasan jelas dan lengkap. Format nama: [[sahkan penamaan fail dan lokasi simpanan]].", "The scan is clear and complete. Naming format: [[confirm the file naming and storage location]].") },
      { n: "5.4", who: CLERK, action: bi("Muat naik imbasan ke kerja penghantaran. Sistem memadankan ikut nombor invois. Tandakan Selesai (Completed) dan kemas kini status penghantaran dalam sistem SQL.", "Upload the scan to the delivery job. The system matches it by invoice number. Mark Completed and update the delivery status in the SQL system."), check: bi("Status Selesai hanya jika POD sudah dimuat naik. Kemas kini SQL: [[sahkan medan atau langkah yang dikemas kini dalam SQL]].", "Completed only if the POD is uploaded. SQL update: [[confirm which field or step is updated in SQL]]."), screen: bi("Logistics > Penghantaran: muat naik POD", "Logistics > Deliveries: upload POD") },
      { n: "5.5", who: CLERK, action: bi("Simpan kertas asal dalam fail ikut tarikh dan laluan. Salinan pelanggan yang dikembalikan disimpan bersama.", "File the paper originals by date and route. Returned customer copies are filed with them."), check: bi("Fail boleh dicari dalam masa kurang seminit. Tempoh simpanan: [[sahkan]].", "A file can be found in under a minute. Retention period: [[confirm]].") },
      { n: "5.6", who: CLERK, action: bi("Setiap hari, semak senarai POD belum diterima. Kejar pemandu sendiri pada hari yang sama dan pengangkut pihak ketiga dalam tempoh yang ditetapkan.", "Every day, check the list of PODs not yet received. Chase own drivers the same day and 3rd-party transporters within the set period."), check: bi("Tiada invois dihantar tanpa POD lebih daripada [[sahkan: bilangan hari]].", "No delivered invoice stays without a POD longer than [[confirm: number of days]]."), screen: bi("Logistics > Penghantaran > POD belum diterima", "Logistics > Deliveries > Missing POD") },
      { n: "5.7", who: DRIVER, action: bi("Serahkan barang yang ditolak atau dipulangkan kepada Penyimpan stor di Zon G. Kerani merekod kuantiti dan sebab.", "Hand rejected or returned goods to the storekeeper in Zone G. The clerk records the quantity and the reason."), check: bi("Barang pulang tidak dimasukkan semula ke rak sebelum diperiksa dan dilulus.", "Returned goods do not go back on a shelf until checked and approved.") },
    ],
  },
];

// ---------- damaged or leaking stock in the warehouse ----------
export const DAMAGED: { n: string; who: Bi; action: Bi }[] = [
  { n: "D1", who: bi("Sesiapa yang nampak", "Whoever sees it"), action: bi("Berhenti dan asingkan barang. Beritahu penyelia dengan segera. Jangan teruskan kerja di kawasan yang basah atau licin.", "Stop and set the item aside. Tell the supervisor at once. Do not keep working in a wet or slippery area.") },
  { n: "D2", who: STORE, action: bi("Pastikan kawasan selamat: letak papan amaran, lap atau serap tumpahan, dan jauhkan karton lain yang terkena.", "Make the area safe: put up a warning sign, wipe or absorb the spill, and move other cartons that got wet away.") },
  { n: "D3", who: STORE, action: bi("Pindahkan ke Zon F (kuarantin stok rosak) yang bertanda, diasingkan daripada stok baik. Jangan sekali-kali letak semula di rak atau muat ke lori.", "Move it to Zone F (damaged stock quarantine), which is marked and kept apart from good stock. Never put it back on a shelf or load it on a lorry.") },
  { n: "D4", who: STORE, action: bi("Labelkan: tarikh, kod item, penerangan, kuantiti, lokasi asal dan sebab (kemek, bocor, basah, tamat tarikh, lain-lain). Ambil gambar.", "Label it: date, item code, description, quantity, original location and cause (crushed, leaking, wet, expired, other). Take a photo.") },
  { n: "D5", who: STORE, action: bi("Rekod dalam log stok rosak di Control Centre pada hari yang sama.", "Record it in the damaged stock log in the control centre the same day.") },
  { n: "D6", who: SUPER, action: bi("Periksa dan pilih keputusan: pulang kepada prinsipal, tuntut, ubah suai (rework) atau hapus kira (write-off). Hapus kira perlu kelulusan: [[sahkan siapa dan had amaun]].", "Inspect and choose the decision: return to principal, claim, rework or write-off. A write-off needs approval: [[confirm who and the amount limit]].") },
  { n: "D7", who: ADMIN, action: bi("Laraskan stok dalam sistem SQL (pelarasan stok atau stok rosak) mengikut keputusan dan simpan dokumen sokongan.", "Adjust stock in the SQL system (stock adjustment or damaged stock) according to the decision and keep the supporting papers.") },
  { n: "D8", who: SUPER, action: bi("Kira stok di Zon F setiap minggu dan bandingkan dengan log. Kosongkan zon selepas keputusan dilaksanakan.", "Count the stock in Zone F every week and compare it with the log. Clear the zone once decisions are carried out.") },
  { n: "D9", who: SUPER, action: bi("Cari punca (pengendalian, susunan terlalu tinggi, forklift, pembungkusan pembekal, bumbung bocor) dan ambil tindakan pembetulan.", "Find the cause (handling, stacking too high, forklift, supplier packing, roof leak) and take corrective action.") },
];

// ---------- warehouse zones (no floor plan yet) ----------
export const ZONES: { code: string; name: Bi; rule: Bi }[] = [
  { code: "A", name: bi("Terima / dok", "Receiving / dock"), rule: bi("Barang masuk disemak dan dikira di sini sebelum disimpan.", "Incoming goods are checked and counted here before storage.") },
  { code: "B", name: bi("Simpanan palet", "Pallet storage"), rule: bi("Palet penuh. Barang berat dan cecair di bawah.", "Full pallets. Heavy items and liquids low down.") },
  { code: "C", name: bi("Rak karton longgar", "Loose-carton racks"), rule: bi("Karton longgar untuk ambil kecil.", "Loose cartons for small picks.") },
  { code: "D", name: bi("Barang laju (fast movers)", "Fast movers"), rule: bi("Barang paling kerap dijual, dekat dengan lorong hantar supaya jarak ambil pendek.", "Items sold most often, close to the dispatch lanes so picking distance is short.") },
  { code: "E", name: bi("Lorong staging", "Staging lanes"), rule: bi("Satu lorong untuk setiap laluan hantar, ditanda dengan pita lantai dan papan nama.", "One lane for each delivery route, marked with floor tape and a sign.") },
  { code: "F", name: bi("Kuarantin stok rosak", "Damaged stock quarantine"), rule: bi("Kawasan berasingan, bertanda jelas. Hanya penyelia dan penyimpan stor boleh keluarkan barang.", "A separate, clearly marked area. Only the supervisor and storekeeper may take goods out.") },
  { code: "G", name: bi("Barang pulang / nota kredit", "Returns / credit-note stock"), rule: bi("Barang yang dipulangkan menunggu pemeriksaan dan kelulusan.", "Returned goods waiting for inspection and approval.") },
];
export const ZONE_TIPS: Bi[] = [
  bi("Belum ada pelan lantai: tandakan zon dengan pita lantai dan papan nama dahulu. Satu hujung gudang untuk masuk (A), satu hujung untuk keluar (D dan E) supaya barang bergerak satu arah.", "No floor plan yet: mark the zones with floor tape and signs first. One end of the warehouse for goods in (A), the other end for goods out (D and E) so goods move in one direction."),
  bi("Beri setiap lokasi kod: ZON-LORONG-ARAS, contohnya B-02-1 (zon B, lorong 2, aras 1). Lekatkan label pada rak atau lantai.", "Give every location a code: ZONE-AISLE-LEVEL, for example B-02-1 (zone B, aisle 2, level 1). Stick the label on the rack or floor."),
  bi("Satu produk satu lokasi utama. Tulis kod lokasi dalam senarai dan beritahu semua pekerja.", "One product, one home location. Write the location codes in a list and tell all workers."),
  bi("Letak barang berat dan cecair di aras rendah. Jangan susun terlalu tinggi.", "Put heavy items and liquids low. Do not stack too high."),
  bi("Pastikan lorong jalan dan pintu keluar kecemasan sentiasa kosong.", "Keep the walkways and the emergency exits clear at all times."),
  bi("Selepas dua minggu, semak tempat yang sesak atau jauh, ubah zon jika perlu, kemudian lukis pelan lantai tetap.", "After two weeks, check where it is crowded or far, change the zones if needed, then draw the permanent floor plan."),
];

// ---------- exceptions ----------
export const EXCEPTIONS: { when: Bi; what: Bi[] }[] = [
  { when: bi("Pelanggan menolak barang", "Customer rejects the goods"), what: [bi("Jangan tinggalkan barang. Tulis sebab dan kuantiti pada dokumen dan minta pelanggan tandatangan penolakan.", "Do not leave the goods. Write the reason and quantity on the document and ask the customer to sign the rejection."), bi("Hubungi pejabat. Bawa barang balik ke Zon G.", "Call the office. Bring the goods back to Zone G."), bi("Kerani log pengecualian dan sediakan nota kredit.", "The clerk logs the exception and prepares a credit note.")] },
  { when: bi("Pelanggan enggan tandatangan atau cop", "Customer refuses to sign or stamp"), what: [bi("Jangan tinggalkan barang. Hubungi pejabat dan jurujual.", "Do not leave the goods. Call the office and the salesman."), bi("Jika dibenarkan oleh pejabat, ambil gambar barang, tulis nama penerima dan masa, dan dapatkan tandatangan atau cop kemudian.", "If the office allows it, photograph the goods, write the receiver's name and the time, and get the signature or stamp later."), bi("Tandakan invois sebagai pengecualian sehingga POD diterima.", "Flag the invoice as an exception until the POD is received.")] },
  { when: bi("Barang kurang, rosak atau bocor semasa sampai", "Goods short, damaged or leaking on arrival"), what: [bi("Tulis kuantiti sebenar dan masalah pada dokumen sebelum tandatangan. Ambil gambar.", "Write the real quantity and the problem on the document before signing. Take a photo."), bi("Pelanggan menandatangani kuantiti yang diterima sahaja. Barang rosak dibawa balik.", "The customer signs only for the quantity accepted. Damaged goods come back."), bi("Kerani log pengecualian dan sediakan nota kredit atau penghantaran semula.", "The clerk logs the exception and prepares a credit note or a re-delivery.")] },
  { when: bi("Barang salah atau lebih", "Wrong or extra item"), what: [bi("Jangan tinggalkan barang yang salah. Tulis pada dokumen dan hubungi pejabat.", "Do not leave the wrong item. Write it on the document and call the office."), bi("Bawa balik dan hantar barang yang betul pada hari lain.", "Bring it back and deliver the right item another day.")] },
  { when: bi("Dokumen hilang atau rosak", "Document lost or damaged"), what: [bi("Beritahu penyelia pada hari yang sama. Cetak semula invois atau DO daripada sistem dan tulis \"SALINAN GANTI\".", "Tell the supervisor the same day. Reprint the invoice or DO from the system and write \"REPLACEMENT COPY\"."), bi("Pemandu atau pengangkut dapatkan tandatangan dan cop pelanggan pada salinan ganti. Gambar lama (jika ada) disimpan sebagai bukti.", "The driver or transporter gets the customer's signature and stamp on the replacement copy. The old photo (if any) is kept as evidence."), bi("Catat dalam log pengecualian.", "Record it in the exceptions log.")] },
  { when: bi("Pelanggan tutup atau tiada orang", "Customer closed or nobody there"), what: [bi("Hubungi pelanggan dan jurujual. Tunggu mengikut had masa: [[sahkan: berapa minit]].", "Call the customer and the salesman. Wait within the time limit: [[confirm: how many minutes]]."), bi("Jika masih tiada, bawa barang balik dan rekod sebagai Gagal dihantar. Atur hantar semula.", "If still nobody, bring the goods back and record Failed delivery. Arrange a re-delivery.")] },
  { when: bi("Pengangkut pihak ketiga gagal atau lewat", "3rd-party transporter fails or is late"), what: [bi("Hubungi pengangkut dan pelanggan. Rekod sebab dan masa.", "Call the transporter and the customer. Record the reason and the time."), bi("Atur hantar semula atau guna lori sendiri. Kejar POD sehingga diterima.", "Arrange a re-delivery or use your own lorry. Chase the POD until received.")] },
];

// ---------- credit note, debit note, goods received note ----------
export const NOTES: { name: Bi; steps: Bi[] }[] = [
  { name: bi("Nota kredit (pelanggan)", "Credit note (customer)"), steps: [
    bi("Mula apabila barang ditolak, rosak, kurang atau harga salah. Dokumen sokongan: invois asal, dokumen bertanda masalah dan gambar.", "Start when goods are rejected, damaged, short or the price is wrong. Supporting papers: the original invoice, the document marked with the problem, and photos."),
    bi("Kerani menyerahkan dokumen kepada Admin. Admin atau bahagian bil menyediakan nota kredit dalam sistem SQL yang merujuk nombor invois asal. Kelulusan: [[sahkan siapa lulus dan had]].", "The clerk hands the papers to Admin. Admin or billing prepares the credit note in the SQL system, quoting the original invoice number. Approval: [[confirm who approves and the limit]]."),
    bi("Cetak nota kredit. Pemandu bawa kepada pelanggan untuk tandatangan dan cop. Salinan bertanda dibawa pulang.", "Print the credit note. The driver takes it to the customer for signature and stamp. The stamped copy comes back."),
    bi("Imbas, namakan NK_NomborNota_Tarikh, muat naik pada invois asal, dan simpan kertas.", "Scan it, name it CN_NoteNumber_Date, attach it to the original invoice, and file the paper."),
    bi("Barang pulang ke Zon G untuk diperiksa. Keputusan: masuk semula stok, atau rosak (ikut bahagian stok rosak).", "Returned goods go to Zone G for inspection. Decision: back into stock, or damaged (follow the damaged stock section)."),
  ] },
  { name: bi("Nota debit (pelanggan)", "Debit note (customer)"), steps: [
    bi("Mula apabila perlu caj tambahan kepada pelanggan, contohnya harga kurang caj atau kuantiti tambahan dihantar.", "Start when an extra charge to the customer is needed, for example an under-charged price or extra quantity delivered."),
    bi("Admin atau bahagian bil menyediakan nota debit dalam SQL yang merujuk invois asal dan sebab. Kelulusan: [[sahkan]].", "Admin or billing prepares the debit note in SQL quoting the original invoice and the reason. Approval: [[confirm]]."),
    bi("Cetak, hantar kepada pelanggan untuk tandatangan dan cop, imbas, namakan ND_NomborNota_Tarikh dan simpan.", "Print it, send it to the customer for signature and stamp, scan it, name it DN_NoteNumber_Date and file it."),
  ] },
  { name: bi("Nota terima barang (GRN)", "Goods received note (GRN)"), steps: [
    bi("GRN digunakan apabila barang diterima, sama ada daripada pembekal atau barang pulang daripada pelanggan.", "A GRN is used when goods are received, either from a supplier or returned by a customer."),
    bi("Penyimpan stor menurunkan barang di Zon A, mengira dan memeriksa keadaan dengan dokumen pembekal atau nota kredit.", "The storekeeper unloads in Zone A, counts and checks the condition against the supplier document or credit note."),
    bi("Tulis kuantiti sebenar, kod item, batch/luput (jika ada) dan barang rosak pada GRN. Penghantar dan penerima tandatangan.", "Write the real quantity, item code, batch/expiry (if any) and damaged goods on the GRN. The deliverer and the receiver sign."),
    bi("Admin memasukkan GRN dalam SQL. Beza kuantiti atau barang rosak dilaporkan kepada pembekal pada hari yang sama.", "Admin enters the GRN in SQL. Quantity differences or damaged goods are reported to the supplier the same day."),
    bi("Imbas dan namakan GRN_NomborGRN_Tarikh. Simpan kertas ikut tarikh.", "Scan and name it GRN_GRNNumber_Date. File the paper by date."),
  ] },
];

// ---------- flowchart: lanes and boxes (column = order across the page) ----------
export type Lane = "Admin" | "Picker" | "Checker" | "Clerk" | "Driver" | "Customer";
export const LANES: { id: Lane; label: Bi }[] = [
  { id: "Admin", label: bi("Admin", "Admin") },
  { id: "Picker", label: bi("Pemilih barang", "Picker") },
  { id: "Checker", label: bi("Penyemak", "Checker") },
  { id: "Clerk", label: bi("Kerani logistik", "Logistics clerk") },
  { id: "Driver", label: bi("Pemandu / pengangkut", "Driver / transporter") },
  { id: "Customer", label: bi("Pelanggan", "Customer") },
];
export const FLOW: { id: string; lane: Lane; col: number; text: Bi; kind?: "decision" | "end" }[] = [
  { id: "f1", lane: "Admin", col: 0, text: bi("Terima invois", "Receive invoice") },
  { id: "f2", lane: "Admin", col: 1, text: bi("Stok cukup?", "Enough stock?"), kind: "decision" },
  { id: "f3", lane: "Admin", col: 2, text: bi("Ada DO / Tiada DO", "With DO / No DO") },
  { id: "f4", lane: "Picker", col: 3, text: bi("Ambil dari invois / DO", "Pick from invoice / DO") },
  { id: "f5", lane: "Checker", col: 4, text: bi("Semakan kedua + tandatangan", "Second check + sign") },
  { id: "f6", lane: "Clerk", col: 5, text: bi("Laluan, lori, manifest, Dimuat", "Route, lorry, manifest, Loaded") },
  { id: "f7", lane: "Driver", col: 6, text: bi("Muat dan hantar", "Load and deliver") },
  { id: "f8", lane: "Customer", col: 7, text: bi("Kira, tandatangan, cop", "Count, sign, stamp") },
  { id: "f9", lane: "Driver", col: 8, text: bi("Pulang, serah dokumen", "Return, hand in documents") },
  { id: "f10", lane: "Clerk", col: 9, text: bi("Semak, imbas, muat naik", "Check, scan, upload") },
  { id: "f11", lane: "Admin", col: 10, text: bi("Selesai (Completed)", "Completed"), kind: "end" },
];
export const FLOW_EXTRA: Bi[] = [
  bi("Stok tidak cukup: hantar separa, tunggu atau batal baris, kemudian teruskan.", "Not enough stock: part delivery, wait or cancel the line, then continue."),
  bi("Barang rosak atau bocor: ke Zon F dan log stok rosak.", "Damaged or leaking goods: to Zone F and the damaged stock log."),
  bi("Ditolak, enggan tandatangan, kurang: log pengecualian, nota kredit, barang pulang ke Zon G.", "Rejected, refused to sign, short: exceptions log, credit note, goods back to Zone G."),
];

// ---------- sign-off checklist for every trip ----------
export const SIGNOFF: { item: Bi; by: "Driver" | "Clerk" | "Both" }[] = [
  { item: bi("Lori dan pemandu ditetapkan; senarai semak kenderaan lengkap", "Lorry and driver assigned; vehicle checklist done"), by: "Both" },
  { item: bi("Semua invois ada tandatangan Picker dan Checker", "Every invoice has the Picker and Checker signatures"), by: "Clerk" },
  { item: bi("Tiada barang rosak atau bocor dalam muatan", "No damaged or leaking goods in the load"), by: "Both" },
  { item: bi("Kiraan palet dan karton sama dengan manifest", "Pallet and carton counts match the manifest"), by: "Both" },
  { item: bi("Muatan diikat; invois terakhir dimuat dahulu", "Load strapped; the last invoice loaded first"), by: "Driver" },
  { item: bi("Manifest ditandatangani pemandu dan kerani; masa keluar dicatat", "Manifest signed by driver and clerk; time out recorded"), by: "Both" },
  { item: bi("Semua dokumen dipulangkan: sama dengan manifest", "All documents returned: equal to the manifest"), by: "Both" },
  { item: bi("Setiap dokumen ada tandatangan, cop, tarikh dan nama", "Every document has signature, stamp, date and name"), by: "Clerk" },
  { item: bi("Barang ditolak atau pulang diserahkan di Zon G dan dilog", "Rejected or returned goods handed over at Zone G and logged"), by: "Both" },
  { item: bi("Imbasan dimuat naik dan status Selesai ditanda", "Scans uploaded and Completed marked"), by: "Clerk" },
];

// ---------- daily handover checklist (print this) ----------
export const DAILY: { time: Bi; items: Bi[] }[] = [
  { time: bi("Pagi (sebelum kerja)", "Morning (before work)"), items: [
    bi("Invois hari ini diterima dan stok disemak; stok kurang dimaklumkan", "Today's invoices received and stock checked; shortages reported"),
    bi("Jenis dokumen (Ada DO / Tiada DO) ditanda pada setiap invois", "Document type (With DO / No DO) marked on every invoice"),
    bi("Lori, pemandu dan pengangkut pihak ketiga disahkan", "Lorries, drivers and 3rd-party transporters confirmed"),
    bi("Zon F (stok rosak) dan lantai gudang selamat dan bersih", "Zone F (damaged stock) and the warehouse floor are safe and clean"),
  ] },
  { time: bi("Sebelum lori keluar", "Before the lorries leave"), items: [
    bi("Semua invois diambil, disemak dua orang dan ditandatangani", "All invoices picked, double-checked and signed"),
    bi("Manifest ditandatangani; kiraan sama", "Manifests signed; counts match"),
    bi("Status Dimuat dikemas kini; fail Status Lori dimuat naik jika perlu", "Loaded status updated; Lorry Status file uploaded if needed"),
  ] },
  { time: bi("Petang (lori pulang)", "Afternoon (lorries back)"), items: [
    bi("Dokumen dipulangkan sama dengan manifest", "Returned documents equal the manifest"),
    bi("Barang ditolak atau pulang masuk Zon G dan dilog", "Rejected or returned goods in Zone G and logged"),
    bi("POD diimbas, dinamakan dan dimuat naik; status Selesai", "PODs scanned, named and uploaded; status Completed"),
  ] },
  { time: bi("Akhir hari", "End of day"), items: [
    bi("Senarai POD belum diterima disemak dan dikejar", "Missing POD list checked and chased"),
    bi("Pengecualian, nota kredit/debit dan GRN dilog", "Exceptions, credit/debit notes and GRNs logged"),
    bi("Stok rosak hari ini dilog dengan gambar dan keputusan", "Today's damaged stock logged with photo and decision"),
    bi("Kertas asal difailkan ikut tarikh dan laluan", "Paper originals filed by date and route"),
    bi("Isu untuk esok diserahkan kepada penyelia", "Issues for tomorrow handed to the supervisor"),
  ] },
];

/** The company still has to confirm each of these; they appear highlighted in the SOP. */
export const TO_CONFIRM: Bi[] = [
  bi("Bilangan salinan DO dan invois, dan siapa simpan yang mana", "Number of DO and invoice copies, and who keeps which"),
  bi("Lokasi simpanan imbasan dan penamaan fail", "Where scans are stored and the file naming"),
  bi("Tarikh akhir mengejar POD pengangkut pihak ketiga", "Deadline for chasing 3rd-party PODs"),
  bi("Sama ada batch dan tarikh luput dijejak untuk setiap baris, dan penggunaan pengimbas barkod", "Whether batch and expiry are tracked per line, and whether barcode scanners are used"),
  bi("Had kelulusan hapus kira, nota kredit dan nota debit, dan siapa meluluskan", "Approval limits for write-offs, credit notes and debit notes, and who approves"),
  bi("Nama peranan dan kapasiti setiap lori", "Role names and each lorry's capacity"),
  bi("Langkah kemas kini status penghantaran dalam sistem SQL", "The delivery status update step in the SQL system"),
];
