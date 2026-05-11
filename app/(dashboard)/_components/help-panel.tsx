'use client'

import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'

const STORAGE_KEY = 'stokkontrol.help.open'

export function HelpPanel() {
  // SSR'da default açık; ilk render sonrası localStorage tercihini uygula.
  const [open, setOpen] = useState(true)
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    if (stored !== null) setOpen(stored === '1')
    setHydrated(true)
  }, [])

  function toggle() {
    const next = !open
    setOpen(next)
    window.localStorage.setItem(STORAGE_KEY, next ? '1' : '0')
  }

  if (hydrated && !open) {
    return (
      <button
        onClick={toggle}
        title="Kullanım kılavuzunu aç"
        className="fixed bottom-6 right-6 z-30 flex h-12 w-12 items-center justify-center rounded-full border border-border bg-bg-card text-lg font-semibold text-gray-100 shadow-lg shadow-black/30 transition-colors hover:bg-bg-subtle"
      >
        ?
      </button>
    )
  }

  return (
    <aside
      className={cn(
        'hidden shrink-0 border-l border-border bg-bg-subtle lg:flex lg:w-96 lg:flex-col',
        !hydrated && 'lg:w-96'
      )}
    >
      <div className="sticky top-0 flex max-h-screen flex-col">
        <div className="flex items-center justify-between border-b border-border bg-bg-card px-5 py-3">
          <div>
            <div className="text-xs uppercase tracking-wider text-gray-500">Yardım</div>
            <div className="text-sm font-semibold">Kullanım Kılavuzu</div>
          </div>
          <button
            onClick={toggle}
            className="rounded-md border border-border px-2 py-1 text-xs text-gray-300 hover:bg-bg-subtle"
            title="Yardım panelini gizle"
          >
            Gizle
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5 text-sm leading-relaxed text-gray-300">
          <Guide />
        </div>
      </div>
    </aside>
  )
}

