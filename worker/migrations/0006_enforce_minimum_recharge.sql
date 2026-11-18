-- Enforce the minimum ৳10 recharge at the database layer as well as the API.
-- This protects the rule if another internal code path inserts or edits payment requests.
CREATE TRIGGER IF NOT EXISTS trg_payment_requests_minimum_amount_insert
BEFORE INSERT ON payment_requests
WHEN NEW.amount_taka < 10
BEGIN
  SELECT RAISE(ABORT, 'minimum_recharge_is_10_taka');
END;

CREATE TRIGGER IF NOT EXISTS trg_payment_requests_minimum_amount_update
BEFORE UPDATE OF amount_taka ON payment_requests
WHEN NEW.amount_taka < 10
BEGIN
  SELECT RAISE(ABORT, 'minimum_recharge_is_10_taka');
END;
