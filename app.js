/** =========================
 *  0) TON URL GOOGLE SHEETS (Apps Script)
 *  ========================= */
const SHEET_ENDPOINT = "https://script.google.com/macros/s/AKfycbweXeu2Ds90oklESXjAxMlYn-TGB_2i1Kix80Ht5Ex3f3PyRnydk5ObeV5IllgWo5YhqA/exec";

/** =========================
 *  1) STOCKAGE LOCAL
 *  ========================= */
const K_PRODUCTS = "foodpos_products_v1";
const K_CART     = "foodpos_cart_v1";
const K_SALES    = "foodpos_sales_v1";
const K_PIN      = "foodpos_admin_pin_v1";

function load(key, fallback){ try{ return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch(e){ return fallback; } }
function save(key, val){ localStorage.setItem(key, JSON.stringify(val)); }

function centsFromEuroInput(v){
  const s = (v || "").trim().replace(",", ".");
  if(!s) return 0;
  const n = Number(s);
  if(Number.isNaN(n)) return 0;
  return Math.round(n*100);
}
function euro(cents){
  return (cents/100).toFixed(2).replace(".", ",") + " €";
}
function startOfTodayISO(){
  const d = new Date();
  d.setHours(0,0,0,0);
  return d.getTime();
}

function isSameLocalDay(dateIso, startMs){
  const t = new Date(dateIso).getTime();
  return t >= startMs;
}

function renderReport(){
  // recharge depuis le storage pour être à jour
  sales = load(K_SALES, []);
  const startMs = startOfTodayISO();

  const today = sales.filter(s => s.date_iso && isSameLocalDay(s.date_iso, startMs));

  // Totaux
  const totalCents = today.reduce((sum,s)=> sum + (Number(s.total_cents)||0), 0);
  const cashCents  = today.filter(s=>s.paiement==="CASH").reduce((sum,s)=> sum + (Number(s.total_cents)||0), 0);
  const cbCents    = today.filter(s=>s.paiement==="CB").reduce((sum,s)=> sum + (Number(s.total_cents)||0), 0);

  // Group by product
  const map = new Map(); // key: product name, value: {qty, amountCents}
  for(const s of today){
    for(const l of (s.lignes || [])){
      const name = l.nom || l.produit_id || "Produit";
      const qty = Number(l.qty || 0);
      const amount = Number(l.price_cents || 0) * qty;

      const prev = map.get(name) || { qty:0, amountCents:0 };
      prev.qty += qty;
      prev.amountCents += amount;
      map.set(name, prev);
    }
  }

  // Sort by qty desc
  const rows = [...map.entries()].sort((a,b)=> (b[1].qty - a[1].qty));

  // UI
  const d = new Date();
  const dd = d.toLocaleDateString("fr-FR", { weekday:"long", year:"numeric", month:"long", day:"numeric" });

  document.getElementById("reportDateLabel").textContent = dd;
  document.getElementById("reportTotal").textContent = euro(totalCents);
  document.getElementById("reportCount").textContent = `${today.length} vente${today.length>1?"s":""}`;
  document.getElementById("reportCash").textContent = `Cash : ${euro(cashCents)}`;
  document.getElementById("reportCb").textContent = `CB : ${euro(cbCents)}`;

  const box = document.getElementById("reportByProduct");
  if(rows.length === 0){
    box.innerHTML = `<div class="muted">Aucune vente enregistrée aujourd’hui sur cet appareil.</div>`;
    return;
  }

  box.innerHTML = rows.map(([name, v]) => `
    <div class="rowSpace" style="padding:10px 0; border-bottom:1px solid #eee;">
      <div style="font-weight:900">${name}</div>
      <div class="pill">Qté : ${v.qty}</div>
      <div class="pill">Total : ${euro(v.amountCents)}</div>
    </div>
  `).join("");
}

function exportReportCSV(){
  sales = load(K_SALES, []);
  const startMs = startOfTodayISO();
  const today = sales.filter(s => s.date_iso && isSameLocalDay(s.date_iso, startMs));

  const lines = [];
  lines.push(["DATE","VENTE_ID","PAIEMENT","TOTAL_EUR","DETAIL"].join(","));

  for(const s of today){
    const totalEu = ((Number(s.total_cents)||0)/100).toFixed(2);
    const detail = (s.lignes||[]).map(l => `${l.nom} x${l.qty}`).join(" | ");
    lines.push([
      s.date_iso,
      s.vente_id,
      s.paiement,
      totalEu,
      `"${detail.replaceAll('"','""')}"`
    ].join(","));
  }

  const blob = new Blob([lines.join("\n")], {type:"text/csv;charset=utf-8"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "bilan_du_jour.csv";
  a.click();
  URL.revokeObjectURL(url);
}

function uid(){
  return "V" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2,8).toUpperCase();
}
function isDesktop(){
  return window.matchMedia("(min-width: 700px)").matches;
}

function applyResponsiveMode(){
  // En desktop: vente + panier visibles, paiement séparé
  if(isDesktop()){
    viewSale.classList.remove("hidden");
    viewCart.classList.remove("hidden");
    // On reste en mode vente/panier tant qu'on n'est pas en paiement
    if(!viewPay.classList.contains("hidden")){
      // si paiement ouvert, on laisse (normal)
    } else {
      headerTitle.textContent = "Vente";
      bottomBar.classList.remove("hidden");
    }
    renderSale();
    renderCart();
  } else {
    // En mobile: on laisse le comportement showView gérer
    // (pas besoin de forcer ici)
  }
}


/** =========================
 *  2) DONNÉES PAR DÉFAUT
 *  ========================= */
const DEFAULT_CATS = ["Samoussas","Bonbons piment","Boissons"];
const DEFAULT_PRODUCTS = [
  {id:"S-FRO", cat:"Samoussas", name:"Samoussa fromage", price_cents:50, active:true},
  {id:"S-POU", cat:"Samoussas", name:"Samoussa poulet",  price_cents:50, active:true},
  {id:"S-POI", cat:"Samoussas", name:"Samoussa poisson",  price_cents:50, active:true},
  {id:"BP-CLA", cat:"Bonbons piment", name:"Bonbon piment", price_cents:80, active:true},
  {id:"BO-EAU", cat:"Boissons", name:"Eau", price_cents:200, active:true},
  {id:"BO-COC", cat:"Boissons", name:"Coca", price_cents:250, active:true},
  {id:"BO-THE", cat:"Boissons", name:"Thé", price_cents:250, active:true},
];

let products = load(K_PRODUCTS, null);
if(!Array.isArray(products) || products.length === 0){
  products = DEFAULT_PRODUCTS;
  save(K_PRODUCTS, products);
} else {
  // merge missing defaults so new products added in code appear for existing users
  const merged = [...products];
  for(const p of DEFAULT_PRODUCTS){
    if(!merged.find(x => x.id === p.id)) merged.push(p);
  }
  if(merged.length !== products.length){
    products = merged;
    save(K_PRODUCTS, products);
  }
}

let cart = load(K_CART, []); // [{prod_id, qty}]
if(!Array.isArray(cart)) cart = [];

let sales = load(K_SALES, []); // [{vente_id, date_iso, total_cents, paiement, lignes, synced}]
if(!Array.isArray(sales)) sales = [];

let adminPin = localStorage.getItem(K_PIN);
if(!adminPin){ localStorage.setItem(K_PIN, "1234"); adminPin = "1234"; }

function getCategories(){
  const cats = [...new Set(products.map(p => p.cat).filter(Boolean))];
  return cats.length > 0 ? cats : DEFAULT_CATS;
}

/** =========================
 *  3) UI - ÉLÉMENTS
 *  ========================= */
const netBadge = document.getElementById("netBadge");
const pendingBadge = document.getElementById("pendingBadge");
const headerTitle = document.getElementById("headerTitle");

const viewSale = document.getElementById("viewSale");
const viewCart = document.getElementById("viewCart");
const viewPay  = document.getElementById("viewPay");

const tabs = document.getElementById("tabs");
const productList = document.getElementById("productList");

const cartList = document.getElementById("cartList");

const bottomBar = document.getElementById("bottomBar");
const bottomTotal = document.getElementById("bottomTotal");
const bottomAction = document.getElementById("bottomAction");

const goCartBtn = document.getElementById("goCartBtn");
const backToSaleBtn = document.getElementById("backToSaleBtn");
const backToCartBtn = document.getElementById("backToCartBtn");

const payTotal = document.getElementById("payTotal");
const payModePill = document.getElementById("payModePill");
const modeCashBtn = document.getElementById("modeCashBtn");
const modeCbBtn   = document.getElementById("modeCbBtn");
const cashArea    = document.getElementById("cashArea");
const cashReceived= document.getElementById("cashReceived");
const cashResult  = document.getElementById("cashResult");
const cashWarn    = document.getElementById("cashWarn");
const validateBtn = document.getElementById("validateBtn");
const validateHint= document.getElementById("validateHint");

const viewReport = document.getElementById("viewReport");
const reportBtn = document.getElementById("reportBtn");
const backFromReportBtn = document.getElementById("backFromReportBtn");
const exportReportBtn = document.getElementById("exportReportBtn");

// Admin modal
const modalBg = document.getElementById("modalBg");
const adminBtn = document.getElementById("adminBtn");
const closeModal = document.getElementById("closeModal");
const modalTitle = document.getElementById("modalTitle");
const pinBlock = document.getElementById("pinBlock");
const pinInput = document.getElementById("pinInput");
const pinOk = document.getElementById("pinOk");
const pinCancel = document.getElementById("pinCancel");
const adminPanel = document.getElementById("adminPanel");
const prodTable = document.getElementById("prodTable");
const addProductBtn = document.getElementById("addProductBtn");
const exportSalesBtn = document.getElementById("exportSalesBtn");
const forceSyncBtn = document.getElementById("forceSyncBtn");
const dangerClearBtn = document.getElementById("dangerClearBtn");
const changePinBtn = document.getElementById("changePinBtn");
const payWrap = document.getElementById("payWrap");


/** =========================
 *  4) NAVIGATION VUES
 *  ========================= */
let currentCat = getCategories()[0];
let payMode = null; // "CASH" | "CB"
let lastPayTotalCents = 0;

function showView(name){
  // AVANT: viewCart dépendait du nom
// APRÈS: en desktop on garde le panier visible
viewSale.classList.toggle("hidden", name !== "sale" && name !== "cart");
viewCart.classList.toggle("hidden", (name !== "cart") && !isDesktop());
viewPay.classList.toggle("hidden",  name !== "pay");
viewReport.classList.toggle("hidden", name !== "report");


  bottomBar.classList.toggle("hidden", name === "pay"); // on cache la barre en paiement
  headerTitle.textContent =
    name === "sale" ? "Vente" :
    name === "cart" ? "Panier" : "Encaissement";

  if(name === "sale"){ renderSale(); }
  if(name === "cart"){ renderCart(); }
  if(name === "pay"){  renderPay(); }
  if(name === "report"){ renderReport(); }
  const desktop = window.matchMedia("(min-width:700px)").matches;

  if(name === "pay"){
    // En desktop: on cache la grille vente/panier
    document.getElementById("twoColWrap").classList.add("hidden");

    // On montre payWrap (panier + paiement)
    payWrap.classList.remove("hidden");

    // On affiche la vue pay (à droite) et on rend le panier pay
    viewPay.classList.remove("hidden");
    renderCartPay();
    renderPay();

    // Bottom bar cachée en paiement
    bottomBar.classList.add("hidden");
    headerTitle.textContent = "Encaissement";
    return;
  }

  // sinon (mobile ou autres vues) :
  if(payWrap) payWrap.classList.add("hidden");
  document.getElementById("twoColWrap").classList.remove("hidden");

}

/** =========================
 *  5) CALCUL TOTAL
 *  ========================= */
function getProductById(id){ return products.find(p=>p.id===id); }

function cartLines(){
  return cart
    .map(line => {
      const p = getProductById(line.prod_id);
      if(!p) return null;
      return {
        prod_id: p.id,
        name: p.name,
        cat: p.cat,
        price_cents: p.price_cents,
        qty: line.qty
      };
    })
    .filter(Boolean);
}

function cartTotalCents(){
  return cartLines().reduce((sum, l)=> sum + l.price_cents*l.qty, 0);
}

/** =========================
 *  6) VENTE (produits)
 *  ========================= */
function renderTabs(){
  tabs.innerHTML = "";
  const cats = getCategories();

  if(!cats.includes(currentCat)) currentCat = cats[0];

  for(const cat of cats){
    const b = document.createElement("button");
    b.className = "tab" + (cat===currentCat ? " active" : "");
    b.textContent = cat;
    b.onclick = () => { currentCat = cat; renderSale(); };
    tabs.appendChild(b);
  }
}

function renderSale(){
  renderTabs();
  updateBottom();

  const list = products
    .filter(p => p.active && p.cat === currentCat);

  productList.innerHTML = "";

  if(list.length === 0){
    productList.innerHTML = `<div class="card"><div class="muted">Aucun produit actif dans ${currentCat}. Va dans ⚙️ Admin pour en ajouter.</div></div>`;
    return;
  }

  for(const p of list){
    const card = document.createElement("div");
    card.className = "card";
    card.innerHTML = `
      <div class="grid">
        <div>
          <p class="prodName">${p.name}</p>
          <span class="pricePill">${euro(p.price_cents)}</span>
        </div>

        <div>
          <div class="muted">Quantité</div>
          <input inputmode="numeric" pattern="[0-9]*" id="q_${p.id}" value="" placeholder="Qté" />
        </div>

        <div>
          <button class="btn btnRed" id="add_${p.id}">AJOUTER</button>
        </div>
      </div>
    `;
    productList.appendChild(card);

    const qInput = card.querySelector(`#q_${p.id}`);
    const addBtn = card.querySelector(`#add_${p.id}`);

    addBtn.onclick = () => {
      const qty = Math.max(1, parseInt((qInput.value||"").trim(),10) || 1);
      addToCart(p.id, qty);
      qInput.value = "";
    };
  }
}

function addToCart(prod_id, qty){
  const existing = cart.find(x => x.prod_id === prod_id);
  if(existing) existing.qty += qty;
  else cart.push({prod_id, qty});

  save(K_CART, cart);
   refreshUI();
}

/** =========================
 *  7) PANIER
 *  ========================= */
function renderCart(){
  updateBottom();

  const lines = cartLines();
  cartList.innerHTML = "";

  if(lines.length === 0){
    cartList.innerHTML = `<div class="card"><div style="font-weight:1000">Panier vide</div><div class="muted">Ajoute des produits depuis l’écran Vente.</div></div>`;
    bottomAction.textContent = "ENCaisser";
    bottomAction.disabled = true;
    bottomAction.style.opacity = ".5";
    return;
  }

  bottomAction.disabled = false;
  bottomAction.style.opacity = "1";

  for(const l of lines){
    const item = document.createElement("div");
    item.className = "card";
    item.innerHTML = `
      <div class="rowSpace">
        <div>
          <div style="font-weight:1000">${l.name}</div>
          <div class="muted">${euro(l.price_cents)} • Sous-total : <span style="font-weight:1000">${euro(l.price_cents*l.qty)}</span></div>
        </div>
        <button class="btn btnGhost btnSmall" data-remove="${l.prod_id}">🗑️</button>
      </div>
      <div class="divider"></div>
      <div class="qtyRow">
        <div class="qtyBtn" data-minus="${l.prod_id}">–</div>
        <input inputmode="numeric" pattern="[0-9]*" value="${l.qty}" data-input="${l.prod_id}" />
        <div class="qtyBtn" data-plus="${l.prod_id}">+</div>
      </div>
    `;
    cartList.appendChild(item);
  }

  // handlers
  cartList.querySelectorAll("[data-remove]").forEach(btn=>{
    btn.onclick = () => {
      const id = btn.getAttribute("data-remove");
      cart = cart.filter(x => x.prod_id !== id);
      save(K_CART, cart);
      refreshUI();
    };
  });

  cartList.querySelectorAll("[data-minus]").forEach(btn=>{
    btn.onclick = () => {
      const id = btn.getAttribute("data-minus");
      const line = cart.find(x=>x.prod_id===id);
      if(!line) return;
      line.qty = Math.max(0, line.qty - 1);
      if(line.qty === 0) cart = cart.filter(x=>x.prod_id!==id);
      save(K_CART, cart);
      refreshUI();
    };
  });

  cartList.querySelectorAll("[data-plus]").forEach(btn=>{
    btn.onclick = () => {
      const id = btn.getAttribute("data-plus");
      const line = cart.find(x=>x.prod_id===id);
      if(!line) return;
      line.qty += 1;
      save(K_CART, cart);
      refreshUI();
    };
  });

  cartList.querySelectorAll("[data-input]").forEach(inp=>{
    inp.oninput = () => {
      const id = inp.getAttribute("data-input");
      const raw = (inp.value||"").trim();
      if(raw === "") return;
      const n = parseInt(raw,10);
      if(Number.isNaN(n)) return;
      const line = cart.find(x=>x.prod_id===id);
      if(!line) return;
      line.qty = Math.max(0, n);
      if(line.qty === 0) cart = cart.filter(x=>x.prod_id!==id);
      save(K_CART, cart);
      refreshUI();
    };
    inp.onblur = () => {
      const id = inp.getAttribute("data-input");
      const raw = (inp.value||"").trim();
      if(raw === ""){
        cart = cart.filter(x=>x.prod_id!==id);
        save(K_CART, cart);
        refreshUI();
      }
    };
  });
}

/** =========================
 *  8) PAIEMENT
 *  ========================= */
function renderPay(){
  lastPayTotalCents = cartTotalCents();
  payTotal.textContent = euro(lastPayTotalCents);

  payMode = null;
  payModePill.textContent = "Mode: —";

  cashArea.classList.add("hidden");
  cashReceived.value = "";
  cashResult.textContent = "Rendu : 0,00 €";
  cashWarn.classList.add("hidden");

  // bouton valider rouge par défaut
  setValidateState(false, "Le bouton passe au vert quand tout est OK.");
}

function setValidateState(ok, hint){
  validateBtn.classList.toggle("btnGreen", ok);
  validateBtn.classList.toggle("btnRed", !ok);
  validateBtn.disabled = !ok;
  validateBtn.style.opacity = ok ? "1" : ".7";
  validateHint.textContent = hint || "";
}

function computeCash(){
  const receivedCents = centsFromEuroInput(cashReceived.value);
  const change = receivedCents - lastPayTotalCents;

  if(lastPayTotalCents <= 0){
    cashWarn.classList.remove("hidden");
    cashWarn.textContent = "Panier vide";
    cashResult.textContent = "Rendu : 0,00 €";
    setValidateState(false, "Ajoute des produits d’abord.");
    return;
  }

  if(change < 0){
    cashWarn.classList.remove("hidden");
    cashWarn.textContent = "Montant insuffisant";
    cashResult.textContent = "Rendu : 0,00 €";
    setValidateState(false, "Montant insuffisant.");
  } else {
    cashWarn.classList.add("hidden");
    if(change === 0){
      cashResult.textContent = "COMPTE BON ✅";
      setValidateState(true, "Compte bon. Tu peux valider.");
    } else {
      cashResult.textContent = "Rendu : " + euro(change);
      setValidateState(true, "Tu peux valider.");
    }
  }
}

/** =========================
 *  9) ENREGISTREMENT VENTE + SYNC
 *  ========================= */
function pendingCount(){
  return sales.filter(s=>!s.synced).length;
}

function updateBadges(){
  netBadge.textContent = navigator.onLine ? "🟢 En ligne" : "🔴 Hors ligne";
  pendingBadge.textContent = `⏳ ${pendingCount()} en attente`;
}

async function syncPending(){
  if(!navigator.onLine) return;
  if(!SHEET_ENDPOINT || SHEET_ENDPOINT.includes("COLLE_ICI")) return;

  sales = load(K_SALES, []);
  const pending = sales.filter(s=>!s.synced);
  if(pending.length === 0) return;

  try{
    const form = new FormData();
    form.append("action", "sales");
    form.append("payload", JSON.stringify({ sales: pending }));
       // Important: depuis un fichier local, no-cors aide à laisser partir la requête
    await fetch(SHEET_ENDPOINT, { method:"POST", body: form, mode:"no-cors" });

    // On marque synced=true (anti-doublon côté Sheet)
    sales = sales.map(s => pending.some(p => p.vente_id === s.vente_id) ? { ...s, synced:true } : s);
    save(K_SALES, sales);
    updateBadges();
  } catch(e){
    // pas grave: on réessaie plus tard
    console.log("Sync failed:", e.message);
  }
}

function recordSale(mode){
  const lignes = cartLines();
  const total = cartTotalCents();
  if(lignes.length === 0 || total <= 0) return;

  const vente = {
    vente_id: uid(),
    date_iso: new Date().toISOString(),
    total_cents: total,
    paiement: mode, // "CASH" ou "CB"
    lignes: lignes.map(l => ({produit_id:l.prod_id, nom:l.name, qty:l.qty, price_cents:l.price_cents})),
    synced: false
  };

  sales = load(K_SALES, []);
  sales.push(vente);
  save(K_SALES, sales);
  updateBadges();
}

/** =========================
 *  10) BARRE BASSE (TOTAL + ACTION)
 *  ========================= */
function updateBottom(){
  bottomTotal.textContent = euro(cartTotalCents());
  const hasItems = cartLines().length > 0;

  if(viewCart.classList.contains("hidden") && viewSale.classList.contains("hidden") === false){
    bottomAction.textContent = "ENCaisser";
  } else if(viewCart.classList.contains("hidden") === false){
    bottomAction.textContent = "ENCaisser";
  } else {
    bottomAction.textContent = "ENCaisser";
  }

  bottomAction.disabled = !hasItems;
  bottomAction.style.opacity = hasItems ? "1" : ".5";
}

/** =========================
 *  11) ADMIN (PIN + produits)
 *  ========================= */
function openAdmin(){
  modalBg.style.display = "flex";
  pinBlock.classList.remove("hidden");
  adminPanel.classList.add("hidden");
  pinInput.value = "";
  modalTitle.textContent = "Admin";
  pinInput.focus();
}
function closeAdmin(){
  modalBg.style.display = "none";
}

function renderAdminProducts(){
  products = load(K_PRODUCTS, []);
  prodTable.innerHTML = `
    <thead>
      <tr>
        <th>Actif</th>
        <th>Catégorie</th>
        <th>Nom</th>
        <th>Prix</th>
        <th></th>
      </tr>
    </thead>
    <tbody></tbody>
  `;
  const tbody = prodTable.querySelector("tbody");

  for(const p of products){
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>
        <label class="toggle">
          <input type="checkbox" ${p.active ? "checked" : ""} data-toggle="${p.id}">
          ${p.active ? "Oui" : "Non"}
        </label>
      </td>
      <td>${p.cat}</td>
      <td style="font-weight:900">${p.name}</td>
      <td>${euro(p.price_cents)}</td>
      <td><button class="btn btnGhost btnSmall" data-edit="${p.id}">✏️</button></td>
    `;
    tbody.appendChild(tr);
  }

  tbody.querySelectorAll("[data-toggle]").forEach(chk=>{
    chk.onchange = () => {
      const id = chk.getAttribute("data-toggle");
      products = products.map(p => p.id===id ? {...p, active: chk.checked} : p);
      save(K_PRODUCTS, products);
      renderAdminProducts();
      renderSale();
    };
  });

  tbody.querySelectorAll("[data-edit]").forEach(btn=>{
    btn.onclick = () => {
      const id = btn.getAttribute("data-edit");
      const p = products.find(x=>x.id===id);
      if(!p) return;

      const name = prompt("Nom du produit :", p.name);
      if(name === null) return;

      const cat = prompt("Catégorie (Samoussas / Bonbons piment / Boissons) :", p.cat);
      if(cat === null) return;

      const priceEu = prompt("Prix en € (ex: 1.80) :", (p.price_cents/100).toFixed(2));
      if(priceEu === null) return;

      const priceCents = centsFromEuroInput(priceEu);
      products = products.map(x=>x.id===id ? {...x, name:name.trim(), cat:cat.trim(), price_cents:priceCents} : x);
      save(K_PRODUCTS, products);
      renderAdminProducts();
      renderSale();
    };
  });
}

function addProduct(){
  const name = prompt("Nom du produit (ex: Samoussa thon) :");
  if(!name) return;

  const cat = prompt("Catégorie (Samoussas / Bonbons piment / Boissons) :");
  if(!cat) return;

  const priceEu = prompt("Prix en € (ex: 1.80) :");
  if(!priceEu) return;

  const priceCents = centsFromEuroInput(priceEu);
  const id = "P-" + Date.now().toString(36).toUpperCase();

  products = load(K_PRODUCTS, []);
  products.push({id, cat:cat.trim(), name:name.trim(), price_cents:priceCents, active:true});
  save(K_PRODUCTS, products);
  pushProducts();
  renderAdminProducts();
  renderSale();
}

function exportSalesCSV(){
  sales = load(K_SALES, []);
  const lines = [];
  lines.push(["VENTE_ID","DATE_ISO","TOTAL_EUR","PAIEMENT","DETAIL"].join(","));

  for(const s of sales){
    const totalEu = (s.total_cents/100).toFixed(2);
    const detail = (s.lignes||[]).map(l => `${l.nom} x${l.qty}`).join(" | ");
    lines.push([s.vente_id, s.date_iso, totalEu, s.paiement, `"${detail.replaceAll('"','""')}"`].join(","));
  }

  const blob = new Blob([lines.join("\n")], {type:"text/csv;charset=utf-8"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "ventes.csv";
  a.click();
  URL.revokeObjectURL(url);
}

function clearAll(){
  if(!confirm("Réinitialiser TOUT sur cet appareil ? (produits + ventes + panier)")) return;
  localStorage.removeItem(K_PRODUCTS);
  localStorage.removeItem(K_CART);
  localStorage.removeItem(K_SALES);
  localStorage.removeItem(K_PIN);
  location.reload();
}

function changePin(){
  const oldPin = prompt("Ancien PIN :");
  if(oldPin === null) return;
  if(oldPin !== localStorage.getItem(K_PIN)) { alert("PIN incorrect"); return; }
  const newPin = prompt("Nouveau PIN (4 chiffres conseillé) :");
  if(!newPin) return;
  localStorage.setItem(K_PIN, newPin.trim());
  alert("PIN changé.");
}

function refreshUI(){
  updateBottom();
  if (window.matchMedia("(min-width:700px)").matches){
    renderCart();
    renderCartPay();
  }
}

/** =========================
 *  12) EVENTS
 *  ========================= */
goCartBtn.onclick = () => showView("cart");
backToSaleBtn.onclick = () => showView("sale");
backToCartBtn.onclick = () => showView("cart");

bottomAction.onclick = () => {
  if(cartLines().length === 0) return;
  showView("pay");
};

modeCashBtn.onclick = () => {
  payMode = "CASH";
  payModePill.textContent = "Mode: CASH";
  cashArea.classList.remove("hidden");
  cashReceived.focus();
  setValidateState(false, "Saisis le montant reçu.");
  computeCash();
};
modeCbBtn.onclick = () => {
  payMode = "CB";
  payModePill.textContent = "Mode: CB";
  cashArea.classList.add("hidden");
  cashWarn.classList.add("hidden");
  cashResult.textContent = "Rendu : 0,00 €";
  // pour CB, ok si panier non vide
  const ok = cartTotalCents() > 0;
  setValidateState(ok, ok ? "Paiement CB via SumUp, puis valider." : "Panier vide.");
};

cashReceived.addEventListener("input", computeCash);

validateBtn.onclick = async () => {
  if (validateBtn.dataset.locked === "1") return;

  const total = cartTotalCents();
  if(total <= 0) return;
  if(!payMode) return;

  // sécurité cash
  if(payMode === "CASH"){
    const receivedCents = centsFromEuroInput(cashReceived.value);
    if(receivedCents < total) return;
  }

  validateBtn.dataset.locked = "1";

  try {
    reportBtn.onclick = () => showView("report");
    backFromReportBtn.onclick = () => showView("sale");
    exportReportBtn.onclick = exportReportCSV;

    // Enregistre la vente offline
    recordSale(payMode);
    if(!viewReport.classList.contains("hidden")) renderReport();

    // Vide le panier + retour vente
    cart = [];
    save(K_CART, cart);
    refreshUI();     // ✅ met à jour le panier à droite + total
    renderCart();    // ✅ sécurité (au cas où)
    payMode = null;
    cashReceived.value = "";

    // Sync automatique si possible
    await syncPending();

    // Retour à vente
    showView("sale");
  } finally {
    validateBtn.dataset.locked = "0";
  }

};
window.addEventListener("resize", applyResponsiveMode);

// Réseau
function updateOnline(){
  updateBadges();
  if(navigator.onLine) syncPending();
}
window.addEventListener("online", updateOnline);
window.addEventListener("offline", updateOnline);

// Admin
adminBtn.onclick = openAdmin;
closeModal.onclick = closeAdmin;
pinCancel.onclick = closeAdmin;

pinOk.onclick = () => {
  const pin = (pinInput.value||"").trim();
  if(pin !== localStorage.getItem(K_PIN)){
    alert("PIN incorrect");
    pinInput.focus();
    return;
  }
  pinBlock.classList.add("hidden");
  adminPanel.classList.remove("hidden");
  modalTitle.textContent = "Admin • Produits";
  renderAdminProducts();
};

addProductBtn.onclick = addProduct;
exportSalesBtn.onclick = exportSalesCSV;
forceSyncBtn.onclick = async () => { await syncPending(); alert("Sync envoyée (si internet)."); };
dangerClearBtn.onclick = clearAll;
changePinBtn.onclick = changePin;

// Auto sync régulier quand l’app est ouverte
setInterval(syncPending, 30000);

// Initial render
updateOnline();
showView("sale");
applyResponsiveMode();
pullProducts();
setInterval(pullProducts, 60000); // toutes les 60s (quand internet)

function renderCartPay(){
  const target = document.getElementById("viewCartPay");
  if(!target) return;

  const lines = cartLines();
  if(lines.length === 0){
    target.innerHTML = `<div class="card"><div style="font-weight:1000">Panier vide</div><div class="muted">Ajoute des produits.</div></div>`;
    return;
  }

  const total = cartTotalCents();

  target.innerHTML = `
    <div class="card">
      <div class="muted">Panier</div>
      <div style="font-weight:1000; margin-top:4px">Vérifie avant de valider</div>
      <div class="divider"></div>
      ${lines.map(l=>`
        <div class="rowSpace" style="padding:8px 0; border-bottom:1px solid #eee;">
          <div style="font-weight:900">${l.name} <span class="muted">x${l.qty}</span></div>
          <div style="font-weight:900">${euro(l.price_cents*l.qty)}</div>
        </div>
      `).join("")}
      <div class="divider"></div>
      <div class="rowSpace">
        <div class="muted">TOTAL</div>
        <div style="font-size:22px; font-weight:1000">${euro(total)}</div>
      </div>
    </div>
  `;
}
async function pullProducts(){
  if(!navigator.onLine) return;
  try{
    const url = SHEET_ENDPOINT + "?action=products&t=" + Date.now();
    const res = await fetch(url);
    const data = await res.json();
    if(data && data.ok && Array.isArray(data.products)){
      // On remplace le catalogue local par le catalogue central
      products = data.products;
      save(K_PRODUCTS, products);
      renderSale();
      if(isDesktop()) renderCart();
    }
  }catch(e){
    console.log("pullProducts failed:", e.message);
  }
}

async function pushProducts(){
  if(!navigator.onLine) return;
  try{
    // on pousse le catalogue local vers le Sheet
    products = load(K_PRODUCTS, products);
    const form = new FormData();
    form.append("action", "products");
    form.append("payload", JSON.stringify({ products }));
    await fetch(SHEET_ENDPOINT, { method:"POST", body: form, mode:"no-cors" });
  }catch(e){
    console.log("pushProducts failed:", e.message);
  }
}
