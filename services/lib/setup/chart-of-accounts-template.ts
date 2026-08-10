/**
 * Template standar Bagan Akun dan default setup awal.
 *
 * Modul ini diimpor server & client components,
 * jadi TIDAK boleh mengimpor dari "@/prisma/generated/prisma/client".
 * Gunakan string literal untuk nilai mirip enum.
 */

export type AccountTemplate = {
  code: string;
  name: string;
  type: "asset" | "liability" | "equity" | "revenue" | "expense";
  normalBalance: "debit" | "credit";
  isPosting: boolean;
  level: number;
  parentCode: string | null;
};

/**
 * Template Bagan Akun standar untuk seed script dan wizard setup.
 */
export const STANDARD_CHART_OF_ACCOUNTS: AccountTemplate[] = [
  // ASET
  { code: "10000", name: "Aset", type: "asset", normalBalance: "debit", isPosting: false, level: 0, parentCode: null },
  { code: "11000", name: "Aset Lancar", type: "asset", normalBalance: "debit", isPosting: false, level: 1, parentCode: "10000" },
  { code: "11100", name: "Kas dan Setara Kas", type: "asset", normalBalance: "debit", isPosting: true, level: 2, parentCode: "11000" },
  { code: "11110", name: "Bank Operasional", type: "asset", normalBalance: "debit", isPosting: true, level: 2, parentCode: "11000" },
  { code: "11120", name: "Kas Kecil", type: "asset", normalBalance: "debit", isPosting: true, level: 2, parentCode: "11000" },
  { code: "11130", name: "Dompet Digital", type: "asset", normalBalance: "debit", isPosting: true, level: 2, parentCode: "11000" },
  { code: "11200", name: "Piutang Usaha", type: "asset", normalBalance: "debit", isPosting: true, level: 2, parentCode: "11000" },
  { code: "11300", name: "Persediaan", type: "asset", normalBalance: "debit", isPosting: true, level: 2, parentCode: "11000" },
  { code: "11400", name: "PPN Masukan", type: "asset", normalBalance: "debit", isPosting: true, level: 2, parentCode: "11000" },
  { code: "11900", name: "Aset Belum Dikategorikan", type: "asset", normalBalance: "debit", isPosting: true, level: 2, parentCode: "11000" },
  { code: "12000", name: "Aset Tidak Lancar", type: "asset", normalBalance: "debit", isPosting: false, level: 1, parentCode: "10000" },
  { code: "12100", name: "Aset Tetap", type: "asset", normalBalance: "debit", isPosting: true, level: 2, parentCode: "12000" },
  { code: "12200", name: "Akumulasi Penyusutan", type: "asset", normalBalance: "credit", isPosting: true, level: 2, parentCode: "12000" },

  // LIABILITAS
  { code: "20000", name: "Liabilitas", type: "liability", normalBalance: "credit", isPosting: false, level: 0, parentCode: null },
  { code: "21000", name: "Liabilitas Jangka Pendek", type: "liability", normalBalance: "credit", isPosting: false, level: 1, parentCode: "20000" },
  { code: "21100", name: "Utang Usaha", type: "liability", normalBalance: "credit", isPosting: true, level: 2, parentCode: "21000" },
  { code: "21200", name: "PPN Keluaran", type: "liability", normalBalance: "credit", isPosting: true, level: 2, parentCode: "21000" },
  { code: "22000", name: "Liabilitas Jangka Panjang", type: "liability", normalBalance: "credit", isPosting: false, level: 1, parentCode: "20000" },

  // EKUITAS
  { code: "30000", name: "Ekuitas", type: "equity", normalBalance: "credit", isPosting: false, level: 0, parentCode: null },
  { code: "31000", name: "Modal", type: "equity", normalBalance: "credit", isPosting: true, level: 1, parentCode: "30000" },
  { code: "32000", name: "Laba Ditahan", type: "equity", normalBalance: "credit", isPosting: true, level: 1, parentCode: "30000" },
  { code: "33000", name: "Ekuitas Saldo Awal", type: "equity", normalBalance: "credit", isPosting: true, level: 1, parentCode: "30000" },

  // PENDAPATAN
  { code: "40000", name: "Pendapatan", type: "revenue", normalBalance: "credit", isPosting: false, level: 0, parentCode: null },
  { code: "41000", name: "Pendapatan Operasional", type: "revenue", normalBalance: "credit", isPosting: false, level: 1, parentCode: "40000" },
  { code: "41100", name: "Pendapatan Jasa", type: "revenue", normalBalance: "credit", isPosting: true, level: 2, parentCode: "41000" },
  { code: "41200", name: "Penjualan Produk", type: "revenue", normalBalance: "credit", isPosting: true, level: 2, parentCode: "41000" },
  { code: "41300", name: "Pendapatan Konsultasi", type: "revenue", normalBalance: "credit", isPosting: true, level: 2, parentCode: "41000" },
  { code: "42000", name: "Potongan Penjualan", type: "revenue", normalBalance: "debit", isPosting: true, level: 2, parentCode: "40000" },
  { code: "49000", name: "Pendapatan Lain-lain", type: "revenue", normalBalance: "credit", isPosting: true, level: 2, parentCode: "40000" },

  // BEBAN
  { code: "50000", name: "Beban", type: "expense", normalBalance: "debit", isPosting: false, level: 0, parentCode: null },
  { code: "51000", name: "Beban Operasional", type: "expense", normalBalance: "debit", isPosting: false, level: 1, parentCode: "50000" },
  { code: "51100", name: "Beban Sewa", type: "expense", normalBalance: "debit", isPosting: true, level: 2, parentCode: "51000" },
  { code: "51200", name: "Beban Utilitas", type: "expense", normalBalance: "debit", isPosting: true, level: 2, parentCode: "51000" },
  { code: "51300", name: "Beban ATK", type: "expense", normalBalance: "debit", isPosting: true, level: 2, parentCode: "51000" },
  { code: "51400", name: "Beban Gaji dan Upah", type: "expense", normalBalance: "debit", isPosting: true, level: 2, parentCode: "51000" },
  { code: "51500", name: "Beban Langganan Perangkat Lunak", type: "expense", normalBalance: "debit", isPosting: true, level: 2, parentCode: "51000" },
  { code: "51600", name: "Beban Perjalanan Dinas", type: "expense", normalBalance: "debit", isPosting: true, level: 2, parentCode: "51000" },
  { code: "51700", name: "Beban Pemasaran", type: "expense", normalBalance: "debit", isPosting: true, level: 2, parentCode: "51000" },
  { code: "51800", name: "Beban Asuransi", type: "expense", normalBalance: "debit", isPosting: true, level: 2, parentCode: "51000" },
  { code: "51900", name: "Beban Penyusutan", type: "expense", normalBalance: "debit", isPosting: true, level: 2, parentCode: "51000" },
  { code: "52000", name: "Harga Pokok Penjualan", type: "expense", normalBalance: "debit", isPosting: true, level: 2, parentCode: "50000" },
  { code: "59000", name: "Beban Belum Dikategorikan", type: "expense", normalBalance: "debit", isPosting: true, level: 2, parentCode: "50000" },
  { code: "80000", name: "Beban Lain-lain", type: "expense", normalBalance: "debit", isPosting: false, level: 0, parentCode: null },
  { code: "81000", name: "Laba/Rugi Selisih Kurs", type: "expense", normalBalance: "debit", isPosting: true, level: 1, parentCode: "80000" },
];

