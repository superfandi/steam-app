import { z } from "zod"

/**
 * Skema validasi form tambah/edit layanan pencucian.
 * price memakai coerce karena input HTML number menghasilkan string.
 */
export const serviceFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(3, "Nama layanan minimal 3 karakter")
    .max(60, "Nama layanan maksimal 60 karakter"),
  vehicle_type: z.enum(["motor", "mobil"], {
    message: "Pilih jenis kendaraan",
  }),
  price: z.coerce
    .number({ message: "Harga tidak valid" })
    .int("Harga harus bilangan bulat rupiah")
    .min(1, "Harga minimal Rp 1")
    .max(100_000_000, "Harga maksimal Rp 100.000.000"),
  description: z
    .string()
    .trim()
    .max(200, "Deskripsi maksimal 200 karakter")
    .optional(),
  is_active: z.boolean(),
})

export type ServiceFormValues = z.infer<typeof serviceFormSchema>

/**
 * Skema validasi form tambah/edit karyawan.
 * commission_percent memakai coerce karena input HTML number menghasilkan string.
 */
export const employeeFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(3, "Nama karyawan minimal 3 karakter")
    .max(60, "Nama karyawan maksimal 60 karakter"),
  phone: z
    .string()
    .trim()
    .max(20, "Nomor telepon maksimal 20 karakter")
    .optional(),
  position: z
    .string()
    .trim()
    .max(40, "Jabatan maksimal 40 karakter")
    .optional(),
  commission_percent: z.coerce
    .number({ message: "Komisi tidak valid" })
    .int("Komisi harus bilangan bulat")
    .min(0, "Komisi minimal 0%")
    .max(100, "Komisi maksimal 100%"),
  is_active: z.boolean(),
})

export type EmployeeFormValues = z.infer<typeof employeeFormSchema>

/**
 * Skema validasi form daftarkan antrian (Fase 12).
 * Semua kolom opsional kecuali jenis kendaraan; nomor WhatsApp
 * divalidasi format ringan (digit, 9–15) — normalisasi final
 * 08xx→62… ditangani database.
 */
export const queueFormSchema = z.object({
  customer_name: z
    .string()
    .trim()
    .max(60, "Nama maksimal 60 karakter")
    .optional(),
  customer_phone: z
    .string()
    .trim()
    .max(20, "Nomor maksimal 20 karakter")
    .refine(
      (value) =>
        value === "" ||
        (value.replace(/\D/g, "").length >= 9 &&
          value.replace(/\D/g, "").length <= 15),
      "Nomor WhatsApp tidak valid. Contoh: 0812xxxxxxx",
    )
    .optional(),
  plate_number: z
    .string()
    .trim()
    .max(12, "Nomor polisi maksimal 12 karakter")
    .optional(),
  vehicle_type: z.enum(["motor", "mobil"], {
    message: "Pilih jenis kendaraan",
  }),
  service_id: z.string().trim().optional(),
  note: z
    .string()
    .trim()
    .max(200, "Catatan maksimal 200 karakter")
    .optional(),
})

export type QueueFormValues = z.infer<typeof queueFormSchema>

/**
 * Skema validasi ganti email akun (menu Pengaturan Akun).
 * Konfirmasi harus sama persis dengan email baru.
 */
export const changeEmailSchema = z
  .object({
    new_email: z.email({ message: "Format email baru tidak valid" }),
    confirm_email: z.email({ message: "Format konfirmasi email tidak valid" }),
  })
  .refine((values) => values.new_email === values.confirm_email, {
    message: "Konfirmasi email tidak cocok",
    path: ["confirm_email"],
  })

export type ChangeEmailFormValues = z.infer<typeof changeEmailSchema>

/**
 * Skema validasi ganti password akun (menu Pengaturan Akun).
 * Minimal 8 karakter — server Supabase dapat menambahkan aturan
 * (angka/simbol) sesuai pengaturan proyek.
 */
export const changePasswordSchema = z
  .object({
    current_password: z.string().min(1, "Password saat ini wajib diisi"),
    new_password: z
      .string()
      .min(8, "Password baru minimal 8 karakter")
      .max(72, "Password baru maksimal 72 karakter"),
    confirm_password: z.string().min(1, "Konfirmasi password wajib diisi"),
  })
  .refine((values) => values.new_password === values.confirm_password, {
    message: "Konfirmasi password tidak cocok",
    path: ["confirm_password"],
  })
  .refine((values) => values.new_password !== values.current_password, {
    message: "Password baru harus berbeda dari password saat ini",
    path: ["new_password"],
  })

export type ChangePasswordFormValues = z.infer<typeof changePasswordSchema>

/**
 * Skema permintaan tautan reset password (dialog "Lupa Password").
 * Email harus berformat valid; keberadaan akun tidak divalidasi di sini
 * (pesan UI selalu netral untuk mencegah penebakan email terdaftar).
 */
export const forgotPasswordSchema = z.object({
  email: z.email({ message: "Format email tidak valid" }),
})

export type ForgotPasswordFormValues = z.infer<typeof forgotPasswordSchema>

/**
 * Skema password baru dari tautan recovery (halaman /reset-password).
 * Tidak ada field password lama — sesi recovery sudah membuktikan
 * kepemilikan email.
 */
export const resetPasswordSchema = z
  .object({
    new_password: z
      .string()
      .min(8, "Password baru minimal 8 karakter")
      .max(72, "Password baru maksimal 72 karakter"),
    confirm_password: z.string().min(1, "Konfirmasi password wajib diisi"),
  })
  .refine((values) => values.new_password === values.confirm_password, {
    message: "Konfirmasi password tidak cocok",
    path: ["confirm_password"],
  })

export type ResetPasswordFormValues = z.infer<typeof resetPasswordSchema>
