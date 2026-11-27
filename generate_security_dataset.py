"""Generator dataset sintetis untuk klasifikasi ancaman grup WhatsApp.

Kelas:
    safe | spam | phishing | social_engineering

Jalankan dari root proyek:
    python generate_security_dataset.py

Output:
    data/security_dataset.csv          (4.000 baris training, 1.000 per kelas)
    data/security_test_synthetic.csv   (1.000 baris uji sintetis, 250 per kelas)
    data/security_test_manual.csv      (65 baris uji manual, termasuk hard-negative)

Uji sintetis memakai template yang DITAHAN (tidak dipakai saat training)
agar evaluasi tidak sekadar menghafal template. Uji manual berisi kalimat
yang ditulis terpisah, termasuk hard-negative yang mengandung kata sensitif
tetapi konteksnya aman.

Catatan: dataset ini sintetis dan dibuat dari template + kombinasi slot.
Cocok untuk prototipe UAS; keterbatasannya harus ditulis di laporan.
"""

import csv
import random
from pathlib import Path

SEED = 42
N_PER_CLASS = 1000
HOLDOUT_PER_CLASS = 250
random.seed(SEED)

OUT_DIR = Path("data")
OUT_DIR.mkdir(exist_ok=True)

NAMES = [
    "Budi", "Sari", "Rina", "Andi", "Dita", "Fajar", "Nadia", "Rizky",
    "Ayu", "Dimas", "Putri", "Hendra", "Maya", "Yoga", "Intan", "Bayu",
]
COURSES = [
    "Algoritma", "Basis Data", "Jaringan Komputer", "Kecerdasan Buatan",
    "Keamanan Informasi", "Sistem Operasi", "Pemrograman Web",
    "Struktur Data", "Statistika", "Rekayasa Perangkat Lunak",
]
ROOMS = ["A101", "B202", "C303", "Lab Jaringan", "Lab AI", "Ruang 3.2", "Ruang 4.1", "Auditorium"]
TIMES = ["08.00", "09.30", "10.00", "13.00", "15.30", "16.00", "19.00"]
DATES = ["Senin", "Selasa", "Rabu", "Kamis", "Jumat", "besok", "lusa", "25 November", "akhir bulan"]
AMOUNTS = ["50.000", "75.000", "100.000", "150.000", "250.000", "500.000", "1.000.000", "2.500.000", "5.000.000"]
PERCENTS = ["10", "20", "30", "50", "70", "80"]
BANKS = ["BCA", "BRI", "BNI", "Mandiri", "DANA", "OVO", "GoPay", "ShopeePay"]
ACCOUNTS = ["1234567890", "9876543210", "1122334455", "5566778899", "081234567890"]
PHONES = ["081234567890", "085712345678", "089612345678", "082198765432"]
PRIZES = ["iPhone 15", "motor Honda", "uang tunai 5 juta", "voucher 1 juta", "emas 10 gram", "laptop gaming"]
PRODUCTS = ["kuota 10GB", "sepatu sneakers", "tas branded", "HP second", "jam tangan", "power bank", "aksesoris kamera"]
BRANDS = ["Slot88", "Gacor777", "Maxwin", "Joker123", "Pragmatic Play", "Togel Nusantara"]
CAMPUSES = ["ui.ac.id", "ugm.ac.id", "itb.ac.id", "unpad.ac.id", "unhas.ac.id", "undip.ac.id"]
ORGS = ["BEM", "Himpunan Mahasiswa", "UKM Robotika", "UKM Musik", "Senat Mahasiswa"]
COMPANIES = ["PT Teknologi Nusantara", "Startup EduTech", "Bank Digital", "Perusahaan Logistik"]
PLACES = ["Bandung", "Yogyakarta", "Jakarta", "Bali", "Malang"]
PRAYERS = ["Subuh", "Dzuhur", "Ashar", "Maghrib", "Isya"]
GBS = ["5", "10", "20", "50", "100"]
BONUSES = ["10", "20", "50", "100"]
REASONS = ["biaya administrasi", "biaya publikasi", "iuran kegiatan", "biaya study tour", "biaya wisuda", "donasi bencana"]
MARKETPLACES = ["Shopee", "Tokopedia", "Lazada", "Bukalapak", "TikTok Shop"]
N = [str(i) for i in range(1, 15)]

