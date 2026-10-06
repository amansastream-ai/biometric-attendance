import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Autorise les domaines de prévisualisation distants (tunnels, environnements
  // de test) à charger les ressources du serveur de développement.
  // N'a aucun effet en production.
  allowedDevOrigins: ["*.e2b.app", "*.e2b.dev", "*.vercel.app"],
};

export default nextConfig;
