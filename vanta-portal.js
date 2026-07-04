/* =========================================================================
   Vanta client/admin portal - real login + dashboards.
   Talks to Netlify Functions (auth-login, auth-me, client-data, admin-clients)
   which store data in Netlify Blobs. Loaded as a classic script; the heavy
   logic lives here and index.html's module just delegates to window.VantaPortal.
   ========================================================================= */
(function () {
  "use strict";

  var API = "/.netlify/functions";
  var LS = { token: "vanta_token", role: "vanta_role", name: "vanta_name" };
  // Google Sheet where lead/form submissions are collected (admin "View leads").
  var LEADS_SHEET_URL = "https://docs.google.com/spreadsheets/d/1hrDo4e5WTX1WQF3n369v1CmsTXQq8ZFOrF8-odcDMI8/edit?gid=0#gid=0";
  var GEAR_SVG = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>';
  var EYE_SVG = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z"/><circle cx="12" cy="12" r="3"/></svg>';
  var EYE_OFF_SVG = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';
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
    netErr:     { en: "Network error - please try again.", fr: "Erreur réseau - réessayez." },
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
    upcoming:   { en: "Upcoming",                  fr: "À venir" },
    trend:      { en: "Views over time",           fr: "Vues dans le temps" },
    sources:    { en: "AI & discovery sources",    fr: "Sources IA et découverte" },
    articles:   { en: "Your articles",             fr: "Vos articles" },
    noData:     { en: "No data yet - we'll fill this in as your campaign runs.", fr: "Pas encore de données - ça se remplira au fil de la campagne." },
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
    remDone:    { en: "Sweep done -",         fr: "Balayage terminé -" },
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
    emAll:      { en: "All",                  fr: "Tous" },
    emClientTab:{ en: "To clients",           fr: "Aux clients" },
    emAdminTab: { en: "To admin",             fr: "À l'admin" },
    emView:     { en: "View",                 fr: "Voir" },
    emDelete:   { en: "Delete",               fr: "Supprimer" },
    emClearAll: { en: "Clear all",            fr: "Tout effacer" },
    emConfirmDel:{ en: "Delete this email from the log?", fr: "Supprimer ce courriel du journal ?" },
    emConfirmClear:{ en: "Delete all emails shown in this tab? This can't be undone.", fr: "Supprimer tous les courriels de cet onglet ? Irréversible." },
    emBodyLabel:{ en: "Message",              fr: "Message" },
    emReason:   { en: "Reason",               fr: "Raison" },
    viewLeads:  { en: "View leads",           fr: "Voir les prospects" },
    ngAvgSeo:   { en: "Avg SEO score",         fr: "Score SEO moyen" },
    ngSitesN:   { en: "Sites",                 fr: "Sites" },
    ngActiveN:  { en: "Active",                fr: "Actifs" },
    ngSeoCol:   { en: "SEO",                   fr: "SEO" },
    ngSiteList: { en: "Your sites",            fr: "Vos sites" },
    ngSiteCol:  { en: "Site",                  fr: "Site" },
    ngLatestCol:{ en: "Latest post",           fr: "Dernier article" },
    ngNoScan:   { en: "Not scanned yet",       fr: "Pas encore analysé" },
    ngNoPost:   { en: "No posts yet",          fr: "Aucun article" },
    trTitle:    { en: "Traffic over time",     fr: "Trafic dans le temps" },
    trNoData:   { en: "No traffic tracked yet - this fills in as visits come in.", fr: "Aucun trafic pour l'instant - se remplit au fil des visites." },
    rngAll:     { en: "All time",              fr: "Depuis le début" },
    rng30:      { en: "30 days",               fr: "30 jours" },
    recentTitle:{ en: "Recent posts",          fr: "Articles récents" },
    cadenceTitle:{ en: "Publishing cadence",   fr: "Rythme de publication" },
    cadenceSub: { en: "Posts per week",        fr: "Articles par semaine" },
    noPostsYet: { en: "No posts published yet.", fr: "Aucun article publié pour l'instant." },
    postViews:  { en: "views",                 fr: "vues" },
    postsUnit:  { en: "posts",                 fr: "articles" },
    weekOf:     { en: "week of",               fr: "semaine du" },
    seoHistTitle:{ en: "SEO score over time",  fr: "Score SEO dans le temps" },
    seoHistEmpty:{ en: "No SEO scans yet - this fills in after the first scan.", fr: "Aucune analyse SEO - se remplit après la première analyse." },
    authTitle:  { en: "SEO authority",         fr: "Autorité SEO" },
    authNoData: { en: "No third-party SEO data yet for these sites.", fr: "Aucune donnée SEO tierce pour ces sites." },
    authDA:     { en: "Domain authority",      fr: "Autorité de domaine" },
    authBacklinks:{ en: "Backlinks",           fr: "Backlinks" },
    authRefDomains:{ en: "Referring domains",  fr: "Domaines référents" },
    authKeywords:{ en: "Organic keywords",     fr: "Mots-clés organiques" },
    authTraffic:{ en: "Est. organic traffic",  fr: "Trafic organique est." },
    authTopKw:  { en: "Top keywords",          fr: "Mots-clés principaux" },
    authFetched:{ en: "updated",               fr: "mis à jour" },
    authColDA:  { en: "DA",                    fr: "DA" },
    authColBl:  { en: "Backlinks",             fr: "Backlinks" },
    authColKw:  { en: "Keywords",              fr: "Mots-clés" },
    authColTr:  { en: "Traffic",               fr: "Trafic" },
    cdView:     { en: "View",                  fr: "Voir" },
    cdBack:     { en: "Back to clients",       fr: "Retour aux clients" },
    cdReal:     { en: "Real data",             fr: "Données réelles" },
    cdManual:   { en: "Manual",                fr: "Manuel" },
    cdRealSub:  { en: "Live from netgrid",     fr: "En direct de netgrid" },
    cdManualSub:{ en: "Numbers you enter",     fr: "Chiffres que vous saisissez" },
    cdOverallSeo:{ en: "Overall SEO score",    fr: "Score SEO global" },
    cdBlogSites:{ en: "Blog sites",            fr: "Sites de blogue" },
    cdActiveLc: { en: "active",                fr: "actifs" },
    cdTotalPosts:{ en: "Total posts",          fr: "Articles publiés" },
    cdPosts30:  { en: "Posts (30 days)",       fr: "Articles (30 j)" },
    cdViews:    { en: "Views",                 fr: "Vues" },
    cdClicks:   { en: "Clicks",                fr: "Clics" },
    cdCtr:      { en: "CTR",                   fr: "CTR" },
    cdLastPost: { en: "Latest post",           fr: "Dernier article" },
    cdNoNetgrid:{ en: "netgrid isn't connected yet - set NETGRID_API_URL and NETGRID_API_KEY.", fr: "netgrid n'est pas connecté - configurez NETGRID_API_URL et NETGRID_API_KEY." },
    cdNoMatch:  { en: "No netgrid data for this client - their email isn't matched to a netgrid account.", fr: "Aucune donnée netgrid pour ce client - son courriel ne correspond à aucun compte netgrid." },
    visSection: { en: "What this client sees",  fr: "Ce que ce client voit" },
    visHint:    { en: "Choose which data blocks appear on this client's dashboard.", fr: "Choisissez les blocs de données affichés sur le tableau de bord de ce client." },
    visReal:    { en: "Real data (from netgrid)", fr: "Données réelles (netgrid)" },
    visManual:  { en: "Reported data",         fr: "Données rapportées" },
    refreshNote:{ en: "Data refreshes weekly.", fr: "Les données sont actualisées chaque semaine." },
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
    reviewNote: { en: "We're verifying your payment - we'll confirm shortly.", fr: "On vérifie votre paiement - confirmation sous peu." },
    expiredT:   { en: "Your plan has expired", fr: "Votre forfait a expiré" },
    expiredMsg: { en: "Your plan expired on", fr: "Votre forfait a expiré le" },
    remindLater:{ en: "Remind me later",     fr: "Me le rappeler plus tard" },
    renewNow:   { en: "Renew now",           fr: "Renouveler" },
    alreadyPaid:{ en: "I already paid",      fr: "J'ai déjà payé" },
    managePlans:{ en: "Manage plans",       fr: "Gérer les forfaits" },
    plansHint:  { en: "Define your plans. They appear in the client Plan dropdown; the buy link is your Whop/Stripe checkout.", fr: "Définissez vos forfaits. Ils apparaissent dans le menu Forfait du client; le lien d'achat est votre paiement Whop/Stripe." },
    planNone:   { en: "- No plan -",         fr: "- Aucun forfait -" },
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
  // vp-admin (admin only) additionally hides the floating support chat;
  // the client dashboard keeps the chat so clients can message us.
  function updateChrome() {
    var h = location.hash || "";
    var onAdmin = h.indexOf("#/admin") === 0 && !!getToken();
    var onDash = onAdmin || (h.indexOf("#/dashboard") === 0 && !!getToken());
    document.body.classList.toggle("vp-dash", onDash);
    document.body.classList.toggle("vp-admin", onAdmin);
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
    document.body.classList.remove("vp-admin");
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
  // Measure the sticky header so the sticky admin nav can pin right below it.
  function syncDashTop() {
    try {
      var h = 0;
      document.querySelectorAll(".dash-top").forEach(function (dt) {
        if (dt.offsetParent !== null) h = dt.offsetHeight;
      });
      if (h) document.documentElement.style.setProperty("--dash-top-h", (h + 10) + "px");
    } catch (e) {}
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
  // Cached client-data so the range toggle can re-render without re-fetching it.
  var _cUser = null, _cM = null, _cPlanLink = "", _cDays = "", _cPosts = null, _cHist = null;
  function renderClient() {
    if (!requireRole("client")) return;
    var host = el("view-dashboard");
    if (!host) return;
    host.innerHTML = '<div class="sec"><div class="wrap"><p class="lead">…</p></div></div>';
    showView("view-dashboard");
    _cUser = null; _cM = null; _cPlanLink = ""; _cDays = ""; _cPosts = null; _cHist = null;

    api("/client-data").then(function (res) {
      if (res.status === 401) { logout(); return; }
      _cUser = (res.data && res.data.user) || {};
      _cM = _cUser.metrics || {};
      _cPlanLink = (res.data && res.data.planLink) || "";
      renderClientBody("", false);
    }).catch(function () {
      host.innerHTML = '<div class="sec"><div class="wrap">' + topbar(getName() || "") +
        '<p class="lead">' + esc(t("netErr")) + '</p></div></div>';
      wireCommon();
    });
  }
  // Renders (or re-renders on range toggle) the dashboard body. isToggle=true skips
  // the one-time chat bind + expiry prompt and only refreshes the data/charts.
  function renderClientBody(days, isToggle) {
    var host = el("view-dashboard");
    if (!host) return;
    _cDays = days = String(days || "");
    var user = _cUser || {}, m = _cM || {};
    var win = days ? "?days=" + encodeURIComponent(days) : "";
    var pNg = api("/client-netgrid" + win).catch(function () { return { data: {} }; });
    var pTr = api("/client-traffic" + win).catch(function () { return { data: {} }; });
    // Posts + SEO history don't depend on the range window - fetch once, reuse on toggle.
    var pPo = (_cPosts !== null)
      ? Promise.resolve(null)
      : api("/client-posts").then(function (pr) {
          var pd = pr.data || {};
          _cPosts = (pd.configured && pd.ok) ? (pd.posts || []) : [];
          return null;
        }).catch(function () { _cPosts = []; return null; });
    var pHi = (_cHist !== null)
      ? Promise.resolve(null)
      : api("/client-seo-history").then(function (hr) {
          var hd = hr.data || {};
          _cHist = (hd.configured && hd.ok) ? { sites: hd.sites || [] } : { sites: [] };
          return null;
        }).catch(function () { _cHist = { sites: [] }; return null; });
    pNg.then(function (nres) {
      pTr.then(function (tres) {
        pPo.then(function () {
        pHi.then(function () {
        var d = nres.data || {};
        var ng = (d.configured && d.ok && d.client) ? d.client : null;
        var ngSites = ng ? (d.sites || []) : [];
        var td = tres.data || {};
        var traffic = (td.configured && td.ok) ? (td.series || []) : [];
        host.innerHTML = clientHTML(user, m, ng, ngSites, traffic, days, _cPosts || [], _cHist || { sites: [] });
        wireCommon();
        wireCharts(host);
        wireAuthority(host, ngSites, _cHist || { sites: [] });
        host.querySelectorAll(".dash-stat-click").forEach(function (tl) {
          tl.onclick = function () { openSiteModal(tl.getAttribute("data-modal"), ngSites); };
        });
        host.querySelectorAll(".rng-btn").forEach(function (bn) {
          bn.onclick = function () { if (bn.getAttribute("data-days") !== _cDays) renderClientBody(bn.getAttribute("data-days"), true); };
        });
        if (!isToggle) {
          try { if (window.__chatIdentify) window.__chatIdentify(user.name, user.email); } catch (e) {}
          // Auto-load this client's past chat messages into the floating chat.
          api("/client-chat").then(function (cr) {
            var cd = cr.data || {};
            if (window.__chatBind && cd.cid) window.__chatBind({ cid: cd.cid, messages: cd.messages || [], name: user.name, email: user.email });
          }).catch(function () {});
          maybeShowExpiry(user, _cPlanLink);
        }
        });
        });
      });
    });
  }

  // Individual dashboard cards the admin can show/hide per client.
  // key -> i18n label key. Order here is the display order on the dashboard.
  var NG_REAL_CARDS = [
    ["seo", "ngAvgSeo"], ["sites", "ngSitesN"], ["active", "ngActiveN"],
    ["posts", "cdTotalPosts"], ["rviews", "cdViews"], ["rclicks", "cdClicks"],
    ["sitelist", "ngSiteList"], ["traffic", "trTitle"],
    ["seohist", "seoHistTitle"], ["recentposts", "recentTitle"],
    ["cadence", "cadenceTitle"], ["authority", "authTitle"],
  ];
  var NG_MANUAL_CARDS = [
    ["mviews", "views"], ["mclicks", "clicks"], ["mai", "ai"],
    ["mpublished", "published"], ["trend", "trend"], ["sources", "sources"],
  ];
  // Expand legacy group keys ("real"/"manual") into their card keys.
  function normVisible(vis) {
    if (!Array.isArray(vis)) return null; // null = show everything (default)
    var out = [];
    vis.forEach(function (k) {
      if (k === "real") NG_REAL_CARDS.forEach(function (c) { out.push(c[0]); });
      else if (k === "manual") NG_MANUAL_CARDS.forEach(function (c) { out.push(c[0]); });
      else out.push(k);
    });
    return out;
  }
  function showCard(key, vis) { var n = normVisible(vis); return n === null ? true : n.indexOf(key) >= 0; }

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


  function seoClass(n) { n = num(n); return n >= 80 ? "ok" : n >= 50 ? "pend" : "exp"; }
  // Big colored SEO number for stat tiles (inherits the big tile size).
  function seoBig(score) {
    return score == null ? "-" : '<span class="ng-score-big ' + seoClass(score) + '">' + Math.round(num(score)) + "</span>";
  }
  function ngDate(iso) {
    if (!iso) return "";
    try { return new Date(iso).toLocaleDateString(FR() ? "fr-CA" : "en-CA", { year: "numeric", month: "short", day: "numeric" }); }
    catch (e) { return ""; }
  }
  function siteUrl(domain) {
    var d = String(domain || "").trim();
    if (!d) return "";
    return /^https?:\/\//i.test(d) ? d : "https://" + d;
  }
  // Short axis date, e.g. "Jun 4".
  function chartDate(iso) {
    if (!iso) return "";
    try { return new Date(iso).toLocaleDateString(FR() ? "fr-CA" : "en-CA", { month: "short", day: "numeric" }); }
    catch (e) { return ""; }
  }
  // Tiny inline sparkline for a stat tile. Single series, no axes. "" if < 2 points.
  function sparkline(vals, color) {
    vals = (vals || []).map(num);
    var n = vals.length;
    if (n < 2) return "";
    var W = 100, H = 26, m = 2;
    var max = 0, min = Infinity;
    for (var k = 0; k < n; k++) { if (vals[k] > max) max = vals[k]; if (vals[k] < min) min = vals[k]; }
    var range = (max - min) || 1;
    var pts = [];
    for (var i = 0; i < n; i++) {
      var x = m + (i / (n - 1)) * (W - 2 * m);
      var y = m + (1 - (vals[i] - min) / range) * (H - 2 * m);
      pts.push(x.toFixed(1) + "," + y.toFixed(1));
    }
    return '<span class="vp-spark"><svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" aria-hidden="true">' +
      '<polyline points="' + pts.join(" ") + '" fill="none" stroke="' + color +
      '" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/></svg></span>';
  }
  // Single-series area+line chart (never dual-axis). Title names the series (no legend).
  // Points are embedded as data-pts for the hover crosshair wired by wireCharts().
  function lineChart(series, key, color, title, emptyMsg) {
    series = series || [];
    var n = series.length, vals = [];
    for (var j = 0; j < n; j++) vals.push(num(series[j][key]));
    var head = '<div class="tchart-head"><span class="tchart-title">' + esc(title) + "</span>" +
      (n ? '<span class="tchart-last">' + fmt(vals[n - 1]) + "</span>" : "") + "</div>";
    // No buckets at all -> genuine empty state.
    if (n < 1) return '<div class="tchart">' + head + '<div class="dash-empty">' + esc(emptyMsg || t("trNoData")) + "</div></div>";
    var W = 320, H = 90, mx = 6, my = 8, base = H - my;
    var max = 0; for (var a = 0; a < n; a++) max = Math.max(max, vals[a]); max = max || 1;
    var line = [], pdata = [], x0 = 0, xn = 0;
    for (var i = 0; i < n; i++) {
      // A single bucket is drawn as one centered marker (can't make a line from one point).
      var x = n === 1 ? W / 2 : mx + (i / (n - 1)) * (W - 2 * mx);
      var y = my + (1 - vals[i] / max) * (H - 2 * my);
      if (i === 0) x0 = x; if (i === n - 1) xn = x;
      line.push(x.toFixed(1) + "," + y.toFixed(1));
      pdata.push({ fx: +(x / W).toFixed(4), fy: +(y / H).toFixed(4), v: vals[i], d: series[i].date });
    }
    var gid = "tgrad-" + key;
    // Body is empty for a single bucket - it's shown as the round HTML end-dot below
    // (an SVG circle would be squashed into an ellipse by preserveAspectRatio="none").
    var body = "";
    if (n > 1) {
      var area = "M" + x0.toFixed(1) + "," + base + " L" + line.join(" L") + " L" + xn.toFixed(1) + "," + base + " Z";
      body = '<defs><linearGradient id="' + gid + '" x1="0" y1="0" x2="0" y2="1">' +
          '<stop offset="0" stop-color="' + color + '" stop-opacity="0.28"/>' +
          '<stop offset="1" stop-color="' + color + '" stop-opacity="0"/></linearGradient></defs>' +
        '<path d="' + area + '" fill="url(#' + gid + ')"/>' +
        '<polyline points="' + line.join(" ") + '" fill="none" stroke="' + color +
        '" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/>';
    }
    var svg = '<svg viewBox="0 0 ' + W + " " + H + '" preserveAspectRatio="none" class="tchart-svg" aria-hidden="true">' +
      body + "</svg>";
    // Persistent round end-cap dot anchoring the latest value (undistorted HTML).
    var last = pdata[n - 1];
    var endDot = '<span class="tchart-end" style="left:' + (last.fx * 100).toFixed(2) + "%;top:" +
      (last.fy * 100).toFixed(2) + '%;background:' + color + '"></span>';
    var overlay = '<span class="tchart-cross"></span>' + endDot + '<span class="tchart-dot" style="background:' + color +
      '"></span><span class="tchart-tip"></span>';
    var axis = n === 1
      ? '<div class="tchart-axis tchart-axis-1"><span>' + esc(chartDate(series[0].date)) + "</span></div>"
      : '<div class="tchart-axis"><span>' + esc(chartDate(series[0].date)) + "</span><span>" +
        esc(chartDate(series[n - 1].date)) + "</span></div>";
    return '<div class="tchart">' + head +
      '<div class="tchart-plot" data-pts="' + esc(JSON.stringify(pdata)) + '" data-label="' + esc(title) + '">' +
      svg + overlay + "</div>" + axis + "</div>";
  }
  // Traffic card: two small single-series charts (views + clicks), never dual-axis.
  function trafficCardHTML(series) {
    return '<div class="dash-card ng-card"><h3>' + esc(t("trTitle")) + "</h3>" +
      '<div class="tchart-grid">' +
        lineChart(series, "views", "#7c3aed", t("cdViews")) +
        lineChart(series, "clicks", "#e8409b", t("cdClicks")) +
      "</div></div>";
  }
  // Range toggle (all-time vs 30 days). data-days: ""=all, "30".
  function rangeToggleHTML(days) {
    days = String(days == null ? "" : days);
    function b(val, lbl) {
      return '<button type="button" class="rng-btn' + (days === val ? " is-on" : "") +
        '" data-days="' + val + '">' + esc(lbl) + "</button>";
    }
    return '<div class="rng-toggle">' + b("", t("rngAll")) + b("30", t("rng30")) + "</div>";
  }
  // Attach hover crosshair + tooltip to every .tchart-plot within root.
  function wireCharts(root) {
    (root || document).querySelectorAll(".tchart-plot").forEach(function (plot) {
      var pts; try { pts = JSON.parse(plot.getAttribute("data-pts") || "[]"); } catch (e) { pts = []; }
      if (!pts.length) return;
      var cross = plot.querySelector(".tchart-cross");
      var dot = plot.querySelector(".tchart-dot");
      var tip = plot.querySelector(".tchart-tip");
      var label = plot.getAttribute("data-label") || "";
      function move(e) {
        var r = plot.getBoundingClientRect();
        if (!r.width) return;
        var cx = ((e.touches && e.touches[0]) ? e.touches[0].clientX : e.clientX) - r.left;
        var frac = cx / r.width;
        var best = 0, bd = 2;
        for (var i = 0; i < pts.length; i++) { var dd = Math.abs(pts[i].fx - frac); if (dd < bd) { bd = dd; best = i; } }
        var p = pts[best], px = p.fx * r.width, py = p.fy * r.height;
        if (cross) { cross.style.left = px + "px"; cross.style.display = "block"; }
        if (dot) { dot.style.left = px + "px"; dot.style.top = py + "px"; dot.style.display = "block"; }
        if (tip) {
          tip.innerHTML = "<b>" + fmt(p.v) + "</b> " + esc(label) + "<span>" + esc(chartDate(p.d)) + "</span>";
          tip.style.display = "block";
          var lx = Math.max(0, Math.min(r.width - tip.offsetWidth, px - tip.offsetWidth / 2));
          tip.style.left = lx + "px";
        }
      }
      function leave() {
        if (cross) cross.style.display = "none";
        if (dot) dot.style.display = "none";
        if (tip) tip.style.display = "none";
      }
      plot.addEventListener("mousemove", move);
      plot.addEventListener("mouseleave", leave);
      plot.addEventListener("touchstart", move);
      plot.addEventListener("touchmove", move);
      plot.addEventListener("touchend", leave);
    });
  }
  // Recent posts: a clickable list of the latest articles (title links out).
  function postsListHTML(posts) {
    posts = (posts || []).slice(0, 8);
    if (!posts.length) return '<div class="dash-empty">' + esc(t("noPostsYet")) + "</div>";
    var rows = posts.map(function (p) {
      var url = p.url ? siteUrl(p.url) : "";
      var title = url
        ? '<a href="' + esc(url) + '" target="_blank" rel="noopener" class="post-link">' + esc(p.title || "-") + " ↗</a>"
        : '<b class="post-title">' + esc(p.title || "-") + "</b>";
      var meta = [];
      if (p.publishedAt) meta.push(esc(ngDate(p.publishedAt)));
      if (p.seoScore != null) meta.push('<span class="ng-score ' + seoClass(p.seoScore) + ' post-seo">' + Math.round(num(p.seoScore)) + "</span>");
      if (p.views != null) meta.push(fmt(p.views) + " " + esc(t("postViews")));
      return '<li class="post-item">' + title +
        '<div class="post-meta">' + meta.join('<span class="post-dot">·</span>') + "</div></li>";
    }).join("");
    return '<ul class="post-list">' + rows + "</ul>";
  }
  function postsCardHTML(posts) {
    return '<div class="dash-card ng-card"><h3>' + esc(t("recentTitle")) + "</h3>" + postsListHTML(posts) + "</div>";
  }
  // Publishing cadence: posts published per week over the last 8 weeks.
  // Bars carry a hover tooltip with the count; x-labels are month over day.
  function cadenceBars(posts) {
    posts = posts || [];
    var WEEKS = 8;
    function weekStart(d) {
      var x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
      var back = (x.getDay() + 6) % 7; // days since Monday
      x.setDate(x.getDate() - back);
      x.setHours(0, 0, 0, 0);
      return x;
    }
    var cur = weekStart(new Date());
    var buckets = [];
    for (var i = WEEKS - 1; i >= 0; i--) {
      var s = new Date(cur); s.setDate(s.getDate() - i * 7);
      buckets.push({ start: s, count: 0 });
    }
    posts.forEach(function (p) {
      if (!p.publishedAt) return;
      var pd = new Date(p.publishedAt); if (isNaN(pd.getTime())) return;
      var ws = weekStart(pd).getTime();
      for (var b = 0; b < buckets.length; b++) { if (buckets[b].start.getTime() === ws) { buckets[b].count++; break; } }
    });
    var max = 0; buckets.forEach(function (b) { if (b.count > max) max = b.count; }); max = max || 1;
    var loc = FR() ? "fr-CA" : "en-CA";
    var cols = buckets.map(function (b) {
      var h = Math.round((b.count / max) * 100);
      var mon = b.start.toLocaleDateString(loc, { month: "short" });
      var day = b.start.getDate();
      return '<div class="bchart-col">' +
        '<div class="bchart-barwrap"><div class="bchart-bar" style="height:' + h + '%">' +
          '<span class="bchart-tip"><b>' + b.count + "</b> " + esc(t("postsUnit")) +
            "<span>" + esc(t("weekOf")) + " " + esc(chartDate(b.start.toISOString())) + "</span></span>" +
        "</div></div>" +
        '<div class="bchart-xl"><b>' + esc(mon) + "</b><span>" + day + "</span></div>" +
      "</div>";
    }).join("");
    return '<p class="dash-muted" style="margin:-6px 0 12px">' + esc(t("cadenceSub")) + "</p>" +
      '<div class="bchart">' + cols + "</div>";
  }
  function cadenceCardHTML(posts) {
    return '<div class="dash-card ng-card"><h3>' + esc(t("cadenceTitle")) + "</h3>" + cadenceBars(posts) + "</div>";
  }
  // Posts list + cadence, laid out side-by-side when both are shown.
  function postsBlockHTML(posts, showPosts, showCadence) {
    var cards = [];
    if (showPosts) cards.push(postsCardHTML(posts));
    if (showCadence) cards.push(cadenceCardHTML(posts));
    if (cards.length === 2) return '<div class="dash-grid2">' + cards.join("") + "</div>";
    if (cards.length === 1) return cards[0];
    return "";
  }
  // Average overall SEO score across all sites, bucketed by month -> one series.
  function avgSeoSeries(hist) {
    var sites = (hist && hist.sites) || [];
    var byMonth = {};
    sites.forEach(function (s) {
      (s.points || []).forEach(function (p) {
        var dt = new Date(p.date); if (isNaN(dt.getTime())) return;
        var mk = dt.getUTCFullYear() + "-" + (dt.getUTCMonth() + 1);
        if (!byMonth[mk]) byMonth[mk] = { sum: 0, n: 0, t: Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth(), 1) };
        byMonth[mk].sum += num(p.score); byMonth[mk].n++;
      });
    });
    return Object.keys(byMonth)
      .sort(function (a, b) { return byMonth[a].t - byMonth[b].t; })
      .map(function (k) { return { date: new Date(byMonth[k].t).toISOString(), score: Math.round(byMonth[k].sum / byMonth[k].n) }; });
  }
  // SEO score over time - averaged across the client's sites (single series).
  function seoHistCardHTML(hist) {
    var series = avgSeoSeries(hist);
    return '<div class="dash-card ng-card"><h3>' + esc(t("seoHistTitle")) + "</h3>" +
      lineChart(series, "score", "#7c3aed", t("cdOverallSeo"), t("seoHistEmpty")) + "</div>";
  }
  function kwText(k) {
    if (k == null) return "";
    if (typeof k === "string") return k;
    return String(k.keyword || k.kw || k.term || k.query || "").trim();
  }
  // Per-site third-party SEO authority table (DA / backlinks / keywords / traffic).
  // Rows are clickable to open the per-site authority drill-down.
  function authorityCardHTML(sites, hist) {
    sites = sites || [];
    if (!sites.length) return "";
    var anyM = sites.some(function (s) { return s.metrics; });
    var body;
    if (!anyM) {
      body = '<div class="dash-empty">' + esc(t("authNoData")) + "</div>";
    } else {
      var rows = sites.map(function (s) {
        var m = s.metrics || {};
        var da = m.domainAuthority != null ? num(m.domainAuthority) : "-";
        var bl = m.backlinks != null ? fmt(m.backlinks) : "-";
        var kw = m.organicKeywords != null ? fmt(m.organicKeywords) : "-";
        var tr = m.organicTrafficEst != null ? fmt(m.organicTrafficEst) : "-";
        return '<tr class="auth-row" data-bid="' + esc(s.id) + '" tabindex="0">' +
          "<td>" + esc(s.domain || "-") + (s.platform ? ' <span class="ng-plat">' + esc(s.platform) + "</span>" : "") +
            ' <span class="dash-stat-more auth-more">›</span></td>' +
          '<td class="auth-num">' + da + '</td><td class="auth-num">' + bl + '</td>' +
          '<td class="auth-num">' + kw + '</td><td class="auth-num">' + tr + "</td></tr>";
      }).join("");
      body = '<div style="overflow-x:auto"><table class="dash-table ng-table auth-table"><thead><tr><th>' +
        esc(t("ngSiteCol")) + '</th><th class="auth-num">' + esc(t("authColDA")) + '</th><th class="auth-num">' +
        esc(t("authColBl")) + '</th><th class="auth-num">' + esc(t("authColKw")) + '</th><th class="auth-num">' +
        esc(t("authColTr")) + "</th></tr></thead><tbody>" + rows + "</tbody></table></div>";
    }
    return '<div class="dash-card ng-card"><h3>' + esc(t("authTitle")) + "</h3>" + body + "</div>";
  }
  // Per-site authority drill-down: full metrics + top keywords + SEO score trend.
  function openSiteAuthority(site, hist) {
    site = site || {}; var m = site.metrics || {};
    var pts = [];
    ((hist && hist.sites) || []).forEach(function (h) { if (h.blogId === site.id) pts = h.points || []; });
    var url = siteUrl(site.domain);
    var head = url
      ? '<a href="' + esc(url) + '" target="_blank" rel="noopener" class="ng-site-link">' + esc(site.domain) + " ↗</a>"
      : esc(site.domain || "-");
    function st(label, val) {
      return '<div class="auth-stat"><div class="auth-stat-v">' + val + "</div>" +
        '<div class="auth-stat-l">' + esc(label) + "</div></div>";
    }
    var dv = function (v) { return v == null ? "-" : fmt(v); };
    var stats = st(t("cdOverallSeo"), site.seoScore == null ? "-" : seoBig(site.seoScore)) +
      st(t("authDA"), m.domainAuthority == null ? "-" : num(m.domainAuthority)) +
      st(t("authBacklinks"), dv(m.backlinks)) +
      st(t("authRefDomains"), dv(m.referringDomains)) +
      st(t("authKeywords"), dv(m.organicKeywords)) +
      st(t("authTraffic"), dv(m.organicTrafficEst));
    var kws = (m.topKeywords || []).map(kwText).filter(Boolean);
    var kwHTML = kws.length
      ? '<div class="auth-sec-h">' + esc(t("authTopKw")) + "</div><div class=\"kw-wrap\">" +
        kws.map(function (k) { return '<span class="kw-chip">' + esc(k) + "</span>"; }).join("") + "</div>"
      : "";
    var trendHTML = '<div class="auth-sec-h">' + esc(t("seoHistTitle")) + "</div>" +
      lineChart(pts, "score", "#7c3aed", t("cdOverallSeo"), t("seoHistEmpty"));
    var src = m.source ? '<span class="auth-src">' + esc(m.source) +
      (m.fetchedAt ? " · " + esc(t("authFetched")) + " " + esc(ngDate(m.fetchedAt)) : "") + "</span>" : "";
    var host = document.createElement("div");
    host.innerHTML =
      '<div class="dash-modal-bg" id="vpAuthBg"><div class="dash-modal" style="max-width:560px">' +
        '<div class="dash-modal-head"><h3>' + head + "</h3>" +
          '<button type="button" class="dash-modal-x" id="vpAuthX" aria-label="' + esc(t("close")) + '">&#10005;</button></div>' +
        '<div class="dash-modal-body">' + src +
          '<div class="auth-grid">' + stats + "</div>" + kwHTML + trendHTML + "</div>" +
      "</div></div>";
    document.body.appendChild(host);
    try { document.body.style.overflow = "hidden"; } catch (e) {}
    function close() { try { document.body.removeChild(host); } catch (e) {} try { document.body.style.overflow = ""; } catch (e) {} document.removeEventListener("keydown", onKey); }
    function onKey(e) { if (e.key === "Escape") close(); }
    document.addEventListener("keydown", onKey);
    host.querySelector("#vpAuthX").onclick = close;
    host.querySelector("#vpAuthBg").onclick = function (e) { if (e.target === host.querySelector("#vpAuthBg")) close(); };
    wireCharts(host);
  }
  // Wire authority-table rows (within root) to open the per-site drill-down.
  function wireAuthority(root, sites, hist) {
    var byId = {};
    (sites || []).forEach(function (s) { byId[s.id] = s; });
    (root || document).querySelectorAll(".auth-row").forEach(function (row) {
      var open = function () { var s = byId[row.getAttribute("data-bid")]; if (s) openSiteAuthority(s, hist); };
      row.onclick = open;
      row.onkeydown = function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); } };
    });
  }
  // Clickable list of the client's blog sites (domain links out to the site).
  function clientSitesHTML(sites) {
    sites = sites || [];
    if (!sites.length) return "";
    var rows = sites.map(function (s) {
      var url = siteUrl(s.domain);
      var name = url
        ? '<a href="' + esc(url) + '" target="_blank" rel="noopener" class="ng-site-link">' + esc(s.domain) + " ↗</a>"
        : "<b>" + esc(s.domain || "-") + "</b>";
      var score = s.seoScore == null ? '<span class="dash-muted">' + esc(t("ngNoScan")) + "</span>"
        : '<span class="ng-score ' + seoClass(s.seoScore) + '">' + Math.round(num(s.seoScore)) + "</span>";
      var post = s.lastPostTitle
        ? esc(s.lastPostTitle) + (s.lastPostAt ? ' <span class="dash-muted">· ' + esc(ngDate(s.lastPostAt)) + "</span>" : "")
        : '<span class="dash-muted">' + esc(t("ngNoPost")) + "</span>";
      return "<tr><td>" + name + (s.platform ? ' <span class="ng-plat">' + esc(s.platform) + "</span>" : "") + "</td>" +
        "<td>" + score + "</td><td>" + post + "</td></tr>";
    }).join("");
    return '<div class="dash-card"><h3>' + esc(t("ngSiteList")) + "</h3>" +
      '<div style="overflow-x:auto"><table class="dash-table ng-table"><thead><tr><th>' + esc(t("ngSiteCol")) +
      "</th><th>" + esc(t("ngSeoCol")) + "</th><th>" + esc(t("ngLatestCol")) +
      "</th></tr></thead><tbody>" + rows + "</tbody></table></div></div>";
  }
  function statusPill(st) {
    st = String(st || "").toLowerCase();
    var cls = st === "active" ? "ok" : (st === "decommissioned" ? "exp" : "pend");
    return '<span class="sub-pill ' + cls + '">' + esc(st || "-") + "</span>";
  }
  // Drill-down modal for the SEO / Sites / Active tiles: a per-site table.
  function openSiteModal(mode, sites) {
    sites = sites || [];
    var title = mode === "seo" ? t("ngAvgSeo") : mode === "active" ? t("ngActiveN") : t("ngSitesN");
    var col2 = mode === "seo" ? t("ngSeoCol") : mode === "active" ? t("statusCol") : t("ngLatestCol");
    var rows = sites.map(function (s) {
      var url = siteUrl(s.domain);
      var name = url
        ? '<a href="' + esc(url) + '" target="_blank" rel="noopener" class="ng-site-link">' + esc(s.domain) + " ↗</a>"
        : "<b>" + esc(s.domain || "-") + "</b>";
      name += (s.platform ? ' <span class="ng-plat">' + esc(s.platform) + "</span>" : "");
      var second;
      if (mode === "seo") second = s.seoScore == null ? '<span class="dash-muted">' + esc(t("ngNoScan")) + "</span>" : '<span class="ng-score ' + seoClass(s.seoScore) + '">' + Math.round(num(s.seoScore)) + "</span>";
      else if (mode === "active") second = statusPill(s.status);
      else second = s.lastPostTitle ? esc(s.lastPostTitle) + (s.lastPostAt ? ' <span class="dash-muted">· ' + esc(ngDate(s.lastPostAt)) + "</span>" : "") : '<span class="dash-muted">' + esc(t("ngNoPost")) + "</span>";
      return "<tr><td>" + name + "</td><td>" + second + "</td></tr>";
    }).join("");
    var host = document.createElement("div");
    host.innerHTML =
      '<div class="dash-modal-bg" id="vpSiteBg"><div class="dash-modal" style="max-width:560px">' +
        '<div class="dash-modal-head"><h3>' + esc(title) + "</h3>" +
          '<button type="button" class="dash-modal-x" id="vpSiteX" aria-label="' + esc(t("close")) + '">&#10005;</button></div>' +
        '<div class="dash-modal-body"><div style="overflow-x:auto"><table class="dash-table ng-table"><thead><tr><th>' +
          esc(t("ngSiteCol")) + "</th><th>" + esc(col2) + "</th></tr></thead><tbody>" +
          (rows || '<tr><td colspan="2" class="dash-empty">-</td></tr>') + "</tbody></table></div></div>" +
      "</div></div>";
    document.body.appendChild(host);
    try { document.body.style.overflow = "hidden"; } catch (e) {}
    function close() { try { document.body.removeChild(host); } catch (e) {} try { document.body.style.overflow = ""; } catch (e) {} document.removeEventListener("keydown", onKey); }
    function onKey(e) { if (e.key === "Escape") close(); }
    document.addEventListener("keydown", onKey);
    host.querySelector("#vpSiteX").onclick = close;
    host.querySelector("#vpSiteBg").onclick = function (e) { if (e.target === host.querySelector("#vpSiteBg")) close(); };
  }
  function clientHTML(user, m, ng, ngSites, traffic, days, posts, hist) {
    var name = user.name || getName() || "";
    traffic = traffic || [];
    posts = posts || [];
    hist = hist || { sites: [] };
    var vis = user.visible;
    function show(k) { return showCard(k, vis); }
    var change = num(m.viewsChangePct);
    var changeTxt = (change > 0 ? "▲ " : change < 0 ? "▼ " : "") + Math.abs(change) + "% " + t("vsPrev");
    var changeCls = change > 0 ? "up" : change < 0 ? "down" : "";
    var out = '<div class="sec"><div class="wrap">' +
      topbar(name || "") +
      (user.plan ? '<div class="dash-plan">' + esc(t("yourPlan")) + ': <b>' + esc(user.plan) + "</b></div>" : "") +
      subBanner(user) +
      '<div class="dash-refresh">' + esc(t("refreshNote")) + "</div>";

    // Stat tiles - real (netgrid) + manual, in one grid, each card toggleable.
    // SEO / Sites / Active open a detail modal when there are sites to show.
    var canDrill = ngSites && ngSites.length;
    var tiles = "";
    if (ng) {
      if (show("seo")) tiles += stat(seoBig(ng.avgSeoScore), t("ngAvgSeo"), "", canDrill ? "seo" : "");
      if (show("sites")) tiles += stat(num(ng.blogCount), t("ngSitesN"), "", canDrill ? "sites" : "");
      if (show("active")) tiles += stat(ng.activeBlogCount == null ? "-" : num(ng.activeBlogCount), t("ngActiveN"), "", canDrill ? "active" : "");
      if (show("posts") && ng.postCount != null) tiles += stat(fmt(ng.postCount), t("cdTotalPosts"), "");
      if (show("rviews") && ng.views != null) tiles += stat(fmt(ng.views), t("cdViews"), sparkline(traffic.map(function (p) { return p.views; }), "#7c3aed"));
      if (show("rclicks") && ng.clicks != null) tiles += stat(fmt(ng.clicks), t("cdClicks"), sparkline(traffic.map(function (p) { return p.clicks; }), "#e8409b"));
    }
    if (show("mviews")) tiles += stat(fmt(m.views), t("views"), '<span class="dash-delta ' + changeCls + '">' + changeTxt + "</span>");
    if (show("mclicks")) tiles += stat(fmt(m.profileClicks), t("clicks"), "");
    if (show("mai")) tiles += stat(fmt(m.aiCitations), t("ai"), "");
    if (show("mpublished")) tiles += stat(fmt(m.articlesPublished), t("published"), '<span class="dash-sub">' + fmt(m.articlesUpcoming) + " " + t("upcoming") + "</span>");
    // Range toggle (all-time vs 30 days) - governs the real traffic-based cards/charts.
    if (ng && (show("rviews") || show("rclicks") || show("traffic"))) out += '<div class="rng-bar">' + rangeToggleHTML(days) + "</div>";
    if (tiles) out += '<div class="dash-stats">' + tiles + "</div>";

    // Views/clicks over time - two small single-series charts.
    if (show("traffic") && ng) out += trafficCardHTML(traffic);

    // SEO score over time (averaged across sites).
    if (show("seohist") && ng) out += seoHistCardHTML(hist);

    // Recent posts list + publishing cadence.
    if (ng) out += postsBlockHTML(posts, show("recentposts"), show("cadence"));

    // Clickable list of blog sites.
    if (show("sitelist") && ngSites && ngSites.length) out += clientSitesHTML(ngSites);

    // Per-site SEO authority table (click a row for the drill-down).
    if (show("authority") && ng && ngSites && ngSites.length) out += authorityCardHTML(ngSites, hist);

    // Charts - trend and/or sources.
    var charts = [];
    if (show("trend")) charts.push('<div class="dash-card"><h3>' + esc(t("trend")) + "</h3>" + bars(m.series) + "</div>");
    if (show("sources")) charts.push('<div class="dash-card"><h3>' + esc(t("sources")) + "</h3>" + sourceList(m.sources) + "</div>");
    if (charts.length === 2) out += '<div class="dash-grid2">' + charts.join("") + "</div>";
    else if (charts.length === 1) out += charts[0];

    out += (m.note ? '<p class="dash-note">' + esc(m.note) + "</p>" : "");
    return out + '</div></div><div id="vpExpiry"></div>';
  }

  // ---- admin client-detail view: Real data (netgrid) + Manual tabs ----
  function cdStat(value, label, sub) {
    return '<div class="dash-stat"><div class="dash-stat-v">' + value + "</div>" +
      '<div class="dash-stat-l">' + esc(label) + "</div>" +
      (sub ? '<div class="dash-sub">' + sub + "</div>" : "") + "</div>";
  }
  function cdManualHTML(m) {
    m = m || {};
    return '<div class="dash-stats">' +
      cdStat(fmt(m.views), t("views")) +
      cdStat(fmt(m.profileClicks), t("clicks")) +
      cdStat(fmt(m.aiCitations), t("ai")) +
      cdStat(fmt(m.articlesPublished), t("published")) +
      "</div>" +
      '<div class="dash-grid2">' +
        '<div class="dash-card"><h3>' + esc(t("trend")) + "</h3>" + bars(m.series) + "</div>" +
        '<div class="dash-card"><h3>' + esc(t("sources")) + "</h3>" + sourceList(m.sources) + "</div>" +
      "</div>";
  }
  function cdRealHTML(d, traffic, days, posts, hist) {
    d = d || {};
    if (!d.configured) return '<div class="dash-card"><div class="dash-empty">' + esc(t("cdNoNetgrid")) + "</div></div>";
    if (!d.ok || !d.client) return '<div class="dash-card"><div class="dash-empty">' + esc(t("cdNoMatch")) + "</div></div>";
    traffic = traffic || [];
    posts = posts || [];
    hist = hist || { sites: [] };
    var sites = d.sites || [];
    var c = d.client;
    var seoVal = seoBig(c.avgSeoScore);
    var ctr = (c.views != null && num(c.views) > 0) ? (num(c.clicks) / num(c.views) * 100).toFixed(1) + "%" : "-";
    var activeSub = c.activeBlogCount == null ? "" : num(c.activeBlogCount) + " " + esc(t("cdActiveLc"));
    var dash = function (v) { return v == null ? "-" : fmt(v); };
    return '<div class="rng-bar">' + rangeToggleHTML(days) + "</div>" +
      '<div class="dash-stats">' +
      cdStat(seoVal, t("cdOverallSeo")) +
      cdStat(dash(c.postCount), t("cdTotalPosts")) +
      cdStat(dash(c.postsLast30Days), t("cdPosts30")) +
      cdStat(num(c.blogCount), t("cdBlogSites"), activeSub) +
      cdStat(dash(c.views), t("cdViews"), sparkline(traffic.map(function (p) { return p.views; }), "#7c3aed")) +
      cdStat(dash(c.clicks), t("cdClicks"), sparkline(traffic.map(function (p) { return p.clicks; }), "#e8409b")) +
      cdStat(ctr, t("cdCtr")) +
      cdStat(c.lastPostAt ? esc(ngDate(c.lastPostAt)) : "-", t("cdLastPost")) +
      "</div>" +
      trafficCardHTML(traffic) +
      seoHistCardHTML(hist) +
      '<div class="dash-grid2">' + postsCardHTML(posts) + cadenceCardHTML(posts) + "</div>" +
      (sites.length ? authorityCardHTML(sites, hist) : "");
  }
  // Loads (or reloads on range toggle) the admin Real-data tab for a client.
  function loadCdReal(email, days) {
    var host = el("cdReal");
    if (!host) return;
    days = String(days || "");
    var win = days ? "&days=" + encodeURIComponent(days) : "";
    var em = encodeURIComponent(email || "");
    var pNg = api("/admin-client-netgrid?email=" + em + win).catch(function () { return { data: {} }; });
    var pTr = api("/admin-client-traffic?email=" + em + win).catch(function () { return { data: {} }; });
    var pPo = api("/admin-client-posts?email=" + em).catch(function () { return { data: {} }; });
    var pHi = api("/admin-client-seo-history?email=" + em).catch(function () { return { data: {} }; });
    pNg.then(function (res) {
      pTr.then(function (tres) {
        pPo.then(function (pres) {
        pHi.then(function (hres) {
        var host2 = el("cdReal"); if (!host2) return;
        var td = tres.data || {};
        var traffic = (td.configured && td.ok) ? (td.series || []) : [];
        var pd = pres.data || {};
        var posts = (pd.configured && pd.ok) ? (pd.posts || []) : [];
        var hd = hres.data || {};
        var hist = (hd.configured && hd.ok) ? { sites: hd.sites || [] } : { sites: [] };
        var nd = res.data || {};
        host2.innerHTML = cdRealHTML(nd, traffic, days, posts, hist);
        wireCharts(host2);
        wireAuthority(host2, nd.sites || [], hist);
        host2.querySelectorAll(".rng-btn").forEach(function (bn) {
          bn.onclick = function () { if (bn.getAttribute("data-days") !== days) loadCdReal(email, bn.getAttribute("data-days")); };
        });
        });
        });
      });
    }).catch(function () {
      var host2 = el("cdReal"); if (host2) host2.innerHTML = '<div class="dash-card"><div class="dash-empty">' + esc(t("netErr")) + "</div></div>";
    });
  }
  function openClientDetail(c, onEdit) {
    var main = el("vpClientsMain"), det = el("vpClientDetail");
    if (!main || !det) return;
    c = c || {};
    main.style.display = "none";
    det.style.display = "";
    det.innerHTML =
      '<div class="cd-topbar">' +
        '<button class="btn ghost sm" id="cdBack">&#8592; ' + esc(t("cdBack")) + "</button>" +
        '<button class="btn ghost sm cd-gear" id="cdSettings" title="' + esc(t("visSection")) + '" aria-label="' + esc(t("visSection")) + '">' + GEAR_SVG + "</button>" +
      "</div>" +
      '<div class="cd-head"><h3>' + esc(c.name || c.email || "") + "</h3>" +
        '<div class="dash-muted">' + esc(c.email || "") + (c.plan ? " · " + esc(c.plan) : "") + "</div></div>" +
      '<div class="cd-tabs">' +
        '<button class="cd-tab is-on" data-cdtab="real"><b>' + esc(t("cdReal")) + '</b><span>' + esc(t("cdRealSub")) + "</span></button>" +
        '<button class="cd-tab" data-cdtab="manual"><b>' + esc(t("cdManual")) + '</b><span>' + esc(t("cdManualSub")) + "</span></button>" +
      "</div>" +
      '<div id="cdReal"><div class="dash-card"><p class="lead">…</p></div></div>' +
      '<div id="cdManual" style="display:none">' +
        '<div class="dash-toolbar"><button class="btn ghost" id="cdEdit">' + esc(t("edit")) + "</button></div>" +
        cdManualHTML(c.metrics || {}) + "</div>";
    el("cdBack").onclick = function () { det.style.display = "none"; det.innerHTML = ""; main.style.display = ""; };
    var gear = el("cdSettings");
    if (gear) gear.onclick = function () { openVisibilityModal(c); };
    var editBtn = el("cdEdit");
    if (editBtn) editBtn.onclick = function () { if (typeof onEdit === "function") onEdit(); };
    det.querySelectorAll(".cd-tab").forEach(function (b) {
      b.onclick = function () {
        det.querySelectorAll(".cd-tab").forEach(function (x) { x.classList.toggle("is-on", x === b); });
        var tab = b.getAttribute("data-cdtab");
        el("cdReal").style.display = tab === "real" ? "" : "none";
        el("cdManual").style.display = tab === "manual" ? "" : "none";
      };
    });
    loadCdReal(c.email || "", "");
  }
  // Eye-toggle modal: pick which individual cards the client sees.
  function openVisibilityModal(c) {
    var modal = el("vpModal"); if (!modal) return;
    var state = {};
    NG_REAL_CARDS.concat(NG_MANUAL_CARDS).forEach(function (card) { state[card[0]] = showCard(card[0], c.visible); });
    function eyeRow(key, label) {
      return '<div class="vis-row"><div class="vis-row-t"><b>' + esc(label) + "</b></div>" +
        '<button type="button" class="vis-eye' + (state[key] ? " is-on" : "") + '" data-vk="' + key +
        '" aria-pressed="' + (state[key] ? "true" : "false") + '">' +
        '<span class="vis-eye-on">' + EYE_SVG + "</span><span class=\"vis-eye-off\">" + EYE_OFF_SVG + "</span></button></div>";
    }
    function group(label, cards) {
      return '<div class="vpf-section">' + esc(label) + "</div>" +
        cards.map(function (card) { return eyeRow(card[0], t(card[1])); }).join("");
    }
    modal.innerHTML =
      '<div class="dash-modal-bg" id="vpVisBg"><div class="dash-modal" style="max-width:480px">' +
        '<div class="dash-modal-head"><h3>' + esc(t("visSection")) + "</h3>" +
          '<button type="button" class="dash-modal-x" id="vpVisX" aria-label="' + esc(t("close")) + '">&#10005;</button></div>' +
        '<div class="dash-modal-body">' +
          '<p class="dash-muted" style="margin:2px 0 6px">' + esc(t("visHint")) + "</p>" +
          group(t("visReal"), NG_REAL_CARDS) +
          group(t("visManual"), NG_MANUAL_CARDS) +
        "</div>" +
        '<div class="dash-modal-foot"><span class="hint" id="vpVisMsg"></span><div class="vpf-actions">' +
          '<button type="button" class="btn ghost" id="vpVisCancel">' + esc(t("cancel")) + "</button>" +
          '<button type="button" class="btn primary" id="vpVisSave">' + esc(t("save")) + "</button></div></div>" +
      "</div></div>";
    try { document.body.style.overflow = "hidden"; } catch (e) {}
    function close() { modal.innerHTML = ""; try { document.body.style.overflow = ""; } catch (e) {} document.removeEventListener("keydown", onKey); }
    function onKey(e) { if (e.key === "Escape") close(); }
    document.addEventListener("keydown", onKey);
    el("vpVisX").onclick = close;
    el("vpVisCancel").onclick = close;
    el("vpVisBg").onclick = function (e) { if (e.target === el("vpVisBg")) close(); };
    modal.querySelectorAll(".vis-eye").forEach(function (btn) {
      btn.onclick = function () {
        var k = btn.getAttribute("data-vk");
        state[k] = !state[k];
        btn.classList.toggle("is-on", state[k]);
        btn.setAttribute("aria-pressed", state[k] ? "true" : "false");
      };
    });
    el("vpVisSave").onclick = function () {
      var visible = NG_REAL_CARDS.concat(NG_MANUAL_CARDS)
        .filter(function (card) { return state[card[0]]; })
        .map(function (card) { return card[0]; });
      var msg = el("vpVisMsg"); if (msg) { msg.textContent = "…"; msg.style.color = ""; }
      api("/admin-clients", { method: "PUT", body: { email: c.email, visible: visible } }).then(function (res) {
        if (res.ok) { c.visible = visible; if (msg) { msg.textContent = t("setSaved"); msg.style.color = "#39d98a"; } setTimeout(close, 500); }
        else if (msg) { msg.textContent = (res.data && res.data.error) || "Error."; msg.style.color = "#ff8080"; }
      });
    };
  }
  function stat(value, label, sub, modal) {
    return '<div class="dash-stat' + (modal ? " dash-stat-click" : "") + '"' + (modal ? ' data-modal="' + modal + '"' : "") + ">" +
      '<div class="dash-stat-v">' + value + "</div>" +
      '<div class="dash-stat-l">' + esc(label) + "</div>" + (sub || "") +
      (modal ? '<span class="dash-stat-more">›</span>' : "") + "</div>";
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
      var pPlans = api("/admin-plans");
      var pNg = api("/admin-netgrid").catch(function () { return { data: {} }; });
      pPlans.then(function (pres) {
        pNg.then(function (ngres) {
          var plans = normPlans((pres.data && pres.data.plans) || []);
          var ng = ngres.data && ngres.data.configured ? (ngres.data.clients || {}) : null;
          host.innerHTML = adminHTML(clients, ng);
          wireCommon();
          wireAdmin(clients, plans);
          syncDashTop();
        });
      });
    }).catch(function () {
      host.innerHTML = '<div class="sec"><div class="wrap">' + topbar(t("adminTitle")) +
        '<p class="lead">' + esc(t("netErr")) + "</p></div></div>";
      wireCommon();
    });
  }

  function adminHTML(clients, ng) {
    function ngCell(email) {
      if (!ng) return "";
      var d = ng[email];
      if (!d) return '<td class="dash-muted">-</td>';
      var score = d.avgSeoScore == null ? '<span class="dash-muted">-</span>'
        : '<span class="ng-score ' + seoClass(d.avgSeoScore) + '">' + Math.round(num(d.avgSeoScore)) + "</span>";
      return "<td>" + score + (d.blogCount != null ? ' <span class="dash-muted">· ' + num(d.blogCount) + "</span>" : "") + "</td>";
    }
    var rows = clients.length ? clients.map(function (c) {
      var si = subInfo(c);
      var renewal = si
        ? '<span class="sub-pill ' + (si.expired ? "exp" : "ok") + '">' + (si.expired ? esc(t("expiredS")) : esc(t("active"))) +
          '</span> <span class="dash-muted">' + esc(fmtDate(si.expiry)) + "</span>"
        : '<span class="dash-muted">-</span>';
      return '<tr data-email="' + esc(c.email) + '">' +
        "<td><b>" + esc(c.name || "-") + "</b><div class='dash-muted'>" + esc(c.email) + "</div></td>" +
        "<td>" + esc(c.plan || "-") + "</td>" +
        "<td>" + renewal + "</td>" +
        "<td>" + fmt(c.metrics && c.metrics.views) + "</td>" +
        "<td>" + fmt(c.metrics && c.metrics.articlesPublished) + "</td>" +
        ngCell(c.email) +
        '<td class="dash-actions">' +
          '<button class="btn ghost sm vp-view">' + esc(t("cdView")) + "</button> " +
          '<button class="btn ghost sm vp-edit">' + esc(t("edit")) + "</button> " +
          '<button class="btn ghost sm vp-del">' + esc(t("del")) + "</button>" +
        "</td></tr>";
    }).join("") : '<tr><td colspan="' + (ng ? 7 : 6) + '" class="dash-empty">' + esc(t("noClients")) + "</td></tr>";

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
          '<div class="admin-nav-foot">' +
            navItem("settings", t("settingsTab"), false) +
            '<div class="admin-nav-sep"></div>' +
            '<button class="admin-nav-item admin-nav-logout" id="vpLogout">' + esc(t("logout")) + "</button>" +
          "</div>" +
        "</aside>" +
        '<div class="admin-main">' +
          '<div class="dash-panel" data-panel="clients">' +
            '<div id="vpClientsMain">' +
              '<div class="dash-toolbar"><button class="btn primary" id="vpAdd">+ ' + esc(t("addClient")) + "</button>" +
                ' <button class="btn ghost" id="vpRunRem">' + esc(t("runRem")) + "</button>" +
                ' <a class="btn ghost" href="' + esc(LEADS_SHEET_URL) + '" target="_blank" rel="noopener">' + esc(t("viewLeads")) + "</a></div>" +
              '<div class="dash-card" style="overflow-x:auto"><table class="dash-table"><thead><tr>' +
                "<th>" + esc(t("clients")) + "</th><th>" + esc(t("yourPlan")) + "</th><th>" + esc(t("renewalCol")) +
                "</th><th>" + esc(t("views")) + "</th><th>" + esc(t("published")) + "</th>" +
                (ng ? "<th>" + esc(t("ngSeoCol")) + "</th>" : "") + "<th></th></tr></thead><tbody>" + rows + "</tbody></table></div>" +
            "</div>" +
            '<div id="vpClientDetail" style="display:none"></div>' +
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
        var label = p.name + (p.price ? " - " + p.price : "");
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
                return '<tr data-email="' + esc(c.email) + '"><td><b>' + esc(c.name || "-") + '</b><div class="dash-muted">' +
                  esc(c.email) + "</div></td><td>" + esc(c.plan || "-") + '</td><td class="dash-muted">' +
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
    var emailTab = "all", emailsCache = [];
    function emailStatusPill(s) {
      if (s === "sent") return '<span class="sub-pill ok">' + esc(t("emSent")) + "</span>";
      if (s === "skipped") return '<span class="sub-pill pend">' + esc(t("emSkipped")) + "</span>";
      return '<span class="sub-pill exp">' + esc(t("emFailed")) + "</span>";
    }
    function fullWhen(ms) { try { return new Date(ms).toLocaleString(FR() ? "fr-CA" : "en-CA"); } catch (e) { return ""; } }
    function renderEmails() {
      var host = el("vpEmailPanel"); if (!host) return;
      host.innerHTML = '<div class="dash-card"><p class="lead">…</p></div>';
      api("/admin-emails").then(function (res) {
        emailsCache = (res.data && res.data.emails) || [];
        drawEmails();
      });
    }
    function emailsFor(tab) {
      return emailsCache.filter(function (e) {
        if (tab === "client") return e.audience === "client";
        if (tab === "admin") return e.audience === "admin";
        return true;
      });
    }
    function drawEmails() {
      var host = el("vpEmailPanel"); if (!host) return;
      var list = emailsFor(emailTab);
      function tab(id, label) {
        return '<button class="em-tab' + (emailTab === id ? " is-on" : "") + '" data-etab="' + id + '">' +
          esc(label) + ' <span class="em-tab-n">' + emailsFor(id).length + "</span></button>";
      }
      host.innerHTML =
        '<div class="dash-card">' +
          '<p class="dash-muted" style="margin:0 0 14px">' + esc(t("emailsHint")) + "</p>" +
          '<div class="em-tabs">' + tab("all", t("emAll")) + tab("client", t("emClientTab")) + tab("admin", t("emAdminTab")) +
            '<span class="em-tabs-sp"></span>' +
            (list.length ? '<button class="btn ghost sm" id="vpEmClear">' + esc(t("emClearAll")) + "</button>" : "") +
          "</div>" +
          '<div style="overflow-x:auto">' +
          (list.length
            ? '<table class="dash-table em-table"><thead><tr><th>' + esc(t("emTo")) + "</th><th>" + esc(t("emSubject")) +
              "</th><th>" + esc(t("statusCol")) + "</th><th>" + esc(t("emWhen")) + "</th><th></th></tr></thead><tbody>" +
              list.map(function (e) {
                return '<tr data-id="' + esc(e.id) + '"><td>' + esc(e.to || "-") + "</td>" +
                  '<td class="em-subcell"><b>' + esc(e.subject || "-") + "</b>" +
                  (e.body ? '<div class="dash-muted em-prev">' + esc(e.body) + "</div>" : "") +
                  "</td><td>" + emailStatusPill(e.status) + '</td><td class="dash-muted">' +
                  esc(relTime(e.created_at || Date.now())) + '</td>' +
                  '<td class="dash-actions"><button class="btn ghost sm em-view">' + esc(t("emView")) +
                    '</button> <button class="btn ghost sm em-del">' + esc(t("emDelete")) + "</button></td></tr>";
              }).join("") + "</tbody></table>"
            : '<div class="dash-empty">' + esc(t("noEmails")) + "</div>") +
          "</div></div>";

      host.querySelectorAll(".em-tab").forEach(function (b) {
        b.onclick = function () { emailTab = b.getAttribute("data-etab"); drawEmails(); };
      });
      var clear = el("vpEmClear");
      if (clear) clear.onclick = function () {
        if (!confirm(t("emConfirmClear"))) return;
        var aud = emailTab === "all" ? "" : emailTab;
        api("/admin-emails", { method: "DELETE", body: { all: true, audience: aud } }).then(function () {
          emailsCache = aud ? emailsCache.filter(function (e) { return e.audience !== aud; }) : [];
          drawEmails();
        });
      };
      host.querySelectorAll("tr[data-id]").forEach(function (tr) {
        var id = tr.getAttribute("data-id");
        var em = list.filter(function (e) { return String(e.id) === String(id); })[0];
        tr.querySelector(".em-view").onclick = function () { openEmailModal(em); };
        tr.querySelector(".em-subcell").onclick = function () { openEmailModal(em); };
        tr.querySelector(".em-del").onclick = function () { if (confirm(t("emConfirmDel"))) removeEmail(id); };
      });
    }
    function removeEmail(id) {
      api("/admin-emails", { method: "DELETE", body: { id: id } }).then(function () {
        emailsCache = emailsCache.filter(function (e) { return String(e.id) !== String(id); });
        drawEmails();
      });
    }
    function openEmailModal(e) {
      if (!e) return;
      var modal = el("vpModal"); if (!modal) return;
      modal.innerHTML =
        '<div class="dash-modal-bg" id="vpEmBg"><div class="dash-modal">' +
          '<div class="dash-modal-head"><h3>' + esc(e.subject || "-") + "</h3>" +
            '<button type="button" class="dash-modal-x" id="vpEmX" aria-label="' + esc(t("close")) + '">&#10005;</button></div>' +
          '<div class="dash-modal-body">' +
            '<div class="vpf-section">' + esc(t("emTo")) + "</div><div>" + esc(e.to || "-") + "</div>" +
            '<div style="margin-top:10px">' + emailStatusPill(e.status) +
              ' <span class="dash-muted">' + esc(fullWhen(e.created_at)) + "</span></div>" +
            (e.status !== "sent" && e.detail ? '<div class="vpf-section">' + esc(t("emReason")) +
              '</div><div class="dash-muted" style="white-space:pre-wrap">' + esc(e.detail) + "</div>" : "") +
            '<div class="vpf-section">' + esc(t("emBodyLabel")) + "</div>" +
            '<div class="em-modal-body">' + esc(e.body || "") + "</div>" +
          "</div>" +
          '<div class="dash-modal-foot"><span></span><div class="vpf-actions">' +
            '<button type="button" class="btn ghost" id="vpEmDelM">' + esc(t("emDelete")) + "</button>" +
            '<button type="button" class="btn primary" id="vpEmClose">' + esc(t("close")) + "</button></div></div>" +
        "</div></div>";
      try { document.body.style.overflow = "hidden"; } catch (er) {}
      function close() { modal.innerHTML = ""; try { document.body.style.overflow = ""; } catch (er) {} document.removeEventListener("keydown", onKey); }
      function onKey(ev) { if (ev.key === "Escape") close(); }
      document.addEventListener("keydown", onKey);
      el("vpEmX").onclick = close;
      el("vpEmClose").onclick = close;
      el("vpEmBg").onclick = function (ev) { if (ev.target === el("vpEmBg")) close(); };
      el("vpEmDelM").onclick = function () { if (!confirm(t("emConfirmDel"))) return; removeEmail(e.id); close(); };
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

    var viewBtns = document.querySelectorAll(".vp-view");
    for (var v = 0; v < viewBtns.length; v++) {
      viewBtns[v].onclick = function () {
        var email = this.closest("tr").getAttribute("data-email");
        var c = clients.filter(function (x) { return x.email === email; })[0];
        openClientDetail(c || { email: email }, function () { openForm(c || { email: email }, false); });
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
    // Which client messages the admin has already seen - kept per browser.
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
          // The admin is looking at this thread - keep it marked read.
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
    ".dash-top{display:flex;justify-content:space-between;align-items:flex-end;gap:16px;margin-bottom:16px;flex-wrap:wrap;position:sticky;top:0;z-index:30;padding:14px 0;background:rgba(10,8,23,.72);-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px);border-bottom:1px solid rgba(255,255,255,.06)}" +
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
    ".dash-sec-h{margin:4px 0 12px;font-size:15px;color:var(--white,#fff)}" +
    ".dash-refresh{color:var(--mut2,#77809a);font-size:12px;margin:-6px 0 16px}" +
    ".ng-card{margin-top:14px}" +
    ".ng-head{display:flex;justify-content:space-between;align-items:center;gap:16px;flex-wrap:wrap;margin-bottom:14px}" +
    ".ng-head h3{margin:0}" +
    ".ng-summary{display:flex;gap:20px;flex-wrap:wrap}" +
    ".ng-kpi{display:flex;flex-direction:column;align-items:flex-end;line-height:1.1}" +
    ".ng-kpi-v{font-size:22px;font-weight:800;color:var(--white,#fff)}" +
    ".ng-kpi-l{font-size:11px;color:var(--mut2,#77809a);margin-top:3px}" +
    ".ng-score{display:inline-flex;align-items:center;justify-content:center;min-width:34px;padding:2px 8px;border-radius:8px;font-weight:800;font-size:13px}" +
    ".ng-score.ok{background:rgba(57,217,138,.16);color:#39d98a}" +
    ".ng-score.pend{background:rgba(245,183,49,.16);color:#f5c451}" +
    ".ng-score.exp{background:rgba(255,122,122,.16);color:#ff8f8f}" +
    ".ng-score-big.ok{color:#39d98a}.ng-score-big.pend{color:#f5c451}.ng-score-big.exp{color:#ff8f8f}" +
    ".ng-kpi-v.ng-score{font-size:20px}" +
    ".ng-plat{font-size:10px;text-transform:uppercase;letter-spacing:.04em;color:var(--mut2,#77809a);border:1px solid var(--line2,#2a2145);border-radius:6px;padding:1px 6px;margin-left:6px;vertical-align:middle}" +
    ".ng-table{min-width:0}" +
    ".ng-table td{font-size:13px}" +
    ".ng-site-link{color:#c4b5fd;font-weight:700;text-decoration:none;white-space:nowrap}" +
    ".ng-site-link:hover{text-decoration:underline}" +
    ".vp-spark{display:block;margin-top:8px;height:26px}" +
    ".vp-spark svg{width:100%;height:26px;display:block}" +
    ".rng-bar{display:flex;justify-content:flex-end;margin:0 0 14px}" +
    ".rng-toggle{display:inline-flex;gap:2px;background:rgba(255,255,255,.05);border:1px solid var(--line2,#2a2145);border-radius:10px;padding:3px}" +
    ".rng-btn{font:inherit;font-size:12.5px;font-weight:600;color:var(--mut,#9aa);background:none;border:none;border-radius:8px;padding:6px 13px;cursor:pointer}" +
    ".rng-btn:hover{color:var(--white,#fff)}" +
    ".rng-btn.is-on{color:var(--white,#fff);background:rgba(124,58,237,.28)}" +
    ".tchart-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}" +
    ".tchart{min-width:0}" +
    ".tchart-head{display:flex;align-items:baseline;justify-content:space-between;gap:10px;margin-bottom:8px}" +
    ".tchart-title{font-size:13px;color:var(--mut,#9aa);font-weight:600}" +
    ".tchart-last{font-size:17px;font-weight:800;color:var(--white,#fff)}" +
    ".tchart-plot{position:relative;height:96px}" +
    ".tchart-svg{width:100%;height:96px;display:block;overflow:visible}" +
    ".tchart-cross{position:absolute;top:0;bottom:0;width:1px;background:rgba(196,181,253,.5);display:none;pointer-events:none;transform:translateX(-.5px)}" +
    ".tchart-dot{position:absolute;width:9px;height:9px;border-radius:50%;border:2px solid #100b24;display:none;pointer-events:none;transform:translate(-50%,-50%);box-shadow:0 0 0 1px rgba(255,255,255,.25)}" +
    ".tchart-end{position:absolute;width:9px;height:9px;border-radius:50%;border:2px solid #100b24;pointer-events:none;transform:translate(-50%,-50%);box-shadow:0 0 0 1px rgba(255,255,255,.22)}" +
    ".tchart-tip{position:absolute;top:-6px;transform:translateY(-100%);display:none;pointer-events:none;background:#0a0817;border:1px solid var(--line2,#2a2145);border-radius:8px;padding:5px 9px;font-size:12px;color:var(--white,#fff);white-space:nowrap;z-index:5;box-shadow:0 8px 24px -8px rgba(0,0,0,.7)}" +
    ".tchart-tip b{font-weight:800}" +
    ".tchart-tip span{display:block;color:var(--mut2,#77809a);font-size:11px;margin-top:1px}" +
    ".tchart-axis{display:flex;justify-content:space-between;margin-top:6px;font-size:11px;color:var(--mut2,#77809a)}" +
    ".tchart-axis-1{justify-content:center}" +
    ".bchart{display:flex;align-items:flex-end;gap:8px;height:186px;padding-top:26px}" +
    ".bchart-col{flex:1;display:flex;flex-direction:column;align-items:center;height:100%;min-width:0}" +
    ".bchart-barwrap{flex:1;width:100%;display:flex;align-items:flex-end;justify-content:center;position:relative}" +
    ".bchart-bar{position:relative;width:100%;max-width:34px;min-height:3px;border-radius:7px 7px 0 0;background:linear-gradient(180deg,#7c3aed,#4f46e5);transition:filter .12s}" +
    ".bchart-bar:hover{filter:brightness(1.15)}" +
    ".bchart-tip{display:none;position:absolute;bottom:100%;left:50%;transform:translateX(-50%);margin-bottom:8px;white-space:nowrap;background:#0a0817;border:1px solid var(--line2,#2a2145);border-radius:8px;padding:5px 9px;font-size:12px;color:var(--white,#fff);z-index:6;box-shadow:0 8px 24px -8px rgba(0,0,0,.7);pointer-events:none}" +
    ".bchart-bar:hover .bchart-tip{display:block}" +
    ".bchart-tip b{font-weight:800}" +
    ".bchart-tip span{display:block;color:var(--mut2,#77809a);font-size:11px;margin-top:1px}" +
    ".bchart-xl{margin-top:8px;text-align:center;line-height:1.15}" +
    ".bchart-xl b{display:block;font-size:11px;color:var(--mut,#9aa);font-weight:700}" +
    ".bchart-xl span{font-size:11px;color:var(--mut2,#77809a)}" +
    ".auth-table td,.auth-table th{white-space:nowrap}" +
    ".auth-num{text-align:right;font-variant-numeric:tabular-nums}" +
    ".auth-row{cursor:pointer}" +
    ".auth-row:hover td{background:rgba(124,58,237,.08)}" +
    ".auth-row:focus{outline:2px solid rgba(124,58,237,.5);outline-offset:-2px}" +
    ".auth-more{position:static;color:var(--mut2,#77809a);font-size:16px}" +
    ".auth-row:hover .auth-more{color:#c4b5fd}" +
    ".auth-src{display:inline-block;font-size:12px;color:var(--mut2,#77809a);text-transform:uppercase;letter-spacing:.04em;margin-bottom:12px}" +
    ".auth-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:6px}" +
    ".auth-stat{background:rgba(255,255,255,.04);border:1px solid var(--line2,#2a2145);border-radius:12px;padding:12px 14px}" +
    ".auth-stat-v{font-size:22px;font-weight:800;color:var(--white,#fff);line-height:1.1}" +
    ".auth-stat-l{font-size:11.5px;color:var(--mut2,#77809a);margin-top:4px}" +
    ".auth-sec-h{font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#c4b5fd;font-weight:700;margin:18px 0 10px}" +
    ".kw-wrap{display:flex;flex-wrap:wrap;gap:8px}" +
    ".kw-chip{font-size:12.5px;color:var(--white,#fff);background:rgba(124,58,237,.16);border:1px solid rgba(196,181,253,.18);border-radius:20px;padding:4px 11px}" +
    "@media(max-width:640px){.tchart-grid{grid-template-columns:1fr}.auth-grid{grid-template-columns:repeat(2,1fr)}}" +
    ".post-list{list-style:none;margin:0;padding:0;display:grid;gap:2px}" +
    ".post-item{padding:11px 0;border-top:1px solid var(--line2,#2a2145)}" +
    ".post-item:first-child{border-top:none;padding-top:2px}" +
    ".post-link,.post-title{display:inline-block;font-size:14px;font-weight:700;color:#c4b5fd;text-decoration:none}" +
    ".post-title{color:var(--white,#fff)}" +
    ".post-link:hover{text-decoration:underline}" +
    ".post-meta{display:flex;align-items:center;flex-wrap:wrap;gap:7px;margin-top:5px;font-size:12px;color:var(--mut2,#77809a)}" +
    ".post-meta .ng-score.post-seo{min-width:0;padding:1px 6px;font-size:11px}" +
    ".post-dot{opacity:.5}" +
    ".dash-stat-click{position:relative;cursor:pointer;transition:border-color .12s,background .12s}" +
    ".dash-stat-click:hover{border-color:var(--royal,#7c3aed);background:linear-gradient(180deg,rgba(124,58,237,.12),#0c0918)}" +
    ".dash-stat-more{position:absolute;top:14px;right:16px;color:var(--mut2,#77809a);font-size:18px;line-height:1}" +
    ".dash-stat-click:hover .dash-stat-more{color:#c4b5fd}" +
    ".cd-head{margin:14px 0 16px}" +
    ".cd-head h3{margin:0;font-size:22px;color:var(--white,#fff)}" +
    ".cd-tabs{display:flex;gap:10px;margin:0 0 18px;flex-wrap:wrap}" +
    ".cd-tab{flex:1;min-width:150px;text-align:left;font:inherit;background:rgba(255,255,255,.04);border:1px solid var(--line2,#2a2145);border-radius:12px;padding:12px 15px;cursor:pointer;color:var(--mut,#9aa)}" +
    ".cd-tab b{display:block;font-size:14.5px;color:var(--white,#fff)}" +
    ".cd-tab span{font-size:12px;color:var(--mut2,#77809a)}" +
    ".cd-tab:hover{background:rgba(255,255,255,.07)}" +
    ".cd-tab.is-on{border-color:transparent;background:rgba(124,58,237,.2)}" +
    ".cd-tab.is-on span{color:#c4b5fd}" +
    "#cdBack{margin-bottom:4px}" +
    ".dash-toolbar{margin:0 0 14px}" +
    ".dash-table{width:100%;border-collapse:collapse;font-size:14px;min-width:560px}" +
    ".dash-table th{text-align:left;color:var(--mut2,#77809a);font-size:12px;font-weight:600;padding:0 10px 10px}" +
    ".dash-table td{padding:12px 10px;border-top:1px solid var(--line2,#2a2145);color:var(--white,#fff);vertical-align:middle}" +
    ".dash-muted{color:var(--mut2,#77809a);font-size:12px;font-weight:400}" +
    ".dash-actions{white-space:nowrap;text-align:right}" +
    ".btn.sm{padding:6px 12px;font-size:12.5px}" +
    "body.vp-dash nav.vn,body.vp-dash footer{display:none!important}" +
    "body.vp-admin #chatw{display:none!important}" +
    "#view-admin>.sec,#view-dashboard>.sec{padding-top:34px}" +
    ".dash-table tbody tr:hover td{background:rgba(124,58,237,.06)}" +
    ".admin-layout{display:grid;grid-template-columns:200px 1fr;gap:24px;align-items:start;margin-top:4px;min-height:62vh}" +
    ".admin-nav{display:flex;flex-direction:column;gap:4px;align-self:start;position:sticky;top:var(--dash-top-h,84px);max-height:calc(100vh - var(--dash-top-h,84px) - 16px);overflow-y:auto}" +
    ".admin-nav-foot{margin-top:auto;display:flex;flex-direction:column;gap:4px;padding-top:6px}" +
    ".admin-nav-item{font:inherit;font-size:14.5px;font-weight:600;text-align:left;color:var(--mut,#9aa);background:none;border:none;border-radius:10px;padding:11px 14px;cursor:pointer;white-space:nowrap}" +
    ".admin-nav-item:hover{color:var(--white,#fff);background:rgba(255,255,255,.05)}" +
    ".admin-nav-item.is-on{color:var(--white,#fff);background:rgba(124,58,237,.18)}" +
    ".admin-nav-badge{display:inline-flex;align-items:center;justify-content:center;margin-left:8px;min-width:19px;height:19px;padding:0 5px;border-radius:10px;background:#e8409b;color:#fff;font-size:11px;font-weight:700;vertical-align:middle;box-sizing:border-box}" +
    ".admin-nav-badge[hidden]{display:none}" +
    ".admin-nav-sep{height:1px;background:var(--line2,#2a2145);margin:10px 6px}" +
    ".em-tabs{display:flex;align-items:center;gap:6px;margin:0 0 14px;flex-wrap:wrap}" +
    ".em-tabs-sp{flex:1}" +
    ".em-tab{font:inherit;font-size:13px;font-weight:600;color:var(--mut,#9aa);background:rgba(255,255,255,.04);border:1px solid var(--line2,#2a2145);border-radius:9px;padding:7px 12px;cursor:pointer}" +
    ".em-tab:hover{color:var(--white,#fff)}" +
    ".em-tab.is-on{color:var(--white,#fff);background:rgba(124,58,237,.2);border-color:transparent}" +
    ".em-tab-n{opacity:.6;font-weight:700;margin-left:2px}" +
    ".em-table{min-width:0;font-size:13px}" +
    ".em-table th,.em-table td{padding:10px 8px}" +
    ".em-table .btn.sm{padding:5px 9px;font-size:12px}" +
    ".em-table .dash-actions{white-space:nowrap}" +
    ".em-subcell{cursor:pointer;max-width:300px}" +
    ".em-subcell b{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}" +
    ".em-prev{max-width:300px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:3px}" +
    "@media(max-width:1150px){.em-subcell,.em-subcell b,.em-prev{max-width:170px}}" +
    ".em-modal-body{white-space:pre-wrap;word-break:break-word;font-size:14px;line-height:1.5;color:var(--white,#fff);background:rgba(255,255,255,.04);border:1px solid var(--line2,#2a2145);border-radius:10px;padding:12px 14px;margin-top:4px}" +
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
    ".cd-topbar{display:flex;align-items:center;gap:8px}" +
    ".cd-gear{display:inline-flex;align-items:center;justify-content:center;padding:6px 9px}" +
    ".vis-row{display:flex;align-items:center;justify-content:space-between;gap:14px;padding:14px 0;border-bottom:1px solid var(--line2,#2a2145)}" +
    ".vis-row:last-child{border-bottom:none}" +
    ".vis-row-t b{display:block;font-size:14.5px;color:var(--white,#fff)}" +
    ".vis-row-t span{font-size:12.5px;color:var(--mut2,#77809a)}" +
    ".vis-eye{flex:0 0 auto;width:52px;height:32px;border-radius:20px;border:1px solid var(--line2,#2a2145);background:rgba(255,255,255,.05);color:var(--mut2,#77809a);cursor:pointer;display:inline-flex;align-items:center;justify-content:center}" +
    ".vis-eye.is-on{background:rgba(124,58,237,.22);border-color:transparent;color:#c4b5fd}" +
    ".vis-eye .vis-eye-on{display:none}.vis-eye .vis-eye-off{display:inline-flex}" +
    ".vis-eye.is-on .vis-eye-on{display:inline-flex}.vis-eye.is-on .vis-eye-off{display:none}" +
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
    window.addEventListener("resize", syncDashTop);
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
