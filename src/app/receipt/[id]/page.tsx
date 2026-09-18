import ReceiptViewerClient from "./ReceiptViewerClient"

export default async function ReceiptPublicPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  return <ReceiptViewerClient id={id} />
}