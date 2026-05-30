import type { Metadata } from "next"
import { RoleProvider } from "@/contexts/RoleContext"
import { ThemeProvider } from "@/contexts/ThemeContext"
import { PlanProvider } from "@/contexts/PlanContext"
import "./globals.css"
import "./theme-utils.css"

const FAVICON_URI = "PASTE_YOUR_BASE64_STRING_HERE"

export const metadata: Metadata = {
  title: "OneAccounts",
  description: "Accounting Software for Trading, Service & NGO",
  icons: {
    icon: FAVICON_URI,
  },
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
            <PlanProvider>
              {children}
            </PlanProvider>
          </RoleProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}