CREATE OR REPLACE FUNCTION public.update_vendor_payment(p_payment_id integer, p_company_id uuid, p_party_id integer, p_payment_date date, p_amount numeric, p_payment_method text, p_bank_account_id integer, p_allocations jsonb, p_reference text DEFAULT NULL::text, p_notes text DEFAULT NULL::text, p_user_email text DEFAULT 'system'::text, p_reversal_date date DEFAULT CURRENT_DATE)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_old_payment RECORD;
    v_bank_gl_id INTEGER;
    v_ap_account_id INTEGER;
    v_alloc jsonb;
    v_invoice_id INTEGER;
    v_alloc_amount NUMERIC;
    v_gross_allocated NUMERIC := 0;
    v_total_wht_deducted NUMERIC := 0;
    v_bill record;
    v_wht record;
    v_wht_tax_account_id INTEGER;
    v_wht_amount NUMERIC;
    v_proportion NUMERIC;
    v_bank_credit NUMERIC;
    v_je_id INTEGER;
    v_je_lines jsonb[];
    v_result jsonb;
    v_rev_je_id INTEGER;
    v_rev_entry_no TEXT;
    v_reverse_amount NUMERIC;
    v_bank_credit_rev NUMERIC;
    v_wht_lines jsonb[];
    v_wht_total NUMERIC;
