import InvoiceViewerClient from "./InvoiceViewerClient"

export default async function InvoicePublicPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  return <InvoiceViewerClient id={id} />
}