SAFE_LINKS = [
    "https://chat.whatsapp.com/AbCdEf123456",
    "https://forms.gle/xYz123AbC",
    "https://drive.google.com/file/d/1AbCdEfGhIj/view",
    "https://www.ui.ac.id/beasiswa",
    "https://www.ugm.ac.id/id/berita",
    "https://www.bca.co.id/id/informasi",
    "https://www.tokopedia.com/",
    "https://www.instagram.com/kampus/",
]

SHORTENERS = ["bit.ly", "tinyurl.com", "s.id", "cutt.ly", "rb.gy", "shorturl.at"]
SUSPICIOUS_TLDS = ["xyz", "top", "click", "link", "online", "site", "shop", "icu", "buzz", "rest", "cf", "tk", "ml", "ga", "gq"]
PHISH_BRANDS = ["bca", "bri", "bni", "mandiri", "dana", "ovo", "gopay", "shopee", "tokopedia", "whatsapp", "instagram"]
PHISH_PATHS = ["login", "verifikasi", "verify", "akun", "confirm", "reset-password", "klaim-hadiah", "pembayaran", "otp", "secure"]


def make_phish_link() -> str:
    pattern = random.choice(["short", "ip", "lookalike", "subdomain", "punycode", "long"])
    path = random.choice(PHISH_PATHS)
    tld = random.choice(SUSPICIOUS_TLDS)
    brand = random.choice(PHISH_BRANDS)
    if pattern == "short":
        return f"https://{random.choice(SHORTENERS)}/{random.choice(['aB3xY', 'Kl9mN', 'Qw2eR', 'Zx8cV'])}"
    if pattern == "ip":
        ip = ".".join(str(random.randint(11, 220)) for _ in range(4))
        return f"http://{ip}/{path}"
    if pattern == "lookalike":
        return f"https://{brand}-{random.choice(['verifikasi', 'secure', 'login', 'hadiah'])}.{tld}/{path}"
    if pattern == "subdomain":
        return f"https://{brand}.co.id.{random.choice(['login', 'verify', 'secure'])}.{tld}/{path}"
    if pattern == "punycode":
        return f"https://xn--{brand}-9na.{tld}/{path}"
    return f"https://{brand}-{random.choice(['akun', 'layanan', 'konfirmasi'])}.{tld}/{path}?token={random.randint(100000, 999999)}"


