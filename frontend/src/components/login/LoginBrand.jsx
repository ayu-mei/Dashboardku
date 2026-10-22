import { ChartNoAxesCombined, Sparkles } from "lucide-react";
import BlinkingYuwi from "./BlinkingYuwi";

export default function LoginBrand() {
  return (
    <section className="login-brand" aria-labelledby="login-brand-title">
      <p className="login-eyebrow">
        <Sparkles size={15} aria-hidden="true" /> ASISTEN BISNIS ANDA
      </p>
      <h2 id="login-brand-title">
        Kenali bisnis Anda,
        <br />
        <strong>bersama Yuwi.</strong>
      </h2>
      <p className="login-hero-description">
        Dari angka menjadi cerita yang mudah dipahami.
      </p>
      <div className="login-mascot-stage">
        <div className="login-mascot-halo" aria-hidden="true" />
        <p className="login-yuwi-bubble">
          Halo, aku Yuwi! <span aria-hidden="true">✦</span>
        </p>
        <BlinkingYuwi className="login-mascot" />
        <Sparkles
          className="login-mascot-sparkle"
          size={24}
          aria-hidden="true"
        />
        <div className="login-yuwi-tag">
          <ChartNoAxesCombined size={17} aria-hidden="true" />
          <span>Teman memahami data Anda</span>
        </div>
      </div>
    </section>
  );
}
