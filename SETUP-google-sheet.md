# Wire the lead form → Google Sheet (5 min, free, no backend)

The form posts every lead to a Google Sheet via a tiny Google Apps Script web app.

## Steps
1. Create a new Google Sheet. Row 1 headers (any order is fine; the script auto-maps):
   `ts | nom | courriel | telephone | restaurant | ville | nb_restaurants | nb_sites | contact_pref | best_time | langue | page | enrolled`
   - The form now sends: `nom` & `restaurant` = combined "restaurant + owner name", `telephone` = the SMS
     number, `contact_pref` = chosen channel(s), and `enrolled` = `non` (flipped to `oui` after payment).
   - `ville` and `best_time` are no longer collected (columns just stay empty — harmless).
   - **For the payment / `enrolled` flip via Whop, use the upgraded `doPost` in `WHOP-SETUP-SOP.md`.**
2. In the Sheet: **Extensions → Apps Script**. Delete the stub and paste:

```js
function doPost(e) {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
  var p = e.parameter || {};
  var headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  var row = headers.map(function (h) { return p[h] || ''; });
  sh.appendRow(row);
  return ContentService.createTextOutput(JSON.stringify({ ok: true }))
    .setMimeType(ContentService.MimeType.JSON);
}
```

3. **Deploy → New deployment → type: Web app.** Execute as: **Me**. Who has access: **Anyone**.
   Copy the **Web app URL** (ends in `/exec`).
4. Open `index.html`, find this line near the bottom and paste your URL:
   `const LEADS_ENDPOINT = "";`  →  `const LEADS_ENDPOINT = "https://script.google.com/macros/s/XXXX/exec";`
5. Redeploy the site. Done — leads now land in your Sheet (and you get a row instantly).

## Until you wire it
With `LEADS_ENDPOINT` empty, the form still "works" for testing: submissions are saved to the
browser's `localStorage` under `vanta_leads` and the success message shows. (Nothing leaves the device.)

## Optional: email yourself on each lead
Add to `doPost`, before the return:
```js
MailApp.sendEmail('hoppenly@icloud.com', 'Nouveau lead Vanta — ' + (p.restaurant||p.nom),
  Object.keys(p).map(function(k){return k+': '+p[k];}).join('\n'));
```