SAFE_TEMPLATES = [
    "Assalamualaikum semua, besok kuliah {course} jam {time} di {room} ya.",
    "Tugas {course} sudah diupload di {safe_link}, deadline {date}.",
    "Ada yang bisa bantu jelaskan materi {course} pertemuan {n}?",
    "Jadwal shalat {prayer} hari ini jam {time}, jangan lupa.",
    "Rapat organisasi {org} {date} jam {time} di {room}.",
    "Link zoom kelas {course}: {safe_link}",
    "Selamat pagi semua, semangat kuliah hari ini!",
    "Maaf mengganggu, apakah ada yang punya kontak dosen {course}?",
    "Info beasiswa: https://www.{campus}/beasiswa, deadline {date}.",
    "File materi sudah saya share di drive: {safe_link}",
    "Yang sudah bayar UKT semester ini tolong konfirmasi ke admin.",
    "Besok libur, tidak ada kelas. Tetap jaga kesehatan.",
    "Siapa yang mau ikut study tour ke {place}? Isi form {safe_link}.",
    "Jangan lupa bawa laptop untuk praktikum {course} besok.",
    "Selamat ulang tahun {name}, semoga sukses!",
    "Grup ini untuk diskusi mata kuliah {course}, mohon jaga etika.",
    "Nomor admin grup: {phone}, hubungi kalau ada kendala.",
    "Jadwal ujian {course} tanggal {date} jam {time} di {room}.",
    "Terima kasih atas presentasi kelompok {n} hari ini.",
    "Ada info lowongan magang di {company}, detail di {safe_link}.",
    "Mohon maaf lahir dan batin, selamat Idul Fitri.",
    "Hari ini hujan, bawa payung ya.",
    "Nilai {course} sudah keluar, cek di portal kampus.",
    "Diskusi kelompok {n} kita lanjut jam {time} ya.",
    "Ada yang punya charger laptop? Pinjam sebentar.",
    "Selamat datang mahasiswa baru, silakan perkenalan.",
    "Pengingat: bayar kas kelas sebelum {date}.",
    "Kelas {course} dipindah ke {room}.",
    "Terima kasih sudah hadir, notulen rapat ada di {safe_link}.",
    "Jangan lupa shalat {prayer} dulu sebelum lanjut.",
    "Saya share link jurnal di {safe_link}, silakan dibaca.",
    "Besok ada dosen tamu dari {company}, masuk jam {time}.",
    "Mohon isi survei kepuasan mahasiswa di {safe_link}.",
    "Ada yang tahu jadwal bus kampus?",
    "Selamat malam semua, istirahat yang cukup.",
    "Materi {course} minggu ini ada di {safe_link}.",
    "Kita diskusi project akhir {course} jam {time} di {room}.",
    "Terima kasih {name} sudah membantu presentasi.",
    "Info: pendaftaran KRS dibuka {date}.",
    "Yang belum mengumpulkan laporan kelompok {n} segera dikumpulkan.",
]

SPAM_TEMPLATES = [
    "PROMO SPESIAL! {product} hanya Rp{amount}, buruan order sekarang! WA {phone}",
    "JUDI ONLINE {brand} BONUS {bonus}%! Daftar di {spam_link} menang besar!",
    "PINJAMAN ONLINE CAIR Rp{amount} TANPA JAMINAN! Klik {spam_link}",
    "Kuota murah {gb} GB cuma Rp{amount}, minat DM {phone}",
    "Sebarkan pesan ini ke {n} grup dan dapatkan hadiah {prize}! {spam_link}",
    "Diskon {percent}% semua produk! Cek katalog di {spam_link}",
    "Dapatkan {prize} GRATIS! Klik {spam_link} sekarang!",
    "Jasa followers murah, 1000 follower hanya Rp{amount}. WA {phone}",
    "OPEN ORDER {product}! Ready stock, kirim ke seluruh Indonesia. DM {phone}",
    "Slot gacor hari ini! Maxwin Rp{amount}! Daftar {spam_link}",
    "Promo akhir bulan! Beli 1 gratis 1. Hubungi {phone}",
    "Investasi crypto profit {percent}% per hari! Join {spam_link}",
    "Lowongan kerja online gaji Rp{amount}/hari, daftar {spam_link}",
    "Klik link ini untuk klaim voucher belanja Rp{amount}: {spam_link}",
    "Ayo gabung grup jual beli murah! {safe_link}",
    "PROMO!!! PROMO!!! PROMO!!! {product} MURAH!!!",
    "Hanya hari ini! {product} diskon {percent}%. Order sekarang!",
    "Dapatkan bonus Rp{amount} untuk pendaftaran hari ini. {spam_link}",
    "Follow dan subscribe channel kami untuk hadiah menarik!",
    "Sebarkan ke {n} grup, jangan putus rantai! Hadiah menanti!",
    "WA {phone} untuk info harga grosir {product}",
    "Jual akun game murah, rank tinggi, harga Rp{amount}. DM {phone}",
    "Pinjol legal cair cepat, bunga rendah. Klik {spam_link}",
    "Togel online terpercaya, pasang angka keberuntunganmu di {spam_link}",
    "Promo pulsa dan paket data termurah se-Indonesia. {phone}",
    "Buruan daftar reseller, untung besar! {spam_link}",
    "Kami mencari 100 orang untuk test produk gratis. {spam_link}",
    "Klik {spam_link} untuk mendapatkan saldo e-wallet gratis Rp{amount}",
    "Info penting: kuota gratis dari pemerintah, klaim di {spam_link}",
    "Judi bola online, bonus new member {bonus}%. Daftar {spam_link}",
    "Cari penghasilan tambahan? Gabung reseller kami, modal Rp{amount}. WA {phone}",
    "Voucher diskon {percent}% untuk {product}, hanya di {spam_link}",
    "Kami buka lowongan admin online, gaji Rp{amount}/bulan. Hubungi {phone}",
    "Klik dan share ke {n} grup untuk mendapatkan {prize}!",
    "Stok terbatas! {product} hanya Rp{amount}. Order via WA {phone}",
    "Investasi emas untung {percent}% dijamin! Hubungi {phone}",
    "Beli followers dan like murah, mulai Rp{amount}. DM {phone}",
    "Grup giveaway! Klaim hadiah {prize} di {spam_link}",
    "Obat kuat herbal, harga Rp{amount}, kirim ke seluruh Indonesia. WA {phone}",
]

