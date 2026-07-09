import type { Metadata } from "next"
import { RoleProvider } from "@/contexts/RoleContext"
import { ThemeProvider } from "@/contexts/ThemeContext"
import { PlanProvider } from "@/contexts/PlanContext"
import "./globals.css"
import "./theme-utils.css"

export const metadata: Metadata = {
  title: "OneAccounts",
  description: "Accounting Software for Trading, Service & NGO",
  icons: [
    { rel: "icon", url: "/favicon-16.png", sizes: "16x16", type: "image/png" },
    { rel: "icon", url: "/favicon-32.png", sizes: "32x32", type: "image/png" },
    { rel: "apple-touch-icon", url: "/favicon-180.png", sizes: "180x180", type: "image/png" },
    { rel: "icon", url: "/favicon-512.png", sizes: "512x512", type: "image/png" },
  ],
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