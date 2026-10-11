/**
 * A labelled slider for the Time Machine (CLAUDE.md 6: TimeSlider). The caller formats the
 * label and the spoken value, so each feature keeps its own strings.
 */
export function TimeSlider({ label, valueText, value, min, max, step, onChange }: {
  label: string;
  /** What a screen reader says for the value, e.g. "₹500". */
  valueText: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="tm-slider">
      <span className="tm-slider-label">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-valuetext={valueText}
      />
    </label>
  );
}
