import PaymentViewerClient from "./PaymentViewerClient"

export default async function PaymentPublicPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  return <PaymentViewerClient id={id} />
}