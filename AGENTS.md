# Project rules
- Share the freelance daily-report interface between both freelance entry routes, keeping the independent team payments panel below it to prevent divergent versions and circular route imports.
- Student account detail is a read-only presentation of the shared accounting results and existing payment history; reuse the established editing and payment dialogs to preserve financial behavior.
- Keep student monthly payment calculations in a browser-safe shared module; monthly dues default to the agreed installment, preserving explicit monthly totals and saved payment-period snapshots to prevent balance drift.
- Student PDF reports receive course accounting separately from monthly accounting so prior payments are never presented as payments of the selected month.