PHISHING_TEMPLATES = [
    "Akun {bank} Anda diblokir. Verifikasi sekarang di {phish_link}",
    "Selamat! Anda mendapat hadiah {prize}. Klaim di {phish_link}",
    "Update data {campus} Anda di {phish_link} sebelum {date}",
    "Klik {phish_link} untuk konfirmasi pembayaran Rp{amount}",
    "Pemberitahuan: paket Anda tertahan. Isi data di {phish_link}",
    "Verifikasi akun WhatsApp Anda di {phish_link} agar tidak diblokir",
    "Login gagal {n} kali. Amankan akun di {phish_link}",
    "Tagihan {bank} Anda jatuh tempo. Bayar di {phish_link}",
    "Klik {phish_link} untuk menerima transfer Rp{amount}",
    "Akun {marketplace} Anda kena hack. Reset password di {phish_link}",
    "Undangan pernikahan digital: {phish_link}",
    "Cek resi pengiriman di {phish_link}",
    "Konfirmasi data penerima bantuan di {phish_link}",
    "Klik {phish_link} untuk update aplikasi {bank}",
    "Email kampus Anda akan dinonaktifkan. Login di {phish_link}",
    "Verifikasi identitas untuk pencairan beasiswa di {phish_link}",
    "Anda memiliki denda parkir. Bayar di {phish_link}",
    "Klik {phish_link} untuk melihat foto Anda yang tersebar",
    "Peringatan keamanan: ada login dari perangkat lain. Cek {phish_link}",
    "Klaim saldo {bank} Anda yang belum cair di {phish_link}",
    "Isi formulir verifikasi di {phish_link} untuk menghindari pemblokiran",
    "Link grup kelas baru: {phish_link}",
    "Pembayaran UKT gagal. Ulangi di {phish_link}",
    "Akun {marketplace} Anda mendapatkan voucher Rp{amount}. Login di {phish_link}",
    "Cek tagihan listrik di {phish_link}",
    "Konfirmasi alamat pengiriman di {phish_link}",
    "Aktifkan kembali akun {bank} Anda di {phish_link}",
    "Klik {phish_link} untuk verifikasi dua langkah",
    "Data mahasiswa {campus} perlu diperbarui di {phish_link}",
    "Hadiah undian {brand} menunggu. Klaim di {phish_link}",
    "Reset PIN {bank} Anda di {phish_link}",
    "Login ke portal {campus} di {phish_link} untuk melihat nilai",
    "Pembayaran Anda gagal, konfirmasi di {phish_link}",
    "Akun Anda terdeteksi mencurigakan. Verifikasi di {phish_link}",
    "Klik {phish_link} untuk membatalkan transaksi Rp{amount}",
    "Buka {phish_link} untuk mengaktifkan kembali akun {marketplace}",
    "Anda menerima transfer Rp{amount}. Cek detail di {phish_link}",
    "Validasi data rekening di {phish_link} sebelum {date}",
    "Klik {phish_link} untuk klaim cashback Rp{amount}",
]

