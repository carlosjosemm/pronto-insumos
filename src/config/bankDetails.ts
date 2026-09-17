export interface BankDetails {
  bankName: string
  accountType: string
  accountNumber: string
  rut: string
  companyName: string
  email: string
}

/**
 * Official bank transfer credentials for PRONTO Insumos Odontológicos.
 * Configured via Vite environment variables with Chilean dental depot defaults.
 */
export const BANK_DETAILS: BankDetails = {
  bankName: import.meta.env.VITE_BANK_NAME || 'Banco de Chile',
  accountType: import.meta.env.VITE_BANK_ACCOUNT_TYPE || 'Cuenta Corriente',
  accountNumber: import.meta.env.VITE_BANK_ACCOUNT_NUMBER || '849-01284-01',
  rut: import.meta.env.VITE_BANK_RUT || '77.892.410-2',
  companyName: import.meta.env.VITE_BANK_COMPANY_NAME || 'PRONTO INSUMOS ODONTOLÓGICOS SPA',
  email: import.meta.env.VITE_BANK_EMAIL || 'pagos@prontoinsumos.cl'
}
