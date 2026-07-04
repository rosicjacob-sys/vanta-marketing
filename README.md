# Vanta Marketing - landing page

Static, single-page bilingual (FR/EN) landing page for Vanta Marketing - a done-for-you local-SEO
+ AI-visibility blog for Québec restaurants ($97/mo). Self-contained: `index.html` + `elements/`
(Three.js/Canvas modules loaded from CDN). No build step.

## Deploy (Netlify)
Static site - **no build command**, **publish directory = repo root**. `index.html` is the homepage.

## Lead form
Posts to a Google Apps Script web app (`LEADS_ENDPOINT` in `index.html`) that appends rows to a
Google Sheet. See `SETUP-google-sheet.md`. With the endpoint empty, submissions fall back to
`localStorage`.

## Local preview
ES modules + CDN imports need an HTTP origin:
```bash
python3 -m http.server 8080
# open http://localhost:8080/
```
#test
