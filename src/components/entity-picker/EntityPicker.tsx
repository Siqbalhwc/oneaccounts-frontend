  const handleSave = async () => {
    if (!validateForm() || !config) return

    setIsSaving(true)
    setSaveError(null)

    try {
      const payload: any = { company_id: companyId }
      config.quickCreate.fields.forEach((f) => {
        if (f.name === 'country_code') return
        if (formValues[f.name] !== undefined) {
          payload[f.name] = formValues[f.name]
        }
      })

      // Combine country_code + phone for customer/supplier
      if (formValues.country_code && formValues.phone) {
        payload.phone = (formValues.country_code || '') + (formValues.phone || '')
      }

      let newRecord: any = null

      // ----- PRODUCT QUICK CREATE (via Supabase) -----
      if (entityType === 'product') {
        // Generate next product code (PROD-xxx)
        let nextCode = 'PROD-001'
        const { data: codes } = await supabase
          .from('products')
          .select('code')
          .eq('company_id', companyId)
          .ilike('code', 'PROD-%')
          .order('code', { ascending: false })
          .limit(1)

        if (codes && codes.length > 0) {
          const match = codes[0].code?.match(/PROD-(\d+)/)
          if (match) {
            const num = parseInt(match[1], 10) + 1
            nextCode = `PROD-${String(num).padStart(3, '0')}`
          }
        }

        const productPayload = {
          company_id: companyId,
          code: nextCode,
          name: payload.name || '',
          sale_price: parseFloat(payload.sale_price || 0),
          cost_price: parseFloat(payload.cost_price || 0),
          opening_qty: 0,
          qty_on_hand: 0,
          image_path: null,
        }

        const { data: inserted, error: insertErr } = await supabase
          .from('products')
          .insert(productPayload)
          .select('*')
          .single()

        if (insertErr) throw new Error(insertErr.message)
        newRecord = inserted
      }
      // ----- CUSTOMER / SUPPLIER / OTHER via API -----
      else {
        const res = await fetch(config.apiBase, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(payload),
        })

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}))
          throw new Error(errData.error || 'Failed to create record')
        }

        const data = await res.json()
        newRecord = data.customer || data.supplier || data.product || data
      }

      setAllRecords((prev) => [newRecord, ...prev])
      onChange(newRecord)
      setIsModalOpen(false)
    } catch (err: any) {
      setSaveError(err.message || 'Failed to create record. Please try again.')
    } finally {
      setIsSaving(false)
    }
  }