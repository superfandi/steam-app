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
