# Economy

AI NOTE: Cash entries require trusted external reconciliation; fixture balances and model-authored income are forbidden.

Goal: **100,000,000 USD cents of cumulative reconciled net operating profit**, before personal income taxes.

Eligible collected campaign revenue, excluding sales tax, minus refunds/chargebacks, marketplace fees, AI/subscription cash expense, and other authorized operating costs equals net profit. Search rankings, unsold downloads, forecasts, owner transfers, test receipts, and pre-existing shop sales do not count.

## Implemented Primitives

- SQLite append-only ledger with unique real-reference/evidence fields; matching duplicates are idempotent, conflicting duplicates are rejected.
- Positive integer inputs; expenses are stored negative. Totals expose gross sales, refunds, marketplace fees, AI/subscription cash expense, other costs, and net.
- Separate `cash_cents` and `ai_units` reservation pools. Included account allowance is usage, not an additional cash bill on top of the subscription.
- Admission checks both UTC day and month caps transactionally. Missing limits mean zero. Ambiguous dispatched usage stays reserved; known overshoot records actual use and suspends execution.
- Primitive goal latch refuses unresolved reservations/operations and cannot silently restart after completion.

## Commissioning Requirements

The intended $150/month ceiling covers actual AI/subscription and discretionary service cash. Reserve the real subscription first; a possible remainder is not permission to purchase anything. No top-ups, automatic upgrades, paid fallback, advertising, or cap expansion.

Before live dispatch, implement verified account/model metering, shared-account headroom, bundled cash/quota admission, continuation/retry bounds, cash-ledger settlement, and conservative handling of liabilities from earlier billing periods. Subscription pricing/entitlement must come from the actual account, not a model's assumption.

Before income contributes to the goal, implement shop/campaign attribution, original currency and verified conversion if needed, refunds/taxes/fees, actual invoices, and settled payout evidence. A paid receipt is not automatically bank-settled cash. Provisional amounts and unknown committed costs must not inflate the milestone.

No receipt importer, provider meter, subscription reconciler, or campaign cohort registry is connected yet. Empty totals mean no reconciled entries. Tests establish arithmetic and record constraints only, not a successful or cost-free business.
