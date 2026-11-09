import "./globals.css";

export const metadata = {
  title: "Plant watch",
  description: "Read-only view of Deye Cloud plants.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
