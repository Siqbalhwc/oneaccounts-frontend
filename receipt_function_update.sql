CREATE OR REPLACE FUNCTION public.create_receipt_transaction(p_company_id uuid, p_party_id integer, p_receipt_date date, p_amount numeric, p_bank_account_id integer, p_income_account_id integer DEFAULT NULL::integer, p_reference text DEFAULT NULL::text, p_notes text DEFAULT NULL::text, p_allocations jsonb DEFAULT '[]'::jsonb, p_user_email text DEFAULT 'system'::text, p_is_donation boolean DEFAULT false, p_opening_allocation numeric DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_receipt_id INTEGER;
    v_receipt_no TEXT;
    v_seq INTEGER;
    v_allocation JSONB;
    v_invoice_id INTEGER;
    v_alloc_amount NUMERIC;
    v_invoice_total NUMERIC;
    v_invoice_paid NUMERIC;
    v_total_allocated NUMERIC := 0;
    v_ar_account_id INTEGER;
    v_bank_gl_account_id INTEGER;
    v_je_id INTEGER;
    v_debit_lines JSONB[];
    v_credit_lines JSONB[];
    v_result JSONB;
    v_error_message TEXT;
BEGIN
    SELECT next_receipt_no(p_company_id) INTO v_seq;
    v_receipt_no := 'REC/' || TO_CHAR(p_receipt_date, 'YYYYMM') || '/' || LPAD(v_seq::text, 4, '0');

    INSERT INTO receipts (
        receipt_no, company_id, party_id, date, amount,
        bank_account_id, income_account_id, reference, notes,
        created_by, updated_by, status
    ) VALUES (
        v_receipt_no, p_company_id, p_party_id, p_receipt_date, p_amount,
        p_bank_account_id, p_income_account_id, p_reference, p_notes,
        p_user_email, p_user_email, 'posted'
    ) RETURNING id INTO v_receipt_id;

    IF NOT p_is_donation AND p_party_id IS NOT NULL THEN
        FOR v_allocation IN SELECT * FROM jsonb_array_elements(p_allocations)
        LOOP
            v_invoice_id := (v_allocation->>'invoice_id')::INTEGER;
            v_alloc_amount := (v_allocation->>'amount')::NUMERIC;

            IF v_alloc_amount > 0 AND v_invoice_id IS NOT NULL THEN
                v_total_allocated := v_total_allocated + v_alloc_amount;

                INSERT INTO receipt_allocations (receipt_id, invoice_id, amount)
                VALUES (v_receipt_id, v_invoice_id, v_alloc_amount);

                SELECT total, paid INTO v_invoice_total, v_invoice_paid
                FROM invoices
                WHERE id = v_invoice_id AND company_id = p_company_id;

                v_invoice_paid := COALESCE(v_invoice_paid, 0) + v_alloc_amount;

                UPDATE invoices
                SET paid = v_invoice_paid,
                    status = CASE
                        WHEN v_invoice_total - v_invoice_paid <= 0 THEN 'Paid'
                        WHEN v_invoice_paid > 0 THEN 'Partial'
                        ELSE 'Unpaid'
                    END
                WHERE id = v_invoice_id AND company_id = p_company_id;
            END IF;
        END LOOP;
    END IF;

    IF NOT p_is_donation AND p_party_id IS NOT NULL AND p_opening_allocation > 0 THEN
        INSERT INTO customer_opening_allocations (receipt_id, customer_id, company_id, amount)
        VALUES (v_receipt_id, p_party_id, p_company_id, p_opening_allocation);
        v_total_allocated := v_total_allocated + p_opening_allocation;
    END IF;

    IF NOT p_is_donation AND p_party_id IS NOT NULL THEN
        UPDATE customers
        SET balance = COALESCE(balance, 0) - p_amount
        WHERE id = p_party_id AND company_id = p_company_id;
    END IF;

    SELECT account_id INTO v_bank_gl_account_id
    FROM bank_accounts
    WHERE id = p_bank_account_id AND company_id = p_company_id;
    IF v_bank_gl_account_id IS NULL THEN
        RAISE EXCEPTION 'Bank account ID % not found', p_bank_account_id;
    END IF;

    SELECT id INTO v_ar_account_id FROM accounts
    WHERE code = '1100' AND company_id = p_company_id;
    IF v_ar_account_id IS NULL THEN
        RAISE EXCEPTION 'AR account (1100) not found';
    END IF;

    v_debit_lines := array_append(v_debit_lines, jsonb_build_object(
        'account_id', v_bank_gl_account_id, 'debit', p_amount, 'credit', 0,
        'location_id', NULL, 'activity_id', NULL, 'project_id', NULL, 'donor_id', NULL
    ));

    IF p_is_donation THEN
        IF p_income_account_id IS NOT NULL THEN
            v_credit_lines := array_append(v_credit_lines, jsonb_build_object(
                'account_id', p_income_account_id, 'debit', 0, 'credit', p_amount,
                'location_id', NULL, 'activity_id', NULL, 'project_id', NULL, 'donor_id', NULL
            ));
        END IF;
    ELSE
        v_credit_lines := array_append(v_credit_lines, jsonb_build_object(
            'account_id', v_ar_account_id, 'debit', 0, 'credit', p_amount,
            'location_id', NULL, 'activity_id', NULL, 'project_id', NULL, 'donor_id', NULL
        ));
    END IF;

    INSERT INTO journal_entries (
        company_id, entry_no, date, description
    ) VALUES (
        p_company_id,
        'JE-REC-' || v_receipt_no,
        p_receipt_date,
        'Receipt ' || v_receipt_no
    ) RETURNING id INTO v_je_id;

    INSERT INTO journal_lines (
        entry_id, company_id, account_id, debit, credit,
        location_id, activity_id, project_id, donor_id,
        source_type, source_id
    )
    SELECT
        v_je_id, p_company_id,
        (line->>'account_id')::INTEGER,
        (line->>'debit')::NUMERIC,
        (line->>'credit')::NUMERIC,
        NULL, NULL, NULL, NULL,
        'receipt', v_receipt_id
    FROM unnest(v_debit_lines) AS line;

    INSERT INTO journal_lines (
        entry_id, company_id, account_id, debit, credit,
        location_id, activity_id, project_id, donor_id,
        source_type, source_id
    )
    SELECT
        v_je_id, p_company_id,
        (line->>'account_id')::INTEGER,
        (line->>'debit')::NUMERIC,
        (line->>'credit')::NUMERIC,
        NULL, NULL, NULL, NULL,
        'receipt', v_receipt_id
    FROM unnest(v_credit_lines) AS line;

    WITH balance_updates AS (
        SELECT account_id, SUM(debit - credit) AS delta
        FROM journal_lines
        WHERE entry_id = v_je_id
        GROUP BY account_id
    )
    UPDATE accounts
    SET balance = COALESCE(balance, 0) + delta
    FROM balance_updates
    WHERE accounts.id = balance_updates.account_id
      AND accounts.company_id = p_company_id;

    v_result := jsonb_build_object(
        'success', true,
        'receipt_id', v_receipt_id,
        'receipt_no', v_receipt_no,
        'journal_entry_id', v_je_id,
        'total_allocated', v_total_allocated,
        'advance_amount', p_amount - v_total_allocated
    );

    RETURN v_result;

EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_error_message = MESSAGE_TEXT;
    RAISE EXCEPTION 'Failed to create receipt: %', v_error_message;
END;
$function$;