import {
  ArrowUpRight,
  ChartNoAxesCombined,
  MoreHorizontal,
} from "lucide-react";

// An illustrative product composition only; never reads account or business data.
export default function LoginBrand() {
  return (
    <section className="login-brand" aria-labelledby="login-brand-title">
      <div className="login-hero">
        <p className="login-eyebrow">
          <span /> KEJELASAN DI SETIAP ANGKA
        </p>
        <h2 id="login-brand-title">
          Data bisnis,<strong>lebih mudah dipahami.</strong>
        </h2>
        <p className="login-hero-description">
          Pantau penjualan, profit, dan performa bisnis
          <br className="login-desktop-break" /> dalam satu dashboard.
        </p>
      </div>
      <div className="login-analytics" aria-hidden="true">
        <div className="login-analytics-orbit" />
        <div className="login-preview-chart login-entrance-chart">
          <div className="login-preview-heading">
            <span>
              <ChartNoAxesCombined size={15} /> Performa penjualan
            </span>
            <MoreHorizontal size={18} />
          </div>
          <div className="login-mini-chart">
            <svg viewBox="0 0 400 128" fill="none" preserveAspectRatio="none">
              <defs>
                <linearGradient
                  id="login-chart-fill"
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="1"
                >
                  <stop stopColor="#72D6B5" stopOpacity=".2" />
                  <stop offset="1" stopColor="#72D6B5" stopOpacity="0" />
                </linearGradient>
              </defs>
              {[26, 64, 102].map((y) => (
                <path
                  key={y}
                  d={`M0 ${y}H400`}
                  stroke="white"
                  strokeOpacity=".09"
                  strokeDasharray="3 6"
                />
              ))}
              <path
                d="M0 104C28 105 32 88 56 92S92 111 116 85 154 85 176 65 204 89 232 61 263 73 286 43 321 54 344 32 372 42 400 12V128H0Z"
                fill="url(#login-chart-fill)"
              />
              <path
                d="M0 113C28 113 40 104 62 107S102 93 123 100 155 77 182 85 217 78 238 85 271 63 294 70 333 48 359 61 380 52 400 48"
                stroke="#8DA5B6"
                strokeWidth="1.5"
                strokeOpacity=".65"
              />
              <path
                d="M0 104C28 105 32 88 56 92S92 111 116 85 154 85 176 65 204 89 232 61 263 73 286 43 321 54 344 32 372 42 400 12"
                stroke="#72D6B5"
                strokeWidth="2.5"
              />
              <circle
                cx="344"
                cy="32"
                r="10"
                fill="#72D6B5"
                fillOpacity=".12"
              />
              <circle
                cx="344"
                cy="32"
                r="3.5"
                fill="#B6F2DC"
                stroke="#19374A"
                strokeWidth="2"
              />
            </svg>
          </div>
          <div className="login-chart-months">
            <span>JAN</span>
            <span>FEB</span>
            <span>MAR</span>
            <span>APR</span>
            <span>MEI</span>
            <span>JUN</span>
          </div>
          <div className="login-chart-legend">
            <span>
              <i />
              Penjualan
            </span>
            <span>
              <i />
              Gross profit
            </span>
          </div>
        </div>
        <div className="login-preview-sales login-entrance-sales">
          <div className="login-preview-label">
            Total Penjualan <ArrowUpRight size={15} />
          </div>
          <strong>
            Rp 248,6 <small>jt</small>
          </strong>
          <span className="login-growth-pill">
            <ArrowUpRight size={12} /> +12,4% <span>vs bulan lalu</span>
          </span>
        </div>
        <div className="login-preview-margin login-entrance-margin">
          <span className="login-preview-label">Gross Margin</span>
          <strong>
            32,8<span>%</span>
          </strong>
          <div className="login-margin-track">
            <i />
          </div>
          <span className="login-preview-caption">Ruang untuk bertumbuh</span>
        </div>
        <div className="login-preview-bars login-entrance-bars">
          <span className="login-preview-label">Kontribusi produk</span>
          <div className="login-mini-bars">
            {[40, 68, 48, 85, 60, 100].map((height, index) => (
              <i key={index} style={{ height: `${height}%` }} />
            ))}
          </div>
        </div>
        <p className="login-illustration-note">
          Ilustrasi antarmuka · bukan data bisnis
        </p>
      </div>
    </section>
  );
}
