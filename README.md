# EFE Şantiye Defteri

Telefona kurulan şantiye defteri (PWA). Notlar, hatırlatıcılar, onay noktaları, yerler ve fotoğraflar telefonda durur; istersen kendi Google Sheet'ine eşitlenir.

## Dosyalar
- `index.html`, `sw.js`, `manifest.webmanifest`, `fonts/`, `icons/` → uygulama (GitHub Pages bunları yayınlar)
- `google-sheet/Code.gs` → Google Sheet tarafındaki köprü kodu

## Kurulum (özet)
1. Bu depoyu GitHub'a yükle, Settings > Pages > Deploy from a branch > `main` / `(root)`.
2. Yeni bir Google Sheet aç > Uzantılar > Apps Script > `google-sheet/Code.gs` içeriğini yapıştır > `kurulum` çalıştır.
3. Dağıt > Yeni dağıtım > Web uygulaması (Çalıştıran: Ben, Erişim: Herkes).
4. Sheet'te EFE > Bağlantı bilgisini göster; adres ve anahtarı uygulamada Ayarlar > Google Sheet bağlantısı kısmına yapıştır.

Adres ve anahtarı bu depoya yazma; sadece telefonuna yapıştır.
