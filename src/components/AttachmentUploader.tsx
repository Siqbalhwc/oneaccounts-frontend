"use client"

import { useState, useEffect } from 'react'
import { createBrowserClient } from '@supabase/ssr'
import { Trash2, Upload, FileText, Image } from 'lucide-react'

interface Attachment {
  id: number
  file_name: string
  file_url: string
  file_size: number
  mime_type: string
}

export default function AttachmentUploader({
  sourceType,
  sourceId,
  companyId,
}: {
  sourceType: string
  sourceId: number | null
  companyId: string
}) {
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [uploading, setUploading] = useState(false)
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const fetchAttachments = async () => {
    if (!sourceId) return
    const { data } = await supabase
      .from('attachments')
      .select('*')
      .eq('source_type', sourceType)
      .eq('source_id', sourceId)
    setAttachments(data || [])
  }

  useEffect(() => {
    fetchAttachments()
  }, [sourceId])

  const uploadFile = async (file: File) => {
    if (!sourceId) {
      alert('Please save the record first, then upload attachments.')
      return
    }

    setUploading(true)
    const fileExt = file.name.split('.').pop()
    const fileName = `${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`
    const storagePath = `${companyId}/${sourceType}/${sourceId}/${fileName}`

    const { error: uploadError } = await supabase.storage
      .from('attachments')
      .upload(storagePath, file)

    if (uploadError) {
      alert('Upload failed: ' + uploadError.message)
      setUploading(false)
      return
    }

    const { data: urlData } = supabase.storage
      .from('attachments')
      .getPublicUrl(storagePath)

    const { error: dbError } = await supabase
      .from('attachments')
      .insert({
        company_id: companyId,
        source_type: sourceType,
        source_id: sourceId,
        file_name: file.name,
        file_url: urlData.publicUrl,
        file_size: file.size,
        mime_type: file.type,
        uploaded_by: (await supabase.auth.getUser()).data.user?.email,
      })

    if (dbError) {
      alert('Failed to save attachment record: ' + dbError.message)
    } else {
      fetchAttachments()
    }
    setUploading(false)
  }

  const deleteAttachment = async (id: number, fileUrl: string) => {
    const pathParts = fileUrl.split('/')
    const storagePath = pathParts.slice(-3).join('/')
    await supabase.storage.from('attachments').remove([storagePath])
    await supabase.from('attachments').delete().eq('id', id)
    fetchAttachments()
  }

  return (
    <div style={{ marginTop: 16 }}>
      <label className="pay-label">Attachments</label>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        <input
          type="file"
          onChange={(e) => {
            if (e.target.files?.[0]) uploadFile(e.target.files[0])
          }}
          disabled={uploading || !sourceId}
          style={{ display: 'none' }}
          id={`attachment-upload-${sourceType}`}
        />
        <label htmlFor={`attachment-upload-${sourceType}`} className="pay-btn" style={{ cursor: 'pointer' }}>
          <Upload size={14} /> {uploading ? 'Uploading...' : 'Add Attachment'}
        </label>
      </div>
      {attachments.length > 0 && (
        <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 8 }}>
          {attachments.map((att) => (
            <div key={att.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
              <a href={att.file_url} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--primary)' }}>
                {att.mime_type?.startsWith('image/') ? <Image size={14} /> : <FileText size={14} />}
                <span style={{ fontSize: 13 }}>{att.file_name}</span>
              </a>
              <button className="pay-btn" onClick={() => deleteAttachment(att.id, att.file_url)} style={{ padding: 4 }}>
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}