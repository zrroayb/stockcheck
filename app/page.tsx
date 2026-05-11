import Link from 'next/link'
import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { ArrowRight, BadgeCheck, BarChart3, RadioTower, ShieldCheck } from 'lucide-react'

export default async function Home() {
  const { userId, orgId } = await auth()
  if (userId && orgId) {
    redirect('/products')
  }

  return (
    <main className="public-home min-h-screen bg-[#080806] text-white">
      <section className="relative flex min-h-[88vh] items-center overflow-hidden px-6 py-10">
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-cover bg-center"
          style={{
            backgroundImage:
              "url('https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?auto=format&fit=crop&w=1800&q=82')",
          }}
        />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(8,8,6,0.94),rgba(8,8,6,0.74)_46%,rgba(8,8,6,0.3))]" />
        <div className="absolute inset-x-0 bottom-0 h-36 bg-gradient-to-t from-[#080806] to-transparent" />

        <div className="relative mx-auto grid w-full max-w-7xl gap-10 lg:grid-cols-[minmax(0,0.92fr)_440px] lg:items-center">
          <div className="max-w-3xl">
            <div className="mb-5 inline-flex items-center gap-2 rounded-md border border-white/15 bg-black/30 px-3 py-2 text-xs font-medium uppercase tracking-wider text-amber-200">
              <RadioTower className="h-3.5 w-3.5" />
              E-ticaret operasyon super app
            </div>
            <h1 className="text-5xl font-semibold tracking-normal text-white sm:text-7xl">
              PazarPilot
            </h1>
            <p className="mt-6 max-w-2xl text-xl leading-8 text-stone-200">
              Trendyol, Shopify ve Hepsiburada operasyonunu tek ekranda toparla:
              stok, siparis, kanal senkronu, alarm ve otomasyon ayni komuta merkezinde.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/sign-up" className="btn-primary">
                Operasyonu baslat
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link href="/sign-in" className="btn-secondary">
                Giris yap
              </Link>
            </div>
            <div className="mt-8 flex flex-wrap gap-4 text-sm text-stone-300">
              <span className="inline-flex items-center gap-2">
                <BadgeCheck className="h-4 w-4 text-emerald-300" />
                Tek ana stok
              </span>
              <span className="inline-flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-cyan-300" />
                Cift satis kalkanı
              </span>
              <span className="inline-flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-amber-300" />
                Gunluk operasyon ritmi
              </span>
            </div>
          </div>

          <div className="hidden border border-white/12 bg-black/45 p-4 shadow-2xl shadow-black/50 backdrop-blur-xl lg:block">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold">Bugunun kontrolu</div>
                <div className="text-xs text-stone-400">Kanal ve stok sagligi</div>
              </div>
              <span className="badge-ok">canli</span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <HeroMetric label="Satisa hazir" value="8.420" tone="text-emerald-300" />
              <HeroMetric label="Riskli SKU" value="17" tone="text-amber-300" />
              <HeroMetric label="Bekleyen sync" value="42" tone="text-cyan-300" />
              <HeroMetric label="Iptal korumasi" value="99.8%" tone="text-stone-100" />
            </div>
            <div className="mt-4 space-y-2">
              {[
                ['Trendyol', 'Stok push tamamlandi', 'text-orange-300'],
                ['Shopify', 'Siparis webhook aktif', 'text-emerald-300'],
                ['Hepsiburada', 'Polling izleniyor', 'text-amber-300'],
              ].map(([platform, detail, tone]) => (
                <div
                  key={platform}
                  className="flex items-center justify-between rounded-md border border-white/10 bg-white/[0.045] px-3 py-2"
                >
                  <span className={`text-sm font-medium ${tone}`}>{platform}</span>
                  <span className="text-xs text-stone-400">{detail}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl grid-cols-1 gap-3 px-6 pb-12 md:grid-cols-3">
        <Feature title="Katalog & stok" text="SKU, barkod, rezerve stok ve pazaryeri listingleri tek kayitta." />
        <Feature title="Siparis akisi" text="Webhook ve polling ile gelen siparisleri stok defterine guvenli isler." />
        <Feature title="Otomasyon" text="Dusuk stokta uyari, kritik durumda kanal bazli 0 stok push ve pause." />
      </section>
    </main>
  )
}

function HeroMetric({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className="rounded-md border border-white/10 bg-white/[0.055] p-3">
      <div className="text-xs text-stone-400">{label}</div>
      <div className={`mt-1 text-2xl font-semibold tabular-nums ${tone}`}>{value}</div>
    </div>
  )
}

function Feature({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.04] p-5">
      <h2 className="text-base font-semibold text-stone-100">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-stone-400">{text}</p>
    </div>
  )
}
