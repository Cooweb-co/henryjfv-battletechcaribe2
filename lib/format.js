export const CURRENCY = process.env.FINBOT_CURRENCY ?? 'COP'

/** Formato de moneda compartido por el bot, las gráficas y los insights. */
export const money = (n) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: CURRENCY, maximumFractionDigits: 0 }).format(n ?? 0)
