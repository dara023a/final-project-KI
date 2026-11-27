# Laporan Hasil Pengembangan — UAS Keamanan Informasi

**Judul proyek:** Pengembangan Bot Keamanan Grup WhatsApp Berbasis Kecerdasan Buatan untuk Mitigasi Ancaman Spam, Phishing, dan Rekayasa Sosial secara Real-Time

**Dosen:** [Nama Dosen]
**Mahasiswa:** [Nama Mahasiswa]
**Program Studi:** Informatika — Semester V
**Mata Kuliah:** Keamanan Informasi

**Penelitian:** Pengembangan bot keamanan grup WhatsApp berbasis kecerdasan buatan untuk mitigasi ancaman spam, phishing, dan rekayasa sosial secara real-time.

---

## Data Penelitian

### Biodata

- **Dosen:** [Nama Dosen]
- **Mahasiswa:** [Nama Mahasiswa]
- **Program Studi:** Informatika
- **Semester:** V
- **Mata Kuliah:** Keamanan Informasi

### Sinopsis Penelitian

Pengembangan ini meneliti deteksi dan mitigasi ancaman spam, phishing, dan rekayasa sosial pada WhatsApp group melalui kombinasi aturan lokal, model machine learning, dan LLM.

---

## Bab 1 — Pendahuluan

### 1.1 Latar Belakang

Perkembangan teknologi komunikasi daring membuat WhatsApp menjadi salah satu saluran utama interaksi sosial dan akademis. Namun, kemudahan distribusi pesan juga dimanfaatkan aktor tidak resmi untuk menyebarkan spam, phishing, dan serangan rekayasa sosial. Kampus dan komunitas daring memerlukan mitigasi keamanan yang cepat, real-time, dan berbasis kecerdasan buatan.

### 1.2 Rumusan Masalah

- Bagaimana mengidentifikasi secara real-time pesan spam, phishing, dan social engineering di grup WhatsApp?
- Bagaimana menggabungkan aturan lokal, model klasifikasi ML, dan LLM untuk hasil yang robust?
- Bagaimana menerapkan tindakan mitigasi sesuai tingkat risiko?

### 1.3 Tujuan

- Mengembangkan pipeline deteksi ancaman spam, phishing, dan social engineering.
- Mengembangkan model klasifikasi 4 kelas: `safe`, `spam`, `phishing`, `social_engineering`.
- Mengimplementasikan tindakan mitigasi otomatis: hapus pesan, peringatan, kick, notifikasi owner.

### 1.4 Manfaat

- Pengurangan penyebaran konten berbahaya.
- Deteksi dini percobaan credential harvesting / phishing.
- Pencegahan sosial engineering seperti permintaan OTP, transfer mendesak, dan impersonasi.

### 1.5 Ruang Lingkup & Batasan

- Fokus pada ancaman spam, phishing, dan social engineering.
- Model saat ini dilatih pada dataset sintetis training (`data/security_dataset.csv`) plus data spam tambahan dari Kaggle SMS Spam Collection (`data/spam.csv`, 629 spam).
- Belum terintegrasi penilaian URL reputation pihak ketiga (misalnya Google Safe Browsing, VirusTotal).
- Hasil evaluasi utama pada dataset sintetis (test held-out) dan uji manual harus diberi catatan metodologi. Kaggle hanya digunakan sebagai data training tambahan untuk memperkuat kelas spam.

---

## Bab 2 — Landasan Teori

### 2.1 Spam

Spam adalah pesan tidak diinginkan yang berulang atau mengejutkan, termasuk promosi, judi online, pinjaman online, dan chain message.

### 2.2 Phishing

Phishing adalah serangan penyamaran untuk memperoleh data sensitif melalui tautan, verifikasi, atau imitasi aplikasi.

### 2.3 Rekayasa Sosial

Social engineering adalah manipulasi orang melalui kepercayaan, tekanan, atau otoritas untuk mengorbankan data/konflik.

### 2.4 Kecerdasan Buatan

- **Rule-based:** regex, pola keyword, pengukuran rate/duplicate.
- **Machine Learning:** TF-IDF word (1–2 gram) + char n-gram (3–5) + Logistic Regression.
- **LLM:** Ollama (Qwen2.5:3b) untuk kasus ambigu.

### 2.5 Real-Time

Pesan diproses melalui event `message` / `message_create` pada WhatsApp Web JS; hasil scoring diterapkan langsung.

---

## Bab 3 — Metodologi

### 3.1 Sumber Data

Dataset sintetis dibuat oleh `generate_security_dataset.py` dengan seed 42. Kelas:

1. `safe`
2. `spam`
3. `phishing`
4. `social_engineering`

Komposisi output:

- `data/security_dataset.csv` — dataset sintetis training.
- `data/security_test_synthetic.csv` — 1.000 baris uji (250 per kelas, template ditahan).
- `data/security_test_manual.csv` — kalimat manual, termasuk hard-negative.

Selain itu, `train_ml.py` menambahkan spam dari Kaggle SMS Spam Collection (`data/spam.csv`), sebanyak 629 spam, untuk memperkuat kelas `spam`. Penggunaan Kaggle perlu dicantumkan sebagai data tambahan non-sintetis.

### 3.2 Preprocessing

`clean_text()`:

