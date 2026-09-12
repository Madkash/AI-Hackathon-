import "./globals.css";

export const metadata = {
  title: "LocalProof Compliance Console",
  description: "Local software compliance readiness powered by OpenClaw and NVIDIA GB10.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
