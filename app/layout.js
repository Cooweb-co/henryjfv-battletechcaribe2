import './globals.css'

// La barra del navegador en móvil sigue el color de la app, no el del sistema.
export const viewport = {
  themeColor: '#0f1115',
  colorScheme: 'dark',
}

export const metadata = {
  title: 'FinBot · Tu asesor financiero personal',
  description: 'Registra gastos conversando y entiende tu comportamiento con gráficas.',
}

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  )
}