- lowercase, NFKC.
- URL → `urltoken`, email → `emailtoken`.
- mention → hapus, hashtag → isi kata.
- normalisasi singkatan umum (`gak`, `bgt`, `udh`, dll).
- hapus tanda baca, rapikan whitespace.

### 3.3 Model

- `FeatureUnion`: TF-IDF word ngram (1,2) + TF-IDF char ngram (3,5).
- `LogisticRegression`: `class_weight=balanced`, `C=3.0`, max_iter 3000.

### 3.4 Pipeline Deteksi

1. Analisis spam: rate, duplikat, link, mention, keyword.
2. Analisis phishing: URL, shortener, IP, TLD, lookalike, path, teks.
3. Analisis social engineering: kombinasi indikator.
4. Prediksi ML.
5. LLM untuk kasus ambigu (mode hybrid).
6. Skor akhir → severity → aksi.

### 3.5 Aksi Mitigasi

| Severity | Bobot | Aksi |
|---|---|---|
| low | — | log |
| medium | 1 | hapus + peringatan |
| high | 2 | hapus + peringatan + notifikasi owner; kick jika melebihi batas |

---

## Bab 4 — Hasil dan Pembahasan

### 4.1 Hasil Model

| Metrik | Test sintetis | Uji manual |
|---|---:|---:|
| Accuracy | 0.9530 | 0.9077 |
| Macro F1 | 0.9531 | 0.9096 |
| Weighted F1 | 0.9531 | 0.9080 |

Dari output `train_ml.py`:

- Model dilatih dari dataset sintetis plus 629 spam Kaggle SMS Spam Collection.
- Held-out accuracy: **0.9530**
- Held-out macro F1: **0.9531**
- Manual accuracy: **0.9077**
- Manual macro F1: **0.9096**
- CV macro F1: **1.0000** — nilai ini optimistis karena CV tanpa group/template isolation.

Kesimpulan: model mampu mendeteksi 3 kelas ancaman dengan performa baik pada data uji.

### 4.2 Analisis Error

Pada uji manual, beberapa false positive/negative terjadi, misalnya pesan yang mengandung kata seperti *transfer*, *admin*, atau *verifikasi* tetapi konteksnya masih aman. Hal ini menunjukkan perlunya konteks ekstra dan kombinasi indikator.

### 4.3 Hasil Pipeline

Dalam pengujian bot:

- Phishing kuat → severity tinggi.
- Spam promo → ML mendeteksi, kombinasi ML + aturan.
- Social engineering OTP → heuristik kuat.
- Kelas aman kampus → aman.

Contoh pesan demo yang sesuai dengan ketiga kelas ancaman:

| Kategori | Contoh Pesan | Hasil |
|---|---|---|
| Spam | `PROMO GILA! HP second murah banget, cuma 1 juta, WA 0812xxx sekarang!` | Terdeteksi sebagai `spam`, severity tinggi. |
| Phishing | `Akun BCA Anda terblokir sementara, verifikasi di http://bca-verifikasi.xyz/login` | Terdeteksi sebagai `phishing`, severity tinggi. |
| Social Engineering | `Halo, saya admin grup. Tolong kirim kode OTP yang baru masuk ke HP kamu.` | Terdeteksi sebagai `social_engineering`, severity tinggi. |

---

## Bab 5 — Kesimpulan dan Saran

### 5.1 Kesimpulan

Bot keamanan WhatsApp berbasis AI telah dikembangkan untuk memitigasi spam, phishing, dan rekayasa sosial secara real-time.

Keberhasilan utama:

- Model ML 4 kelas terlatih dan diserahkan ke `ml_service.py`.
- Model spam diperkuat dengan data Kaggle SMS Spam Collection.
- Pipeline aturan + ML + LLM berjalan.
- Tindakan mitigasi otomatis terintegrasi.

### 5.2 Saran

- Perlu data nyata.
- Perlu penambahan URL reputation.
- Perlu evaluasi lebih besar dan human-in-the-loop.
- Perlu monitoring false positive.

### 5.3 Penutup

Pengembangan ini menjawab tantangan UAS dengan fokus mitigasi ancaman spam, phishing, dan rekayasa sosial secara real-time.

---

## Lampiran A — Struktur Kode

(Sesuai README)

## Lampiran B — Data

### B.1 Dataset Sintetis

- `data/security_dataset.csv` — dataset sintetis training: 4.000 baris (1.000 per kelas dari template training).
- `data/security_test_synthetic.csv` — test sintetis: 1.000 baris (250 per kelas, template ditahan).
- `data/security_test_manual.csv` — uji manual: 65 baris, mencakup safe, spam, phishing, dan social engineering, termasuk hard-negative.

### B.2 Data Tambahan (Kaggle SMS Spam Collection)

- `data/spam.csv` — dataset SMS Spam Collection dari Kaggle.
- Setelah dibersihkan dan dideduplikasi, **629 spam** dipakai sebagai data training tambahan untuk memperkuat kelas `spam`.

### B.3 Komposisi Data Training Final

| Label | Jumlah |
|---|---:|
| `safe` | 880 |
| `spam` | 1.419 |
| `phishing` | 643 |
| `social_engineering` | 1.000 |
| **Total** | **3.942** |

Catatan: data training final terdiri dari dataset sintetis plus spam tambahan dari Kaggle. Test evaluasi tetap menggunakan test sintetis dan uji manual, bukan data Kaggle.
