/** @type {import('next').NextConfig} */
const nextConfig = {
  // @libsql/client carga bindings nativos para el modo file:. Si pasa por el
  // bundler del server, compila pero revienta en runtime con 500 (en dev no se
  // nota: dev no bundlea igual). Debe quedar fuera.
  serverExternalPackages: ['@libsql/client', 'libsql'],
}

export default nextConfig
