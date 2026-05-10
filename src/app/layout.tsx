import { RoleProvider } from "@/contexts/RoleContext"

export default function RootLayout({ children }: { children: React.ReactNode }) {
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