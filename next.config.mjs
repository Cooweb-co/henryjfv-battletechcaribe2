/** @type {import('next').NextConfig} */
const nextConfig = {
  // @libsql/client habla HTTP y no arrastra binarios nativos, así que no hace
  // falta excluir nada del bundler del server.
}

export default nextConfig
