import './globals.css'

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
