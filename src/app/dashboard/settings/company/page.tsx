  const handleSave = async () => {
    setSaving(true)
    setMessage("")

    let newLogoUrl = settings.logo_url

    // Upload new logo if provided
    if (logoFile) {
      const fileExt = logoFile.name.split(".").pop()
      const fileName = `logo-${Date.now()}.${fileExt}`
      const { error: uploadError } = await supabase.storage
        .from("logos")
        .upload(fileName, logoFile, { upsert: true, contentType: logoFile.type })

      if (uploadError) {
        setMessage("Failed to upload logo.")
        setSaving(false)
        return
      }

      const { data: publicUrlData } = supabase.storage.from("logos").getPublicUrl(fileName)
      newLogoUrl = publicUrlData?.publicUrl || ""
    }

    // Step 1 – Try to update an existing row for this company
    const { data: updated, error: updateError } = await supabase
      .from("company_settings")
      .update({
        business_name: settings.business_name,
        tagline: settings.tagline,
        address: settings.address,
        phone: settings.phone,
        email: settings.email,
        logo_url: newLogoUrl,
        updated_at: new Date().toISOString(),
      })
      .eq("company_id", companyId)
      .select()           // ← needed to check affected rows

    // If the update found no row, insert a new one
    if (!updated || updated.length === 0) {
      const { error: insertError } = await supabase
        .from("company_settings")
        .insert({
          company_id: companyId,
          business_name: settings.business_name,
          tagline: settings.tagline,
          address: settings.address,
          phone: settings.phone,
          email: settings.email,
          logo_url: newLogoUrl,
          updated_at: new Date().toISOString(),
        })

      if (insertError) {
        setMessage("Error saving settings: " + insertError.message)
        setSaving(false)
        return
      }
    } else if (updateError) {
      setMessage("Error saving settings: " + updateError.message)
      setSaving(false)
      return
    }

    // Update the company name in the companies table as well
    await supabase
      .from("companies")
      .update({ name: settings.business_name })
      .eq("id", companyId)

    setMessage("✅ Settings saved! Refreshing page…")
    setSettings(prev => ({ ...prev, logo_url: newLogoUrl }))
    setLogoFile(null)

    // Reload so sidebar/dashboard reflect the new name
    setTimeout(() => {
      window.location.reload()
    }, 1500)
    setSaving(false)
  }