CREATE OR REPLACE FUNCTION public.update_bill_transaction(
    p_bill_id INTEGER,
    p_company_id UUID,
    p_party_id INTEGER,
    p_bill_date DATE,
    p_due_date DATE,
    p_items JSONB,
    p_reference TEXT DEFAULT '',
    p_notes TEXT DEFAULT '',
    p_po_id INTEGER DEFAULT NULL,
    p_wht_tax_code_id UUID DEFAULT NULL,
    p_wht_rate NUMERIC DEFAULT 0,
    p_wht_amount NUMERIC DEFAULT 0,
    p_business_type TEXT DEFAULT '',
    p_tax_enabled BOOLEAN DEFAULT false
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
    v_old_bill RECORD;
    v_old_je_ids INTEGER[];
    v_total NUMERIC := 0;
    v_total_tax NUMERIC := 0;
    v_gross_total NUMERIC := 0;
    v_payable_account_id INTEGER;
    v_je_id INTEGER;
    v_item JSONB;
    v_qty NUMERIC;
    v_unit_price NUMERIC;
    v_line_total NUMERIC;
    v_tax_amount NUMERIC;
    v_account_id INTEGER;
    v_activity_id INTEGER;
    v_location_id INTEGER;
    v_project_id INTEGER;
    v_donor_id INTEGER;
    v_is_recoverable BOOLEAN;
    v_expense_amount NUMERIC;
    v_debit_lines JSONB[];
    v_fiscal_year INTEGER;
    v_budget_available NUMERIC;
    v_spent NUMERIC;
    v_budget NUMERIC;
    v_result JSONB;
    v_error_message TEXT;
    v_wht_actual_amount NUMERIC;
    v_wht_actual_rate NUMERIC;
    v_wht_actual_code_id UUID;
BEGIN
    v_fiscal_year := EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER;

    SELECT * INTO v_old_bill FROM invoices WHERE id = p_bill_id AND company_id = p_company_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Bill not found';
    END IF;

    -- ============ REVERSE THE OLD ENTRY ============
    SELECT ARRAY_AGG(DISTINCT entry_id) INTO v_old_je_ids
    FROM journal_lines
    WHERE source_type = 'purchase_bill' AND source_id = p_bill_id AND company_id = p_company_id;

    UPDATE accounts a
    SET balance = a.balance - jl.net
    FROM (
        SELECT account_id, SUM(debit - credit) AS net
        FROM journal_lines
        WHERE source_type = 'purchase_bill' AND source_id = p_bill_id AND company_id = p_company_id
        GROUP BY account_id
    ) jl
    WHERE a.id = jl.account_id AND a.company_id = p_company_id;

    DELETE FROM journal_lines WHERE source_type = 'purchase_bill' AND source_id = p_bill_id AND company_id = p_company_id;
    IF v_old_je_ids IS NOT NULL THEN
        DELETE FROM journal_entries WHERE id = ANY(v_old_je_ids) AND company_id = p_company_id;
    END IF;

    IF v_old_bill.party_id IS NOT NULL THEN
        UPDATE suppliers SET balance = COALESCE(balance,0) - v_old_bill.total
        WHERE id = v_old_bill.party_id AND company_id = p_company_id;
    END IF;

    DELETE FROM bill_withholding WHERE bill_id = p_bill_id AND company_id = p_company_id;
    DELETE FROM stock_moves WHERE source_type = 'invoice' AND source_id = p_bill_id AND company_id = p_company_id;
    DELETE FROM invoice_items WHERE invoice_id = p_bill_id AND company_id = p_company_id;

    -- ============ REBUILD, SAME LOGIC AS CREATION ============
    SELECT id INTO v_payable_account_id FROM accounts WHERE code = '2000' AND company_id = p_company_id;
    IF v_payable_account_id IS NULL THEN
        SELECT id INTO v_payable_account_id FROM accounts WHERE type = 'Liability' AND company_id = p_company_id LIMIT 1;
    END IF;
    IF v_payable_account_id IS NULL THEN
        INSERT INTO accounts (code, name, type, company_id, balance)
        VALUES ('2000', 'Accounts Payable', 'Liability', p_company_id, 0)
        RETURNING id INTO v_payable_account_id;
    END IF;

    IF p_tax_enabled AND p_wht_tax_code_id IS NOT NULL AND p_wht_amount > 0 THEN
        v_wht_actual_amount := p_wht_amount;
        v_wht_actual_rate := p_wht_rate;
        v_wht_actual_code_id := p_wht_tax_code_id;
    ELSIF p_tax_enabled AND p_wht_tax_code_id IS NOT NULL AND p_wht_amount = 0 THEN
        SELECT rate INTO v_wht_actual_rate FROM tax_codes WHERE id = p_wht_tax_code_id AND company_id = p_company_id;
        v_wht_actual_rate := COALESCE(v_wht_actual_rate, 0);
        v_wht_actual_code_id := p_wht_tax_code_id;
    ELSE
        v_wht_actual_amount := 0;
        v_wht_actual_rate := 0;
        v_wht_actual_code_id := NULL;
    END IF;

    IF p_business_type = 'ngo' THEN
        FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
        LOOP
            v_activity_id := COALESCE((v_item->>'activity_id')::INTEGER, 0);
            v_account_id := COALESCE((v_item->>'account_id')::INTEGER, 0);
            IF v_activity_id > 0 AND v_account_id > 0 THEN
                v_location_id := COALESCE((v_item->>'location_id')::INTEGER, NULL);
                v_qty := COALESCE((v_item->>'qty')::NUMERIC, 0);
                v_unit_price := COALESCE((v_item->>'unit_price')::NUMERIC, 0);
                v_line_total := v_qty * v_unit_price;

                SELECT budgeted_amount INTO v_budget FROM budgets
                WHERE company_id = p_company_id AND activity_id = v_activity_id AND account_id = v_account_id
                  AND fiscal_year = v_fiscal_year AND month IS NULL
                  AND (location_id = v_location_id OR (location_id IS NULL AND v_location_id IS NULL))
                LIMIT 1;
                v_budget := COALESCE(v_budget, 0);

                SELECT COALESCE(SUM(debit - credit), 0) INTO v_spent
                FROM journal_lines
                WHERE company_id = p_company_id AND activity_id = v_activity_id AND account_id = v_account_id
                  AND (location_id = v_location_id OR (location_id IS NULL AND v_location_id IS NULL));

                v_budget_available := v_budget - COALESCE(v_spent, 0);
                IF v_budget_available < v_line_total THEN
                    RAISE EXCEPTION 'Budget exceeded for activity % – available: %, requested: %', v_activity_id, v_budget_available, v_line_total;
                END IF;
            END IF;
        END LOOP;
    END IF;

    UPDATE invoices
    SET party_id = p_party_id, date = p_bill_date, due_date = p_due_date,
        reference = p_reference, notes = p_notes, po_id = p_po_id, updated_by = 'system'
    WHERE id = p_bill_id AND company_id = p_company_id;

    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_qty := COALESCE((v_item->>'qty')::NUMERIC, 0);
        v_unit_price := COALESCE((v_item->>'unit_price')::NUMERIC, 0);
        v_line_total := v_qty * v_unit_price;
        v_tax_amount := COALESCE((v_item->>'tax_amount')::NUMERIC, 0);
        v_account_id := COALESCE((v_item->>'account_id')::INTEGER, NULL);
        v_location_id := COALESCE((v_item->>'location_id')::INTEGER, NULL);
        v_activity_id := COALESCE((v_item->>'activity_id')::INTEGER, NULL);
        v_project_id := COALESCE((v_item->>'project_id')::INTEGER, NULL);
        v_donor_id := COALESCE((v_item->>'donor_id')::INTEGER, NULL);
        v_is_recoverable := COALESCE((v_item->>'is_recoverable')::BOOLEAN, true);

        IF v_account_id IS NULL AND (v_item->>'product_id') IS NOT NULL THEN
            SELECT id INTO v_account_id FROM accounts WHERE code = '1200' AND company_id = p_company_id;
            IF v_account_id IS NULL THEN
                SELECT id INTO v_account_id FROM accounts WHERE type = 'Asset' AND company_id = p_company_id LIMIT 1;
            END IF;
            IF v_account_id IS NULL THEN
                SELECT id INTO v_account_id FROM accounts WHERE type = 'Expense' AND company_id = p_company_id LIMIT 1;
            END IF;
        END IF;

        IF v_account_id IS NULL THEN
            RAISE EXCEPTION 'No account found for item: %', (v_item->>'description');
        END IF;

        v_total := v_total + v_line_total;
        v_total_tax := v_total_tax + COALESCE(v_tax_amount, 0);

        INSERT INTO invoice_items (
            invoice_id, product_id, description, qty, unit_price, total,
            account_id, location_id, activity_id, company_id,
            tax_code_id, tax_code_snapshot, tax_name_snapshot, tax_rate, tax_amount
        ) VALUES (
            p_bill_id,
            COALESCE((v_item->>'product_id')::INTEGER, NULL),
            COALESCE(v_item->>'description', ''),
            v_qty, v_unit_price, v_line_total + COALESCE(v_tax_amount, 0),
            v_account_id, v_location_id, v_activity_id, p_company_id,
            COALESCE((v_item->>'tax_code_id')::UUID, NULL),
            v_item->>'tax_code_snapshot',
            v_item->>'tax_name_snapshot',
            COALESCE((v_item->>'tax_rate')::NUMERIC, 0),
            COALESCE(v_tax_amount, 0)
        );

        v_expense_amount := v_line_total;
        IF NOT v_is_recoverable AND COALESCE(v_tax_amount, 0) > 0 THEN
            v_expense_amount := v_expense_amount + v_tax_amount;
        END IF;

        v_debit_lines := array_append(v_debit_lines, jsonb_build_object(
            'account_id', v_account_id, 'debit', v_expense_amount, 'credit', 0,
            'location_id', v_location_id, 'activity_id', v_activity_id,
            'project_id', v_project_id, 'donor_id', v_donor_id
        ));

        IF v_is_recoverable AND COALESCE(v_tax_amount, 0) > 0 THEN
            DECLARE
                v_tax_account_id INTEGER;
            BEGIN
                SELECT tax_account_id INTO v_tax_account_id FROM tax_codes WHERE id = (v_item->>'tax_code_id')::UUID AND company_id = p_company_id;
                IF v_tax_account_id IS NOT NULL THEN
                    v_debit_lines := array_append(v_debit_lines, jsonb_build_object(
                        'account_id', v_tax_account_id, 'debit', v_tax_amount, 'credit', 0,
                        'location_id', v_location_id, 'activity_id', v_activity_id,
                        'project_id', v_project_id, 'donor_id', v_donor_id
                    ));
                END IF;
            END;
        END IF;
    END LOOP;

    v_gross_total := v_total + v_total_tax;

    IF p_tax_enabled AND v_wht_actual_code_id IS NOT NULL AND p_wht_amount = 0 THEN
        v_wht_actual_amount := v_gross_total * (v_wht_actual_rate / 100);
    END IF;

    IF p_tax_enabled AND v_wht_actual_code_id IS NOT NULL AND v_wht_actual_amount > 0 THEN
        INSERT INTO bill_withholding (company_id, bill_id, wht_tax_code_id, wht_rate, wht_amount)
        VALUES (p_company_id, p_bill_id, v_wht_actual_code_id, v_wht_actual_rate, v_wht_actual_amount);
    END IF;

    INSERT INTO stock_moves (company_id, product_id, move_type, qty, date, ref, reason, source_type, source_id)
    SELECT p_company_id, COALESCE((item->>'product_id')::INTEGER, NULL), 'purchase',
           COALESCE((item->>'qty')::NUMERIC, 0),
           p_bill_date, v_old_bill.invoice_no, 'Purchase Bill ' || v_old_bill.invoice_no, 'invoice', p_bill_id
    FROM jsonb_array_elements(p_items) AS item
    WHERE (item->>'product_id') IS NOT NULL;

    UPDATE invoices SET total = v_gross_total, total_tax = v_total_tax WHERE id = p_bill_id;
    UPDATE suppliers SET balance = COALESCE(balance, 0) + v_gross_total WHERE id = p_party_id AND company_id = p_company_id;

    v_debit_lines := array_append(v_debit_lines, jsonb_build_object(
        'account_id', v_payable_account_id, 'debit', 0, 'credit', v_gross_total,
        'location_id', NULL, 'activity_id', NULL, 'project_id', NULL, 'donor_id', NULL
    ));

    INSERT INTO journal_entries (company_id, entry_no, date, description)
    VALUES (p_company_id, 'JE-BILL-' || v_old_bill.invoice_no, p_bill_date, 'Purchase Bill ' || v_old_bill.invoice_no)
    RETURNING id INTO v_je_id;

    INSERT INTO journal_lines (
        entry_id, company_id, account_id, debit, credit,
        location_id, activity_id, project_id, donor_id, source_type, source_id
    )
    SELECT
        v_je_id, p_company_id,
        (line->>'account_id')::INTEGER,
        (line->>'debit')::NUMERIC,
        (line->>'credit')::NUMERIC,
        COALESCE((line->>'location_id')::INTEGER, NULL),
        COALESCE((line->>'activity_id')::INTEGER, NULL),
        COALESCE((line->>'project_id')::INTEGER, NULL),
        COALESCE((line->>'donor_id')::INTEGER, NULL),
        'purchase_bill', p_bill_id
    FROM unnest(v_debit_lines) AS line;

    WITH balance_updates AS (
        SELECT account_id, SUM(debit - credit) AS delta FROM journal_lines WHERE entry_id = v_je_id GROUP BY account_id
    )
    UPDATE accounts SET balance = balance + delta
    FROM balance_updates
    WHERE accounts.id = balance_updates.account_id AND accounts.company_id = p_company_id;

    v_result := jsonb_build_object(
        'success', true, 'bill_id', p_bill_id, 'bill_no', v_old_bill.invoice_no,
        'journal_entry_id', v_je_id, 'total', v_gross_total, 'total_tax', v_total_tax
    );
    RETURN v_result;

EXCEPTION
    WHEN OTHERS THEN
        GET STACKED DIAGNOSTICS v_error_message = MESSAGE_TEXT;
        RAISE EXCEPTION 'Failed to update bill: %', v_error_message;
END;
$function$;