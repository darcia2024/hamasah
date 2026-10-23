-- Historical corrections have no recoverable sign; leave old balances explicitly unknown.
ALTER TABLE inventory_movements DROP CONSTRAINT inventory_movements_quantity_check;
ALTER TABLE inventory_movements ADD CONSTRAINT inventory_movements_quantity_check CHECK (quantity > 0 OR (quantity = 0 AND direction = 'in' AND reason = 'Saldo awal'));
ALTER TABLE inventory_movements ADD COLUMN delta INTEGER;
ALTER TABLE inventory_movements ADD COLUMN before_quantity INTEGER;
ALTER TABLE inventory_movements ADD COLUMN after_quantity INTEGER;
UPDATE inventory_movements SET delta = CASE direction WHEN 'in' THEN quantity WHEN 'out' THEN -quantity ELSE NULL END;
ALTER TABLE inventory_movements ADD CONSTRAINT inventory_movement_balances CHECK (
  (before_quantity IS NULL AND after_quantity IS NULL) OR
  (before_quantity IS NOT NULL AND after_quantity IS NOT NULL AND delta IS NOT NULL
   AND before_quantity >= 0 AND after_quantity >= 0 AND after_quantity = before_quantity + delta
   AND abs(delta) = quantity AND (direction = 'correction' OR (direction = 'in' AND delta >= 0) OR (direction = 'out' AND delta < 0)))
);
