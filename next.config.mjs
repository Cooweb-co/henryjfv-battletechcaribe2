/** @type {import('next').NextConfig} */
const nextConfig = {
  // better-sqlite3 es un módulo nativo: no debe pasar por el bundler del server.
  serverExternalPackages: ['better-sqlite3'],
}

export default nextConfig