SE_TEMPLATES = [
    "Halo, ini admin grup. Tolong kirim kode OTP yang baru masuk ke nomor Anda.",
    "Saya dosen {name}, minta transfer biaya {reason} Rp{amount} ke rekening {bank} {acc}. Jangan bilang siapa-siapa.",
    "Ini nomor baru saya, simpan ya. Besok transfer DP Rp{amount} ke rekening {acc}.",
    "Jangan bilang siapa-siapa, saya butuh bantuan verifikasi akun. Kirim password Anda.",
    "Saya dari bank {bank}. Ada transaksi mencurigakan, mohon kirim PIN dan OTP Anda.",
    "Halo, saya owner grup. Tolong belikan pulsa Rp{amount} dulu, nanti saya ganti.",
    "Akun saya kena hack, tolong kirim kode verifikasi yang masuk ke HP kamu.",
    "Kami dari customer service {marketplace}. Kirim data rekening untuk refund.",
    "Selamat, Anda pemenang undian {brand}. Kirim biaya administrasi Rp{amount} ke {acc}.",
    "Saya sedang di luar kota, butuh transfer mendesak Rp{amount} ke rekening {acc}.",
    "Ini pak RT. Bayar iuran {reason} Rp{amount} ke rekening {acc} hari ini.",
    "Saya kaprodi, minta data mahasiswa dan password portal untuk validasi.",
    "Tolong jangan tutup telepon, saya petugas bank. Sebutkan kode OTP Anda.",
    "Saya teman {name}, ganti nomor. Pinjam uang Rp{amount} dulu ya.",
    "Ada paket hadiah untuk Anda, cukup bayar ongkir Rp{amount} ke {acc}.",
    "Klik link ini dan isi data KTP, KK, dan nomor rekening untuk bantuan sosial.",
    "Saya dari pihak kampus. Kirim foto KTP dan selfie untuk verifikasi beasiswa.",
    "Jangan beri tahu orang lain, ini program rahasia. Transfer Rp{amount} untuk ikut.",
    "Akun Anda terpilih untuk verifikasi ulang. Kirim username dan password.",
    "Saya admin baru, minta nomor HP dan alamat lengkap semua anggota.",
    "Tolong transfer sekarang juga, nanti saya kembalikan dua kali lipat.",
    "Ini kesempatan terakhir. Kirim OTP sebelum akun Anda diblokir permanen.",
    "Saya polisi, ada kasus penipuan. Kirim data rekening dan KTP Anda.",
    "Saya pengacara, klien saya butuh bantuan biaya administrasi Rp{amount}.",
    "Halo, saya dari DANA. Akun Anda akan ditutup, kirim kode OTP sekarang.",
    "Ini undangan rapat penting. Isi password email kampus Anda di form ini.",
    "Saya dosen pembimbing, minta transfer biaya publikasi Rp{amount} ke {acc}.",
    "Ada hadiah sponsor, cukup kirim data rekening dan OTP untuk pencairan.",
    "Saya teman sekelas kamu, lupa password. Kirim kode verifikasi yang masuk.",
    "Jangan panik, akun Anda aman. Cukup ikuti instruksi saya dan kirim PIN.",
    "Kami dari tim keamanan WhatsApp. Verifikasi nomor Anda dengan mengirim OTP.",
    "Saya panitia wisuda. Bayar biaya toga Rp{amount} ke rekening {acc} hari ini.",
    "Ini admin grup baru. Semua anggota wajib kirim data pribadi ke DM saya.",
    "Saya butuh bantuan mendesak. Transfer Rp{amount} ke {acc}, jangan bilang siapa-siapa.",
    "Halo, saya kurir. Paket Anda butuh biaya tambahan Rp{amount}, transfer ke {acc}.",
    "Saya dari bagian beasiswa. Kirim nomor rekening dan OTP untuk pencairan dana.",
    "Ini owner baru grup. Kirim daftar nomor anggota dan password admin.",
    "Saya kenalan lama kamu. Tolong bantu transfer Rp{amount} dulu, nanti diganti.",
    "Ada masalah dengan akun kamu. Kirim kode OTP supaya tidak diblokir.",
]

