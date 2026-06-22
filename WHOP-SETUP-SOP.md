# SOP — Connect Whop checkout to the Vanta landing page

**Audience:** the payment/integrations person.
**Goal:** when a lead clicks **"Commencer maintenant · 97 $/mois"**, their details are already saved to
the Google Sheet (`enrolled = non`), then they go to **Whop checkout** and are charged **$97/mo
immediately**. After a successful payment, flip that lead's row to `enrolled = oui`.

---

## Flow (already built on the site side)
```
User fills form  ──▶  POST to Google Sheet (Apps Script)   [row added, enrolled = non]
                 │
                 └──▶  Milestone overlay (Day 1/2/3/7)  ──▶  "Procéder au paiement" button
                                                            │
                                                            └──▶  redirect to Whop checkout
                                                                  (?email=<lead>&name=<lead>&plan=vanta-97)
Whop payment success  ──▶  webhook  ──▶  Apps Script (action=enroll&courriel=<email>)  [enrolled = oui]
```

The site reads a single constant. In `index.html`, find:
```js
const CHECKOUT_URL = ""; // <-- paste your Whop checkout URL here
```
Set it to the Whop checkout/product URL. The site auto-appends `?email=`, `?name=`, `?plan=vanta-97`
so Whop can prefill the email and store metadata. (Send me the final URL and I'll commit it, or edit
this line in the `vanta-marketing` GitHub repo → Netlify auto-deploys.)

---

## Step 1 — Whop product
1. Create a **$97 / month recurring subscription** product in Whop.
2. Set it to **charge immediately** on checkout (no free trial).
3. Copy the **checkout URL**. Put it in `CHECKOUT_URL` (above).
4. In Whop checkout settings, enable **prefill email from URL param** (`email`) if available, and make
   sure buyer email is captured (it always is at payment).

## Step 2 — Google Sheet: add the `enrolled` column + upgrade the script
1. In the **Leads** sheet, add a column header **`enrolled`** (e.g. column M).
   New leads from the form already send `enrolled = non`.
2. Open **Extensions → Apps Script** and replace the code with this (handles BOTH the form append
   AND the Whop "enroll" update), then **Deploy → Manage deployments → Edit → Deploy** (same `/exec` URL):
```js
function doPost(e){
  var p = (e && e.parameter) || {};
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
  var headers = sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0];

  // Whop webhook: flip an existing lead to enrolled = oui (matched by email)
  if (p.action === 'enroll' && p.courriel) {
    var emailCol = headers.indexOf('courriel');
    var enrolledCol = headers.indexOf('enrolled');
    if (emailCol > -1 && enrolledCol > -1 && sh.getLastRow() > 1) {
      var rows = sh.getRange(2,1,sh.getLastRow()-1,sh.getLastColumn()).getValues();
      for (var i = rows.length - 1; i >= 0; i--) { // newest match first
        if (String(rows[i][emailCol]).toLowerCase() === String(p.courriel).toLowerCase()) {
          sh.getRange(i + 2, enrolledCol + 1).setValue('oui'); break;
        }
      }
    }
    return ContentService.createTextOutput(JSON.stringify({ok:true, action:'enroll'})).setMimeType(ContentService.MimeType.JSON);
  }

  // default: append a new lead
  if (Object.keys(p).length) sh.appendRow(headers.map(function(h){ return p[h] || ''; }));
  return ContentService.createTextOutput(JSON.stringify({ok:true})).setMimeType(ContentService.MimeType.JSON);
}
```
   The Apps Script web-app URL (the "enroll" target) is:
   `https://script.google.com/macros/s/AKfycbzLawKgUNxG-jwSqV_er_kepAFJe5fl7XVbtwlOf_e1AYdAMCYqu6VqWnc3E57aafk/exec`

## Step 3 — Whop → Sheet webhook (choose ONE)

**Option A — No-code (Zapier or Make), easiest:**
1. Trigger: Whop **"Payment succeeded"** (or "Membership went valid").
2. Action: **Webhooks → POST** to the Apps Script `/exec` URL above, content-type
   `application/x-www-form-urlencoded`, body:
   `action=enroll&courriel={{buyer_email}}`
3. Test with a real/sandbox payment → confirm the matching row flips to `enrolled = oui`.

**Option B — Direct Whop webhook + tiny relay:**
1. Whop dashboard → **Developer → Webhooks** → add endpoint, subscribe to `payment.succeeded`
   (and/or `membership.went_valid`).
2. Whop posts JSON; Apps Script expects form params, so put a small relay in between (Cloudflare
   Worker / Vercel function / Apps Script doPost JSON branch) that extracts the buyer email and
   re-POSTs `action=enroll&courriel=<email>` to the `/exec` URL. (Ask the dev for the relay snippet.)
3. Verify the Whop webhook **signature** in the relay before trusting it.

## Step 4 — Verify end-to-end
1. Submit the live form with a test email → row appears with `enrolled = non`.
2. Complete a Whop test payment with the same email → row flips to `enrolled = oui`.
3. Abandon a payment → row stays `enrolled = non` (lead retained). ✅

## Notes
- The lead is saved **before** payment on purpose, so abandoned checkouts are still captured.
- Email is the join key between the Sheet and Whop. If a buyer pays with a different email than they
  typed in the form, the match fails — consider passing a unique `id` param too if that becomes common.
- `$97/mo charged immediately` is the agreed model. If you later add a trial, update Whop + the
  milestone copy in `index.html` (`co.*` strings).