BEGIN
    SELECT * INTO v_old_payment FROM payments
    WHERE id = p_payment_id AND company_id = p_company_id
      AND status IN ('posted','edited','COMPLETED');
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Payment not found or already reversed';
    END IF;

    -- 1. Undo business effects of the old payment
    PERFORM undo_vendor_payment_business_effects(p_payment_id, p_company_id);

    -- 2. Create reversal journal for the old payment (preserving audit trail)
    -- Collect WHT info from the old journal
    SELECT array_agg(
        jsonb_build_object('account_id', jl.account_id, 'amount', jl.credit)
    ), SUM(jl.credit)
    INTO v_wht_lines, v_wht_total
    FROM journal_lines jl
    JOIN journal_entries je ON je.id = jl.entry_id
    WHERE je.description = 'Payment - ' || v_old_payment.payment_no
      AND jl.company_id = p_company_id
      AND jl.account_id <> (SELECT id FROM accounts WHERE code = '2000' AND company_id = p_company_id)
      AND jl.account_id <> (SELECT account_id FROM bank_accounts WHERE id = v_old_payment.bank_account_id AND company_id = p_company_id);

    SELECT id INTO v_ap_account_id FROM accounts WHERE code = '2000' AND company_id = p_company_id;
    SELECT account_id INTO v_bank_gl_id
    FROM bank_accounts
    WHERE id = v_old_payment.bank_account_id AND company_id = p_company_id;

    v_reverse_amount := v_old_payment.amount;
    v_bank_credit_rev := v_old_payment.amount - v_wht_total;

    v_rev_entry_no := 'JE-REV-PAY-' || v_old_payment.payment_no || '-' || TO_CHAR(NOW(), 'YYYYMMDDHH24MISS');

    INSERT INTO journal_entries (company_id, entry_no, date, description)
    VALUES (p_company_id, v_rev_entry_no, p_reversal_date,
            'Reversal of Payment ' || v_old_payment.payment_no)
    RETURNING id INTO v_rev_je_id;

    -- Credit AP
    INSERT INTO journal_lines (entry_id, company_id, account_id, debit, credit, source_type, source_id)
    VALUES (v_rev_je_id, p_company_id, v_ap_account_id, 0, v_reverse_amount, 'payment_reversal', p_payment_id);

    -- Debit Bank
    INSERT INTO journal_lines (entry_id, company_id, account_id, debit, credit, source_type, source_id)
    VALUES (v_rev_je_id, p_company_id, v_bank_gl_id, v_bank_credit_rev, 0, 'payment_reversal', p_payment_id);

    -- Debit WHT accounts
    IF v_wht_lines IS NOT NULL THEN
        FOR i IN 1..array_length(v_wht_lines, 1) LOOP
            INSERT INTO journal_lines (entry_id, company_id, account_id, debit, credit, source_type, source_id)
            VALUES (v_rev_je_id, p_company_id,
                    (v_wht_lines[i]->>'account_id')::INTEGER,
                    (v_wht_lines[i]->>'amount')::NUMERIC, 0,
                    'payment_reversal', p_payment_id);
        END LOOP;
    END IF;

    WITH balance_updates AS (
        SELECT account_id, SUM(debit - credit) AS delta
        FROM journal_lines
        WHERE entry_id = v_rev_je_id
        GROUP BY account_id
    )
    UPDATE accounts
    SET balance = COALESCE(balance, 0) + delta
    FROM balance_updates
    WHERE accounts.id = balance_updates.account_id
      AND accounts.company_id = p_company_id;

    -- 3. Update the payment record with new data
    UPDATE payments
    SET party_id = p_party_id,
        payment_date = p_payment_date,
        amount = p_amount,
        payment_method = p_payment_method,
        bank_account_id = p_bank_account_id,
        reference = p_reference,
        notes = p_notes,
        status = 'edited',
        updated_by = p_user_email,
        gross_amount = 0
    WHERE id = p_payment_id AND company_id = p_company_id;

    -- 4. Process new allocations (batch style)
    IF p_allocations IS NOT NULL AND jsonb_array_length(p_allocations) > 0 THEN
        DECLARE
            v_invoice_updates jsonb[] := '{}';
            v_alloc_inserts jsonb[] := '{}';
        BEGIN
            FOR v_alloc IN SELECT * FROM jsonb_array_elements(p_allocations)
            LOOP
                v_invoice_id := (v_alloc->>'invoice_id')::integer;
                v_alloc_amount := (v_alloc->>'allocated_amount')::numeric;

                SELECT id, paid, total INTO v_bill
                FROM invoices
                WHERE id = v_invoice_id AND company_id = p_company_id AND type = 'purchase';
                IF NOT FOUND THEN
                    RAISE EXCEPTION 'Bill ID % not found or not a purchase bill', v_invoice_id;
                END IF;

                v_gross_allocated := v_gross_allocated + v_alloc_amount;

                v_invoice_updates := array_append(v_invoice_updates, jsonb_build_object(
                    'invoice_id', v_invoice_id, 'amount', v_alloc_amount));
                v_alloc_inserts := array_append(v_alloc_inserts, jsonb_build_object(
                    'invoice_id', v_invoice_id, 'amount', v_alloc_amount));

                -- WHT handling
                SELECT bw.wht_amount, bw.wht_tax_code_id INTO v_wht
                FROM bill_withholding bw
                WHERE bw.bill_id = v_invoice_id AND bw.company_id = p_company_id;

                IF v_wht.wht_amount > 0 AND v_wht.wht_tax_code_id IS NOT NULL THEN
                    SELECT tax_account_id INTO v_wht_tax_account_id
                    FROM tax_codes
                    WHERE id = v_wht.wht_tax_code_id AND company_id = p_company_id;

                    IF v_wht_tax_account_id IS NOT NULL THEN
                        v_proportion := v_alloc_amount / v_bill.total;
                        v_wht_amount := ROUND(v_wht.wht_amount * v_proportion);
                        v_total_wht_deducted := v_total_wht_deducted + v_wht_amount;
                        v_je_lines := array_append(v_je_lines, jsonb_build_object(
                            'account_id', v_wht_tax_account_id, 'debit', 0, 'credit', v_wht_amount));
                    END IF;
                END IF;
            END LOOP;

            -- Batch update invoices
            WITH updates AS (
                SELECT (j->>'invoice_id')::integer AS invoice_id,
                       (j->>'amount')::numeric AS amount
                FROM unnest(v_invoice_updates) j
            )
            UPDATE invoices i
            SET paid = i.paid + u.amount,
                status = CASE
                           WHEN i.paid + u.amount >= i.total THEN 'Paid'
                           WHEN i.paid + u.amount > 0 THEN 'Partial'
                           ELSE 'Unpaid'
                         END
            FROM updates u
            WHERE i.id = u.invoice_id AND i.company_id = p_company_id;

            -- Batch insert allocations
            INSERT INTO payment_allocations (payment_id, invoice_id, allocated_amount, company_id)
            SELECT p_payment_id, (j->>'invoice_id')::integer, (j->>'amount')::numeric, p_company_id
            FROM unnest(v_alloc_inserts) j;
        END;
    END IF;

    -- Update supplier balance: subtract FULL new amount
    UPDATE suppliers
    SET balance = COALESCE(balance, 0) - p_amount
    WHERE id = p_party_id AND company_id = p_company_id;

    -- Get bank GL for the new payment
    SELECT account_id INTO v_bank_gl_id
    FROM bank_accounts
    WHERE id = p_bank_account_id AND company_id = p_company_id;
    IF v_bank_gl_id IS NULL THEN
        SELECT id INTO v_bank_gl_id FROM accounts WHERE code = '1000' AND company_id = p_company_id;
    END IF;

    -- Build new journal entry
    v_je_lines := array_prepend(jsonb_build_object(
        'account_id', v_ap_account_id, 'debit', p_amount, 'credit', 0), v_je_lines);

    v_bank_credit := p_amount - v_total_wht_deducted;
    v_je_lines := array_append(v_je_lines, jsonb_build_object(
        'account_id', v_bank_gl_id, 'debit', 0, 'credit', v_bank_credit));

    UPDATE payments SET gross_amount = v_gross_allocated WHERE id = p_payment_id AND company_id = p_company_id;

    INSERT INTO journal_entries (company_id, entry_no, date, description)
    VALUES (p_company_id,
            'JE-EDIT-PAY-' || v_old_payment.payment_no || '-' || TO_CHAR(NOW(), 'YYYYMMDDHH24MISS'),
            p_payment_date,
            'Payment ' || v_old_payment.payment_no || ' (edited)')
    RETURNING id INTO v_je_id;

    INSERT INTO journal_lines (entry_id, company_id, account_id, debit, credit, source_type, source_id)
    SELECT v_je_id, p_company_id,
           (l->>'account_id')::integer,
           (l->>'debit')::numeric,
           (l->>'credit')::numeric,
           'payment', p_payment_id
    FROM unnest(v_je_lines) l;

    WITH balance_updates AS (
        SELECT account_id, SUM(debit - credit) AS delta
        FROM journal_lines
        WHERE entry_id = v_je_id
        GROUP BY account_id
    )
    UPDATE accounts SET balance = COALESCE(balance, 0) + delta
    FROM balance_updates
    WHERE accounts.id = balance_updates.account_id AND accounts.company_id = p_company_id;

    v_result := jsonb_build_object(
        'success', true,
        'payment_id', p_payment_id,
        'payment_no', v_old_payment.payment_no,
        'gross_amount', v_gross_allocated,
        'wht_deducted', v_total_wht_deducted,
        'net_bank_credit', v_bank_credit
    );
    RETURN v_result;
EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'Payment update failed: %', SQLERRM;
END;
$function$;