PREFIXES = {
    "safe": ["", "", "Halo semua, ", "Info: ", "Mohon info, ", "Assalamualaikum, "],
    "spam": ["", "", "PROMO! ", "PENTING! ", "Info: ", "🔥 "],
    "phishing": ["", "", "PENTING! ", "Pemberitahuan: ", "Info: ", "⚠️ "],
    "social_engineering": ["", "", "Halo, ", "Pak/Bu, ", "Permisi, ", "Penting: "],
}

SUFFIXES = {
    "safe": ["", "", "", " Terima kasih.", " Mohon dibantu."],
    "spam": ["", "", " !!!", " Buruan!", " Jangan sampai kehabisan."],
    "phishing": ["", "", " Segera.", " Jangan diabaikan.", " Terima kasih."],
    "social_engineering": ["", "", " Tolong bantuannya.", " Jangan bilang siapa-siapa.", " Segera ya."],
}


def fill(template: str) -> str:
    slots = {
        "name": random.choice(NAMES),
        "course": random.choice(COURSES),
        "room": random.choice(ROOMS),
        "time": random.choice(TIMES),
        "date": random.choice(DATES),
        "amount": random.choice(AMOUNTS),
        "percent": random.choice(PERCENTS),
        "bank": random.choice(BANKS),
        "acc": random.choice(ACCOUNTS),
        "phone": random.choice(PHONES),
        "prize": random.choice(PRIZES),
        "product": random.choice(PRODUCTS),
        "brand": random.choice(BRANDS),
        "campus": random.choice(CAMPUSES),
        "org": random.choice(ORGS),
        "company": random.choice(COMPANIES),
        "place": random.choice(PLACES),
        "prayer": random.choice(PRAYERS),
        "gb": random.choice(GBS),
        "bonus": random.choice(BONUSES),
        "reason": random.choice(REASONS),
        "marketplace": random.choice(MARKETPLACES),
        "n": random.choice(N),
        "safe_link": random.choice(SAFE_LINKS),
        "spam_link": make_phish_link(),
        "phish_link": make_phish_link(),
    }
    return template.format(**slots)


def add_noise(text: str, label: str) -> str:
    prefix = random.choice(PREFIXES[label])
    suffix = random.choice(SUFFIXES[label])
    text = f"{prefix}{text}{suffix}"
    if label == "spam" and random.random() < 0.25:
        text = text.upper()
    return " ".join(text.split())


def generate_class(templates, label: str, count: int):
    seen = set()
    rows = []
    attempts = 0
    max_attempts = count * 50
    while len(rows) < count and attempts < max_attempts:
        attempts += 1
        text = add_noise(fill(random.choice(templates)), label)
        if text in seen:
            continue
        seen.add(text)
        rows.append({"text": text, "label": label})
    if len(rows) < count:
        raise RuntimeError(f"Gagal membuat {count} baris untuk kelas {label}; hanya {len(rows)} unik.")
    return rows


