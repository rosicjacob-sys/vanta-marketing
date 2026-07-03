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
    close:      { en: "Close",              fr: "Fermer" }
  };
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
    go("#/login");
    location.hash = "#/login";
  }

  function requireRole(role) {
    if (!getToken() || (role && getRole() !== role)) {
      location.hash = "#/login";
      return false;
    }
    return true;
  }

  function topbar(title) {
    return '<div class="dash-top">' +
      '<div><div class="eyebrow">' + esc(t("welcome")) + '</div>' +
      '<h2 style="margin:6px 0 0">' + esc(title) + '</h2></div>' +
      '<button class="btn ghost" id="vpLogout">' + esc(t("logout")) + '</button></div>';
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
    "</div></div>";
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
    host.innerHTML = '<div class="sec"><div class="wrap"><p class="lead">…</p></div></div>';
    showView("view-admin");

    api("/admin-clients").then(function (res) {
      if (res.status === 401 || res.status === 403) { logout(); return; }
      var clients = (res.data && res.data.clients) || [];
      host.innerHTML = adminHTML(clients);
      wireCommon();
      wireAdmin(clients);
    }).catch(function () {
      host.innerHTML = '<div class="sec"><div class="wrap">' + topbar(t("adminTitle")) +
        '<p class="lead">' + esc(t("netErr")) + "</p></div></div>";
      wireCommon();
    });
  }

  function adminHTML(clients) {
    var rows = clients.length ? clients.map(function (c) {
      return '<tr data-email="' + esc(c.email) + '">' +
        "<td><b>" + esc(c.name || "—") + "</b><div class='dash-muted'>" + esc(c.email) + "</div></td>" +
        "<td>" + esc(c.plan || "—") + "</td>" +
        "<td>" + fmt(c.metrics && c.metrics.views) + "</td>" +
        "<td>" + fmt(c.metrics && c.metrics.articlesPublished) + "</td>" +
        '<td class="dash-actions">' +
          '<button class="btn ghost sm vp-edit">' + esc(t("edit")) + "</button> " +
          '<button class="btn ghost sm vp-del">' + esc(t("del")) + "</button>" +
        "</td></tr>";
    }).join("") : '<tr><td colspan="5" class="dash-empty">' + esc(t("noClients")) + "</td></tr>";

    return '<div class="sec"><div class="wrap">' +
      topbar(t("adminTitle")) +
      '<div class="dash-toolbar"><button class="btn primary" id="vpAdd">+ ' + esc(t("addClient")) + "</button></div>" +
      '<div class="dash-card" style="overflow-x:auto"><table class="dash-table"><thead><tr>' +
        "<th>" + esc(t("clients")) + "</th><th>" + esc(t("yourPlan")) + "</th><th>" + esc(t("views")) +
        "</th><th>" + esc(t("published")) + "</th><th></th></tr></thead><tbody>" + rows + "</tbody></table></div>" +
      '<div id="vpModal"></div>' +
    "</div></div>";
  }

  function clientForm(c, isNew) {
    c = c || {}; var m = c.metrics || {};
    function f(label, name, val, type) {
      return '<label class="vpf">' + esc(label) +
        '<input name="' + name + '" type="' + (type || "text") + '" value="' + esc(val == null ? "" : val) + '"></label>';
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
        f(FR() ? "Forfait" : "Plan", "plan", c.plan) +
        f(isNew ? (FR() ? "Mot de passe" : "Password") : (FR() ? "Nouveau mot de passe (laisser vide)" : "New password (blank = keep)"), "password", "", "text") +
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

  function wireAdmin(clients) {
    var modal = el("vpModal");
    function onKey(e) { if (e.key === "Escape") close(); }
    function close() {
      if (modal) modal.innerHTML = "";
      try { document.body.style.overflow = ""; } catch (e) {}
      document.removeEventListener("keydown", onKey);
    }
    function openForm(client, isNew) {
      if (!modal) return;
      modal.innerHTML = clientForm(client, isNew);
      try { document.body.style.overflow = "hidden"; } catch (e) {}
      document.addEventListener("keydown", onKey);
      var cancel = el("vpCancel"); if (cancel) cancel.onclick = close;
      var xBtn = el("vpClose"); if (xBtn) xBtn.onclick = close;
      var bg = el("vpModalBg");
      if (bg) bg.onclick = function (e) { if (e.target === bg) close(); };
      var focusEl = el("vpForm") && el("vpForm").querySelector("input");
      if (focusEl) { try { focusEl.focus(); } catch (e) {} }
      var form = el("vpForm");
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
  }

  function wireCommon() {
    var lo = el("vpLogout");
    if (lo) lo.onclick = logout;
  }

  // ================= boot =================
  function injectCSS() {
    if (el("vp-css")) return;
    var css =
    ".dash-top{display:flex;justify-content:space-between;align-items:flex-end;gap:16px;margin-bottom:20px;flex-wrap:wrap}" +
    ".dash-plan{color:var(--mut,#9aa);margin:-6px 0 18px;font-size:14px}" +
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
    "body.vp-dash nav.vn,body.vp-dash footer{display:none!important}" +
    "#view-admin>.sec,#view-dashboard>.sec{padding-top:34px}" +
    ".dash-table tbody tr:hover td{background:rgba(124,58,237,.06)}" +
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
