/* =========================================================================
   Vanta client/admin portal — real login + dashboards.
   Talks to Netlify Functions (auth-login, auth-me, client-data, admin-clients)
   which store data in Netlify Blobs. Loaded as a classic script; the heavy
   logic lives here and index.html's module just delegates to window.VantaPortal.
   ========================================================================= */
(function () {
  "use strict";

  var API = "/.netlify/functions";
  var LS = { token: "vanta_token", role: "vanta_role", name: "vanta_name" };
  var adminPoll = null; // interval handle for the admin Messages thread
  var bellPoll = null;  // interval handle for the notifications bell
  var msgPoll = null;   // interval handle for the admin Messages unread badge
  var bellItems = [];   // last-fetched notifications

  function lang() { try { return localStorage.getItem("vanta_lang") || "en"; } catch (e) { return "en"; } }
  var FR = function () { return lang() === "fr"; };

  // ---- tiny i18n for portal-only strings ----
  var T = {
    signInFail: { en: "Wrong email or password.", fr: "Courriel ou mot de passe invalide." },
    signingIn:  { en: "Signing you in…",           fr: "Connexion en cours…" },
    netErr:     { en: "Network error — please try again.", fr: "Erreur réseau — réessayez." },
    notConfigured: { en: "Login isn't set up on the server yet (missing environment variables). Set them in Netlify and redeploy.", fr: "La connexion n'est pas encore configurée sur le serveur (variables d'environnement manquantes). Configurez-les dans Netlify et redéployez." },
    notDeployed: { en: "Login service not found (functions not deployed). Check the Netlify deploy.", fr: "Service de connexion introuvable (fonctions non déployées). Vérifiez le déploiement Netlify." },
    logout:     { en: "Log out",                   fr: "Se déconnecter" },
    welcome:    { en: "Welcome back",              fr: "Bon retour" },
    yourPlan:   { en: "Your plan",                 fr: "Votre forfait" },
    views:      { en: "Blog views",                fr: "Vues du blogue" },
    vsPrev:     { en: "vs last month",             fr: "vs mois dernier" },
    clicks:     { en: "Clicks to your profile",    fr: "Clics vers votre profil" },
    ai:         { en: "AI citations",              fr: "Citations IA" },
    published:  { en: "Articles published",        fr: "Articles publiés" },
    pubShort:   { en: "Published",                  fr: "Publié" },
    upcoming:   { en: "Upcoming",                  fr: "À venir" },
    trend:      { en: "Views over time",           fr: "Vues dans le temps" },
    sources:    { en: "AI & discovery sources",    fr: "Sources IA et découverte" },
    articles:   { en: "Your articles",             fr: "Vos articles" },
    noData:     { en: "No data yet — we'll fill this in as your campaign runs.", fr: "Pas encore de données — ça se remplira au fil de la campagne." },
    // admin
    adminTitle: { en: "Admin dashboard",           fr: "Tableau de bord admin" },
    clients:    { en: "Clients",                   fr: "Clients" },
    addClient:  { en: "Add client",                fr: "Ajouter un client" },
    newClient:  { en: "New client",                fr: "Nouveau client" },
    edit:       { en: "Edit",                      fr: "Modifier" },
    del:        { en: "Delete",                    fr: "Supprimer" },
    save:       { en: "Save",                      fr: "Enregistrer" },
    cancel:     { en: "Cancel",                    fr: "Annuler" },
    confirmDel: { en: "Delete this client account?", fr: "Supprimer ce compte client ?" },
    noClients:  { en: "No clients yet. Add your first one.", fr: "Aucun client. Ajoutez le premier." },
    secAccount: { en: "Account",           fr: "Compte" },
    secNumbers: { en: "Dashboard numbers",  fr: "Chiffres du tableau de bord" },
    close:      { en: "Close",              fr: "Fermer" },
    tabMessages:{ en: "Messages",           fr: "Messages" },
    noMessages: { en: "No conversations yet.", fr: "Aucune conversation." },
    selectConv: { en: "Select a conversation to read and reply.", fr: "Choisissez une conversation pour lire et répondre." },
    replyPh:    { en: "Type your reply…",   fr: "Écrivez votre réponse…" },
    sendReply:  { en: "Send",               fr: "Envoyer" },
    noReplyYet: { en: "No messages.",       fr: "Aucun message." },
    notifs:     { en: "Notifications",       fr: "Notifications" },
    noNotifs:   { en: "No notifications yet.", fr: "Aucune notification." },
    justNow:    { en: "just now",            fr: "à l'instant" },
    payments:   { en: "Payments",            fr: "Paiements" },
    runRem:     { en: "Run reminders",        fr: "Lancer les rappels" },
    remDone:    { en: "Sweep done —",         fr: "Balayage terminé —" },
    remRems:    { en: "reminder(s),",         fr: "rappel(s)," },
    remExps:    { en: "expiry notice(s),",    fr: "avis d'expiration," },
    remScan:    { en: "scanned",              fr: "analysés" },
    claimed:    { en: "Claimed",             fr: "Réclamé" },
    confirmPay: { en: "Confirm",             fr: "Confirmer" },
    rejectPay:  { en: "Reject",              fr: "Rejeter" },
    statusCol:  { en: "Status",              fr: "Statut" },
    stConfirmed:{ en: "Confirmed",           fr: "Confirmé" },
    stRejected: { en: "Rejected",            fr: "Rejeté" },
    noClaims:   { en: "No payment claims yet.", fr: "Aucune réclamation de paiement." },
    emailsTab:  { en: "Emails",              fr: "Courriels" },
    emailsHint: { en: "Every notification email the system tried to send. Set RESEND_API_KEY and EMAIL_FROM in Netlify to actually deliver them.", fr: "Chaque courriel de notification que le système a tenté d'envoyer. Configurez RESEND_API_KEY et EMAIL_FROM dans Netlify pour les livrer." },
    noEmails:   { en: "No emails yet.",       fr: "Aucun courriel." },
    emTo:       { en: "To",                   fr: "À" },
    emSubject:  { en: "Subject",              fr: "Objet" },
    emWhen:     { en: "When",                 fr: "Quand" },
    emSent:     { en: "Sent",                 fr: "Envoyé" },
    emFailed:   { en: "Failed",               fr: "Échec" },
    emSkipped:  { en: "Not sent",             fr: "Non envoyé" },
    settingsTab:{ en: "Settings",            fr: "Paramètres" },
    setHint:    { en: "Configure reminder timing and the emails clients receive. Placeholders: {name} {plan} {date} {days} {brand} {link} (the client's plan checkout link).", fr: "Configurez le moment des rappels et les courriels reçus par les clients. Variables : {name} {plan} {date} {days} {brand} {link} (lien de paiement du forfait du client)." },
    setLeadDays:{ en: "Send renewal reminder this many days before expiry", fr: "Envoyer le rappel de renouvellement ce nombre de jours avant l'expiration" },
    setBrand:   { en: "Brand name (used in emails as {brand})", fr: "Nom de marque (utilisé dans les courriels via {brand})" },
    setRenewal: { en: "Renewal reminder email", fr: "Courriel de rappel de renouvellement" },
    setExpired: { en: "Expiry notice email",   fr: "Courriel d'avis d'expiration" },
    setSubject: { en: "Subject",              fr: "Objet" },
    setBody:    { en: "Message",              fr: "Message" },
    setSaved:   { en: "Settings saved.",      fr: "Paramètres enregistrés." },
    setSave:    { en: "Save settings",        fr: "Enregistrer les paramètres" },
    setEmailSec:{ en: "Email delivery",       fr: "Livraison des courriels" },
    testEmail:  { en: "Send test email",      fr: "Envoyer un courriel test" },
    testEmailHint:{ en: "Sends a test message to your admin email to confirm delivery is working.", fr: "Envoie un message test à votre courriel admin pour confirmer la livraison." },
    testSending:{ en: "Sending…",             fr: "Envoi…" },
    testSentTo: { en: "Test email sent to",   fr: "Courriel test envoyé à" },
    testFailed: { en: "Couldn't send:",       fr: "Échec de l'envoi :" },
    rejectConfirm:{ en: "Mark this payment as NOT confirmed?", fr: "Marquer ce paiement comme NON confirmé?" },
    underReview:{ en: "Payment under review", fr: "Paiement en vérification" },
    reviewNote: { en: "We're verifying your payment — we'll confirm shortly.", fr: "On vérifie votre paiement — confirmation sous peu." },
    expiredT:   { en: "Your plan has expired", fr: "Votre forfait a expiré" },
    expiredMsg: { en: "Your plan expired on", fr: "Votre forfait a expiré le" },
    remindLater:{ en: "Remind me later",     fr: "Me le rappeler plus tard" },
    renewNow:   { en: "Renew now",           fr: "Renouveler" },
    alreadyPaid:{ en: "I already paid",      fr: "J'ai déjà payé" },
    managePlans:{ en: "Manage plans",       fr: "Gérer les forfaits" },
    plansHint:  { en: "Define your plans. They appear in the client Plan dropdown; the buy link is your Whop/Stripe checkout.", fr: "Définissez vos forfaits. Ils apparaissent dans le menu Forfait du client; le lien d'achat est votre paiement Whop/Stripe." },
    planNone:   { en: "— No plan —",         fr: "— Aucun forfait —" },
    planName:   { en: "Plan name",           fr: "Nom du forfait" },
    planPrice:  { en: "Price (e.g. $97/mo)",  fr: "Prix (ex. 97 $/mois)" },
    planLink:   { en: "Buy link (Whop, Stripe…)", fr: "Lien d'achat (Whop, Stripe…)" },
    addPlan:    { en: "+ Add plan",           fr: "+ Ajouter un forfait" },
    savePlans:  { en: "Save plans",           fr: "Enregistrer" },
    plansSaved: { en: "Saved.",               fr: "Enregistré." },
    noPlans:    { en: "No plans yet. Add your first one.", fr: "Aucun forfait. Ajoutez le premier." },
    secSub:     { en: "Subscription",        fr: "Abonnement" },
    dateAvailed:{ en: "Date availed",         fr: "Date d'adhésion" },
    billing:    { en: "Billing period",       fr: "Cycle de facturation" },
    monthly:    { en: "Monthly",              fr: "Mensuel" },
    yearly:     { en: "Yearly",               fr: "Annuel" },
    renews:     { en: "Renews",               fr: "Renouvellement" },
    renewalCol: { en: "Renewal",              fr: "Renouvellement" },
    active:     { en: "Active",               fr: "Actif" },
    expiredS:   { en: "Expired",              fr: "Expiré" },
    daysWord:   { en: "days",                 fr: "jours" }
  };

  // Compute a client's expiry/status from Date Availed + billing period.
  function subInfo(user) {
    var availedAt = user && user.availedAt;
    var period = (user && user.period) || "monthly";
    if (!availedAt) return null;
    var start = new Date(availedAt + "T00:00:00");
    if (isNaN(start.getTime())) return null;
    var exp = new Date(start.getTime());
    if (period === "yearly") exp.setFullYear(exp.getFullYear() + 1);
    else exp.setMonth(exp.getMonth() + 1);
    var now = new Date();
    return { expiry: exp, expired: now.getTime() > exp.getTime(),
      days: Math.ceil((exp.getTime() - now.getTime()) / 86400000), period: period };
  }
  function fmtDate(d) {
    try { return d.toLocaleDateString(FR() ? "fr-CA" : "en-CA", { year: "numeric", month: "short", day: "numeric" }); }
    catch (e) { return ""; }
  }
  function subBanner(user) {
    var si = subInfo(user);
    if (!si) return "";
    if (user && user.claimStatus === "pending") return '<div class="sub-banner"><span class="sub-pill pend">' +
      esc(t("underReview")) + "</span><span>" + esc(t("reviewNote")) + "</span></div>";
    if (si.expired) return '<div class="sub-banner exp"><span class="sub-pill exp">' + esc(t("expiredS")) +
      "</span><span>" + esc(fmtDate(si.expiry)) + "</span></div>";
    return '<div class="sub-banner"><span class="sub-pill ok">' + esc(t("active")) + "</span><span>" +
      esc(t("renews")) + " " + esc(fmtDate(si.expiry)) + " · " + si.days + " " + esc(t("daysWord")) + "</span></div>";
  }
  // Blocking expiry prompt for an expired, unclaimed, un-snoozed client.
  function maybeShowExpiry(user, planLink) {
    var host = el("vpExpiry"); if (!host) return;
    host.innerHTML = "";
    var si = subInfo(user);
    if (!si || !si.expired) return;
    if (user.claimStatus === "pending") return;
    if (Date.now() < (user.snoozeUntil || 0)) return;
    host.innerHTML =
      '<div class="dash-modal-bg" id="vpExpBg"><div class="dash-modal" style="max-width:440px">' +
        '<div class="dash-modal-head"><h3>' + esc(t("expiredT")) + "</h3></div>" +
        '<div class="dash-modal-body"><p class="dash-muted" style="font-size:14px;line-height:1.5">' +
          esc(t("expiredMsg")) + " <b>" + esc(fmtDate(si.expiry)) + "</b>." + "</p></div>" +
        '<div class="dash-modal-foot" style="flex-wrap:wrap;justify-content:flex-end">' +
          '<button class="btn ghost" id="vpRemind">' + esc(t("remindLater")) + "</button>" +
          (planLink ? '<a class="btn ghost" href="' + esc(planLink) + '" target="_blank" rel="noopener">' + esc(t("renewNow")) + "</a>" : "") +
          '<button class="btn primary" id="vpPaid">' + esc(t("alreadyPaid")) + "</button>" +
        "</div></div></div>";
    var remind = el("vpRemind");
    if (remind) remind.onclick = function () {
      api("/client-subscription", { method: "POST", body: { action: "snooze" } }).then(function () { host.innerHTML = ""; });
    };
    var paid = el("vpPaid");
    if (paid) paid.onclick = function () {
      paid.disabled = true;
      api("/client-subscription", { method: "POST", body: { action: "paid" } }).then(function () { renderClient(); });
    };
  }

  // Plans may be stored as strings (legacy) or {name, price, link} objects.
  function normPlans(arr) {
    return (arr || []).map(function (p) {
      return (typeof p === "string")
        ? { name: p, price: "", link: "", period: "monthly" }
        : { name: p.name || "", price: p.price || "", link: p.link || "", period: p.period === "yearly" ? "yearly" : "monthly" };
    }).filter(function (p) { return p.name; });
  }
  function t(k) { var e = T[k] || {}; return FR() ? (e.fr || e.en || k) : (e.en || k); }

  // ---- helpers ----
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function el(id) { return document.getElementById(id); }
  function num(v) { var n = Number(v); return isFinite(n) ? n : 0; }
  function fmt(n) { return num(n).toLocaleString(FR() ? "fr-CA" : "en-CA"); }

  function getToken() { try { return localStorage.getItem(LS.token) || ""; } catch (e) { return ""; } }
  function getRole() { try { return localStorage.getItem(LS.role) || ""; } catch (e) { return ""; } }
  function getName() { try { return localStorage.getItem(LS.name) || ""; } catch (e) { return ""; } }
  function setSession(s) {
    try {
      localStorage.setItem(LS.token, s.token || "");
      localStorage.setItem(LS.role, s.role || "");
      localStorage.setItem(LS.name, s.name || "");
    } catch (e) {}
  }
  function clearSession() {
    try { localStorage.removeItem(LS.token); localStorage.removeItem(LS.role); localStorage.removeItem(LS.name); } catch (e) {}
  }

  function api(path, opts) {
    opts = opts || {};
    var headers = { "content-type": "application/json" };
    if (opts.auth !== false && getToken()) headers["authorization"] = "Bearer " + getToken();
    return fetch(API + path, {
      method: opts.method || "GET",
      headers: headers,
      body: opts.body ? JSON.stringify(opts.body) : undefined
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (data) {
        return { ok: r.ok, status: r.status, data: data };
      });
    });
  }

  // ---- view switching (mirrors index.html's show()) ----
  function showView(id) {
    var views = document.querySelectorAll(".view");
    for (var i = 0; i < views.length; i++) views[i].classList.remove("active");
    var v = el(id);
    if (v) v.classList.add("active");
    window.scrollTo(0, 0);
  }

  function go(hash) { if (location.hash === hash) route(hash); else location.hash = hash; }
  function route(hash) {
    if (hash.indexOf("#/admin") === 0) renderAdmin();
    else if (hash.indexOf("#/dashboard") === 0) renderClient();
  }

  // Hide the marketing top-nav while a signed-in dashboard is showing.
  function updateChrome() {
    var h = location.hash || "";
    var onDash = (h.indexOf("#/admin") === 0 || h.indexOf("#/dashboard") === 0) && !!getToken();
    document.body.classList.toggle("vp-dash", onDash);
  }

  // ================= LOGIN =================
  function handleLogin(form) {
    var email = (form.email && form.email.value || "").trim();
    var pw = (form.pw && form.pw.value || "");
    var msg = el("loginMsg");
    if (!email || !pw) return;
    if (msg) { msg.textContent = t("signingIn"); msg.style.color = ""; }

    api("/auth-login", { method: "POST", auth: false, body: { email: email, password: pw } })
      .then(function (res) {
        if (res.ok && res.data && res.data.token) {
          setSession(res.data);
          form.reset();
          if (msg) msg.textContent = "";
          go(res.data.role === "admin" ? "#/admin" : "#/dashboard");
        } else {
          var err = res.data && res.data.error;
          var m2 = (err === "server_not_configured" || err === "admin_not_configured") ? t("notConfigured")
                 : (res.status === 404 ? t("notDeployed") : t("signInFail"));
          if (err) { try { console.warn("[vanta login]", res.status, err); } catch (e) {} }
          if (msg) { msg.textContent = m2; msg.style.color = "#ff8080"; }
        }
      })
      .catch(function () {
        if (msg) { msg.textContent = t("netErr"); msg.style.color = "#ff8080"; }
      });
  }

  function logout() {
    clearSession();
    if (bellPoll) { clearInterval(bellPoll); bellPoll = null; }
    if (adminPoll) { clearInterval(adminPoll); adminPoll = null; }
    if (msgPoll) { clearInterval(msgPoll); msgPoll = null; }
    try { if (window.__chatReset) window.__chatReset(); } catch (e) {}
    // Show the login screen right away instead of waiting on the async hashchange
    // (the shared router has no "#/login" branch, so relying on it left the
    //  dashboard visible until a manual refresh).
    document.body.classList.remove("vp-dash");
    showView("view-login");
    if ((location.hash || "").indexOf("#/login") !== 0) location.hash = "#/login";
  }

  function requireRole(role) {
    if (!getToken() || (role && getRole() !== role)) {
      location.hash = "#/login";
      return false;
    }
    return true;
  }

  function topbar(title, hideLogout) {
    return '<div class="dash-top">' +
      '<div><div class="eyebrow">' + esc(t("welcome")) + '</div>' +
      '<h2 style="margin:6px 0 0">' + esc(title) + '</h2></div>' +
      '<div class="dash-top-actions">' +
        '<div class="vp-bell-wrap"><button class="vp-bell" id="vpBell" aria-label="' + esc(t("notifs")) + '">' +
          '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>' +
          '<span class="vp-bell-badge" id="vpBellCount" hidden></span></button>' +
          '<div class="vp-bell-menu" id="vpBellMenu" hidden></div></div>' +
        (hideLogout ? "" : '<button class="btn ghost" id="vpLogout">' + esc(t("logout")) + '</button>') +
      "</div></div>";
  }
  function relTime(ms) {
    var s = Math.floor((Date.now() - ms) / 1000);
    if (s < 60) return t("justNow");
    var m = Math.floor(s / 60); if (m < 60) return m + (FR() ? " min" : "m");
    var h = Math.floor(m / 60); if (h < 24) return h + (FR() ? " h" : "h");
    return Math.floor(h / 24) + (FR() ? " j" : "d");
  }
  function renderBellItems() {
    var menu = el("vpBellMenu"); if (!menu) return;
    menu.innerHTML = '<div class="vp-bell-head">' + esc(t("notifs")) + "</div>" +
      (bellItems.length ? bellItems.map(function (n) {
        return '<div class="vp-notif' + (n.read ? "" : " unread") + '"><div class="vp-notif-t">' + esc(n.title) + "</div>" +
          (n.body ? '<div class="vp-notif-b">' + esc(n.body) + "</div>" : "") +
          '<div class="vp-notif-time">' + esc(relTime(n.created_at)) + "</div></div>";
      }).join("") : '<div class="vp-bell-empty">' + esc(t("noNotifs")) + "</div>");
  }
  function loadBell() {
    api("/notifications").then(function (res) {
      bellItems = (res.data && res.data.notifications) || [];
      var unread = (res.data && res.data.unread) || 0;
      var badge = el("vpBellCount");
      if (badge) { if (unread > 0) { badge.textContent = unread > 9 ? "9+" : String(unread); badge.hidden = false; } else badge.hidden = true; }
      var menu = el("vpBellMenu");
      if (menu && !menu.hidden) renderBellItems();
    }).catch(function () {});
  }
  function initBell() {
    var bell = el("vpBell"); if (!bell) return;
    var menu = el("vpBellMenu");
    bell.onclick = function (e) {
      e.stopPropagation();
      if (!menu) return;
      if (menu.hidden) {
        renderBellItems(); menu.hidden = false;
        var badge = el("vpBellCount");
        if (badge && !badge.hidden) { api("/notifications", { method: "POST", body: { action: "read" } }).then(function () { badge.hidden = true; bellItems.forEach(function (n) { n.read = true; }); }); }
      } else { menu.hidden = true; }
    };
    document.addEventListener("click", function (e) {
      var mn = el("vpBellMenu"), bl = el("vpBell");
      if (mn && !mn.hidden && bl && !bl.contains(e.target) && !mn.contains(e.target)) mn.hidden = true;
    });
    loadBell();
    if (bellPoll) clearInterval(bellPoll);
    bellPoll = setInterval(loadBell, 30000);
  }

  // ================= CLIENT DASHBOARD =================
  function renderClient() {
    if (!requireRole("client")) return;
    var host = el("view-dashboard");
    if (!host) return;
    host.innerHTML = '<div class="sec"><div class="wrap"><p class="lead">…</p></div></div>';
    showView("view-dashboard");

    api("/client-data").then(function (res) {
      if (res.status === 401) { logout(); return; }
      var user = (res.data && res.data.user) || {};
      var m = user.metrics || {};
      host.innerHTML = clientHTML(user, m);
      wireCommon();
      maybeShowExpiry(user, (res.data && res.data.planLink) || "");
    }).catch(function () {
      host.innerHTML = '<div class="sec"><div class="wrap">' + topbar(getName() || "") +
        '<p class="lead">' + esc(t("netErr")) + '</p></div></div>';
      wireCommon();
    });
  }

  function bars(series) {
    if (!series || !series.length) return '<div class="dash-empty">' + esc(t("noData")) + "</div>";
    var max = 0;
    series.forEach(function (p) { max = Math.max(max, num(p.value)); });
    max = max || 1;
    var out = '<div class="dash-bars">';
    series.forEach(function (p) {
      var h = Math.round((num(p.value) / max) * 100);
      out += '<div class="dash-bar"><div class="dash-bar-fill" style="height:' + h + '%"></div>' +
             '<span class="dash-bar-lb">' + esc(p.label || "") + "</span></div>";
    });
    return out + "</div>";
  }

  function sourceList(sources) {
    if (!sources || !sources.length) return '<div class="dash-empty">' + esc(t("noData")) + "</div>";
    var max = 0;
    sources.forEach(function (s) { max = Math.max(max, num(s.value)); });
    max = max || 1;
    var out = '<ul class="dash-src">';
    sources.forEach(function (s) {
      var w = Math.round((num(s.value) / max) * 100);
      out += '<li><span class="dash-src-lb">' + esc(s.label || "") + "</span>" +
        '<span class="dash-src-track"><span class="dash-src-fill" style="width:' + w + '%"></span></span>' +
        '<span class="dash-src-v">' + fmt(s.value) + "</span></li>";
    });
    return out + "</ul>";
  }

  function articleList(articles) {
    if (!articles || !articles.length) return '<div class="dash-empty">' + esc(t("noData")) + "</div>";
    var out = '<ul class="dash-arts">';
    articles.forEach(function (a) {
      var pub = (a.status || "").toLowerCase() === "published";
      var badge = pub ? esc(t("pubShort")) : esc(t("upcoming"));
      var title = a.url ? '<a href="' + esc(a.url) + '" target="_blank" rel="noopener">' + esc(a.title || "") + "</a>" : esc(a.title || "");
      out += '<li><span class="dash-art-badge ' + (pub ? "pub" : "up") + '">' + badge + "</span>" + title + "</li>";
    });
    return out + "</ul>";
  }

  function clientHTML(user, m) {
    var name = user.name || getName() || "";
    var change = num(m.viewsChangePct);
    var changeTxt = (change > 0 ? "▲ " : change < 0 ? "▼ " : "") + Math.abs(change) + "% " + t("vsPrev");
    var changeCls = change > 0 ? "up" : change < 0 ? "down" : "";
    return '<div class="sec"><div class="wrap">' +
      topbar(name || "") +
      (user.plan ? '<div class="dash-plan">' + esc(t("yourPlan")) + ': <b>' + esc(user.plan) + "</b></div>" : "") +
      subBanner(user) +
      '<div class="dash-stats">' +
        stat(fmt(m.views), t("views"), '<span class="dash-delta ' + changeCls + '">' + changeTxt + "</span>") +
        stat(fmt(m.profileClicks), t("clicks"), "") +
        stat(fmt(m.aiCitations), t("ai"), "") +
        stat(fmt(m.articlesPublished), t("published"), '<span class="dash-sub">' + fmt(m.articlesUpcoming) + " " + t("upcoming") + "</span>") +
      "</div>" +
      '<div class="dash-grid2">' +
        '<div class="dash-card"><h3>' + esc(t("trend")) + "</h3>" + bars(m.series) + "</div>" +
        '<div class="dash-card"><h3>' + esc(t("sources")) + "</h3>" + sourceList(m.sources) + "</div>" +
      "</div>" +
      '<div class="dash-card"><h3>' + esc(t("articles")) + "</h3>" + articleList(m.articles) + "</div>" +
      (m.note ? '<p class="dash-note">' + esc(m.note) + "</p>" : "") +
    '</div></div><div id="vpExpiry"></div>';
  }

  function stat(value, label, sub) {
    return '<div class="dash-stat"><div class="dash-stat-v">' + value + "</div>" +
      '<div class="dash-stat-l">' + esc(label) + "</div>" + (sub || "") + "</div>";
  }

  // ================= ADMIN DASHBOARD =================
  function renderAdmin() {
    if (!requireRole("admin")) return;
    var host = el("view-admin");
    if (!host) return;
    if (adminPoll) { clearInterval(adminPoll); adminPoll = null; }
    if (msgPoll) { clearInterval(msgPoll); msgPoll = null; }
    host.innerHTML = '<div class="sec"><div class="wrap"><p class="lead">…</p></div></div>';
    showView("view-admin");

    api("/admin-clients").then(function (res) {
      if (res.status === 401 || res.status === 403) { logout(); return; }
      var clients = (res.data && res.data.clients) || [];
      api("/admin-plans").then(function (pres) {
        var plans = normPlans((pres.data && pres.data.plans) || []);
        host.innerHTML = adminHTML(clients);
        wireCommon();
        wireAdmin(clients, plans);
      });
    }).catch(function () {
      host.innerHTML = '<div class="sec"><div class="wrap">' + topbar(t("adminTitle")) +
        '<p class="lead">' + esc(t("netErr")) + "</p></div></div>";
      wireCommon();
    });
  }

  function adminHTML(clients) {
    var rows = clients.length ? clients.map(function (c) {
      var si = subInfo(c);
      var renewal = si
        ? '<span class="sub-pill ' + (si.expired ? "exp" : "ok") + '">' + (si.expired ? esc(t("expiredS")) : esc(t("active"))) +
          '</span> <span class="dash-muted">' + esc(fmtDate(si.expiry)) + "</span>"
        : '<span class="dash-muted">—</span>';
      return '<tr data-email="' + esc(c.email) + '">' +
        "<td><b>" + esc(c.name || "—") + "</b><div class='dash-muted'>" + esc(c.email) + "</div></td>" +
        "<td>" + esc(c.plan || "—") + "</td>" +
        "<td>" + renewal + "</td>" +
        "<td>" + fmt(c.metrics && c.metrics.views) + "</td>" +
        "<td>" + fmt(c.metrics && c.metrics.articlesPublished) + "</td>" +
        '<td class="dash-actions">' +
          '<button class="btn ghost sm vp-edit">' + esc(t("edit")) + "</button> " +
          '<button class="btn ghost sm vp-del">' + esc(t("del")) + "</button>" +
        "</td></tr>";
    }).join("") : '<tr><td colspan="6" class="dash-empty">' + esc(t("noClients")) + "</td></tr>";

    function navItem(id, label, on) {
      return '<button class="admin-nav-item' + (on ? " is-on" : "") + '" data-nav="' + id + '">' + esc(label) + "</button>";
    }
    return '<div class="sec"><div class="wrap">' +
      topbar(t("adminTitle"), true) +
      '<div class="admin-layout">' +
        '<aside class="admin-nav">' +
          navItem("clients", t("clients"), true) +
          '<button class="admin-nav-item" data-nav="messages">' + esc(t("tabMessages")) +
            '<span class="admin-nav-badge" id="vpMsgBadge" hidden></span></button>' +
          '<button class="admin-nav-item" data-nav="payments">' + esc(t("payments")) +
            '<span class="admin-nav-badge" id="vpPayBadge" hidden></span></button>' +
          navItem("emails", t("emailsTab"), false) +
          navItem("plans", t("managePlans"), false) +
          navItem("settings", t("settingsTab"), false) +
          '<div class="admin-nav-foot">' +
            '<div class="admin-nav-sep"></div>' +
            '<button class="admin-nav-item admin-nav-logout" id="vpLogout">' + esc(t("logout")) + "</button>" +
          "</div>" +
        "</aside>" +
        '<div class="admin-main">' +
          '<div class="dash-panel" data-panel="clients">' +
            '<div class="dash-toolbar"><button class="btn primary" id="vpAdd">+ ' + esc(t("addClient")) + "</button>" +
              ' <button class="btn ghost" id="vpRunRem">' + esc(t("runRem")) + "</button></div>" +
            '<div class="dash-card" style="overflow-x:auto"><table class="dash-table"><thead><tr>' +
              "<th>" + esc(t("clients")) + "</th><th>" + esc(t("yourPlan")) + "</th><th>" + esc(t("renewalCol")) +
              "</th><th>" + esc(t("views")) + "</th><th>" + esc(t("published")) + "</th><th></th></tr></thead><tbody>" + rows + "</tbody></table></div>" +
          "</div>" +
          '<div class="dash-panel" data-panel="messages" style="display:none">' +
            '<div class="vpc-admin"><div class="vpc-list" id="vpChatList"><div class="dash-empty">…</div></div>' +
            '<div class="vpc-pane" id="vpChatPane"><div class="vpc-empty">' + esc(t("selectConv")) + "</div></div></div>" +
          "</div>" +
          '<div class="dash-panel" data-panel="payments" style="display:none" id="vpPayPanel"></div>' +
          '<div class="dash-panel" data-panel="emails" style="display:none" id="vpEmailPanel"></div>' +
          '<div class="dash-panel" data-panel="plans" style="display:none" id="vpPlansPanel"></div>' +
          '<div class="dash-panel" data-panel="settings" style="display:none" id="vpSettingsPanel"></div>' +
        "</div>" +
      "</div>" +
      '<div id="vpModal"></div>' +
    "</div></div>";
  }

  function clientForm(c, isNew, plans) {
    c = c || {}; var m = c.metrics || {};
    plans = plans || [];
    function f(label, name, val, type) {
      return '<label class="vpf">' + esc(label) +
        '<input name="' + name + '" type="' + (type || "text") + '" value="' + esc(val == null ? "" : val) + '"></label>';
    }
    function planSel(current) {
      var opts = '<option value="">' + esc(t("planNone")) + "</option>";
      var found = false;
      plans.forEach(function (p) {
        var label = p.name + (p.price ? " — " + p.price : "");
        var sel = p.name === current ? " selected" : "";
        if (p.name === current) found = true;
        opts += '<option value="' + esc(p.name) + '"' + sel + ">" + esc(label) + "</option>";
      });
      if (current && !found) opts += '<option value="' + esc(current) + '" selected>' + esc(current) + "</option>";
      return '<label class="vpf">' + esc(FR() ? "Forfait" : "Plan") + '<select name="plan">' + opts + "</select></label>";
    }
    function billingSel(current) {
      var y = current === "yearly";
      return '<label class="vpf">' + esc(t("billing")) + '<select name="period">' +
        '<option value="monthly"' + (y ? "" : " selected") + ">" + esc(t("monthly")) + "</option>" +
        '<option value="yearly"' + (y ? " selected" : "") + ">" + esc(t("yearly")) + "</option>" +
        "</select></label>";
    }
    return '<div class="dash-modal-bg" id="vpModalBg"><form class="dash-modal" id="vpForm">' +
      '<div class="dash-modal-head">' +
        "<h3>" + esc(isNew ? t("newClient") : t("edit")) + "</h3>" +
        '<button type="button" class="dash-modal-x" id="vpClose" aria-label="' + esc(t("close")) + '">&#10005;</button>' +
      "</div>" +
      '<div class="dash-modal-body">' +
        '<div class="vpf-section">' + esc(t("secAccount")) + "</div>" +
        f("Email", "email", c.email, "email") + (isNew ? "" : '<input type="hidden" name="_email" value="' + esc(c.email) + '">') +
        f(FR() ? "Nom / entreprise" : "Name / business", "name", c.name) +
        planSel(c.plan) +
        f(isNew ? (FR() ? "Mot de passe" : "Password") : (FR() ? "Nouveau mot de passe (laisser vide)" : "New password (blank = keep)"), "password", "", "text") +
        '<div class="vpf-section">' + esc(t("secSub")) + "</div>" +
        '<div class="vpf-row">' +
          '<label class="vpf">' + esc(t("dateAvailed")) + '<input name="availedAt" type="date" value="' + esc(c.availedAt || "") + '"></label>' +
          billingSel(c.period) +
        "</div>" +
        '<div class="vpf-section">' + esc(t("secNumbers")) + "</div>" +
        '<div class="vpf-row">' +
          f(t("views"), "views", m.views, "number") +
          f("% " + t("vsPrev"), "viewsChangePct", m.viewsChangePct, "number") +
        "</div><div class='vpf-row'>" +
          f(t("clicks"), "profileClicks", m.profileClicks, "number") +
          f(t("ai"), "aiCitations", m.aiCitations, "number") +
        "</div><div class='vpf-row'>" +
          f(t("published"), "articlesPublished", m.articlesPublished, "number") +
          f(t("upcoming"), "articlesUpcoming", m.articlesUpcoming, "number") +
        "</div>" +
        '<label class="vpf">' + esc(t("trend")) + ' <span class="vpf-hint">(' + (FR() ? "ex" : "e.g.") + ' Jan:120, Feb:180)</span>' +
          '<input name="series" value="' + esc(seriesToStr(m.series)) + '"></label>' +
        '<label class="vpf">' + esc(t("sources")) + ' <span class="vpf-hint">(ChatGPT:40, Google:30)</span>' +
          '<input name="sources" value="' + esc(seriesToStr(m.sources)) + '"></label>' +
        '<label class="vpf">' + esc(t("articles")) + ' <span class="vpf-hint">(' + (FR() ? "une par ligne" : "one per line") + ': published | ' + (FR() ? "Titre" : "Title") + ' | https://…)</span>' +
          '<textarea name="articles" rows="3">' + esc(articlesToStr(m.articles)) + "</textarea></label>" +
        '<label class="vpf">' + (FR() ? "Note au client" : "Note to client") +
          '<input name="note" value="' + esc(m.note || "") + '"></label>' +
      "</div>" +
      '<div class="dash-modal-foot">' +
        '<div class="hint" id="vpFormMsg"></div>' +
        '<div class="vpf-actions"><button type="button" class="btn ghost" id="vpCancel">' + esc(t("cancel")) + "</button>" +
          '<button type="submit" class="btn primary">' + esc(t("save")) + "</button></div>" +
      "</div>" +
    "</form></div>";
  }

  // ---- parsers for the compact admin inputs ----
  function seriesToStr(arr) { return (arr || []).map(function (p) { return (p.label || "") + ":" + num(p.value); }).join(", "); }
  function strToSeries(s) {
    return String(s || "").split(",").map(function (x) { return x.trim(); }).filter(Boolean).map(function (pair) {
      var i = pair.lastIndexOf(":");
      return i < 0 ? { label: pair, value: 0 } : { label: pair.slice(0, i).trim(), value: num(pair.slice(i + 1)) };
    });
  }
  function articlesToStr(arr) {
    return (arr || []).map(function (a) { return (a.status || "upcoming") + " | " + (a.title || "") + (a.url ? " | " + a.url : ""); }).join("\n");
  }
  function strToArticles(s) {
    return String(s || "").split("\n").map(function (l) { return l.trim(); }).filter(Boolean).map(function (l) {
      var parts = l.split("|").map(function (x) { return x.trim(); });
      return { status: (parts[0] || "upcoming").toLowerCase() === "published" ? "published" : "upcoming", title: parts[1] || "", url: parts[2] || "" };
    });
  }

  function collectForm(form) {
    function v(n) { return form[n] ? form[n].value : ""; }
    var payload = {
      email: v("email").trim(),
      name: v("name"),
      plan: v("plan"),
      availedAt: v("availedAt"),
      period: v("period") === "yearly" ? "yearly" : "monthly",
      metrics: {
        views: num(v("views")),
        viewsChangePct: num(v("viewsChangePct")),
        profileClicks: num(v("profileClicks")),
        aiCitations: num(v("aiCitations")),
        articlesPublished: num(v("articlesPublished")),
        articlesUpcoming: num(v("articlesUpcoming")),
        series: strToSeries(v("series")),
        sources: strToSeries(v("sources")),
        articles: strToArticles(v("articles")),
        note: v("note")
      }
    };
    var pw = v("password");
    if (pw) payload.password = pw;
    return payload;
  }

  function wireAdmin(clients, plans) {
    plans = plans || [];
    var modal = el("vpModal");
    function onKey(e) { if (e.key === "Escape") close(); }
    function close() {
      if (modal) modal.innerHTML = "";
      try { document.body.style.overflow = ""; } catch (e) {}
      document.removeEventListener("keydown", onKey);
    }
    function openForm(client, isNew) {
      if (!modal) return;
      modal.innerHTML = clientForm(client, isNew, plans);
      try { document.body.style.overflow = "hidden"; } catch (e) {}
      document.addEventListener("keydown", onKey);
      var cancel = el("vpCancel"); if (cancel) cancel.onclick = close;
      var xBtn = el("vpClose"); if (xBtn) xBtn.onclick = close;
      var bg = el("vpModalBg");
      if (bg) bg.onclick = function (e) { if (e.target === bg) close(); };
      var focusEl = el("vpForm") && el("vpForm").querySelector("input");
      if (focusEl) { try { focusEl.focus(); } catch (e) {} }
      var form = el("vpForm");
      // auto-fill billing period from the chosen plan
      if (form && form.plan && form.period) {
        form.plan.addEventListener("change", function () {
          var pl = plans.filter(function (x) { return x.name === form.plan.value; })[0];
          if (pl && pl.period) form.period.value = pl.period;
        });
      }
      if (form) form.onsubmit = function (e) {
        e.preventDefault();
        var payload = collectForm(form);
        var fmsg = el("vpFormMsg");
        if (!payload.email) { if (fmsg) fmsg.textContent = "Email required."; return; }
        if (isNew && !payload.password) { if (fmsg) { fmsg.textContent = FR() ? "Mot de passe requis." : "Password required."; } return; }
        api("/admin-clients", { method: isNew ? "POST" : "PUT", body: payload }).then(function (res) {
          if (res.ok) { close(); renderAdmin(); }
          else if (fmsg) fmsg.textContent = (res.data && res.data.error) || "Error.";
        });
      };
    }

    var add = el("vpAdd"); if (add) add.onclick = function () { openForm({}, true); };
    var runRem = el("vpRunRem");
    if (runRem) runRem.onclick = function () {
      runRem.disabled = true; var orig = runRem.textContent; runRem.textContent = "…";
      api("/admin-run-reminders", { method: "POST" }).then(function (res) {
        runRem.disabled = false; runRem.textContent = orig;
        var d = res.data || {};
        alert(t("remDone") + " " + (d.reminders || 0) + " " + t("remRems") + " " + (d.expiries || 0) + " " +
          t("remExps") + " " + (d.scanned || 0) + " " + t("remScan") + ".");
        loadBell();
      });
    };
    // ---- left-nav switching ----
    var plansRendered = false, chatLoaded = false, settingsRendered = false;
    document.querySelectorAll(".admin-nav-item[data-nav]").forEach(function (item) {
      item.onclick = function () {
        var name = item.getAttribute("data-nav");
        document.querySelectorAll(".admin-nav-item[data-nav]").forEach(function (b) { b.classList.toggle("is-on", b === item); });
        document.querySelectorAll(".admin-main .dash-panel").forEach(function (pnl) {
          pnl.style.display = pnl.getAttribute("data-panel") === name ? "" : "none";
        });
        if (name === "messages" && !chatLoaded) { chatLoaded = true; loadChats(); }
        if (name === "plans" && !plansRendered) { plansRendered = true; renderPlansPanel(); }
        if (name === "payments") renderPayments();
        if (name === "emails") renderEmails();
        if (name === "settings" && !settingsRendered) { settingsRendered = true; renderSettings(); }
      };
    });

    // ---- payments (verify claims) ----
    function updatePayBadge(claims) {
      var badge = el("vpPayBadge"); if (!badge) return;
      var pending = (claims || []).filter(function (c) { return c.status === "pending"; }).length;
      if (pending > 0) { badge.textContent = pending > 9 ? "9+" : String(pending); badge.hidden = false; }
      else badge.hidden = true;
    }
    // initial count on admin load (so the badge is right before opening Payments)
    api("/admin-payments").then(function (res) { updatePayBadge((res.data && res.data.claims) || []); });

    function renderPayments() {
      var host = el("vpPayPanel"); if (!host) return;
      host.innerHTML = '<div class="dash-card"><p class="lead">…</p></div>';
      api("/admin-payments").then(function (res) {
        var claims = (res.data && res.data.claims) || [];
        updatePayBadge(claims);
        host.innerHTML = '<div class="dash-card" style="overflow-x:auto">' +
          (claims.length
            ? '<table class="dash-table"><thead><tr><th>' + esc(t("clients")) + "</th><th>" + esc(t("yourPlan")) +
              "</th><th>" + esc(t("claimed")) + "</th><th>" + esc(t("statusCol")) + "</th></tr></thead><tbody>" +
              claims.map(function (c) {
                var statusCell;
                if (c.status === "pending") {
                  statusCell = '<div class="dash-actions"><button class="btn primary sm pay-ok">' + esc(t("confirmPay")) +
                    '</button> <button class="btn ghost sm pay-no">' + esc(t("rejectPay")) + "</button></div>";
                } else {
                  var ok = c.status === "confirmed";
                  statusCell = '<span class="sub-pill ' + (ok ? "ok" : "exp") + '">' + esc(t(ok ? "stConfirmed" : "stRejected")) +
                    "</span>" + (c.decidedAt ? ' <span class="dash-muted">' + esc(relTime(c.decidedAt)) + "</span>" : "");
                }
                return '<tr data-email="' + esc(c.email) + '"><td><b>' + esc(c.name || "—") + '</b><div class="dash-muted">' +
                  esc(c.email) + "</div></td><td>" + esc(c.plan || "—") + '</td><td class="dash-muted">' +
                  esc(relTime(c.claimedAt || Date.now())) + "</td><td>" + statusCell + "</td></tr>";
              }).join("") + "</tbody></table>"
            : '<div class="dash-empty">' + esc(t("noClaims")) + "</div>") + "</div>";
        host.querySelectorAll(".pay-ok").forEach(function (btn) {
          btn.onclick = function () { decidePayment(btn.closest("tr").getAttribute("data-email"), "confirm"); };
        });
        host.querySelectorAll(".pay-no").forEach(function (btn) {
          btn.onclick = function () { if (!confirm(t("rejectConfirm"))) return; decidePayment(btn.closest("tr").getAttribute("data-email"), "reject"); };
        });
      });
    }
    function decidePayment(email, decision) {
      api("/admin-payments", { method: "POST", body: { email: email, decision: decision } }).then(function () {
        renderPayments(); loadBell();
      });
    }

    // ---- emails (outbound log) ----
    function emailStatusPill(s) {
      if (s === "sent") return '<span class="sub-pill ok">' + esc(t("emSent")) + "</span>";
      if (s === "skipped") return '<span class="sub-pill pend">' + esc(t("emSkipped")) + "</span>";
      return '<span class="sub-pill exp">' + esc(t("emFailed")) + "</span>";
    }
    function renderEmails() {
      var host = el("vpEmailPanel"); if (!host) return;
      host.innerHTML = '<div class="dash-card"><p class="lead">…</p></div>';
      api("/admin-emails").then(function (res) {
        var emails = (res.data && res.data.emails) || [];
        host.innerHTML =
          '<div class="dash-card">' +
            '<p class="dash-muted" style="margin:0 0 16px">' + esc(t("emailsHint")) + "</p>" +
            '<div style="overflow-x:auto">' +
            (emails.length
              ? '<table class="dash-table"><thead><tr><th>' + esc(t("emTo")) + "</th><th>" + esc(t("emSubject")) +
                "</th><th>" + esc(t("statusCol")) + "</th><th>" + esc(t("emWhen")) + "</th></tr></thead><tbody>" +
                emails.map(function (e) {
                  return "<tr><td>" + esc(e.to || "—") + "</td>" +
                    "<td><b>" + esc(e.subject || "—") + "</b>" +
                    (e.body ? '<div class="dash-muted vp-em-body">' + esc(e.body) + "</div>" : "") +
                    (e.status !== "sent" && e.detail ? '<div class="dash-muted">' + esc(e.detail) + "</div>" : "") +
                    "</td><td>" + emailStatusPill(e.status) + '</td><td class="dash-muted">' +
                    esc(relTime(e.created_at || Date.now())) + "</td></tr>";
                }).join("") + "</tbody></table>"
              : '<div class="dash-empty">' + esc(t("noEmails")) + "</div>") +
            "</div></div>";
      });
    }

    // ---- settings ----
    function renderSettings() {
      var host = el("vpSettingsPanel"); if (!host) return;
      host.innerHTML = '<div class="dash-card"><p class="lead">…</p></div>';
      api("/admin-settings").then(function (res) {
        var s = (res.data && res.data.settings) || {};
        host.innerHTML =
          '<div class="dash-card"><form id="vpSetForm">' +
            '<p class="dash-muted" style="margin:0 0 18px">' + esc(t("setHint")) + "</p>" +
            '<label class="vpf">' + esc(t("setLeadDays")) +
              '<input name="reminderLeadDays" type="number" min="1" max="90" value="' + esc(s.reminderLeadDays == null ? 3 : s.reminderLeadDays) + '"></label>' +
            '<label class="vpf">' + esc(t("setBrand")) +
              '<input name="brandName" type="text" value="' + esc(s.brandName || "") + '"></label>' +
            '<div class="vpf-section">' + esc(t("setRenewal")) + "</div>" +
            '<label class="vpf">' + esc(t("setSubject")) +
              '<input name="renewalSubject" type="text" value="' + esc(s.renewalSubject || "") + '"></label>' +
            '<label class="vpf">' + esc(t("setBody")) +
              '<textarea name="renewalBody" rows="3">' + esc(s.renewalBody || "") + "</textarea></label>" +
            '<div class="vpf-section">' + esc(t("setExpired")) + "</div>" +
            '<label class="vpf">' + esc(t("setSubject")) +
              '<input name="expiredSubject" type="text" value="' + esc(s.expiredSubject || "") + '"></label>' +
            '<label class="vpf">' + esc(t("setBody")) +
              '<textarea name="expiredBody" rows="3">' + esc(s.expiredBody || "") + "</textarea></label>" +
            '<div class="plans-foot"><span></span><span class="plans-foot-r">' +
              '<span class="hint" id="vpSetMsg"></span>' +
              '<button type="submit" class="btn primary">' + esc(t("setSave")) + "</button></span></div>" +
          "</form>" +
          '<div class="vpf-section">' + esc(t("setEmailSec")) + "</div>" +
          '<p class="dash-muted" style="margin:0 0 12px">' + esc(t("testEmailHint")) + "</p>" +
          '<div class="plans-foot"><span class="hint" id="vpTestMsg"></span>' +
            '<button type="button" class="btn ghost" id="vpTestEmail">' + esc(t("testEmail")) + "</button></div>" +
          "</div>";
        var testBtn = el("vpTestEmail");
        if (testBtn) testBtn.onclick = function () {
          var tm = el("vpTestMsg");
          testBtn.disabled = true; if (tm) { tm.textContent = t("testSending"); tm.style.color = ""; }
          api("/admin-test-email", { method: "POST" }).then(function (r) {
            testBtn.disabled = false;
            var d = r.data || {};
            if (d.ok) { if (tm) { tm.textContent = t("testSentTo") + " " + (d.to || ""); tm.style.color = "#39d98a"; } }
            else if (tm) {
              var res = d.result || {};
              tm.textContent = t("testFailed") + " " + (res.detail || res.reason || "error");
              tm.style.color = "#ff8080";
            }
          }).catch(function () { testBtn.disabled = false; if (tm) { tm.textContent = t("netErr"); tm.style.color = "#ff8080"; } });
        };
        var form = el("vpSetForm");
        form.onsubmit = function (e) {
          e.preventDefault();
          var body = {
            reminderLeadDays: form.reminderLeadDays.value,
            brandName: form.brandName.value,
            renewalSubject: form.renewalSubject.value,
            renewalBody: form.renewalBody.value,
            expiredSubject: form.expiredSubject.value,
            expiredBody: form.expiredBody.value,
          };
          var msg = el("vpSetMsg"); if (msg) { msg.textContent = "…"; msg.style.color = ""; }
          api("/admin-settings", { method: "PUT", body: body }).then(function (r) {
            if (r.ok) { if (msg) { msg.textContent = t("setSaved"); msg.style.color = "#39d98a"; } }
            else if (msg) { msg.textContent = (r.data && r.data.error) || "Error."; msg.style.color = "#ff8080"; }
          });
        };
      });
    }

    // ---- manage plans (panel) ----
    function planRow(p) {
      p = p || { name: "", price: "", link: "", period: "monthly" };
      var y = p.period === "yearly";
      return '<div class="vpp-row">' +
        '<input class="vpp-f vpp-name" placeholder="' + esc(t("planName")) + '" value="' + esc(p.name) + '">' +
        '<input class="vpp-f vpp-price" placeholder="' + esc(t("planPrice")) + '" value="' + esc(p.price) + '">' +
        '<input class="vpp-f vpp-link" placeholder="' + esc(t("planLink")) + '" value="' + esc(p.link) + '">' +
        '<select class="vpp-f vpp-period"><option value="monthly"' + (y ? "" : " selected") + ">" + esc(t("monthly")) +
          '</option><option value="yearly"' + (y ? " selected" : "") + ">" + esc(t("yearly")) + "</option></select>" +
        '<button type="button" class="vpp-del" aria-label="remove">&#10005;</button></div>';
    }
    function renderPlansPanel() {
      var host = el("vpPlansPanel"); if (!host) return;
      host.innerHTML =
        '<div class="dash-card">' +
          '<p class="dash-muted" style="margin:0 0 16px">' + esc(t("plansHint")) + "</p>" +
          '<div class="vpp-cols"><span>' + esc(t("planName")) + "</span><span>" + esc(t("planPrice")) +
            "</span><span>" + esc(t("planLink")) + "</span><span>" + esc(t("billing")) + "</span><span></span></div>" +
          '<div id="vpPlanRows">' + (plans.length ? plans.map(planRow).join("") : "") + "</div>" +
          (plans.length ? "" : '<div class="dash-empty" id="vpPlanEmpty">' + esc(t("noPlans")) + "</div>") +
          '<div class="plans-foot"><button type="button" class="btn ghost sm" id="vpPlanAdd">' + esc(t("addPlan")) + "</button>" +
            '<span class="plans-foot-r"><span class="hint" id="vpPlansMsg"></span>' +
            '<button type="button" class="btn primary" id="vpPlansSave">' + esc(t("savePlans")) + "</button></span></div>" +
        "</div>";
      wirePlansPanel();
    }
    function wirePlansPanel() {
      function wireDel() {
        el("vpPlanRows").querySelectorAll(".vpp-del").forEach(function (b) {
          b.onclick = function () { b.closest(".vpp-row").remove(); };
        });
      }
      wireDel();
      el("vpPlanAdd").onclick = function () {
        var empty = el("vpPlanEmpty"); if (empty) empty.remove();
        el("vpPlanRows").insertAdjacentHTML("beforeend", planRow());
        wireDel();
      };
      el("vpPlansSave").onclick = function () {
        var out = [];
        el("vpPlanRows").querySelectorAll(".vpp-row").forEach(function (r) {
          var name = r.querySelector(".vpp-name").value.trim();
          if (!name) return;
          out.push({ name: name, price: r.querySelector(".vpp-price").value.trim(), link: r.querySelector(".vpp-link").value.trim(), period: r.querySelector(".vpp-period").value });
        });
        var msg = el("vpPlansMsg"); if (msg) { msg.textContent = "…"; msg.style.color = ""; }
        api("/admin-plans", { method: "PUT", body: { plans: out } }).then(function (res) {
          if (res.ok) { plans = normPlans((res.data && res.data.plans) || out); if (msg) { msg.textContent = t("plansSaved"); msg.style.color = "#39d98a"; } }
          else if (msg) { msg.textContent = (res.data && res.data.error) || "Error."; msg.style.color = "#ff8080"; }
        });
      };
    }

    var editBtns = document.querySelectorAll(".vp-edit");
    for (var i = 0; i < editBtns.length; i++) {
      editBtns[i].onclick = function () {
        var email = this.closest("tr").getAttribute("data-email");
        var c = clients.filter(function (x) { return x.email === email; })[0];
        openForm(c || { email: email }, false);
      };
    }
    var delBtns = document.querySelectorAll(".vp-del");
    for (var j = 0; j < delBtns.length; j++) {
      delBtns[j].onclick = function () {
        var email = this.closest("tr").getAttribute("data-email");
        if (!confirm(t("confirmDel"))) return;
        api("/admin-clients", { method: "DELETE", body: { email: email } }).then(function () { renderAdmin(); });
      };
    }

    // ---- messages ----
    var curCid = null, chatSeen = 0, convs = [];
    // Which client messages the admin has already seen — kept per browser.
    var readMap = (function () { try { return JSON.parse(localStorage.getItem("vanta_chat_read") || "{}") || {}; } catch (e) { return {}; } })();
    function saveReadMap() { try { localStorage.setItem("vanta_chat_read", JSON.stringify(readMap)); } catch (e) {} }
    function convUnread(c) { return (c.lastClientAt || 0) > (readMap[c.cid] || 0); }
    function updateMsgBadge(list) {
      var badge = el("vpMsgBadge"); if (!badge) return;
      var n = (list || convs || []).filter(convUnread).length;
      if (n > 0) { badge.textContent = n > 9 ? "9+" : String(n); badge.hidden = false; } else badge.hidden = true;
    }
    function refreshMsgBadge() {
      api("/admin-chats").then(function (res) {
        var list = (res.data && res.data.conversations) || [];
        // If the Messages panel isn't rendered yet, keep this list for badge counting.
        if (!convs.length) convs = list;
        updateMsgBadge(list);
      }).catch(function () {});
    }
    function loadChats() {
      var listEl = el("vpChatList");
      api("/admin-chats").then(function (res) {
        if (!listEl) return;
        convs = (res.data && res.data.conversations) || [];
        updateMsgBadge(convs);
        if (!convs.length) { listEl.innerHTML = '<div class="dash-empty">' + esc(t("noMessages")) + "</div>"; return; }
        listEl.innerHTML = convs.map(function (c) {
          return '<button class="vpc-conv' + (convUnread(c) ? " has-unread" : "") + '" data-cid="' + esc(c.cid) + '">' +
            '<span class="vpc-dot" aria-hidden="true"></span>' +
            '<div class="vpc-conv-name">' + esc(c.name || c.email || c.cid) + "</div>" +
            (c.business ? '<div class="vpc-conv-sub">' + esc(c.business) + "</div>" : "") +
            '<div class="vpc-conv-last">' + esc(c.last || "") + "</div></button>";
        }).join("");
        listEl.querySelectorAll(".vpc-conv").forEach(function (btn) {
          btn.onclick = function () {
            listEl.querySelectorAll(".vpc-conv").forEach(function (b) { b.classList.toggle("is-on", b === btn); });
            openConv(convs.filter(function (x) { return x.cid === btn.getAttribute("data-cid"); })[0] || { cid: btn.getAttribute("data-cid") });
          };
        });
      });
    }
    function openConv(meta) {
      curCid = meta.cid; chatSeen = 0;
      // Opening the thread marks its client messages as read.
      readMap[meta.cid] = Math.max(readMap[meta.cid] || 0, meta.lastClientAt || meta.lastAt || Date.now());
      saveReadMap();
      var row = document.querySelector('.vpc-conv[data-cid="' + (window.CSS && CSS.escape ? CSS.escape(meta.cid) : meta.cid) + '"]');
      if (row) row.classList.remove("has-unread");
      updateMsgBadge(convs);
      var pane = el("vpChatPane"); if (!pane) return;
      pane.innerHTML =
        '<div class="vpc-head"><b>' + esc(meta.name || meta.email || meta.cid) + "</b>" +
        (meta.email ? "<span>" + esc(meta.email) + "</span>" : "") +
        (meta.business ? "<span>" + esc(meta.business) + "</span>" : "") + "</div>" +
        '<div class="vpc-thread" id="vpChatThread"></div>' +
        '<form class="vpc-reply" id="vpReplyForm"><textarea id="vpReplyBox" rows="2" placeholder="' + esc(t("replyPh")) + '"></textarea>' +
        '<button class="btn primary" type="submit">' + esc(t("sendReply")) + "</button></form>";
      el("vpReplyForm").onsubmit = function (e) {
        e.preventDefault();
        var box = el("vpReplyBox"); var body = box.value.trim(); if (!body) return;
        box.value = "";
        api("/admin-chats", { method: "POST", body: { cid: curCid, message: body } }).then(function () { refreshThread(); });
      };
      el("vpReplyBox").addEventListener("keydown", function (e) {
        if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); el("vpReplyForm").requestSubmit(); }
      });
      refreshThread();
      if (adminPoll) clearInterval(adminPoll);
      adminPoll = setInterval(function () { if (curCid) refreshThread(); }, 6000);
    }
    function refreshThread() {
      var cid = curCid;
      api("/admin-chats?cid=" + encodeURIComponent(cid) + "&after=" + (chatSeen || 0)).then(function (res) {
        if (cid !== curCid) return;
        var thread = el("vpChatThread"); if (!thread) return;
        var msgs = (res.data && res.data.messages) || [];
        msgs.forEach(function (m) {
          var empty = thread.querySelector(".dash-empty"); if (empty) empty.remove();
          var d = document.createElement("div");
          d.className = "vpc-b " + (m.sender === "admin" ? "me" : "them");
          d.textContent = m.body;
          thread.appendChild(d);
        });
        if (res.data && typeof res.data.head === "number") chatSeen = res.data.head;
        if (!thread.children.length) thread.innerHTML = '<div class="dash-empty">' + esc(t("noReplyYet")) + "</div>";
        if (msgs.length) {
          thread.scrollTop = thread.scrollHeight;
          // The admin is looking at this thread — keep it marked read.
          readMap[cid] = Math.max(readMap[cid] || 0, chatSeen || 0);
          saveReadMap();
          updateMsgBadge(convs);
        }
      });
    }

    // Populate the Messages nav badge on load and keep it fresh in the background.
    refreshMsgBadge();
    if (msgPoll) clearInterval(msgPoll);
    msgPoll = setInterval(refreshMsgBadge, 30000);
  }

  function wireCommon() {
    var lo = el("vpLogout");
    if (lo) lo.onclick = logout;
    initBell();
  }

  // ================= boot =================
  function injectCSS() {
    if (el("vp-css")) return;
    var css =
    ".dash-top{display:flex;justify-content:space-between;align-items:flex-end;gap:16px;margin-bottom:20px;flex-wrap:wrap}" +
    ".dash-top-actions{display:flex;align-items:center;gap:10px}" +
    ".vp-bell-wrap{position:relative}" +
    ".vp-bell{position:relative;width:44px;height:44px;border-radius:12px;border:1px solid var(--line2,#2a2145);background:rgba(255,255,255,.04);color:var(--white,#fff);cursor:pointer;display:inline-flex;align-items:center;justify-content:center}" +
    ".vp-bell:hover{background:rgba(255,255,255,.09)}" +
    ".vp-bell-badge{position:absolute;top:-5px;right:-5px;min-width:19px;height:19px;padding:0 5px;border-radius:10px;background:#e8409b;color:#fff;font-size:11px;font-weight:700;display:inline-flex;align-items:center;justify-content:center;box-sizing:border-box}" +
    ".vp-bell-badge[hidden]{display:none}" +
    ".vp-bell-menu{position:absolute;top:52px;right:0;width:330px;max-width:calc(100vw - 32px);max-height:min(60vh,460px);overflow-y:auto;background:#17112f;border:1px solid var(--line2,#2a2145);border-radius:14px;box-shadow:0 34px 90px -24px rgba(0,0,0,.85);z-index:1500}" +
    ".vp-bell-head{padding:13px 15px;font-weight:700;font-size:14px;color:var(--white,#fff);border-bottom:1px solid var(--line2,#2a2145);position:sticky;top:0;background:#17112f}" +
    ".vp-bell-empty{padding:26px 15px;text-align:center;color:var(--mut2,#77809a);font-size:13px}" +
    ".vp-notif{padding:12px 15px;border-bottom:1px solid var(--line2,#2a2145)}" +
    ".vp-notif.unread{background:rgba(124,58,237,.09)}" +
    ".vp-notif-t{font-size:13.5px;font-weight:600;color:var(--white,#fff)}" +
    ".vp-notif-b{font-size:12.5px;color:var(--mut,#9aa);margin-top:2px;line-height:1.4}" +
    ".vp-notif-time{font-size:11px;color:var(--mut2,#77809a);margin-top:5px}" +
    ".dash-plan{color:var(--mut,#9aa);margin:-6px 0 10px;font-size:14px}" +
    ".sub-banner{display:flex;align-items:center;gap:10px;margin:0 0 18px;font-size:13.5px;color:var(--mut,#9aa)}" +
    ".sub-pill{display:inline-block;font-size:11px;font-weight:700;padding:2px 9px;border-radius:20px;white-space:nowrap}" +
    ".sub-pill.ok{background:rgba(57,217,138,.14);color:#39d98a}" +
    ".sub-pill.exp{background:rgba(255,122,122,.16);color:#ff8f8f}" +
    ".sub-pill.pend{background:rgba(245,183,49,.16);color:#f5c451}" +
    ".dash-stats{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-bottom:18px}" +
    ".dash-stat{background:linear-gradient(180deg,var(--panel,#140e29),#0c0918);border:1px solid var(--line2,#2a2145);border-radius:16px;padding:18px}" +
    ".dash-stat-v{font-size:30px;font-weight:800;color:var(--white,#fff);line-height:1.1}" +
    ".dash-stat-l{color:var(--mut,#9aa);font-size:13px;margin-top:4px}" +
    ".dash-delta{display:inline-block;margin-top:6px;font-size:12.5px;font-weight:700}" +
    ".dash-delta.up{color:#39d98a}.dash-delta.down{color:#ff7a7a}" +
    ".dash-sub{display:block;color:var(--mut2,#77809a);font-size:12px;margin-top:4px}" +
    ".dash-grid2{display:grid;grid-template-columns:1.3fr 1fr;gap:14px;margin-bottom:14px}" +
    ".dash-card{background:linear-gradient(180deg,var(--panel,#140e29),#0a0817);border:1px solid var(--line2,#2a2145);border-radius:18px;padding:18px}" +
    ".dash-card h3{margin:0 0 14px;font-size:15px;color:var(--white,#fff)}" +
    ".dash-bars{display:flex;align-items:flex-end;gap:8px;height:150px}" +
    ".dash-bar{flex:1;display:flex;flex-direction:column;justify-content:flex-end;align-items:center;height:100%}" +
    ".dash-bar-fill{width:100%;max-width:34px;border-radius:7px 7px 0 0;background:linear-gradient(180deg,#7c3aed,#4f46e5);min-height:3px}" +
    ".dash-bar-lb{font-size:11px;color:var(--mut2,#77809a);margin-top:6px}" +
    ".dash-src{list-style:none;margin:0;padding:0;display:grid;gap:12px}" +
    ".dash-src li{display:grid;grid-template-columns:auto 1fr auto;align-items:center;gap:10px;font-size:13px;color:var(--mut,#9aa)}" +
    ".dash-src-lb{min-width:90px}.dash-src-v{color:var(--white,#fff);font-weight:700}" +
    ".dash-src-track{height:8px;background:rgba(255,255,255,.07);border-radius:6px;overflow:hidden}" +
    ".dash-src-fill{display:block;height:100%;background:linear-gradient(90deg,#7c3aed,#4f46e5)}" +
    ".dash-arts{list-style:none;margin:0;padding:0;display:grid;gap:10px}" +
    ".dash-arts li{display:flex;align-items:center;gap:10px;font-size:14px;color:var(--white,#fff)}" +
    ".dash-arts a{color:#c4b5fd}" +
    ".dash-art-badge{font-size:11px;font-weight:700;padding:3px 8px;border-radius:20px}" +
    ".dash-art-badge.pub{background:rgba(57,217,138,.14);color:#39d98a}" +
    ".dash-art-badge.up{background:rgba(255,255,255,.08);color:var(--mut,#9aa)}" +
    ".dash-empty{color:var(--mut2,#77809a);font-size:13px;padding:8px 0}" +
    ".dash-note{color:var(--mut,#9aa);font-size:13px;margin-top:14px;font-style:italic}" +
    ".dash-toolbar{margin:0 0 14px}" +
    ".dash-table{width:100%;border-collapse:collapse;font-size:14px;min-width:560px}" +
    ".dash-table th{text-align:left;color:var(--mut2,#77809a);font-size:12px;font-weight:600;padding:0 10px 10px}" +
    ".dash-table td{padding:12px 10px;border-top:1px solid var(--line2,#2a2145);color:var(--white,#fff);vertical-align:middle}" +
    ".dash-muted{color:var(--mut2,#77809a);font-size:12px;font-weight:400}" +
    ".dash-actions{white-space:nowrap;text-align:right}" +
    ".btn.sm{padding:6px 12px;font-size:12.5px}" +
    "body.vp-dash nav.vn,body.vp-dash footer,body.vp-dash #chatw{display:none!important}" +
    "#view-admin>.sec,#view-dashboard>.sec{padding-top:34px}" +
    ".dash-table tbody tr:hover td{background:rgba(124,58,237,.06)}" +
    ".admin-layout{display:grid;grid-template-columns:200px 1fr;gap:24px;align-items:start;margin-top:4px;min-height:62vh}" +
    ".admin-nav{display:flex;flex-direction:column;gap:4px;align-self:stretch}" +
    ".admin-nav-foot{margin-top:auto;display:flex;flex-direction:column;gap:4px;padding-top:6px}" +
    ".admin-nav-item{font:inherit;font-size:14.5px;font-weight:600;text-align:left;color:var(--mut,#9aa);background:none;border:none;border-radius:10px;padding:11px 14px;cursor:pointer;white-space:nowrap}" +
    ".admin-nav-item:hover{color:var(--white,#fff);background:rgba(255,255,255,.05)}" +
    ".admin-nav-item.is-on{color:var(--white,#fff);background:rgba(124,58,237,.18)}" +
    ".admin-nav-badge{display:inline-flex;align-items:center;justify-content:center;margin-left:8px;min-width:19px;height:19px;padding:0 5px;border-radius:10px;background:#e8409b;color:#fff;font-size:11px;font-weight:700;vertical-align:middle;box-sizing:border-box}" +
    ".admin-nav-badge[hidden]{display:none}" +
    ".admin-nav-sep{height:1px;background:var(--line2,#2a2145);margin:10px 6px}" +
    ".vp-em-body{max-width:420px;white-space:normal;margin-top:3px;line-height:1.4}" +
    ".admin-nav-logout{color:var(--mut2,#77809a)}" +
    ".admin-nav-logout:hover{color:#ff8f8f;background:rgba(255,122,122,.12)}" +
    ".admin-main{min-width:0}" +
    ".vpp-cols{display:grid;grid-template-columns:1fr 1fr 1.5fr 108px 36px;gap:10px;font-size:11.5px;color:var(--mut2,#77809a);font-weight:600;padding:0 2px 9px;border-bottom:1px solid var(--line2,#2a2145);margin-bottom:12px}" +
    ".vpp-row{display:grid;grid-template-columns:1fr 1fr 1.5fr 108px 36px;gap:10px;margin-bottom:10px;align-items:center}" +
    ".vpp-f{font:inherit;font-size:14px;color:var(--white,#fff);background:rgba(255,255,255,.05);border:1px solid var(--line2,#2a2145);border-radius:9px;padding:9px 11px;outline:none;width:100%;box-sizing:border-box}" +
    ".vpp-f:focus{border-color:var(--royal,#7c3aed)}" +
    ".vpp-period{background-color:rgba(255,255,255,.05);background-image:url(\"data:image/svg+xml;charset=utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='7'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%23C4B5FD' stroke-width='2' fill='none' stroke-linecap='round'/%3E%3C/svg%3E\");background-repeat:no-repeat;background-position:right 9px center;padding-right:24px}" +
    ".vpp-del{width:36px;height:38px;border-radius:9px;border:1px solid var(--line2,#2a2145);background:rgba(255,255,255,.04);color:var(--mut,#9aa);font-size:13px;cursor:pointer}" +
    ".vpp-del:hover{color:#fff;background:rgba(255,122,122,.18)}" +
    ".plans-foot{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-top:14px;flex-wrap:wrap}" +
    ".plans-foot-r{display:flex;align-items:center;gap:12px}" +
    "@media(max-width:820px){.admin-layout{grid-template-columns:1fr;min-height:0}.admin-nav{flex-direction:row;overflow-x:auto;position:static;margin-bottom:8px;align-self:auto}.admin-nav-foot{flex-direction:row;margin:0;padding:0}.admin-nav-sep{display:none}.vpp-cols{display:none}.vpp-row{grid-template-columns:1fr 1fr;gap:8px}.vpp-row .vpp-link{grid-column:1/-1}.vpp-del{width:auto}}" +
    ".vpc-admin{display:grid;grid-template-columns:300px 1fr;gap:14px;height:min(66vh,620px)}" +
    ".vpc-list{overflow-y:auto;background:linear-gradient(180deg,var(--panel,#140e29),#0a0817);border:1px solid var(--line2,#2a2145);border-radius:16px;padding:8px}" +
    ".vpc-conv{position:relative;display:block;width:100%;text-align:left;background:none;border:none;border-radius:10px;padding:11px 12px;cursor:pointer;color:var(--white,#fff);font:inherit}" +
    ".vpc-conv:hover{background:rgba(255,255,255,.05)}" +
    ".vpc-conv.is-on{background:rgba(124,58,237,.16)}" +
    ".vpc-dot{display:none;position:absolute;top:14px;right:12px;width:9px;height:9px;border-radius:50%;background:#e8409b}" +
    ".vpc-conv.has-unread .vpc-dot{display:block}" +
    ".vpc-conv.has-unread .vpc-conv-name{font-weight:800}" +
    ".vpc-conv.has-unread .vpc-conv-last{color:var(--white,#fff)}" +
    ".vpc-conv-name{font-weight:700;font-size:14px}" +
    ".vpc-conv-sub{font-size:12px;color:var(--mut2,#77809a);margin-top:1px}" +
    ".vpc-conv-last{font-size:12.5px;color:var(--mut,#9aa);margin-top:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}" +
    ".vpc-pane{display:flex;flex-direction:column;background:linear-gradient(180deg,var(--panel,#140e29),#0a0817);border:1px solid var(--line2,#2a2145);border-radius:16px;overflow:hidden}" +
    ".vpc-empty{margin:auto;color:var(--mut2,#77809a);font-size:13px;padding:20px;text-align:center}" +
    ".vpc-head{flex:0 0 auto;padding:14px 16px;border-bottom:1px solid var(--line2,#2a2145);display:flex;flex-wrap:wrap;gap:4px 10px;align-items:baseline}" +
    ".vpc-head b{font-size:15px;color:var(--white,#fff)}.vpc-head span{font-size:12.5px;color:var(--mut2,#77809a)}" +
    ".vpc-thread{flex:1 1 auto;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:8px}" +
    ".vpc-b{max-width:78%;padding:9px 13px;border-radius:14px;font-size:14px;line-height:1.4;white-space:pre-wrap;word-break:break-word}" +
    ".vpc-b.them{align-self:flex-start;background:rgba(255,255,255,.07);color:var(--white,#fff);border-bottom-left-radius:5px}" +
    ".vpc-b.me{align-self:flex-end;background:linear-gradient(120deg,#7c3aed,#4f46e5);color:#fff;border-bottom-right-radius:5px}" +
    ".vpc-reply{flex:0 0 auto;display:flex;gap:8px;padding:12px;border-top:1px solid var(--line2,#2a2145)}" +
    ".vpc-reply textarea{flex:1;font:inherit;font-size:14px;color:var(--white,#fff);background:rgba(255,255,255,.05);border:1px solid var(--line2,#2a2145);border-radius:10px;padding:9px 12px;outline:none;resize:none}" +
    ".vpc-reply textarea:focus{border-color:var(--royal,#7c3aed)}" +
    ".vpc-reply .btn{align-self:stretch}" +
    "@media(max-width:700px){.vpc-admin{grid-template-columns:1fr;height:auto}.vpc-list{max-height:200px}.vpc-pane{height:60vh}}" +
    ".dash-modal-bg{position:fixed;inset:0;background:rgba(6,4,16,.78);-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);display:flex;align-items:flex-start;justify-content:center;padding:clamp(16px,5vh,56px) 16px;z-index:2000;overflow-y:auto}" +
    ".dash-modal{width:100%;max-width:560px;display:flex;flex-direction:column;max-height:calc(100vh - 48px);background:#17112f;border:1px solid rgba(196,181,253,.18);border-radius:20px;box-shadow:0 40px 120px -30px rgba(0,0,0,.85);overflow:hidden}" +
    ".dash-modal-head{flex:0 0 auto;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:18px 22px;border-bottom:1px solid var(--line2,#2a2145);background:#17112f}" +
    ".dash-modal-head h3{margin:0;font-size:17px;color:var(--white,#fff)}" +
    ".dash-modal-x{width:34px;height:34px;flex:0 0 auto;border-radius:9px;border:1px solid var(--line2,#2a2145);background:rgba(255,255,255,.04);color:var(--mut,#9aa);font-size:14px;line-height:1;cursor:pointer}" +
    ".dash-modal-x:hover{color:#fff;background:rgba(255,255,255,.09)}" +
    ".dash-modal-body{flex:1 1 auto;padding:2px 22px 18px;overflow-y:auto}" +
    ".dash-modal-foot{flex:0 0 auto;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 22px;border-top:1px solid var(--line2,#2a2145);background:#17112f}" +
    ".dash-modal-foot .hint{margin:0;text-align:left;font-size:12.5px}" +
    ".vpf-section{font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:#c4b5fd;font-weight:700;margin:22px 0 2px;padding-bottom:9px;border-bottom:1px solid rgba(255,255,255,.07)}" +
    ".vpf-section:first-child{margin-top:12px}" +
    ".vpf-hint{color:var(--mut2,#77809a);font-weight:500;text-transform:none;letter-spacing:0}" +
    ".vpf{display:grid;gap:5px;font-size:12.5px;color:var(--mut,#9aa);font-weight:600;margin-top:12px}" +
    ".vpf input,.vpf textarea{font:inherit;font-size:14px;color:var(--white,#fff);background:rgba(255,255,255,.05);border:1px solid var(--line2,#2a2145);border-radius:9px;padding:10px 12px;outline:none;width:100%;box-sizing:border-box}" +
    ".vpf input:focus,.vpf textarea:focus{border-color:var(--royal,#7c3aed);background:rgba(124,58,237,.08)}" +
    ".vpf textarea{resize:vertical}" +
    ".vpf select{width:100%;box-sizing:border-box;font-size:14px;color:var(--white,#fff)}" +
    ".vpf-row{display:grid;grid-template-columns:1fr 1fr;gap:12px}" +
    ".vpf-actions{display:flex;justify-content:flex-end;gap:10px}" +
    "@media(max-width:820px){.dash-stats{grid-template-columns:1fr 1fr}.dash-grid2{grid-template-columns:1fr}}" +
    "@media(max-width:520px){.vpf-row{grid-template-columns:1fr}.dash-modal-foot{flex-direction:column;align-items:stretch}.vpf-actions .btn{flex:1}}";
    var s = document.createElement("style");
    s.id = "vp-css"; s.textContent = css;
    document.head.appendChild(s);
  }

  function boot() {
    injectCSS();
    window.addEventListener("hashchange", updateChrome);
    // If already signed in and sitting on the login screen, jump to the dashboard.
    var h = location.hash || "";
    if (getToken() && (h === "" || h === "#/" || h.indexOf("#/login") === 0)) {
      go(getRole() === "admin" ? "#/admin" : "#/dashboard");
    } else {
      route(h);
    }
    updateChrome();
  }

  window.VantaPortal = {
    handleLogin: handleLogin,
    renderClient: renderClient,
    renderAdmin: renderAdmin,
    logout: logout,
    isAuthed: function () { return !!getToken(); },
    role: getRole
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