MANUAL_TEST = {
    "safe": [
        "Teman-teman, besok kita tidak ada kelas karena dosen ada rapat.",
        "Siapa yang sudah mengumpulkan laporan praktikum minggu ini?",
        "Tolong kirim materi presentasi kelompok 3 ke grup ya.",
        "Jadwal imsak hari ini jam berapa? Saya lupa cek.",
        "Ada yang bisa merekomendasikan tempat print murah dekat kampus?",
        "Rapat himpunan dipindah ke hari Kamis pukul 16.00.",
        "Saya sudah upload catatan kuliah di Google Drive, silakan dicek.",
        "Hari ini hujan deras, hati-hati di jalan ya semuanya.",
        "Selamat pagi, semoga presentasi kita hari ini lancar.",
        "Mohon maaf saya telat masuk karena ban motor bocor.",
        "Apakah ada yang punya nomor kontak laboran?",
        "Terima kasih atas bantuan teman-teman kemarin.",
        "Jangan lupa bawa kartu ujian besok pagi.",
        "Kita belajar kelompok di perpustakaan jam 3 sore, siapa ikut?",
        "Info: pendaftaran KRS diperpanjang sampai Jumat.",
        "Tolong transfer catatan kuliah kemarin ke folder shared drive ya.",
        "Link zoom kelas hari ini: https://www.ui.ac.id/zoom, silakan join.",
        "Saya sudah bayar UKT, ini bukti transfernya saya kirim di grup.",
        "Admin grup sedang tidak online, besok pagi saja tanyanya.",
        "Jangan lupa verifikasi KRS di portal kampus sebelum Jumat.",
    ],
    "spam": [
        "PROMO GILA! HP second murah banget, cuma 1 juta, WA 0812xxx sekarang!",
        "Judi online terpercaya bonus 100 persen, daftar lewat link di bio!",
        "Pinjaman cair tanpa jaminan, proses 5 menit, klik bit.ly/abc123",
        "Kuota 50GB cuma 25 ribu, buruan order sebelum habis!",
        "Ayo sebar pesan ini ke 10 grup, nanti dapat saldo 500 ribu!",
        "Investasi crypto dijamin untung 50 persen per hari, join sekarang!",
        "Jual followers murah, 10 ribu follower hanya 50 ribu, DM ya!",
        "Slot gacor maxwin hari ini, deposit 50 ribu bisa menang jutaan!",
        "Diskon 80 persen semua produk, hanya hari ini, order sekarang!",
        "Lowongan kerja online gaji 5 juta per minggu, tanpa pengalaman!",
        "Klik link ini untuk klaim voucher belanja gratis 1 juta!",
        "Togel online resmi, pasang angka keberuntunganmu sekarang!",
        "Reseller baju murah, untung besar, modal cuma 100 ribu!",
        "Voucher game murah, semua nominal tersedia, WA cepat!",
        "Promo pulsa semua operator, harga termurah se-Indonesia!",
    ],
    "phishing": [
        "Akun BCA Anda terblokir sementara, verifikasi di http://bca-verifikasi.xyz/login",
        "Paket Anda tertahan di gudang, isi data di https://bit.ly/klaimpaket",
        "Selamat, nomor Anda menang undian, klaim hadiah di http://hadiah-palsu.top",
        "Login akun kampus Anda gagal, reset password di http://ui.ac.id.secure-login.xyz",
        "Klik http://192.168.10.5/verifikasi untuk mengaktifkan kembali akun DANA Anda",
        "Ada transfer masuk 2 juta, cek detail di https://tinyurl.com/transfermasuk",
        "Tagihan listrik Anda belum dibayar, bayar di http://pln-bayar.click",
        "Verifikasi dua langkah WhatsApp Anda di http://whatsapp-verifikasi.icu",
        "Akun Shopee Anda kena hack, login ulang di http://shopee-akun.top",
        "Cek resi pengiriman Anda di https://shorturl.at/resi123",
        "Email kampus akan dinonaktifkan, login di http://ugm.ac.id.verifikasi.cf",
        "Klik link ini untuk membatalkan transaksi mencurigakan di rekening Anda",
        "Pembayaran UKT gagal, ulangi di http://pembayaran-kampus.xyz",
        "Anda mendapat cashback 500 ribu, klaim di http://cashback-dana.click",
        "Validasi rekening Anda di https://bit.ly/validasirekening",
    ],
    "social_engineering": [
        "Halo, saya admin grup. Tolong kirim kode OTP yang baru masuk ke HP kamu.",
        "Ini dosen pembimbing kamu. Saya butuh transfer 2 juta untuk biaya publikasi, jangan bilang siapa-siapa.",
        "Saya dari bank BRI. Ada transaksi mencurigakan, mohon sebutkan PIN dan kode OTP Anda.",
        "Nomor saya baru, simpan ya. Besok tolong transfer DP 500 ribu ke rekening 1234567890.",
        "Akun saya kena hack, bantu kirim kode verifikasi yang masuk ke nomor kamu.",
        "Saya panitia beasiswa. Kirim foto KTP, KK, dan nomor rekening untuk pencairan.",
        "Jangan tutup telepon, saya customer service. Sebutkan kode OTP sekarang.",
        "Saya teman lama kamu, lupa password. Kirim kode verifikasi yang masuk ya.",
        "Ini pak RT, bayar iuran kebersihan 250 ribu ke rekening 9876543210 hari ini.",
        "Saya dari tim keamanan WhatsApp. Verifikasi nomor dengan mengirim OTP.",
        "Kamu menang undian, cukup bayar biaya administrasi 100 ribu ke rekening ini.",
        "Saya owner grup baru. Semua anggota wajib kirim data pribadi ke DM saya.",
        "Tolong bantu transfer mendesak 1 juta, nanti saya ganti dua kali lipat.",
        "Saya polisi, ada kasus penipuan. Kirim data rekening dan KTP Anda sekarang.",
        "Ini program rahasia, jangan beri tahu orang lain. Transfer 500 ribu untuk ikut.",
    ],
}


