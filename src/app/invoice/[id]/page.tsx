import InvoiceViewerClient from "./InvoiceViewerClient"

export default function InvoicePublicPage({
  params,
}: {
  params: { id: string }
}) {
  return <InvoiceViewerClient id={params.id} />
}