/**
 * Pemetaan akun default yang direkomendasikan (purpose -> kode akun).
 */
export const RECOMMENDED_DEFAULT_ACCOUNT_MAPPINGS: {
  purpose: string;
  code: string;
}[] = [
  { purpose: "ACCOUNTS_RECEIVABLE", code: "11200" },
  { purpose: "ACCOUNTS_PAYABLE", code: "21100" },
  { purpose: "GOODS_RECEIVED_NOT_INVOICED", code: "21100" },
  { purpose: "INVENTORY_ASSET", code: "11300" },
  { purpose: "COGS", code: "52000" },
  { purpose: "SALES_REVENUE", code: "41200" },
  { purpose: "SALES_DISCOUNT", code: "42000" },
  { purpose: "SALES_TAX_PAYABLE", code: "21200" },
  { purpose: "PURCHASE_TAX_RECEIVABLE", code: "11400" },
  { purpose: "CASH_ON_HAND", code: "11120" },
  { purpose: "BANK", code: "11110" },
  { purpose: "OPENING_BALANCE_EQUITY", code: "33000" },
  { purpose: "RETAINED_EARNINGS", code: "32000" },
  { purpose: "UNCATEGORIZED_EXPENSE", code: "59000" },
  { purpose: "UNCATEGORIZED_INCOME", code: "49000" },
  { purpose: "UNCATEGORIZED_ASSET", code: "11900" },
  { purpose: "EXCHANGE_GAIN_LOSS", code: "81000" },
];

