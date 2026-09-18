import BillViewerClient from "./BillViewerClient"

export default async function BillPublicPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  return <BillViewerClient id={id} />
}