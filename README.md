# QA Compliance Platform

Case-study site for the call quality compliance platform I built at a UK PropTech startup: an exact copy of the old
review tool, proven by re-scoring 1,281 of 1,281 historical reviews to the same result, then rebuilt around
the quality analysts' working day.

Live: https://qa-compliance-platform.vercel.app

The scorecard and heat map on the page are synthetic. The scoring arithmetic in `app/page.tsx` follows the
production rules. No customer data, agent records or confidential figures are in this repository.

## Run

```bash
npm install
npm run dev
```
