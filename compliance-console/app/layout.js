import "./globals.css";

export const metadata = {
  title: "ProofBid Assurance Console",
  description: "Unified local RFP response and compliance readiness console powered by OpenClaw and NVIDIA GB10.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
