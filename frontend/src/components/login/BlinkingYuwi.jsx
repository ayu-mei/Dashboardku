import { useState } from "react";
import eyesOpen from "../../assets/images/yuwi-profile-anime.png";
import eyesClosed from "../../assets/images/yuwi-blink-anime.png";

export default function BlinkingYuwi({ className = "", decorative = false }) {
  const [ready, setReady] = useState(false);
  return (
    <span
      className={`yuwi-blink ${className}`}
      data-blink-ready={ready ? "true" : undefined}
    >
      <img
        className="yuwi-blink-base"
        src={eyesOpen}
        alt={
          decorative
            ? ""
            : "Yuwi, asisten bisnis dengan telinga hitam dan pita kotak-kotak"
        }
        fetchPriority="high"
      />
      <img
        className="yuwi-blink-eyes yuwi-blink-left"
        src={eyesClosed}
        alt=""
        aria-hidden="true"
        onLoad={() => setReady(true)}
      />
      <img
        className="yuwi-blink-eyes yuwi-blink-right"
        src={eyesClosed}
        alt=""
        aria-hidden="true"
      />
    </span>
  );
}
