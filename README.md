# 🤖 Auto Order Telegram Bot

Bot Telegram untuk auto order produk digital dengan pembayaran QRIS dan Saldo. Dilengkapi panel admin, manajemen stok, dan fitur lengkap.

---

## 📋 Fitur

- **User**: Lihat produk, pesan, bayar QRIS/Saldo, cek saldo, topup, riwayat transaksi, best seller
- **Admin**: Tambah/hapus produk, tambah stok, set harga, broadcast, statistik
- **Pembayaran**: QRIS otomatis dengan polling status, Saldo langsung
- **Stok**: Auto deliver setelah pembayaran terkonfirmasi
- **Testimoni**: Rating 1-5 bintang setelah order selesai

---

## 🚀 Instalasi & Menjalankan

### 1. Clone & Install
```bash
git clone <repo-url>
cd telegram-bot-auto-order
npm install
```

### 2. Konfigurasi ENV
Buat file `.env` di root project:
```env
BOT_TOKEN=your_telegram_bot_token
ADMIN_IDS=123456789,987654321
APIKEY=your_api_key
USERNAME_API=your_username
TOKEN_API=your_token
DB_PATH=./data/db.json
TIMEZONE=Asia/Jakarta
CHANNEL_ID=          # opsional, untuk post testimoni
```

### 3. Jalankan Bot
```bash
# Production
npm start

# Development (auto-restart)
npm run dev
```

---

## 🔑 Environment Variables

| Variable       | Wajib | Keterangan                                              |
|----------------|-------|---------------------------------------------------------|
| `BOT_TOKEN`    | ✅    | Token bot dari @BotFather                              |
| `ADMIN_IDS`    | ✅    | ID Telegram admin (pisah koma), misal: `123,456`       |
| `APIKEY`       | ✅    | API Key dari api.komputerz.site                        |
| `USERNAME_API` | ✅    | Username akun API                                      |
| `TOKEN_API`    | ✅    | Token API                                              |
| `DB_PATH`      | ❌    | Path file database JSON (default: `./data/db.json`)    |
| `TIMEZONE`     | ❌    | Timezone display (default: `Asia/Jakarta`)             |
| `CHANNEL_ID`   | ❌    | ID channel Telegram untuk posting testimoni            |

---

## 👤 Perintah User

| Perintah / Tombol         | Keterangan                          |
|---------------------------|-------------------------------------|
| `/start`                  | Mulai bot, lihat info & menu utama  |
| `/stok`                   | Lihat daftar produk                 |
| `🛍️ List Produk`          | Daftar kategori & produk            |
| `💰 Saldo`                | Cek saldo & top up                  |
| `📋 Riwayat Transaksi`    | 5 transaksi terakhir                |
| `🏆 Best Seller`          | Ranking produk terlaris             |
| `❓ How To Order`         | Panduan cara memesan                |

---

## 🔧 Perintah Admin

Admin diakses via `/admin` (hanya user dengan ID di `ADMIN_IDS`):

| Tombol / Aksi              | Keterangan                                      |
|----------------------------|-------------------------------------------------|
| `➕ Tambah Produk`         | Wizard tambah produk baru + kategori            |
| `🗑️ Hapus Produk`          | Soft delete produk (isActive = false)           |
| `📦 Tambah Stok`           | Input stok baru (satu item per baris)           |
| `✏️ Set Harga`              | Ubah harga produk                               |
| `📢 Broadcast`             | Kirim pesan ke semua user                       |
| `📊 Statistik`             | Statistik bot (user, terjual, revenue, dll)     |

---

## 💳 Alur Pembayaran

### QRIS
1. User pilih produk & qty
2. Tekan **💳 QRIS**
3. Bot buat order & panggil API `createpayment`
4. Bot tampilkan QR Code & instruksi
5. Bot polling `mutasiqr` setiap ~15 detik
6. Jika mutasi cocok dengan nominal → stok dikirim otomatis
7. Jika 10 menit belum bayar → order expired

### Saldo
1. User pilih produk & qty
2. Tekan **💰 Saldo**
3. Bot cek saldo cukup → potong saldo → kirim stok otomatis

---

## 📡 Mutasi Matching

Bot mengecek mutasi QRIS via endpoint:
```
GET https://api.komputerz.site/?action=mutasiqr&apikey={apikey}&username={username}&token={token}
```

**Logika verifikasi:**
- Cari mutasi dengan `amount >= totalAmount`
- Cek `mutationId` belum digunakan sebelumnya (anti double-claim)
- Jika cocok → tandai `mutationId` sebagai used, kirim stok

---

## 📁 Struktur Proyek

```
/src
  /config      - Konfigurasi ENV
  /db          - Database JSON (atomic write + mutex)
  /services    - Payment, Order, Broadcast, Stats
  /keyboards   - Keyboard markup (Reply & Inline)
  /handlers    - Handler user dan admin
  /utils       - Format, Validator, Logger
  bot.js       - Setup Telegraf & routing
index.js       - Entry point
data/db.json   - Database JSON
```

---

## 📝 Format Stok

Stok disimpan sebagai array string. Contoh format (pisahkan dengan `|`):
```
email@gmail.com|password123
user2@gmail.com|pass456
```

Saat order berhasil, bot akan `shift` N item dari array stok dan mengirimnya ke user.

---

## 🛡️ Keamanan

- Admin ID diambil dari ENV (tidak hardcoded)
- Atomic write menggunakan temp file + rename
- Mutex sederhana untuk cegah race condition
- Validasi input di semua wizard
- Anti double-claim mutation ID

---

## 📄 Lisensi

MIT License