/** Satuan default saat setup awal */
export const DEFAULT_UNITS = [
  { name: "Buah", symbol: "PCS" },
  { name: "Dus", symbol: "BOX" },
  { name: "Kilogram", symbol: "KG" },
];

/** Kategori produk default saat setup awal */
export const DEFAULT_CATEGORIES = [
  { name: "Umum", description: "Produk dan jasa umum" },
];

export const SERVICE_CHART_OF_ACCOUNTS: AccountTemplate[] =
  STANDARD_CHART_OF_ACCOUNTS.map((a) => {
    if (a.code === "11300") return { ...a, name: "Persediaan / Perlengkapan" };
    if (a.code === "52000") return { ...a, name: "Harga Pokok Jasa" };
    return a;
  });

export const RETAIL_CHART_OF_ACCOUNTS: AccountTemplate[] =
  STANDARD_CHART_OF_ACCOUNTS;

export const MANUFACTURING_CHART_OF_ACCOUNTS: AccountTemplate[] =
  STANDARD_CHART_OF_ACCOUNTS.concat([
    {
      code: "11310",
      name: "Bahan Baku",
      type: "asset",
      normalBalance: "debit",
      isPosting: true,
      level: 2,
      parentCode: "11000",
    },
    {
      code: "11320",
      name: "Barang Dalam Proses",
      type: "asset",
      normalBalance: "debit",
      isPosting: true,
      level: 2,
      parentCode: "11000",
    },
    {
      code: "11330",
      name: "Barang Jadi",
      type: "asset",
      normalBalance: "debit",
      isPosting: true,
      level: 2,
      parentCode: "11000",
    },
  ]).sort((a, b) => a.code.localeCompare(b.code));

export const AVAILABLE_TEMPLATES = [
  {
    id: "general",
    name: "Bisnis Umum",
    description: "Bagan akun standar untuk sebagian besar bisnis.",
    getTemplate: () => STANDARD_CHART_OF_ACCOUNTS,
  },
  {
    id: "service",
    name: "Bisnis Jasa",
    description: "Dioptimalkan untuk bisnis jasa tanpa persediaan fisik.",
    getTemplate: () => SERVICE_CHART_OF_ACCOUNTS,
  },
  {
    id: "retail",
    name: "Retail / Perdagangan",
    description: "Termasuk pelacakan persediaan fisik dan HPP.",
    getTemplate: () => RETAIL_CHART_OF_ACCOUNTS,
  },
  {
    id: "manufacturing",
    name: "Manufaktur",
    description:
      "Termasuk bahan baku, barang dalam proses, dan barang jadi.",
    getTemplate: () => MANUFACTURING_CHART_OF_ACCOUNTS,
  },
];
