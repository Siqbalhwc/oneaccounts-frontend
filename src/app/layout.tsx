import type { Metadata } from "next"
import { RoleProvider } from "@/contexts/RoleContext"
import { ThemeProvider } from "@/contexts/ThemeContext"
import "./globals.css"
import "./theme-utils.css"

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
    <html lang="en" suppressHydrationWarning>
      <body>
        <ThemeProvider>
          <RoleProvider>
            {children}
          </RoleProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}