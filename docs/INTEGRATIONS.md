# Integrations

AI NOTE: No live integration is commissioned. Fetch current Context7/official documentation before implementing each adapter.

## Copilot SDK

The earlier scaffold claim that Copilot could not be embedded was wrong. GitHub provides a CLI-backed Copilot SDK with sessions, custom tools, model discovery, and usage events. Account access, model IDs, billing/allowance bounds, and the supported SDK/CLI pair still require verification.

- Do not install/authenticate against the owner's account or run paid probes without explicit authorization.
- Requested commander display name "GPT 6.1sol" is not a verified executable model ID. Never silently substitute a paid model/provider.
- Custom tools alone do not disable default tools. Deny raw shell, arbitrary filesystem/network, ambient MCP/plugins/memory, and nested agents on both session creation and resume.
- Keep credentials in a trusted broker, out of prompts, browser state, SDK child environment, and logs. Bind each task to trusted worker/session generations.
- Explicitly verify abort/disconnect. A response timeout or `sendAndWait` timeout is not proof that underlying inference stopped.
- Count internal iterations, retries, compaction, and continuations within reserved usage; included credits are not unlimited calls or duplicate cash costs.

Reference: <https://github.com/github/copilot-sdk>. The application currently has no installed SDK adapter or active model session.

## Etsy

The initial scaffold OAuth URLs and HTTP-loopback callback assumption are not trusted implementation references. Planning found different endpoints in the official guide and an HTTPS registered-redirect requirement. Revalidate current authorization/token URLs, PKCE S256/state, refresh behavior, scopes, API-key headers, and callback constraints before coding. Do not expose the local console or create a public callback relay without approval.

Launch requires an approved developer app and seller/shop access, current creativity/AI-disclosure policy review, and an eligible original-product workflow. The policy page was inaccessible during planning; this is unresolved, not a verified clearance. Record authoritative policy/date and required disclosure before publication.

Centralize all scientists' reads under observed application QPS/rolling-day limits, response headers, cache policy, and `Retry-After`. Verify digital file limits and upload/draft/publish fields from current docs. Do not assume Etsy supports idempotency headers or that a conflict response universally means success.

Every write needs durable intent, payload/version hash, dispatch record, and remote reconciliation. Timeout after send means UNKNOWN, not automatic retry. Draft-first; exact inspected-version approval is required before active publication.

References: <https://developers.etsy.com/documentation/essentials/authentication/> and <https://developers.etsy.com/documentation/essentials/rate-limits/>.

## Research Evidence

Active listings, prices, favorites, and recency can be demand proxies; they are not verified competitor sales or buyer search volume. Preserve source/time/query/sample/method/limitations and distinguish observations from inference. Multiple agents repeating one source do not make it independent evidence.

External text remains untrusted data. Prompt delimiters are not a security boundary; task/role/source scopes and structured tool validation must be enforced by server code. No broad scraping or additional paid data sources are authorized.