def write_csv(path: Path, rows):
    with path.open("w", newline="", encoding="utf-8") as fh:
        writer = csv.DictWriter(fh, fieldnames=["text", "label"])
        writer.writeheader()
        writer.writerows(rows)


def main():
    print("=" * 60)
    print("  GENERATOR DATASET ANCAMAN WHATSAPP (SINTETIS)")
    print("=" * 60)

    train_rows = []
    test_rows = []
    class_sets = [
        ("safe", SAFE_TEMPLATES),
        ("spam", SPAM_TEMPLATES),
        ("phishing", PHISHING_TEMPLATES),
        ("social_engineering", SE_TEMPLATES),
    ]

    for index, (label, templates) in enumerate(class_sets):
        # Bagi template secara deterministik: sebagian untuk training,
        # sebagian ditahan untuk uji sintetis agar evaluasi lebih jujur.
        shuffled = list(templates)
        random.Random(SEED + index).shuffle(shuffled)
        holdout_n = max(6, len(shuffled) // 4)
        train_templates = shuffled[:-holdout_n]
        test_templates = shuffled[-holdout_n:]

        generated = generate_class(train_templates, label, N_PER_CLASS)
        heldout = generate_class(test_templates, label, HOLDOUT_PER_CLASS)
        train_rows.extend(generated)
        test_rows.extend(heldout)
        print(
            f"[Data] {label:20s}: train {len(generated):4d} | "
            f"uji sintetis {len(heldout):4d} | template ditahan {holdout_n}"
        )

    random.shuffle(train_rows)
    random.shuffle(test_rows)

    dataset_path = OUT_DIR / "security_dataset.csv"
    write_csv(dataset_path, train_rows)
    print(f"\n[Data] Dataset training  : {dataset_path} ({len(train_rows)} baris)")

    test_path = OUT_DIR / "security_test_synthetic.csv"
    write_csv(test_path, test_rows)
    print(f"[Data] Uji sintetis      : {test_path} ({len(test_rows)} baris)")

    manual_rows = []
    for label, texts in MANUAL_TEST.items():
        for text in texts:
            manual_rows.append({"text": text, "label": label})
    manual_path = OUT_DIR / "security_test_manual.csv"
    write_csv(manual_path, manual_rows)
    print(f"[Data] Uji manual        : {manual_path} ({len(manual_rows)} baris)")
    print("\nSelesai. Jalankan `python train_ml.py` untuk melatih model.\n")


if __name__ == "__main__":
    main()