function Guide() {
  return (
    <div className="space-y-6">
      <Section title="Hoş geldin">
        <p>
          <strong>PazarPilot</strong>, e-ticaret operasyonunu tek kokpitte toplar:
          stok, sipariş, pazaryeri listingleri, alarm ve otomasyon aynı yerden yönetilir.
          Uygulamadaki <em>stockCount</em> sayın <strong>tek doğruluk kaynağı</strong>dır.
          Bir pazaryerinde sattığında, diğer kanallara otomatik olarak yeni stok yazılır.
        </p>
      </Section>

      <Section title="Hızlı başlangıç">
        <ol className="list-decimal space-y-1.5 pl-5">
          <li>
            <Kbd>Kanallar</Kbd> sayfasından pazaryerlerini bağla (Trendyol, Shopify,
            Hepsiburada).
          </li>
          <li>
            <Kbd>Operasyon → Kanaldan içe aktar</Kbd> ile aynı SKU'ları otomatik
            birleştir, çakışmaları review tablosunda seç ve <strong>Apply</strong> de.
          </li>
          <li>
            Listede <Kbd>checkbox</Kbd>'larla birden fazla ürün seç → üstte beliren
            toolbar'dan toplu stok güncelle / duraklat / aktifleştir.
          </li>
          <li>
            <Kbd>Otomasyon</Kbd> sayfasından "stok 5'in altına düşerse mail at" gibi
            kural tanımla.
          </li>
        </ol>
      </Section>

      <Section title="Pazaryerinden ürün içe aktarma">
        <p>
          <Kbd>Operasyon → Kanaldan içe aktar</Kbd> butonuyla bağlı tüm pazaryerlerinden ürünler
          çekilir ve <strong>SKU bazında</strong> otomatik gruplanır. Üç sekme görürsün:
        </p>
        <Defs>
          <Def term="Conflicts">
            Aynı SKU 2+ pazaryerinde var ama stoklar farklı. Her satırda hangi pazaryerinin
            sayısını master alacağını seçersin (ya da kendi rakamını yazarsın).
          </Def>
          <Def term="Auto-merged">
            Aynı SKU 2+ pazaryerinde, stoklar zaten aynı. Hiçbir karar gerekmez.
          </Def>
          <Def term="Unmatched">
            SKU sadece 1 pazaryerinde var. Tek listing'li ürün olarak içe alınır.
          </Def>
        </Defs>
        <p className="mt-2">
          <strong>Push-back</strong> checkbox'ı işaretliyse, Apply'dan sonra master stok
          tüm pazaryerlerine yazılır — tüm yerler senin DB'ndekine uyar.
        </p>
      </Section>

      <Section title="Toplu işlemler (bulk actions)">
        <p>Products listesinde checkbox'lar görünür. Bir veya daha fazlasını seçince üstte toolbar açılır:</p>
        <Defs>
          <Def term="Stoğu set et">Tüm seçili ürünlerin stoğunu N yapar (delta hesaplanıp event log'a yazılır).</Def>
          <Def term="Stok ekle/çıkar">Δ kadar artırır/azaltır (örn. +5, −3).</Def>
          <Def term="Reserved set et">Reserved stoğu toplu güncelle.</Def>
          <Def term="Duraklat">Tüm pazaryerlerinde sync'i kapat (paused).</Def>
          <Def term="Aktifleştir">Yeniden açar ve mevcut stoku tüm pazaryerlerine push'lar.</Def>
        </Defs>
      </Section>

      <Section title="Sayfalar - Operasyon">
        <p>Tüm ürünlerinin listesi. Sütunlar:</p>
        <Defs>
          <Def term="Stock">Toplam stok (depodaki tüm ürün).</Def>
          <Def term="Reserved">
            Online satışa kapalı miktar (B2B, numune, fiziksel mağaza için ayrılan).
          </Def>
          <Def term="Available">
            <code>Stock − Reserved</code>. Pazaryerlerinde bu rakam görünür. 5 altıysa
            sarı, 0 altıysa kırmızı vurgu.
          </Def>
          <Def term="Listings">
            Bu ürünün hangi pazaryerlerinde aktif olduğu. Yeşil = senkron, sarı = bekliyor,
            kırmızı = hata.
          </Def>
        </Defs>
        <p className="mt-2">
          Ürün kartına tıklayınca <strong>detay sayfası</strong> açılır:
          stok ayar formu, her pazaryeri için son sync durumu ve son 50 stok olayı.
        </p>
      </Section>

      <Section title="Sayfalar - Siparişler">
        <p>Tüm pazaryerlerinden akan siparişlerin tek listesi. Filtre: platform + durum.</p>
        <Defs>
          <Def term="received">Webhook ile geldi, stok düşüldü.</Def>
          <Def term="fulfilled">Kargolandı/teslim edildi.</Def>
          <Def term="cancelled">İptal edildi (sebep event log'da).</Def>
          <Def term="partially_cancelled">
            Bazı kalemler iptal — genelde stok yetmediği için.
          </Def>
        </Defs>
      </Section>

      <Section title="Sayfalar - Otomasyon">
        <p>Stok eşiği geçince ne olacağını tanımladığın kurallar.</p>
        <Defs>
          <Def term="low_stock">Stok ≤ eşik altına düşünce.</Def>
          <Def term="out_of_stock">Stok 0 olunca.</Def>
          <Def term="overstock">Stok ≥ eşik üstüne çıkınca.</Def>
        </Defs>
        <p className="mt-2">Aksiyonlar:</p>
        <Defs>
          <Def term="notify_email">Resend üzerinden alarm e-postası.</Def>
          <Def term="pause_listings">
            Tüm pazaryerlerinde ürünü 0 stoka çekip görünmez yapar.
          </Def>
        </Defs>
      </Section>

      <Section title="Sayfalar - Kanallar">
        <p>
          Pazaryeri kimlik bilgileri burada eklenir. <strong>Tümü AES-256-GCM ile
          şifrelenir</strong> ve geri okunmaz — sadece güncelleyebilir veya silebilirsin.
        </p>
        <Defs>
          <Def term="Trendyol">API Key, API Secret, Supplier ID — partner panelinden.</Def>
          <Def term="Shopify">
            Admin API Access Token (custom app), Store URL (
            <code>yourstore.myshopify.com</code>) ve Location ID.
          </Def>
          <Def term="Hepsiburada">API Username, Password ve Merchant ID.</Def>
        </Defs>
      </Section>

      <Section title="Sayfalar - Ekip">
        <p>
          Workspace üyelerini yönet. Davet gönderme, rol değiştirme, çıkartma — Clerk'in
          organization profile'ı üzerinden.
        </p>
      </Section>

      <Section title="Önemli kavramlar">
        <h4 className="mt-2 font-semibold text-gray-100">Tek doğruluk kaynağı</h4>
        <p>
          Bizim DB'mizdeki <code>stockCount</code> tek geçerli sayıdır. Pazaryerlerinden
          stok <em>okumayız</em>, sadece onlara <em>yazarız</em>.
        </p>

        <h4 className="mt-3 font-semibold text-gray-100">Sipariş akışı</h4>
        <ol className="list-decimal space-y-1 pl-5">
          <li>Pazaryeri webhook gönderir → HMAC imzasıyla doğrularız.</li>
          <li>Sipariş DB'ye yazılır. Aynı sipariş tekrar gelirse atlanır (idempotent).</li>
          <li>
            Stok atomik düşülür — Postgres satır kilidi sayesinde aynı anda gelen iki
            sipariş yarış kazanamaz.
          </li>
          <li>
            Diğer pazaryerlerine yeni stok kuyruğa atılır, sırayla push'lanır.
          </li>
        </ol>

        <h4 className="mt-3 font-semibold text-gray-100">Stok yetmiyorsa</h4>
        <p>
          İki sipariş aynı anda son ürünü isterse, biri başarılı olur, ikincisi otomatik
          olarak iptal edilir: pazaryerine cancel gönderilir, event log'a
          <em>"Cancelled — insufficient stock"</em> yazılır.
        </p>

        <h4 className="mt-3 font-semibold text-gray-100">Manuel düzenleme</h4>
        <p>
          Ürün detayında <Kbd>+</Kbd>/<Kbd>−</Kbd> butonları stok ekler/çıkarır.
          Her değişiklik kalıcı log'a düşer — geri alamazsın ama kim/ne zaman/neden
          değiştirdi her zaman görünür.
        </p>

        <h4 className="mt-3 font-semibold text-gray-100">Hız limitleri</h4>
        <Defs>
          <Def term="Trendyol">10 push/sn</Def>
          <Def term="Shopify">35 push/sn</Def>
          <Def term="Hepsiburada">5 push/sn + 60sn polling yedeği</Def>
        </Defs>
      </Section>

      <Section title="Sık sorulanlar">
        <h4 className="font-semibold text-gray-100">
          Pazaryeri şifrem nasıl korunuyor?
        </h4>
        <p>
          AES-256-GCM ile şifrelenmiş şekilde tutulur. Sunucumuz dahil hiçbir yer ham
          değeri ekrana basmaz. Anahtar (<code>ENCRYPTION_KEY</code>) sadece sunucuda.
        </p>

        <h4 className="mt-3 font-semibold text-gray-100">Stok eksiğe düşebilir mi?</h4>
        <p>Hayır. Postgres satır kilidi <code>SELECT … FOR UPDATE</code> garantisi verir.</p>

        <h4 className="mt-3 font-semibold text-gray-100">İade gelirse?</h4>
        <p>
          API'den <code>creditStock</code> çağrısı stoğu geri yazıp event log'a
          <em>"return_credit"</em> ekler (UI'dan henüz tetiklenemiyor).
        </p>

        <h4 className="mt-3 font-semibold text-gray-100">
          Pazaryeri ile sayım uyuşmazsa?
        </h4>
        <p>
          Bizim sayımız doğrudur. Workers her stok değişiminde pazaryerine doğru rakamı
          tekrar gönderir; pazaryeri eski rakamı silinene kadar deneme yapar.
        </p>
      </Section>

      <Section title="Test / demo modu">
        <p>
          Gerçek pazaryeri hesabın yoksa <strong>mock mode</strong> ile tüm akışı
          deneyebilirsin:
        </p>
        <ol className="list-decimal space-y-1 pl-5">
          <li>
            <Kbd>Integrations</Kbd> sayfasına git, herhangi bir pazaryerine{' '}
            <Kbd>Connect</Kbd> de.
          </li>
          <li>
            Açılan formda alanlardan herhangi birine <code>MOCK</code> yaz (ya da
            "MOCK ile doldur" linkine tıkla) → kaydet.
          </li>
          <li>
            <Kbd>Products → İçe aktar → Pazaryerlerini tara</Kbd> de. 30 sahte ürün
            ve birkaç çakışma görürsün.
          </li>
          <li>
            Conflict'leri çöz, <Kbd>Apply</Kbd> de. Push-back işaretliyse mock
            pazaryerlerinin in-memory state'i master stoğa hizalanır — tekrar tara,
            hepsi <em>auto-merged</em> görünür.
          </li>
        </ol>
        <p className="mt-2 text-gray-400">
          Üç pazaryerinin hepsini MOCK yaparsan en zengin test datası: 6 conflict
          (T+S), 6 conflict (S+H), 6 auto-merge (T+S+H), 6 auto-merge (T+S), 6 unmatched (T).
        </p>
      </Section>

      <Section title="Klavye kısayolları">
        <p className="text-gray-400">(yakında)</p>
      </Section>

      <div className="border-t border-border pt-4 text-xs text-gray-500">
        Bu paneli sağ alttaki <Kbd>?</Kbd> ile tekrar açabilirsin.
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 text-sm font-semibold uppercase tracking-wider text-indigo-300">
        {title}
      </h3>
      <div className="space-y-2 text-[13px] text-gray-300">{children}</div>
    </section>
  )
}

function Defs({ children }: { children: React.ReactNode }) {
  return <dl className="mt-1 space-y-1">{children}</dl>
}

function Def({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-2">
      <dt className="shrink-0 font-medium text-gray-100">{term}:</dt>
      <dd className="text-gray-400">{children}</dd>
    </div>
  )
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex items-center rounded border border-border bg-bg-card px-1.5 py-0.5 font-mono text-[11px] text-gray-200">
      {children}
    </kbd>
  )
}
