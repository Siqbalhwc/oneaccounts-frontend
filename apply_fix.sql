-- Restrict trg_set_qty_on_hand to fire only on INSERT (new product creation),
-- never on UPDATE — it was incorrectly resetting qty_on_hand to opening_qty
-- on every product edit, discarding all purchase/sale history.

DROP TRIGGER IF EXISTS trg_set_qty_on_hand ON products;

CREATE TRIGGER trg_set_qty_on_hand
BEFORE INSERT ON products
FOR EACH ROW
EXECUTE FUNCTION set_qty_on_hand();