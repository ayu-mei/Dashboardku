import BlinkingYuwi from "./BlinkingYuwi";

export default function LoginBrand() {
  return (
    <section className="login-brand" aria-labelledby="login-brand-title">
      <p className="login-eyebrow">ASISTEN BISNIS ANDA</p>
      <h2 id="login-brand-title">
        Kenali bisnis Anda,
        <br />
        <strong>bersama Yuwi.</strong>
      </h2>
      <div className="login-mascot-stage">
        <p className="login-yuwi-bubble">Halo, aku Yuwi!</p>
        <BlinkingYuwi className="login-mascot" />
      </div>
    </section>
  );
}
