import type { Metadata } from "next"
import { RoleProvider } from "@/contexts/RoleContext"
import "./globals.css"

export const metadata: Metadata = {
  title: "OneAccounts",
  description: "Accounting Software for Trading, Service & NGO",
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>
        <RoleProvider>
          {children}
        </RoleProvider>
      </body>
    </html>
  )
}