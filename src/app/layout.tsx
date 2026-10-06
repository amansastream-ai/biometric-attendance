import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "BioPointage RH • Pointage par Empreinte Digitale & Gestion des Heures",
  description:
    "Application de pointage biométrique du pouce pour entreprises et DRH avec reconnaissance d'empreintes, calcul des heures et transmission automatique des fichiers de présence.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fr" className="dark">
      <body className="bg-slate-950 text-slate-100 antialiased min-h-screen">
        {children}
      </body>
    </html>
  );
}
