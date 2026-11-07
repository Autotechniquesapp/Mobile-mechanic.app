# Invoice payment controls

Invoices support recording received Cash, Zelle, Cash App, and Other payments,
including partial amounts. A private payment ledger records method, amount,
reference, server time, and recording user. Invoice-row locking, request IDs,
role checks, and balance checks prevent duplicate submissions and overpayments.
The invoice total stays fixed; payment and balance totals are derived separately.

Square invoice sync preserves these recorded payments. Square does not expose
an API for marking its invoices paid by external methods, so a linked invoice
shows a reminder to record the payment in Square. After refreshing, the user
can match that payment to Square's confirmed paid total; matched ledger entries
are retained for history and stop contributing twice to the app balance.

Tap to Pay has an editable amount capped at the remaining balance. Customer
signatures authorize the selected amount. The return page supplies a transaction
ID; the server fetches its Square Order and Payment and verifies location,
completed status, USD amount, request reference, and timestamp before applying
the payment. The callback's success flag alone cannot mark an invoice paid.
Square payment IDs are unique in the ledger. Verified POS links and refunds are
preserved on later synchronization. POS payment and Square invoice settlement
are separate Square records; the same matching reminder applies when linked.

Validation includes browser interaction tests for settled/partial invoices,
manual methods, partial tap amounts, Back navigation, and callback forgery;
server lifecycle/signature/refund tests; and rolled-back production-database
checks for partial/final payments, retries, overpayments, role isolation, sync
preservation, and full POS refunds. No real customer payment, email, cancellation,
or refund was initiated for testing. Hardware tap and Android Back gestures still
require a real-device check.
